import { all, one, run, nowISO } from '../../db.mjs'
import { uid, addMinutes, addDays } from '../../lib/utils.mjs'
import { buildIndex, matchGame } from '../matcher.mjs'
import { evaluate, advise } from '../detection.mjs'
import { similarity, variantHash } from '../imagehash.mjs'
import { getBaseline } from '../baseline.mjs'
import jiaoyimao from './jiaoyimao.mjs'
import pangxie from './pangxie.mjs'
import taoshouyou from './taoshouyou.mjs'
import p5173 from './p5173.mjs'
import p7881 from './p7881.mjs'

const ADAPTERS = new Map([
  [jiaoyimao.id, jiaoyimao],
  [pangxie.id, pangxie],
  [taoshouyou.id, taoshouyou],
  [p5173.id, p5173],
  [p7881.id, p7881],
])

export function listAdapters() {
  return [...ADAPTERS.values()].map(({ id, name, mode, baseUrl }) => ({ id, name, mode, baseUrl }))
}

export function getAdapter(id) {
  const a = ADAPTERS.get(id)
  if (!a) throw new Error(`未知渠道: ${id}`)
  return a
}

function marketAverages() {
  const rows = all(`SELECT game_id, AVG(price) AS avg_price, COUNT(*) AS c FROM listings WHERE game_id IS NOT NULL GROUP BY game_id`)
  return new Map(rows.map((r) => [r.game_id, r.c >= 2 ? Math.round(r.avg_price) : null]))
}

function sellerAuthorized(source, sellerName) {
  const s = one(`SELECT authorized FROM sellers WHERE source = ? AND seller_name = ?`, [source, sellerName])
  return Boolean(s?.authorized)
}

/**
 * 线索入库：同渠道同 externalId 视为同一条，重复巡检只刷新快照与评分。
 * @returns {{created:number, updated:number, alerts:number}}
 */
export function ingestForensic(rawList, { source }) {
  const games = all(`SELECT id, name, aliases FROM games`)
  const assets = all(`SELECT id, name, phash FROM assets`)
  const index = buildIndex(games)
  const avgMap = marketAverages()
  let created = 0
  let updated = 0
  let alertCount = 0

  for (const raw of rawList) {
    const matched = matchGame(raw.title, index)
    const game = matched.gameId ? games.find((g) => g.id === matched.gameId) : null
    const authorized = sellerAuthorized(source, raw.sellerName)
    const marketAvg = matched.gameId ? avgMap.get(matched.gameId) ?? null : null
    const baseline = matched.gameId ? getBaseline(matched.gameId) : null

    // 图片比对：真实渠道应下载主图算 pHash；演示模式用素材哈希的近邻模拟「二次压缩后的同图」
    let imageHash = null
    let imageAssetId = null
    let imageSimilarity = null
    let imageMatch = null
    if (raw.assetId) {
      const asset = assets.find((a) => a.id === raw.assetId)
      if (asset) {
        const seed = [...String(raw.externalId)].reduce((s, c) => s + c.charCodeAt(0), 0)
        imageHash = variantHash(asset.phash, raw.assetFlips ?? 3, seed)
        imageAssetId = asset.id
        imageSimilarity = similarity(imageHash, asset.phash)
        imageMatch = { assetName: asset.name, similarity: imageSimilarity }
      }
    }

    const verdict = evaluate({
      title: raw.title,
      description: raw.description,
      price: raw.price,
      game,
      authorized,
      marketAvg,
      baseline,
      imageMatch,
    })

    const snapshotAt = new Date(Date.now() - (raw.postedAgoMin ?? 0) * 60_000).toISOString()
    const existing = one(`SELECT id, risk_score FROM listings WHERE source = ? AND external_id = ?`, [source, raw.externalId])

    let listingId
    if (existing) {
      listingId = existing.id
      run(
        `UPDATE listings SET price = ?, snapshot_at = ?, risk_score = ?, risk_level = ?,
           game_id = ?, game_name = ?, url = ?, raw = ?,
           image_hash = ?, image_asset_id = ?, image_similarity = ? WHERE id = ?`,
        [raw.price, snapshotAt, verdict.score, verdict.level, matched.gameId, matched.gameName,
          raw.url, JSON.stringify(raw), imageHash, imageAssetId, imageSimilarity, listingId],
      )
      updated++
    } else {
      listingId = uid('lst')
      run(
        `INSERT INTO listings (id, source, external_id, title, description, price, currency, game_id, game_name,
           seller_name, seller_ref, url, snapshot_at, raw, status, risk_score, risk_level, created_at,
           image_hash, image_asset_id, image_similarity)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [listingId, source, raw.externalId, raw.title, raw.description, raw.price, 'CNY',
          matched.gameId, matched.gameName, raw.sellerName, raw.sellerRef, raw.url, snapshotAt,
          JSON.stringify(raw), verdict.level === '高' ? '侵权风险' : '待审核', verdict.score, verdict.level, nowISO(),
          imageHash, imageAssetId, imageSimilarity],
      )
      created++
    }

    // 预警去重：同一线索同一规则只保留一条（重复巡检不重复刷屏）
    for (const a of verdict.alerts) {
      const dup = one(`SELECT id FROM alerts WHERE listing_id = ? AND rule_code = ?`, [listingId, a.ruleCode])
      if (!dup) {
        run(
          `INSERT INTO alerts (id, listing_id, rule_code, rule_name, severity, detail, status, created_at)
           VALUES (?,?,?,?,?,?,?,?)`,
          [uid('alt'), listingId, a.ruleCode, a.ruleName, a.severity, a.detail, '新建', nowISO()],
        )
        alertCount++
      }
    }
  }

  return { created, updated, alerts: alertCount }
}

/** 执行一次巡检（供手动触发与定时调度共用） */
export async function runTask(taskId, { trigger = 'manual' } = {}) {
  const task = one(`SELECT * FROM tasks WHERE id = ?`, [taskId])
  if (!task) throw new Error('任务不存在')

  const adapter = getAdapter(task.source)
  const keywords = JSON.parse(task.keywords || '[]')
  const runId = uid('run')
  const startedAt = nowISO()

  run(
    `INSERT INTO crawl_runs (id, task_id, source, started_at, status, log) VALUES (?,?,?,?,?,?)`,
    [runId, taskId, task.source, startedAt, '运行中', ''],
  )

  try {
    const collected = []
    const logs = []
    for (const kw of keywords) {
      logs.push(`关键词「${kw}」检索中…`)
      const batch = await adapter.search({ keywords: [kw], maxPages: 2, pageSize: 15 })
      logs.push(`关键词「${kw}」命中 ${batch.length} 条`)
      collected.push(...batch)
    }

    // 同批次去重
    const seen = new Set()
    const unique = collected.filter((x) => {
      const k = `${task.source}:${x.externalId}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    const result = ingestForensic(unique, { source: task.source })
    logs.push(`入库完成：新增 ${result.created} 条，更新 ${result.updated} 条，生成预警 ${result.alerts} 条`)

    const next = addMinutes(nowISO(), task.interval_minutes)
    run(
      `UPDATE tasks SET last_run_at = ?, next_run_at = ?, total_found = total_found + ?, total_new = total_new + ? WHERE id = ?`,
      [nowISO(), next, result.updated + result.created, result.created, taskId],
    )
    run(
      `UPDATE crawl_runs SET finished_at = ?, found = ?, new_count = ?, status = ?, log = ? WHERE id = ?`,
      [nowISO(), unique.length, result.created, '成功', logs.join('\n'), runId],
    )

    return { runId, trigger, found: unique.length, ...result, log: logs }
  } catch (err) {
    run(
      `UPDATE crawl_runs SET finished_at = ?, status = ?, log = ? WHERE id = ?`,
      [nowISO(), '失败', String(err?.stack || err), runId],
    )
    throw err
  }
}

/** 版权库 / 授权台账变更后，重算全部线索的风险分 */
export function revaluateAll() {
  const games = all(`SELECT id, name, aliases FROM games`)
  const assets = all(`SELECT id, name, phash FROM assets`)
  const index = buildIndex(games)
  const rows = all(`SELECT * FROM listings`)
  const avgMap = marketAverages()
  let changed = 0
  for (const row of rows) {
    const matched = matchGame(row.title, index)
    const game = matched.gameId ? games.find((g) => g.id === matched.gameId) : null
    const authorized = sellerAuthorized(row.source, row.seller_name)
    const asset = row.image_asset_id ? assets.find((a) => a.id === row.image_asset_id) : null
    const imageMatch = asset && row.image_hash
      ? { assetName: asset.name, similarity: similarity(row.image_hash, asset.phash) }
      : null
    const verdict = evaluate({
      title: row.title,
      description: row.description,
      price: row.price,
      game,
      authorized,
      marketAvg: matched.gameId ? avgMap.get(matched.gameId) ?? null : null,
      baseline: matched.gameId ? getBaseline(matched.gameId) : null,
      imageMatch,
    })
    if (verdict.score !== row.risk_score || verdict.level !== row.risk_level) {
      run(`UPDATE listings SET risk_score = ?, risk_level = ?, game_id = ?, game_name = ? WHERE id = ?`,
        [verdict.score, verdict.level, matched.gameId, matched.gameName, row.id])
      changed++
    }
  }
  return { scanned: rows.length, changed }
}

/** 定时调度：每 60s 检查到期任务（框架内置的极简调度器） */
export function startScheduler(getIntervalMs = 60_000) {
  const timer = setInterval(async () => {
    const due = all(`SELECT id FROM tasks WHERE enabled = 1 AND (next_run_at IS NULL OR next_run_at <= ?)`, [nowISO()])
    for (const t of due) {
      try {
        await runTask(t.id, { trigger: 'schedule' })
      } catch (err) {
        console.error('[scheduler] 任务失败', t.id, err.message)
      }
    }
  }, getIntervalMs)
  timer.unref?.()
  return timer
}

export { advise }
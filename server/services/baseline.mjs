/**
 * 价格基线：按作品统计分位数（P20 / P50 / P80）
 * 用「低于 P20」替代「低于均价 40%」，对不同区服、不同档位的价格离散更稳，误报更少。
 */
import { all, run, nowISO } from '../db.mjs'

function percentile(sorted, p) {
  if (!sorted.length) return null
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

/** 全量重算，写入 price_baselines（region 统一记 '全部'） */
export function computeBaselines() {
  const rows = all(`SELECT game_id, price FROM listings WHERE game_id IS NOT NULL AND price > 0`)
  const byGame = new Map()
  for (const row of rows) {
    if (!byGame.has(row.game_id)) byGame.set(row.game_id, [])
    byGame.get(row.game_id).push(Number(row.price))
  }

  let updated = 0
  for (const [gameId, prices] of byGame) {
    const sorted = prices.slice().sort((a, b) => a - b)
    run(
      `INSERT INTO price_baselines (game_id, region, sample_count, p20, p50, p80, updated_at)
       VALUES (?, '全部', ?, ?, ?, ?, ?)
       ON CONFLICT(game_id, region) DO UPDATE SET
         sample_count = excluded.sample_count, p20 = excluded.p20,
         p50 = excluded.p50, p80 = excluded.p80, updated_at = excluded.updated_at`,
      [gameId, sorted.length, percentile(sorted, 20), percentile(sorted, 50), percentile(sorted, 80), nowISO()],
    )
    updated++
  }
  return { games: updated, samples: rows.length }
}

export function getBaseline(gameId) {
  if (!gameId) return null
  return all(`SELECT * FROM price_baselines WHERE game_id = ? AND region = '全部'`, [gameId])[0] ?? null
}

export function listBaselines() {
  return all(
    `SELECT b.*, g.name AS gameName, g.hot
       FROM price_baselines b LEFT JOIN games g ON g.id = b.game_id
      ORDER BY b.sample_count DESC`,
  )
}

/** 判定是否显著低于基线：低于 P20 即视为异常低价 */
export function isUnderpriced(price, baseline) {
  if (!baseline || !baseline.p20 || !price) return null
  if (price >= baseline.p20) return null
  return {
    p20: baseline.p20,
    p50: baseline.p50,
    discount: Math.round((price / baseline.p20) * 100),
    ratio: price / baseline.p20,
  }
}
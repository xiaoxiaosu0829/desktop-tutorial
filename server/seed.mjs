/**
 * 种子数据：仅用于本地演示与联调，全部为合成数据。
 * 用法：node server/seed.mjs [--reset]
 */
import { all, one, run, tx, nowISO, DB_PATH } from './db.mjs'
import { uid, addDays, addMinutes, daysAgo } from './lib/utils.mjs'
import { ingestForensic, revaluateAll } from './services/crawler/index.mjs'
import { demoListings } from './services/crawler/fixtures.mjs'
import { createReport } from './services/reporting.mjs'
import { countUsers, registerUser } from './services/auth.mjs'

const reset = process.argv.includes('--reset')

if (reset) {
  for (const t of ['alerts', 'listings', 'crawl_runs', 'tasks', 'licenses', 'sellers', 'games', 'reports', 'settings']) {
    run(`DELETE FROM ${t}`)
  }
  console.log('已清空既有数据')
}

const existing = one(`SELECT COUNT(*) AS c FROM games`).c
if (existing > 0) {
  console.log('版权库已有数据，跳过种子写入。需要重建请加 --reset')
  process.exit(0)
}

const games = [
  { id: 'g_hm', name: '王者荣耀', aliases: ['王者', '王者荣耀手游', 'HonorOfKings'], publisher: '腾讯游戏', ip_owner: '腾讯科技', region: '国服', category: 'MOBA', hot: 96 },
  { id: 'g_hp', name: '和平精英', aliases: ['和平', '吃鸡手游', '和平精英手游'], publisher: '腾讯游戏', ip_owner: '腾讯科技', region: '国服', category: '射击', hot: 91 },
  { id: 'g_ys', name: '原神', aliases: ['Genshin', '原神手游'], publisher: '米哈游', ip_owner: '上海米哈游影铁', region: '国服/国际服', category: '二次元', hot: 94 },
  { id: 'g_sr', name: '崩坏：星穹铁道', aliases: ['星铁', '崩铁', '星穹铁道'], publisher: '米哈游', ip_owner: '上海米哈游影铁', region: '国服/国际服', category: '二次元', hot: 88 },
  { id: 'g_lol', name: '英雄联盟', aliases: ['LOL', '撸啊撸', 'LeagueOfLegends'], publisher: '腾讯游戏/拳头游戏', ip_owner: 'Riot Games', region: '国服', category: 'MOBA', hot: 85 },
  { id: 'g_mh', name: '梦幻西游', aliases: ['梦幻', '梦幻西游手游'], publisher: '网易游戏', ip_owner: '网易（杭州）', region: '国服', category: 'MMORPG', hot: 80 },
  { id: 'g_yj', name: '永劫无间', aliases: ['永劫', 'Naraka'], publisher: '网易游戏', ip_owner: '网易（杭州）', region: '国服', category: '动作', hot: 72 },
  { id: 'g_dz', name: '蛋仔派对', aliases: ['蛋仔', 'EggyParty'], publisher: '网易游戏', ip_owner: '网易（杭州）', region: '国服', category: '休闲', hot: 78 },
]

const now = nowISO()
tx(() => {
  for (const g of games) {
    run(
      `INSERT INTO games (id, name, aliases, publisher, ip_owner, region, category, hot, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [g.id, g.name, JSON.stringify(g.aliases), g.publisher, g.ip_owner, g.region, g.category, g.hot, now],
    )
  }

  // 授权台账：示例仅登记少量被授权方，其余卖家均视为未授权
  const licenses = [
    { gameId: 'g_hm', holder: '猫字号-A100', type: '平台直营', scope: '交易猫平台内王者荣耀成品号代售', cert: 'HM-2026-0001', from: daysAgo(300), to: addDays(now, 200) },
    { gameId: 'g_ys', holder: '蟹字号-B101', type: '普通', scope: '螃蟹渠道原神账号经销', cert: 'YS-2026-0042', from: daysAgo(180), to: addDays(now, 120) },
    { gameId: 'g_mh', holder: '猫字号-C102', type: '独家', scope: '梦幻西游高价值角色代售', cert: 'MH-2026-0007', from: daysAgo(90), to: addDays(now, 275) },
  ]
  for (const l of licenses) {
    run(
      `INSERT INTO licenses (id, game_id, holder, license_type, scope, cert_no, valid_from, valid_to, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [uid('lic'), l.gameId, l.holder, l.type, l.scope, l.cert, l.from.toISOString(), l.to, '有效', now],
    )
  }

  // 卖家主体（脱敏占位名）
  for (const l of licenses) {
    run(`INSERT INTO sellers (id, source, seller_name, seller_ref, authorized, risk_note, created_at) VALUES (?,?,?,?,?,?,?)`,
      [uid('slr'), l.holder.startsWith('猫') ? 'jiaoyimao' : 'pangxie', l.holder, 'demo', 1, '已备案被授权方', now])
  }
  for (const [name, source] of [['猫字号-D103', 'jiaoyimao'], ['蟹字号-E104', 'pangxie']]) {
    run(`INSERT INTO sellers (id, source, seller_name, seller_ref, authorized, risk_note, created_at) VALUES (?,?,?,?,?,?,?)`,
      [uid('slr'), source, name, 'demo', 0, '历史投诉 2 次，重点观察', now])
  }

  // 监测任务
  const tasks = [
    { id: uid('tsk'), name: '重点作品日常巡检', source: 'jiaoyimao', keywords: ['王者荣耀', '原神', '梦幻西游'], interval: 360 },
    { id: uid('tsk'), name: '交易猫全量观察', source: 'jiaoyimao', keywords: ['星铁', '英雄联盟', '账号'], interval: 720 },
    { id: uid('tsk'), name: '螃蟹渠道侵权巡检', source: 'pangxie', keywords: ['和平精英', '永劫无间', '蛋仔派对'], interval: 360 },
    { id: uid('tsk'), name: '螃蟹高价值账号观察', source: 'pangxie', keywords: ['满命', '满级号'], interval: 1440, enabled: 0 },
  ]
  for (const t of tasks) {
    run(
      `INSERT INTO tasks (id, name, source, keywords, interval_minutes, enabled, next_run_at, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [t.id, t.name, t.source, JSON.stringify(t.keywords), t.interval, t.enabled ?? 1,
        addMinutes(now, t.interval / 2), now],
    )
  }
})

// 通过真实入库链路生成线索（含匹配、评分、预警），保证与运行时行为一致
const result = { created: 0, updated: 0, alerts: 0 }
for (const source of ['jiaoyimao', 'pangxie']) {
  for (let page = 1; page <= 2; page++) {
    const raw = demoListings(source, { count: 20, seed: 20261112 + page * 7, page })
    const r = ingestForensic(raw, { source })
    result.created += r.created
    result.updated += r.updated
    result.alerts += r.alerts
  }
}

revaluateAll()

// 把线索的入库时间摊到最近 7 天，让趋势图/周期报告有真实的时间分布（演示用）
{
  const rows = all(`SELECT id FROM listings ORDER BY id`)
  rows.forEach((row, i) => {
    const dayOffset = i % 7
    const d = new Date()
    d.setDate(d.getDate() - dayOffset)
    d.setHours(9 + (i % 10), (i * 7) % 60, 0, 0)
    run(`UPDATE listings SET created_at = ? WHERE id = ?`, [d.toISOString(), row.id])
  })
}

// 回填任务执行统计
for (const t of all(`SELECT * FROM tasks`)) {
  const n = one(`SELECT COUNT(*) AS c FROM listings WHERE source = ?`, [t.source]).c
  run(`UPDATE tasks SET total_found = ?, total_new = ?, last_run_at = ?, next_run_at = ? WHERE id = ?`,
    [n, Math.round(n * 0.7), nowISO(), addMinutes(nowISO(), t.interval_minutes), t.id])
  run(`INSERT INTO crawl_runs (id, task_id, source, started_at, finished_at, found, new_count, status, log) VALUES (?,?,?,?,?,?,?,?,?)`,
    [uid('run'), t.id, t.source, addMinutes(nowISO(), -30), nowISO(), n, Math.round(n * 0.7), '成功',
      `种子巡检完成：命中 ${n} 条，新增 ${Math.round(n * 0.7)} 条`])
}

// 制造部分处置进度，让看板有真实业务层次
const highs = all(`SELECT id FROM listings WHERE risk_level = '高' ORDER BY risk_score DESC LIMIT 30`)
highs.slice(0, 6).forEach((row, i) => {
  const status = ['已通知', '已下架', '误报', '已通知'][i % 4]
  run(`UPDATE listings SET status = ? WHERE id = ?`, [status, row.id])
  run(`UPDATE alerts SET status = ?, handled_at = ?, handled_by = ? WHERE listing_id = ?`,
    [status === '误报' ? '误报' : '已处理', nowISO(), '合规运营组', row.id])
})
const mids = all(`SELECT id FROM listings WHERE risk_level = '中' LIMIT 4`)
mids.forEach((row) => run(`UPDATE alerts SET status = '处理中', handled_by = '法务复核' WHERE listing_id = ?`, [row.id]))

// 首份周期报告
createReport({ type: '周期报告', title: 'V1.0 初始化周期报告' })

run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('system.name', '网络游戏账号交易版权监测系统')`)
run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('system.version', 'V1.0')`)

// 默认管理员（仅当还没有任何账号时创建）
if (countUsers() === 0) {
  registerUser({ username: 'admin', password: 'Admin@12345', displayName: '系统管理员' })
  console.log('已创建默认管理员：admin / Admin@12345（请登录后尽快修改）')
}

console.log(`种子完成 → ${DB_PATH}`)
console.log(`作品 ${all('SELECT COUNT(*) c FROM games')[0].c} 部，授权 ${all('SELECT COUNT(*) c FROM licenses')[0].c} 条，`
  + `线索 ${all('SELECT COUNT(*) c FROM listings')[0].c} 条（新增 ${result.created}），`
  + `预警 ${all('SELECT COUNT(*) c FROM alerts')[0].c} 条`)
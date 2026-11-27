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
import { computeBaselines } from './services/baseline.mjs'
import { phash } from './services/imagehash.mjs'
import { PNG } from 'pngjs'

/** 生成一张确定性图案的示意素材图（仅用于演示 pHash 链路，不涉及真实美术资源） */
function makePoster(seed, base) {
  const size = 96
  const png = new PNG({ width: size, height: size })
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) << 2
      const block = Math.floor(x / (size / 3)) + 3 * Math.floor(y / (size / 3))
      const stripe = (x + y) % 16 < 8 ? 46 : 0
      png.data[i] = (base[0] + block * 19 + stripe) & 255
      png.data[i + 1] = (base[1] + block * 12 + stripe) & 255
      png.data[i + 2] = (base[2] + block * 8 + (seed % 40)) & 255
      png.data[i + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

const reset = process.argv.includes('--reset')

if (reset) {
  for (const t of ['case_events', 'case_listings', 'cases', 'price_baselines', 'assets',
  'alerts', 'listings', 'crawl_runs', 'tasks', 'licenses', 'sellers', 'games', 'reports', 'settings']) {
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

// 素材库：4 张示意素材（真实场景由版权方上传官方海报/立绘）
{
  const assets = [
    { id: 'ast_hm', gameId: 'g_hm', name: '王者荣耀 · 官方主视觉', seed: 11, base: [200, 120, 40] },
    { id: 'ast_ys', gameId: 'g_ys', name: '原神 · 版本宣传图', seed: 23, base: [60, 130, 200] },
    { id: 'ast_sr', gameId: 'g_sr', name: '星穹铁道 · 角色立绘', seed: 37, base: [120, 80, 180] },
    { id: 'ast_mh', gameId: 'g_mh', name: '梦幻西游 · 活动海报', seed: 53, base: [70, 150, 110] },
  ]
  for (const a of assets) {
    const buf = makePoster(a.seed, a.base)
    const { hash, width, height } = phash(buf)
    run(
      `INSERT INTO assets (id, game_id, name, phash, width, height, size_bytes, note, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [a.id, a.gameId, a.name, hash, width, height, buf.length, '演示素材（合成图案）', nowISO()],
    )
  }
}

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

// 先算价格基线（P20/P50/P80），再按基线重算风险分
computeBaselines()
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

// 演示案件：从高风险线索立案，带时间线
{
  const seedCases = [
    {
      title: '王者荣耀账号批量挂售（疑似未授权经销）',
      gameId: 'g_hm',
      priority: '高',
      owner: '法务-张明',
      status: '已发函',
      summary: '同一卖家在交易猫连续上架 3 条王者荣耀成品号，未在授权台账内，已发送侵权告知函。',
      days: 9,
      events: [
        ['创建', '建案：王者荣耀账号批量挂售', '运营-李雷'],
        ['关联线索', '关联线索 3 条（同一卖家）', '运营-李雷'],
        ['发函', '已通过渠道工单提交侵权告知函，附件为取证包', '法务-张明'],
      ],
    },
    {
      title: '原神私服资源账号售卖',
      gameId: 'g_ys',
      priority: '高',
      owner: '版权-王芳',
      status: '调查中',
      summary: '商品描述出现"私服同款资源"，同时命中未授权经销，需确认是否涉及私服运营方。',
      days: 3,
      events: [
        ['创建', '建案：原神私服资源账号售卖', '版权-王芳'],
        ['备注', '待补充私服站点线索，已同步技术组取证', '版权-王芳'],
      ],
    },
    {
      title: '梦幻西游高价值角色异常低价',
      gameId: 'g_mh',
      priority: '中',
      owner: '运营-李雷',
      status: '待受理',
      summary: '成交价低于作品 P20 基线，疑似盗号销赃，待人工复核。',
      days: 1,
      events: [['创建', '建案：梦幻西游高价值角色异常低价', '运营-李雷']],
    },
  ]

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  seedCases.forEach((c, idx) => {
    const id = uid('cas')
    const createdAt = new Date(Date.now() - c.days * 86_400_000).toISOString()
    const deadline = new Date(Date.now() + (5 - c.days) * 86_400_000).toISOString()
    run(
      `INSERT INTO cases (id, code, title, game_id, seller_name, status, priority, owner, deadline, summary, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, `CASE-${today}-${String(idx + 1).padStart(3, '0')}`, c.title, c.gameId, '', c.status,
        c.priority, c.owner, deadline, c.summary, createdAt, nowISO()],
    )
    c.events.forEach(([type, content, actor], i) => {
      run(`INSERT INTO case_events (id, case_id, type, content, actor, created_at) VALUES (?,?,?,?,?,?)`,
        [uid('evt'), id, type, content, actor, new Date(Date.now() - (c.days * 86400000) + i * 3600000).toISOString()])
    })
    // 关联 1–3 条同作品线索
    const candidates = all(
      `SELECT id FROM listings WHERE game_id = ? AND risk_level = '高' ORDER BY risk_score DESC LIMIT 3`,
      [c.gameId],
    )
    candidates.forEach((row) => {
      run(`INSERT OR IGNORE INTO case_listings (case_id, listing_id, added_at) VALUES (?,?,?)`, [id, row.id, createdAt])
    })
  })
}

run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('system.name', '网络游戏账号交易版权监测系统')`)
run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('system.version', 'V1.1')`)

// 默认管理员（仅当还没有任何账号时创建）
if (countUsers() === 0) {
  registerUser({ username: 'admin', password: 'Admin@12345', displayName: '系统管理员' })
  console.log('已创建默认管理员：admin / Admin@12345（请登录后尽快修改）')
}

console.log(`种子完成 → ${DB_PATH}`)
console.log(`作品 ${all('SELECT COUNT(*) c FROM games')[0].c} 部，授权 ${all('SELECT COUNT(*) c FROM licenses')[0].c} 条，`
  + `线索 ${all('SELECT COUNT(*) c FROM listings')[0].c} 条（新增 ${result.created}），`
  + `预警 ${all('SELECT COUNT(*) c FROM alerts')[0].c} 条`)
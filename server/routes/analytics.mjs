import { Router } from 'express'
import { all, one, run, nowISO } from '../db.mjs'
import { uid } from '../lib/utils.mjs'
import { createReport } from '../services/reporting.mjs'
import { listAdapters } from '../services/crawler/index.mjs'
import { RULES } from '../services/detection.mjs'
import { revaluateAll } from '../services/crawler/index.mjs'
import { listBaselines, computeBaselines } from '../services/baseline.mjs'

const router = Router()

const SOURCE_LABEL = { jiaoyimao: '交易猫', pangxie: '螃蟹账号交易' }

/** 基础元数据：前端筛选项与系统信息 */
router.get('/meta', (req, res) => {
  const settings = Object.fromEntries(all(`SELECT key, value FROM settings`).map((r) => [r.key, r.value]))
  res.json({
    system: {
      name: settings['system.name'] ?? '网络游戏账号交易版权监测系统',
      version: settings['system.version'] ?? 'V1.0',
    },
    adapters: listAdapters(),
    sources: Object.entries(SOURCE_LABEL).map(([id, label]) => ({ id, label, mode: 'demo' })),
    levels: ['高', '中', '低'],
    statuses: ['待审核', '侵权风险', '合规', '已通知', '已下架', '误报'],
    alertStatuses: ['新建', '处理中', '已处理', '误报'],
    rules: RULES,
  })
})

/** 总览看板 */
router.get('/overview', (req, res) => {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()

  const metrics = {
    listings: one(`SELECT COUNT(*) c FROM listings`).c,
    newLast7d: one(`SELECT COUNT(*) c FROM listings WHERE created_at >= ?`, [since]).c,
    highRisk: one(`SELECT COUNT(*) c FROM listings WHERE risk_level = '高' AND status NOT IN ('已下架','误报')`).c,
    openAlerts: one(`SELECT COUNT(*) c FROM alerts WHERE status IN ('新建','处理中')`).c,
    games: one(`SELECT COUNT(*) c FROM games`).c,
    licensedSellers: one(`SELECT COUNT(*) c FROM sellers WHERE authorized = 1`).c,
    handledRate: (() => {
      const total = one(`SELECT COUNT(*) c FROM alerts`).c
      const done = one(`SELECT COUNT(*) c FROM alerts WHERE status IN ('已处理','误报')`).c
      return total ? Math.round((done / total) * 100) : 0
    })(),
    openCases: one(`SELECT COUNT(*) c FROM cases WHERE status IN ('待受理','调查中','已发函','渠道处理中')`).c,
    assets: one(`SELECT COUNT(*) c FROM assets`).c,
    imageHits: one(`SELECT COUNT(*) c FROM listings WHERE image_similarity IS NOT NULL`).c,
  }

  // 近 7 日趋势（按日聚合，缺失日补 0）
  const rows = all(
    `SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS total,
            SUM(CASE WHEN risk_level = '高' THEN 1 ELSE 0 END) AS high
       FROM listings GROUP BY d ORDER BY d DESC LIMIT 7`,
  ).reverse()
  const map = new Map(rows.map((r) => [r.d, r]))
  const trend = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
    const hit = map.get(d)
    trend.push({ date: d.slice(5), total: hit?.total ?? 0, high: hit?.high ?? 0 })
  }

  const bySource = all(
    `SELECT source, COUNT(*) AS total, SUM(CASE WHEN risk_level='高' THEN 1 ELSE 0 END) AS high
       FROM listings GROUP BY source`,
  ).map((r) => ({ ...r, label: SOURCE_LABEL[r.source] ?? r.source }))

  const levelDist = ['高', '中', '低'].map((level) => ({
    level,
    count: one(`SELECT COUNT(*) c FROM listings WHERE risk_level = ?`, [level]).c,
  }))

  const topGames = all(
    `SELECT COALESCE(game_name, '未收录作品') AS game, COUNT(*) AS total,
            SUM(CASE WHEN risk_level='高' THEN 1 ELSE 0 END) AS high
       FROM listings GROUP BY game_name ORDER BY total DESC LIMIT 6`,
  )

  const recentAlerts = all(
    `SELECT a.id, a.listing_id AS listingId, a.rule_code AS ruleCode, a.rule_name AS ruleName,
            a.severity, a.status, a.created_at AS createdAt, l.title, l.source, l.risk_level AS riskLevel
       FROM alerts a JOIN listings l ON l.id = a.listing_id
       ORDER BY a.created_at DESC LIMIT 8`,
  )

  res.json({
    metrics, trend, bySource, levelDist, topGames, recentAlerts,
    sources: Object.entries(SOURCE_LABEL).map(([id, label]) => ({ id, label })),
  })
})

/** 报告列表与生成 */
router.get('/reports', (req, res) => {
  const items = all(`SELECT * FROM reports ORDER BY created_at DESC`).map((r) => ({ ...r, payload: JSON.parse(r.payload) }))
  res.json({ items })
})

router.post('/reports', (req, res) => {
  const { type = '周期报告', title, from, to } = req.body ?? {}
  const report = createReport({ type, title, from, to })
  res.status(201).json({ ...report, payload: JSON.parse(report.payload) })
})

/** 授权台账变更后重算全部评分 */
router.post('/revaluate', (req, res) => {
  res.json(revaluateAll())
})

/** 价格基线：查看 / 重算 */
router.get('/baselines', (req, res) => {
  res.json({ items: listBaselines() })
})

router.post('/baselines/refresh', (req, res) => {
  const result = computeBaselines()
  const revalued = revaluateAll()
  res.json({ ...result, revalued })
})

export default router
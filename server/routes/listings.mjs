import { Router } from 'express'
import { all, one, run } from '../db.mjs'
import { advise } from '../services/detection.mjs'

const router = Router()

const LIST_COLUMNS = `id, source, external_id AS externalId, title, price, game_id AS gameId, game_name AS gameName,
  seller_name AS sellerName, url, snapshot_at AS snapshotAt, status, risk_score AS riskScore, risk_level AS riskLevel,
  created_at AS createdAt`

/** 线索列表：支持关键词、渠道、风险等级、处置状态过滤与分页 */
router.get('/listings', (req, res) => {
  const { q = '', source = '', level = '', status = '', game = '', page = '1', pageSize = '12', sort = 'risk' } = req.query
  const where = []
  const params = []

  if (q) {
    where.push(`(title LIKE ? OR seller_name LIKE ? OR game_name LIKE ?)`)
    params.push(`%${q}%`, `%${q}%`, `%${q}%`)
  }
  if (source) { where.push('source = ?'); params.push(source) }
  if (level) { where.push('risk_level = ?'); params.push(level) }
  if (status) { where.push('status = ?'); params.push(status) }
  if (game) { where.push('game_id = ?'); params.push(game) }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const order = sort === 'new' ? 'created_at DESC' : sort === 'price' ? 'price DESC' : 'risk_score DESC, snapshot_at DESC'
  const size = Math.min(100, Math.max(1, Number(pageSize)))
  const offset = (Math.max(1, Number(page)) - 1) * size

  const total = one(`SELECT COUNT(*) c FROM listings ${clause}`, params).c
  const items = all(`SELECT ${LIST_COLUMNS} FROM listings ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, size, offset])

  res.json({ total, page: Number(page), pageSize: size, items })
})

/** 线索详情：商品快照 + 命中规则 + 处置建议 */
router.get('/listings/:id', (req, res) => {
  const listing = one(`SELECT * FROM listings WHERE id = ?`, [req.params.id])
  if (!listing) return res.status(404).json({ error: '线索不存在' })

  const alerts = all(`SELECT * FROM alerts WHERE listing_id = ? ORDER BY created_at DESC`, [listing.id])
  const game = listing.game_id ? one(`SELECT * FROM games WHERE id = ?`, [listing.game_id]) : null
  const seller = one(`SELECT * FROM sellers WHERE source = ? AND seller_name = ?`, [listing.source, listing.seller_name])
  const marketAvg = listing.game_id
    ? one(`SELECT AVG(price) avg, COUNT(*) c FROM listings WHERE game_id = ? AND id <> ?`, [listing.game_id, listing.id])
    : null

  res.json({
    listing: { ...listing, raw: listing.raw ? JSON.parse(listing.raw) : null, game, seller, marketAvg: marketAvg?.c ? Math.round(marketAvg.avg) : null },
    alerts,
    verdict: {
      score: listing.risk_score,
      level: listing.risk_level,
      advise: advise(listing.risk_level, alerts.map((a) => ({ ruleCode: a.rule_code }))),
    },
  })
})

/** 更新处置状态（状态机在 V1.0 由前端约束，服务端只做白名单校验） */
router.patch('/listings/:id', (req, res) => {
  const allowed = ['待审核', '侵权风险', '合规', '已通知', '已下架', '误报']
  const { status } = req.body ?? {}
  if (!allowed.includes(status)) return res.status(400).json({ error: `非法状态，可选：${allowed.join(' / ')}` })

  const listing = one(`SELECT id FROM listings WHERE id = ?`, [req.params.id])
  if (!listing) return res.status(404).json({ error: '线索不存在' })

  run(`UPDATE listings SET status = ? WHERE id = ?`, [status, listing.id])
  if (['已下架', '误报', '已通知'].includes(status)) {
    run(`UPDATE alerts SET status = ?, handled_at = datetime('now') WHERE listing_id = ? AND status IN ('新建','处理中')`,
      [status === '误报' ? '误报' : '已处理', listing.id])
  }
  res.json(one(`SELECT ${LIST_COLUMNS} FROM listings WHERE id = ?`, [listing.id]))
})

/** 预警列表 */
router.get('/alerts', (req, res) => {
  const { status = '', severity = '', source = '', page = '1', pageSize = '15' } = req.query
  const where = []
  const params = []
  if (status) { where.push('a.status = ?'); params.push(status) }
  if (severity) { where.push('a.severity = ?'); params.push(severity) }
  if (source) { where.push('l.source = ?'); params.push(source) }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const size = Math.min(100, Math.max(1, Number(pageSize)))
  const offset = (Math.max(1, Number(page)) - 1) * size

  const total = one(`SELECT COUNT(*) c FROM alerts a JOIN listings l ON l.id = a.listing_id ${clause}`, params).c
  const items = all(
    `SELECT a.*, l.title, l.source, l.risk_level AS riskLevel, l.price, l.game_name AS gameName
       FROM alerts a JOIN listings l ON l.id = a.listing_id ${clause}
      ORDER BY CASE a.status WHEN '新建' THEN 0 WHEN '处理中' THEN 1 ELSE 2 END, a.created_at DESC
      LIMIT ? OFFSET ?`, [...params, size, offset],
  )
  res.json({ total, page: Number(page), pageSize: size, items })
})

router.patch('/alerts/:id', (req, res) => {
  const allowed = ['新建', '处理中', '已处理', '误报']
  const { status, handledBy = '合规运营组' } = req.body ?? {}
  if (!allowed.includes(status)) return res.status(400).json({ error: `非法状态，可选：${allowed.join(' / ')}` })
  const alert = one(`SELECT id FROM alerts WHERE id = ?`, [req.params.id])
  if (!alert) return res.status(404).json({ error: '预警不存在' })

  run(`UPDATE alerts SET status = ?, handled_by = ?, handled_at = ? WHERE id = ?`,
    [status, handledBy, ['已处理', '误报'].includes(status) ? new Date().toISOString() : null, alert.id])
  if (['已处理', '误报'].includes(status)) {
    const { listing_id: listingId } = one(`SELECT listing_id FROM alerts WHERE id = ?`, [alert.id])
    run(`UPDATE listings SET status = ? WHERE id = ? AND status IN ('待审核','侵权风险')`,
      [status === '误报' ? '误报' : '已通知', listingId])
  }
  res.json(one(`SELECT * FROM alerts WHERE id = ?`, [alert.id]))
})

export default router
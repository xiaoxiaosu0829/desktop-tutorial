import { Router } from 'express'
import { all, one, run, nowISO } from '../db.mjs'
import { uid } from '../lib/utils.mjs'
import { revaluateAll } from '../services/crawler/index.mjs'

const router = Router()

/** 版权库作品列表（含授权与线索统计） */
router.get('/games', (req, res) => {
  const items = all(`SELECT * FROM games ORDER BY hot DESC, name`).map((g) => ({
    ...g,
    aliases: JSON.parse(g.aliases || '[]'),
    licenseCount: one(`SELECT COUNT(*) c FROM licenses WHERE game_id = ?`, [g.id]).c,
    listingCount: one(`SELECT COUNT(*) c FROM listings WHERE game_id = ?`, [g.id]).c,
    highCount: one(`SELECT COUNT(*) c FROM listings WHERE game_id = ? AND risk_level = '高'`, [g.id]).c,
  }))
  res.json({ items })
})

router.post('/games', (req, res) => {
  const { name, aliases = [], publisher = '', ipOwner = '', region = '国服', category = '', hot = 50 } = req.body ?? {}
  if (!name) return res.status(400).json({ error: '作品名称必填' })
  const id = uid('g')
  run(`INSERT INTO games (id, name, aliases, publisher, ip_owner, region, category, hot, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, name, JSON.stringify(aliases), publisher, ipOwner, region, category, Number(hot) || 50, nowISO()])
  res.status(201).json({ ...one(`SELECT * FROM games WHERE id = ?`, [id]), aliases })
})

router.patch('/games/:id', (req, res) => {
  const g = one(`SELECT * FROM games WHERE id = ?`, [req.params.id])
  if (!g) return res.status(404).json({ error: '作品不存在' })
  const { name = g.name, aliases, publisher = g.publisher, ipOwner = g.ip_owner, region = g.region, category = g.category, hot = g.hot } = req.body ?? {}
  run(`UPDATE games SET name=?, aliases=?, publisher=?, ip_owner=?, region=?, category=?, hot=? WHERE id=?`,
    [name, JSON.stringify(aliases ?? JSON.parse(g.aliases || '[]')), publisher, ipOwner, region, category, Number(hot), g.id])
  revaluateAll()
  res.json({ ...one(`SELECT * FROM games WHERE id = ?`, [g.id]) })
})

/** 授权台账 */
router.get('/licenses', (req, res) => {
  const items = all(
    `SELECT l.*, g.name AS gameName FROM licenses l JOIN games g ON g.id = l.game_id ORDER BY l.created_at DESC`,
  )
  res.json({ items })
})

router.post('/licenses', (req, res) => {
  const { gameId, holder, licenseType = '普通', scope = '', certNo = '', validFrom = nowISO(), validTo = '' } = req.body ?? {}
  if (!gameId || !holder) return res.status(400).json({ error: 'gameId 与 holder 必填' })
  if (!one(`SELECT id FROM games WHERE id = ?`, [gameId])) return res.status(400).json({ error: '作品不存在' })

  const id = uid('lic')
  run(`INSERT INTO licenses (id, game_id, holder, license_type, scope, cert_no, valid_from, valid_to, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, gameId, holder, licenseType, scope, certNo, validFrom, validTo, '有效', nowISO()])

  // 授权台账变化 → 卖家白名单与风险评分同步
  run(`INSERT INTO sellers (id, source, seller_name, seller_ref, authorized, risk_note, created_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(source, seller_name) DO UPDATE SET authorized = 1`,
    [uid('slr'), 'jiaoyimao', holder, 'demo', 1, '由授权台账自动同步', nowISO()])
  run(`INSERT INTO sellers (id, source, seller_name, seller_ref, authorized, risk_note, created_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(source, seller_name) DO UPDATE SET authorized = 1`,
    [uid('slr'), 'pangxie', holder, 'demo', 1, '由授权台账自动同步', nowISO()])

  revaluateAll()
  res.status(201).json(one(`SELECT * FROM licenses WHERE id = ?`, [id]))
})

router.patch('/licenses/:id', (req, res) => {
  const lic = one(`SELECT * FROM licenses WHERE id = ?`, [req.params.id])
  if (!lic) return res.status(404).json({ error: '授权不存在' })
  const { status = lic.status } = req.body ?? {}
  if (!['有效', '已过期', '已撤销'].includes(status)) return res.status(400).json({ error: '非法授权状态' })
  run(`UPDATE licenses SET status = ? WHERE id = ?`, [status, lic.id])
  revaluateAll()
  res.json(one(`SELECT * FROM licenses WHERE id = ?`, [lic.id]))
})

/** 卖家主体：是否在授权名单内 */
router.get('/sellers', (req, res) => {
  res.json({
    items: all(`SELECT * FROM sellers ORDER BY authorized DESC, seller_name`).map((s) => ({
      ...s,
      listingCount: one(`SELECT COUNT(*) c FROM listings WHERE source = ? AND seller_name = ?`, [s.source, s.seller_name]).c,
    })),
  })
})

router.patch('/sellers/:id', (req, res) => {
  const s = one(`SELECT * FROM sellers WHERE id = ?`, [req.params.id])
  if (!s) return res.status(404).json({ error: '卖家不存在' })
  const { authorized, riskNote = s.risk_note } = req.body ?? {}
  run(`UPDATE sellers SET authorized = ?, risk_note = ? WHERE id = ?`, [authorized ? 1 : 0, riskNote, s.id])
  revaluateAll()
  res.json(one(`SELECT * FROM sellers WHERE id = ?`, [s.id]))
})

export default router
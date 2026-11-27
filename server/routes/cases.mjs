import { Router } from 'express'
import { all, one, run, nowISO } from '../db.mjs'
import { uid } from '../lib/utils.mjs'

const router = Router()

const STATUSES = ['待受理', '调查中', '已发函', '渠道处理中', '已结案', '已驳回']
const PRIORITIES = ['高', '中', '低']
const OPEN_STATUSES = ['待受理', '调查中', '已发函', '渠道处理中']

const mapCase = (row) => ({
  ...row,
  listingCount: one(`SELECT COUNT(*) c FROM case_listings WHERE case_id = ?`, [row.id]).c,
  overdue: Boolean(row.deadline && OPEN_STATUSES.includes(row.status) && new Date(row.deadline).getTime() < Date.now()),
})

function nextCode() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const n = one(`SELECT COUNT(*) c FROM cases WHERE code LIKE ?`, [`CASE-${today}-%`]).c + 1
  return `CASE-${today}-${String(n).padStart(3, '0')}`
}

function addEvent(caseId, type, content, actor) {
  run(
    `INSERT INTO case_events (id, case_id, type, content, actor, created_at) VALUES (?,?,?,?,?,?)`,
    [uid('evt'), caseId, type, content, actor || '系统', nowISO()],
  )
}

/** 列表 */
router.get('/cases', (req, res) => {
  const { status = '', priority = '', q = '' } = req.query
  const where = []
  const params = []
  if (status === 'open') where.push(`status IN ('待受理','调查中','已发函','渠道处理中')`)
  else if (status) { where.push('status = ?'); params.push(status) }
  if (priority) { where.push('priority = ?'); params.push(priority) }
  if (q) { where.push('(title LIKE ? OR code LIKE ? OR seller_name LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`) }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const items = all(`SELECT * FROM cases ${clause} ORDER BY created_at DESC`, params).map(mapCase)

  const stats = {
    total: one(`SELECT COUNT(*) c FROM cases`).c,
    open: one(`SELECT COUNT(*) c FROM cases WHERE status IN ('待受理','调查中','已发函','渠道处理中')`).c,
    closed: one(`SELECT COUNT(*) c FROM cases WHERE status IN ('已结案','已驳回')`).c,
    overdue: all(`SELECT * FROM cases WHERE status IN ('待受理','调查中','已发函','渠道处理中')`)
      .filter((c) => c.deadline && new Date(c.deadline).getTime() < Date.now()).length,
  }
  res.json({ items, stats })
})

/** 详情：案件 + 关联线索 + 时间线 */
router.get('/cases/:id', (req, res) => {
  const row = one(`SELECT * FROM cases WHERE id = ?`, [req.params.id])
  if (!row) return res.status(404).json({ error: '案件不存在' })

  const listings = all(
    `SELECT l.id, l.title, l.source, l.game_name AS gameName, l.seller_name AS sellerName,
            l.price, l.risk_level AS riskLevel, l.risk_score AS riskScore, l.status, cl.added_at AS addedAt
       FROM case_listings cl JOIN listings l ON l.id = cl.listing_id
      WHERE cl.case_id = ? ORDER BY cl.added_at`,
    [row.id],
  )
  const events = all(`SELECT * FROM case_events WHERE case_id = ? ORDER BY created_at`, [row.id])
  res.json({ case: mapCase(row), listings, events })
})

/** 新建案件；可直接从某条线索立案 */
router.post('/cases', (req, res) => {
  const { title, gameId = null, sellerName = '', priority = '中', owner = '', deadline = null, summary = '', listingId = null } = req.body ?? {}
  if (!title || !String(title).trim()) return res.status(400).json({ error: '请填写案件标题' })
  if (!PRIORITIES.includes(priority)) return res.status(400).json({ error: '优先级不合法' })

  const id = uid('cas')
  const code = nextCode()
  run(
    `INSERT INTO cases (id, code, title, game_id, seller_name, status, priority, owner, deadline, summary, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, code, String(title).trim(), gameId, sellerName, '待受理', priority, owner, deadline, summary, nowISO(), nowISO()],
  )
  addEvent(id, '创建', `建案：${title}${listingId ? '（由线索发起）' : ''}`, owner || '运营')

  if (listingId && one(`SELECT id FROM listings WHERE id = ?`, [listingId])) {
    run(`INSERT OR IGNORE INTO case_listings (case_id, listing_id, added_at) VALUES (?,?,?)`, [id, listingId, nowISO()])
    addEvent(id, '关联线索', `关联线索 ${listingId}`, owner || '运营')
  }

  res.status(201).json(mapCase(one(`SELECT * FROM cases WHERE id = ?`, [id])))
})

/** 更新状态 / 负责人 / 期限 */
router.patch('/cases/:id', (req, res) => {
  const row = one(`SELECT * FROM cases WHERE id = ?`, [req.params.id])
  if (!row) return res.status(404).json({ error: '案件不存在' })

  const {
    status = row.status, priority = row.priority, owner = row.owner,
    deadline = row.deadline, summary = row.summary,
  } = req.body ?? {}

  if (!STATUSES.includes(status)) return res.status(400).json({ error: `状态不合法，可选：${STATUSES.join(' / ')}` })
  if (!PRIORITIES.includes(priority)) return res.status(400).json({ error: '优先级不合法' })

  const closed = ['已结案', '已驳回'].includes(status)
  run(
    `UPDATE cases SET status = ?, priority = ?, owner = ?, deadline = ?, summary = ?, updated_at = ?, closed_at = ? WHERE id = ?`,
    [status, priority, owner, deadline, summary, nowISO(), closed ? (row.closed_at ?? nowISO()) : null, row.id],
  )
  if (status !== row.status) {
    addEvent(row.id, '状态变更', `${row.status} → ${status}`, owner || '运营')
  }
  res.json(mapCase(one(`SELECT * FROM cases WHERE id = ?`, [row.id])))
})

/** 追加时间线（备注 / 发函 / 渠道回复 等） */
router.post('/cases/:id/events', (req, res) => {
  const row = one(`SELECT id FROM cases WHERE id = ?`, [req.params.id])
  if (!row) return res.status(404).json({ error: '案件不存在' })
  const { type = '备注', content = '', actor = '运营' } = req.body ?? {}
  if (!String(content).trim()) return res.status(400).json({ error: '内容不能为空' })
  addEvent(row.id, String(type), String(content), actor)
  res.status(201).json({ ok: true })
})

/** 关联线索 */
router.post('/cases/:id/listings', (req, res) => {
  const row = one(`SELECT id FROM cases WHERE id = ?`, [req.params.id])
  if (!row) return res.status(404).json({ error: '案件不存在' })
  const { listingId } = req.body ?? {}
  const listing = one(`SELECT id, title FROM listings WHERE id = ?`, [listingId])
  if (!listing) return res.status(404).json({ error: '线索不存在' })

  run(`INSERT OR IGNORE INTO case_listings (case_id, listing_id, added_at) VALUES (?,?,?)`, [row.id, listingId, nowISO()])
  addEvent(row.id, '关联线索', `关联线索：${listing.title}`, '运营')
  res.json({ ok: true })
})

export default router
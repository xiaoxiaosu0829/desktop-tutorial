import { Router } from 'express'
import { all, one, run, nowISO } from '../db.mjs'
import { uid, addMinutes } from '../lib/utils.mjs'
import { runTask, listAdapters } from '../services/crawler/index.mjs'

const router = Router()

const mapTask = (t) => ({
  ...t,
  keywords: JSON.parse(t.keywords || '[]'),
  enabled: Boolean(t.enabled),
})

router.get('/tasks', (req, res) => {
  res.json({ items: all(`SELECT * FROM tasks ORDER BY enabled DESC, created_at DESC`).map(mapTask) })
})

router.post('/tasks', (req, res) => {
  const { name, source, keywords = [], intervalMinutes = 360 } = req.body ?? {}
  if (!name || !source) return res.status(400).json({ error: '任务名称与渠道必填' })
  if (!listAdapters().some((a) => a.id === source)) {
    return res.status(400).json({ error: `不支持的渠道，可选：${listAdapters().map((a) => a.name).join(' / ')}` })
  }

  const id = uid('tsk')
  run(`INSERT INTO tasks (id, name, source, keywords, interval_minutes, enabled, next_run_at, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    [id, name, source, JSON.stringify(keywords), Number(intervalMinutes) || 360, 1, nowISO(), nowISO()])
  res.status(201).json(mapTask(one(`SELECT * FROM tasks WHERE id = ?`, [id])))
})

router.patch('/tasks/:id', (req, res) => {
  const t = one(`SELECT * FROM tasks WHERE id = ?`, [req.params.id])
  if (!t) return res.status(404).json({ error: '任务不存在' })
  const {
    name = t.name, keywords = JSON.parse(t.keywords || '[]'),
    intervalMinutes = t.interval_minutes, enabled = t.enabled,
  } = req.body ?? {}
  run(`UPDATE tasks SET name = ?, keywords = ?, interval_minutes = ?, enabled = ?, next_run_at = ? WHERE id = ?`,
    [name, JSON.stringify(keywords), Number(intervalMinutes), enabled ? 1 : 0, addMinutes(nowISO(), Number(intervalMinutes)), t.id])
  res.json(mapTask(one(`SELECT * FROM tasks WHERE id = ?`, [t.id])))
})

router.delete('/tasks/:id', (req, res) => {
  const t = one(`SELECT * FROM tasks WHERE id = ?`, [req.params.id])
  if (!t) return res.status(404).json({ error: '任务不存在' })
  run(`DELETE FROM tasks WHERE id = ?`, [t.id])
  res.status(204).end()
})

/** 立即执行一次巡检（同步等待结果，便于演示与联调） */
router.post('/tasks/:id/run', async (req, res, next) => {
  try {
    const result = await runTask(req.params.id, { trigger: 'manual' })
    res.json(result)
  } catch (err) {
    next(err)
  }
})

router.get('/runs', (req, res) => {
  const { taskId = '', limit = '20' } = req.query
  const where = taskId ? `WHERE r.task_id = ?` : ''
  const params = taskId ? [taskId] : []
  const items = all(
    `SELECT r.*, t.name AS taskName FROM crawl_runs r LEFT JOIN tasks t ON t.id = r.task_id
      ${where} ORDER BY r.started_at DESC LIMIT ?`, [...params, Number(limit) || 20])
  res.json({ items })
})

export default router
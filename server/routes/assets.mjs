import { Router } from 'express'
import { all, one, run, nowISO } from '../db.mjs'
import { uid } from '../lib/utils.mjs'
import { phash, fromDataUrl } from '../services/imagehash.mjs'

const router = Router()
const MAX_BYTES = 4 * 1024 * 1024

/** 素材库列表 */
router.get('/assets', (req, res) => {
  const items = all(
    `SELECT a.*, g.name AS gameName,
            (SELECT COUNT(*) FROM listings l WHERE l.image_asset_id = a.id) AS hitCount
       FROM assets a LEFT JOIN games g ON g.id = a.game_id
      ORDER BY a.created_at DESC`,
  )
  res.json({ items })
})

/** 上传素材：接收 data URL，只保存感知哈希与元信息，不保存原图 */
router.post('/assets', (req, res, next) => {
  try {
    const { name, gameId = null, dataUrl, note = '' } = req.body ?? {}
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: '请填写素材名称' })
    }
    if (!dataUrl) return res.status(400).json({ error: '请选择图片' })

    const buffer = fromDataUrl(dataUrl)
    if (buffer.length > MAX_BYTES) {
      return res.status(413).json({ error: '图片不能超过 4 MB' })
    }
    if (gameId && !one(`SELECT id FROM games WHERE id = ?`, [gameId])) {
      return res.status(400).json({ error: '作品不存在' })
    }

    const { hash, width, height } = phash(buffer)
    const id = uid('ast')
    run(
      `INSERT INTO assets (id, game_id, name, phash, width, height, size_bytes, note, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, gameId, String(name).trim(), hash, width, height, buffer.length, note, nowISO()],
    )
    res.status(201).json(one(`SELECT * FROM assets WHERE id = ?`, [id]))
  } catch (err) {
    if (err?.message?.includes('图片')) return res.status(400).json({ error: err.message })
    next(err)
  }
})

router.delete('/assets/:id', (req, res) => {
  const asset = one(`SELECT id FROM assets WHERE id = ?`, [req.params.id])
  if (!asset) return res.status(404).json({ error: '素材不存在' })
  run(`UPDATE listings SET image_asset_id = NULL, image_similarity = NULL WHERE image_asset_id = ?`, [asset.id])
  run(`DELETE FROM assets WHERE id = ?`, [asset.id])
  res.status(204).end()
})

export default router
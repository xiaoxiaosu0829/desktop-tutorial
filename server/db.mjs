import { DatabaseSync } from 'node:sqlite'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(here, '..', 'data')
mkdirSync(dataDir, { recursive: true })

export const DB_PATH = process.env.DSH_MONITOR_DB || join(dataDir, 'app.db')

const db = new DatabaseSync(DB_PATH)
db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'))

/** 轻量迁移：给已有库补列（SQLite 的 ADD COLUMN 不幂等，先查后加） */
function migrate() {
  const cols = db.prepare(`PRAGMA table_info(listings)`).all().map((c) => c.name)
  const add = [
    ['image_hash', 'ALTER TABLE listings ADD COLUMN image_hash TEXT'],
    ['image_asset_id', 'ALTER TABLE listings ADD COLUMN image_asset_id TEXT'],
    ['image_similarity', 'ALTER TABLE listings ADD COLUMN image_similarity INTEGER'],
  ]
  for (const [name, sql] of add) {
    if (!cols.includes(name)) db.exec(sql)
  }
}
migrate()

export default db

/** 查询辅助：返回对象数组 */
export function all(sql, params = []) {
  return db.prepare(sql).all(...params)
}

/** 查询辅助：返回单条或 undefined */
export function one(sql, params = []) {
  return db.prepare(sql).get(...params)
}

/** 写入辅助：返回 { changes, lastInsertRowid } */
export function run(sql, params = []) {
  return db.prepare(sql).run(...params)
}

export function tx(fn) {
  db.exec('BEGIN')
  try {
    const out = fn()
    db.exec('COMMIT')
    return out
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export const nowISO = () => new Date().toISOString()
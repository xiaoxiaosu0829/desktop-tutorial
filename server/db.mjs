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
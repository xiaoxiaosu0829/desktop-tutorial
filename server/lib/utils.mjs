import { randomUUID } from 'node:crypto'
import { randomBytes } from 'node:crypto'

export const uid = (prefix) => `${prefix}_${randomUUID().slice(0, 8)}`
export const shortId = () => randomBytes(4).toString('hex')

const pad = (n, w = 2) => String(n).padStart(w, '0')

export function fmtDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fmtDateTime(d = new Date()) {
  return `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function addMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()
}

export function addDays(iso, days) {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString()
}

export function daysAgo(n) {
  const d = new Date()
  d.setHours(10, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}

/** 简易日志：带时间戳打到 stdout，供巡检记录复用 */
export function log(...args) {
  console.log(`[${fmtDateTime()}]`, ...args)
}
/**
 * 账号与会话
 * ------------------------------------------------------------
 * - 密码：scrypt(随机盐) 派生 64 字节，只落库派生值；校验用 timingSafeEqual 防时序侧信道
 * - 会话：32 字节随机 token 存 sessions 表，浏览器只拿 HttpOnly Cookie，XSS 读不到
 * - 登录限流：同一 IP+用户名 连续失败 5 次锁定 5 分钟（内存实现，单机够用）
 */
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { all, one, run, nowISO } from '../db.mjs'
import { uid } from '../lib/utils.mjs'

export const SESSION_COOKIE = 'ngcms_sid'
/** 勾选「记住账号密码」后的免登录时长：7 天 */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** 未勾选时：会话级登录，关掉浏览器即失效；服务端兜底 12 小时 */
export const SESSION_TTL_SHORT_MS = 12 * 60 * 60 * 1000

const SCRYPT_KEYLEN = 64

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex')
  return { salt, hash }
}

export function verifyPassword(password, salt, expectedHex) {
  try {
    const actual = scryptSync(String(password), salt, SCRYPT_KEYLEN)
    const expected = Buffer.from(expectedHex, 'hex')
    if (actual.length !== expected.length) return false
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

/** 登录名：3-20 位，允许中英文、数字、下划线 */
export function normalizeUsername(name) {
  return String(name ?? '').trim().toLowerCase()
}

export function validateRegisterInput({ username, password, displayName }) {
  const name = normalizeUsername(username)
  if (!/^[\w\u4e00-\u9fa5]{3,20}$/u.test(name)) {
    return { ok: false, error: '用户名需 3-20 位，仅支持中英文、数字、下划线' }
  }
  if (String(password ?? '').length < 8) {
    return { ok: false, error: '密码至少 8 位' }
  }
  if (String(password).length > 128) {
    return { ok: false, error: '密码过长' }
  }
  if (displayName && String(displayName).length > 24) {
    return { ok: false, error: '显示名不能超过 24 个字符' }
  }
  return { ok: true, username: name }
}

export function publicUser(row) {
  if (!row) return null
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  }
}

export function countUsers() {
  return one(`SELECT COUNT(*) c FROM users`).c
}

/** 注册；首个注册用户自动成为管理员 */
export function registerUser({ username, password, displayName, ip, userAgent, remember = false }) {
  const check = validateRegisterInput({ username, password, displayName })
  if (!check.ok) throw Object.assign(new Error(check.error), { status: 400 })

  const exists = one(`SELECT id FROM users WHERE username = ?`, [check.username])
  if (exists) throw Object.assign(new Error('该用户名已被注册'), { status: 409 })

  const isFirst = countUsers() === 0
  const { salt, hash } = hashPassword(password)
  const id = uid('usr')
  run(
    `INSERT INTO users (id, username, display_name, password_hash, password_salt, role, status, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, check.username, (displayName || username).trim(), hash, salt, isFirst ? '管理员' : '成员', '启用', nowISO()],
  )
  const user = one(`SELECT * FROM users WHERE id = ?`, [id])
  const token = createSession(user.id, { ip, userAgent, ttlMs: remember ? SESSION_TTL_MS : SESSION_TTL_SHORT_MS })
  return { user: publicUser(user), token }
}

export function createSession(userId, { ip = '', userAgent = '', ttlMs = SESSION_TTL_MS } = {}) {
  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  const expires = new Date(now.getTime() + ttlMs)
  run(
    `INSERT INTO sessions (token, user_id, created_at, expires_at, ip, user_agent) VALUES (?,?,?,?,?,?)`,
    [token, userId, now.toISOString(), expires.toISOString(), String(ip).slice(0, 64), String(userAgent).slice(0, 200)],
  )
  // 顺带清理过期会话，避免表无限膨胀
  run(`DELETE FROM sessions WHERE expires_at < ?`, [nowISO()])
  return token
}

/** 根据 token 取用户；过期或不存在返回 null */
export function userByToken(token) {
  if (!token) return null
  const row = one(
    `SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
    [token],
  )
  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) {
    run(`DELETE FROM sessions WHERE token = ?`, [token])
    return null
  }
  if (row.status !== '启用') return null
  return row
}

export function destroySession(token) {
  if (token) run(`DELETE FROM sessions WHERE token = ?`, [token])
}

/** 登录限流：5 次失败 → 锁 5 分钟 */
const attempts = new Map()
const LOCK_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 5

function attemptKey(ip, username) {
  return `${ip}|${username}`
}

export function assertNotLocked(ip, username) {
  const rec = attempts.get(attemptKey(ip, username))
  if (rec?.lockUntil && rec.lockUntil > Date.now()) {
    const mins = Math.ceil((rec.lockUntil - Date.now()) / 60000)
    throw Object.assign(new Error(`尝试次数过多，请 ${mins} 分钟后再试`), { status: 429 })
  }
}

export function recordFailure(ip, username) {
  const key = attemptKey(ip, username)
  const rec = attempts.get(key) ?? { count: 0, lockUntil: 0 }
  rec.count += 1
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockUntil = Date.now() + LOCK_MS
    rec.count = 0
  }
  attempts.set(key, rec)
}

export function clearFailures(ip, username) {
  attempts.delete(attemptKey(ip, username))
}

export function loginUser({ username, password, ip = '', userAgent = '', remember = false }) {
  const name = normalizeUsername(username)
  assertNotLocked(ip, name)

  const user = one(`SELECT * FROM users WHERE username = ?`, [name])
  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    recordFailure(ip, name)
    // 不区分"用户不存在"和"密码错误"，避免账号枚举
    throw Object.assign(new Error('用户名或密码不正确'), { status: 401 })
  }
  if (user.status !== '启用') {
    throw Object.assign(new Error('账号已被停用，请联系管理员'), { status: 403 })
  }

  clearFailures(ip, name)
  run(`UPDATE users SET last_login_at = ? WHERE id = ?`, [nowISO(), user.id])
  const token = createSession(user.id, { ip, userAgent, ttlMs: remember ? SESSION_TTL_MS : SESSION_TTL_SHORT_MS })
  return { user: publicUser(one(`SELECT * FROM users WHERE id = ?`, [user.id])), token, remember }
}

export function listUsers() {
  return all(`SELECT * FROM users ORDER BY created_at`).map(publicUser)
}
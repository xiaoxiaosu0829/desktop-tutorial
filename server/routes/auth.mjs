import { Router } from 'express'
import {
  SESSION_COOKIE, SESSION_TTL_MS,
  registerUser, loginUser, userByToken, destroySession, publicUser, listUsers,
} from '../services/auth.mjs'

const router = Router()

/**
 * Cookie 策略：
 * - 勾选「记住账号密码」→ 持久 Cookie，7 天后自动失效（到期需重新登录）
 * - 未勾选 → 会话 Cookie（浏览器关闭即清除），服务端兜底 12 小时
 */
function cookieFor(remember) {
  const base = { httpOnly: true, sameSite: 'lax', path: '/' }
  return remember ? { ...base, maxAge: SESSION_TTL_MS } : base
}

function readToken(req) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice(7).trim()
  const raw = req.headers.cookie
  if (!raw) return null
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === SESSION_COOKIE) return decodeURIComponent(rest.join('='))
  }
  return null
}

/** 鉴权中间件：挂到需要登录的路由组上 */
export function requireAuth(req, res, next) {
  const token = readToken(req)
  const user = userByToken(token)
  if (!user) {
    return res.status(401).json({ error: '未登录或登录已过期', code: 'UNAUTHORIZED' })
  }
  req.user = user
  req.authToken = token
  next()
}

export function optionalAuth(req, res, next) {
  req.user = userByToken(readToken(req))
  next()
}

/** 当前登录用户 + 会话剩余时间（前端可据此提示"免登录剩余 N 天"） */
router.get('/me', requireAuth, (req, res) => {
  const expiresAt = req.user.expires_at
  res.json({
    user: publicUser(req.user),
    session: {
      expiresAt,
      daysLeft: Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)),
    },
  })
})

/** 注册（首个用户自动成为管理员） */
router.post('/register', (req, res, next) => {
  try {
    const { username, password, displayName, remember = false } = req.body ?? {}
    const { user, token } = registerUser({
      username,
      password,
      displayName,
      remember: Boolean(remember),
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    })
    res.cookie(SESSION_COOKIE, token, cookieFor(Boolean(remember)))
    res.status(201).json({ user, remember: Boolean(remember) })
  } catch (err) {
    next(err)
  }
})

router.post('/login', (req, res, next) => {
  try {
    const { username, password, remember = false } = req.body ?? {}
    const { user, token } = loginUser({
      username,
      password,
      remember: Boolean(remember),
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    })
    res.cookie(SESSION_COOKIE, token, cookieFor(Boolean(remember)))
    res.json({ user, remember: Boolean(remember) })
  } catch (err) {
    next(err)
  }
})

router.post('/logout', (req, res) => {
  destroySession(readToken(req))
  res.clearCookie(SESSION_COOKIE, { path: '/' })
  res.json({ ok: true })
})

/** 用户列表（仅管理员） */
router.get('/users', requireAuth, (req, res) => {
  if (req.user.role !== '管理员') {
    return res.status(403).json({ error: '仅管理员可查看成员列表' })
  }
  res.json({ items: listUsers() })
})

export default router
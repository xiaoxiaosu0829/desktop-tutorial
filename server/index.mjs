import express from 'express'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import db, { one } from './db.mjs'
import { log } from './lib/utils.mjs'
import authRoutes, { requireAuth } from './routes/auth.mjs'
import analytics from './routes/analytics.mjs'
import listings from './routes/listings.mjs'
import catalog from './routes/catalog.mjs'
import ops from './routes/ops.mjs'
import { startScheduler } from './services/crawler/index.mjs'
import { countUsers, registerUser } from './services/auth.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 8787)

const app = express()
app.use(express.json({ limit: '1mb' }))

// 轻量访问日志
app.use((req, res, next) => {
  const t0 = Date.now()
  res.on('finish', () => {
    if (req.path.startsWith('/api')) {
      log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - t0}ms)`)
    }
  })
  next()
})

// 公开接口：健康检查（用于探活，不含业务数据）
app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: 'V1.0', db: 'sqlite' })
})

// 账号接口（注册 / 登录 / 登出 / 当前用户）自身处理鉴权
app.use('/api/auth', authRoutes)

// 业务接口统一要求登录
app.use('/api', requireAuth)
app.use('/api', analytics)
app.use('/api', listings)
app.use('/api', catalog)
app.use('/api', ops)

// 生产模式：托管前端构建产物
const dist = join(here, '..', 'web', 'dist')
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(join(dist, 'index.html'))
  })
}

// 统一错误处理：带 status 的业务错误按原样返回
app.use((err, req, res, next) => {
  const status = err?.status ?? 500
  if (status >= 500) console.error('[api error]', err)
  res.status(status).json({ error: err?.message ?? '服务器内部错误' })
})

// 首次启动自动建库播种，开箱即用
if (one(`SELECT COUNT(*) c FROM games`).c === 0) {
  log('检测到空库，正在写入演示种子数据…')
  await import('./seed.mjs')
}

// 老库升级或首次启动：确保至少有一个可登录的管理员账号
if (countUsers() === 0) {
  registerUser({ username: 'admin', password: 'Admin@12345', displayName: '系统管理员' })
  log('已创建默认管理员账号 admin / Admin@12345（请登录后尽快修改）')
}

if (process.env.MONITOR_DISABLE_SCHEDULER !== '1') {
  startScheduler()
  log('巡检调度器已启动（每 60s 检查到期任务）')
}

const server = app.listen(PORT, () => {
  log(`API 已就绪 → http://127.0.0.1:${PORT}/api/health`)
  log(`前端开发地址 → http://127.0.0.1:5173 （npm run dev 时）`)
})

export { app, server, db }
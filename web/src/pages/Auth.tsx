import React from 'react'
import { auth, type SessionUser } from '../api'

type Mode = 'login' | 'register'

/** 记住账号的本地产物（只存用户名 + 过期时间，不存密码） */
const REMEMBER_KEY = 'ngcms.remember'
const REMEMBER_TTL_MS = 7 * 24 * 60 * 60 * 1000

function readRemembered(): { username: string; exp: number } | null {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.username || !parsed?.exp) return null
    if (parsed.exp < Date.now()) {
      localStorage.removeItem(REMEMBER_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function saveRemembered(username: string) {
  try {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username, exp: Date.now() + REMEMBER_TTL_MS }))
  } catch {
    /* 隐私模式下 localStorage 可能不可用，忽略 */
  }
}

function clearRemembered() {
  try {
    localStorage.removeItem(REMEMBER_KEY)
  } catch {
    /* ignore */
  }
}

export default function Auth({ onAuth }: { onAuth: (u: SessionUser) => void }) {
  const [mode, setMode] = React.useState<Mode>('login')
  const [form, setForm] = React.useState({ username: '', password: '', confirm: '', displayName: '' })
  const [remember, setRemember] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // 上次勾选过「记住账号密码」且未超过 7 天：回填用户名并默认勾选
  React.useEffect(() => {
    const saved = readRemembered()
    if (saved) {
      setForm((f) => ({ ...f, username: saved.username }))
      setRemember(true)
    }
  }, [])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const switchMode = (m: Mode) => {
    setMode(m)
    setError(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!form.username.trim() || !form.password) {
      setError('请填写用户名和密码')
      return
    }
    if (mode === 'register') {
      if (form.username.trim().length < 3) {
        setError('用户名至少 3 个字符')
        return
      }
      if (form.password.length < 8) {
        setError('密码至少 8 位')
        return
      }
      if (form.password !== form.confirm) {
        setError('两次输入的密码不一致')
        return
      }
    }

    setBusy(true)
    try {
      const user = mode === 'login'
        ? await auth.login({ username: form.username.trim(), password: form.password, remember })
        : await auth.register({
            username: form.username.trim(),
            password: form.password,
            displayName: form.displayName.trim() || undefined,
            remember,
          })

      if (remember) saveRemembered(user.username)
      else clearRemembered()

      onAuth(user)
    } catch (err: any) {
      setError(err.message ?? '操作失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-shell">
      <aside className="auth-brand">
        <div className="auth-logo">版</div>
        <h1>网络游戏账号交易<br />版权监测系统</h1>
        <p className="auth-sub">Game Account Trading Copyright Monitor · V1.0</p>

        <ul className="auth-points">
          <li><b>发现</b> 按关键词周期巡检交易渠道，留存公开页面快照</li>
          <li><b>归属</b> 标题归一化匹配版权库，容错别名与错别字</li>
          <li><b>判定</b> 8 条可解释规则打分，命中原文可追溯</li>
          <li><b>处置</b> 预警队列 → 通知下架 → 复核归档，全程留痕</li>
        </ul>

        <div className="auth-foot">仅限内部合规与维权使用 · 数据为演示样本</div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => switchMode('login')}
            >
              登录
            </button>
            <button
              type="button"
              className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => switchMode('register')}
            >
              注册
            </button>
          </div>

          <h2>{mode === 'login' ? '欢迎回来' : '创建账号'}</h2>
          <p className="auth-hint">
            {mode === 'login'
              ? '首次进入或关闭浏览器后都需要重新登录'
              : '注册后即可进入控制台；首个注册账号自动成为管理员'}
          </p>

          <form onSubmit={submit} className="auth-form">
            <label>
              用户名
              <input
                value={form.username}
                onChange={set('username')}
                autoComplete="username"
                placeholder="3-20 位，中英文 / 数字 / 下划线"
                disabled={busy}
              />
            </label>

            {mode === 'register' && (
              <label>
                显示名（可选）
                <input
                  value={form.displayName}
                  onChange={set('displayName')}
                  placeholder="如：法务-张明"
                  disabled={busy}
                />
              </label>
            )}

            <label>
              密码
              <input
                type="password"
                value={form.password}
                onChange={set('password')}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'login' ? '请输入密码' : '至少 8 位'}
                disabled={busy}
              />
            </label>

            {mode === 'register' && (
              <label>
                确认密码
                <input
                  type="password"
                  value={form.confirm}
                  onChange={set('confirm')}
                  autoComplete="new-password"
                  placeholder="再次输入密码"
                  disabled={busy}
                />
              </label>
            )}

            <label className="auth-remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                disabled={busy}
              />
              <span>
                记住账号密码
                <em>勾选后 7 天内免登录；超过 7 天未登录将自动失效，需要重新输入账号密码</em>
              </span>
            </label>

            {error && <div className="auth-error">{error}</div>}

            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? '处理中…' : mode === 'login' ? '登录' : '注册并登录'}
            </button>
          </form>

          <div className="auth-switch">
            {mode === 'login' ? (
              <>还没有账号？<a onClick={() => switchMode('register')}>立即注册</a></>
            ) : (
              <>已有账号？<a onClick={() => switchMode('login')}>去登录</a></>
            )}
          </div>

          {mode === 'login' && (
            <div className="auth-demo">
              演示管理员账号：<code>admin</code> / <code>Admin@12345</code>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
import React from 'react'
import { api, auth, type SessionUser } from './api'
import Auth from './pages/Auth'
import Overview from './pages/Overview'
import Listings from './pages/Listings'
import Alerts from './pages/Alerts'
import Cases from './pages/Cases'
import Tasks from './pages/Tasks'
import Catalog from './pages/Catalog'
import Reports from './pages/Reports'

const NAV = [
  {
    group: '监测工作台',
    items: [
      { key: 'overview', label: '总览看板', icon: '◧', title: '总览看板' },
      { key: 'listings', label: '商品线索', icon: '☰', title: '商品线索' },
      { key: 'alerts', label: '风险预警', icon: '⚑', title: '风险预警' },
      { key: 'cases', label: '案件管理', icon: '◈', title: '案件管理' },
    ],
  },
  {
    group: '运行管理',
    items: [
      { key: 'tasks', label: '监测任务', icon: '⟳', title: '监测任务与巡检记录' },
    ],
  },
  {
    group: '版权资产',
    items: [{ key: 'catalog', label: '版权与授权', icon: '❏', title: '版权库与授权台账' }],
  },
  {
    group: '合规输出',
    items: [{ key: 'reports', label: '监测报告', icon: '▤', title: '监测报告' }],
  },
]

const TITLES: Record<string, string> = Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i.key, i.title])))

function currentRoute() {
  const h = window.location.hash.replace(/^#\/?/, '')
  return TITLES[h] ? h : 'overview'
}

type SessionInfo = { expiresAt: string; daysLeft: number } | null

export default function App() {
  // undefined = 正在校验会话；null = 未登录
  const [user, setUser] = React.useState<SessionUser | null | undefined>(undefined)
  const [session, setSession] = React.useState<SessionInfo>(null)
  const [route, setRoute] = React.useState(currentRoute)
  const [meta, setMeta] = React.useState<any>(null)

  React.useEffect(() => {
    auth.me()
      .then((r) => {
        setUser(r.user)
        setSession(r.session ?? null)
      })
      .catch(() => setUser(null))
    const onExpired = () => {
      setUser(null)
      setSession(null)
    }
    window.addEventListener('ngcms:unauthorized', onExpired)
    return () => window.removeEventListener('ngcms:unauthorized', onExpired)
  }, [])

  React.useEffect(() => {
    const onHash = () => setRoute(currentRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  React.useEffect(() => {
    if (user) {
      window.location.hash = `#/${route}`
      api.meta().then(setMeta).catch(() => {})
    }
  }, [route, user])

  if (user === undefined) {
    return <div className="auth-splash">正在校验登录状态…</div>
  }

  if (!user) {
    return <Auth onAuth={(u) => { setUser(u); auth.me().then((r) => setSession(r.session ?? null)).catch(() => {}) }} />
  }

  const page = {
    overview: <Overview onNavigate={setRoute} />,
    listings: <Listings />,
    alerts: <Alerts />,
    cases: <Cases />,
    tasks: <Tasks />,
    catalog: <Catalog />,
    reports: <Reports />,
  }[route]

  const logout = async () => {
    try {
      await auth.logout()
    } catch {
      /* 网络异常也照样本地退出 */
    }
    setUser(null)
    setSession(null)
    setMeta(null)
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">版</div>
          <div className="brand-text">
            <strong>账号交易版权监测</strong>
            <span>{meta?.system?.version ?? 'V1.1'} · 内测框架</span>
          </div>
        </div>

        {NAV.map((g) => (
          <div className="nav-group" key={g.group}>
            <div className="nav-group-title">{g.group}</div>
            {g.items.map((it) => (
              <div
                key={it.key}
                className={`nav-item ${route === it.key ? 'active' : ''}`}
                onClick={() => setRoute(it.key)}
              >
                <span className="ico">{it.icon}</span>
                {it.label}
              </div>
            ))}
          </div>
        ))}

        <div className="sidebar-foot">
          网络游戏账号交易版权监测系统
          <br />
          V1.1 · 演示数据环境
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>{TITLES[route]}</h1>
          <span className="crumb">/ {NAV.find((g) => g.items.some((i) => i.key === route))?.group}</span>
          <span className="spacer" />

          <span className="pill demo">演示模式 · 合成数据</span>
          <span className="pill ver">{meta?.system?.version ?? 'V1.1'}</span>

          {/* 右上角账号区：登录入口 / 当前账号 / 退出 */}
          <div className="topbar-user">
            <div className="tb-avatar" title={user.displayName || user.username}>
              {(user.displayName || user.username).slice(0, 1)}
            </div>
            <div className="tb-meta">
              <strong>{user.displayName || user.username}</strong>
              <span>
                {user.role}
                {session && session.daysLeft > 0 ? ` · 免登录剩 ${session.daysLeft} 天` : ' · 本次会话'}
              </span>
            </div>
            <button className="btn sm" onClick={logout}>退出</button>
          </div>
        </header>
        <main className="content">{page}</main>
      </div>
    </div>
  )
}
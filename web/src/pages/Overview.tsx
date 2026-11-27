import React from 'react'
import { api, fmtTime, sourceLabel } from '../api'
import { RiskBadge, StatCard, Loading, StatusBadge } from '../components/ui'
import { BarList, Legend, LevelDonut, TrendChart } from '../components/charts'

export default function Overview({ onNavigate }: { onNavigate: (r: string) => void }) {
  const [data, setData] = React.useState<any>(null)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(() => {
    api.overview().then(setData).catch((e) => setError(e.message))
  }, [])

  React.useEffect(() => {
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [load])

  if (error) return <div className="card"><div className="empty">加载失败：{error}</div></div>
  if (!data) return <div className="card"><Loading /></div>

  const m = data.metrics

  return (
    <>
      <div className="grid cols-6" style={{ marginBottom: 14 }}>
        <StatCard label="监测线索总量" value={m.listings} hint={`近 7 日新增 ${m.newLast7d}`} />
        <StatCard label="高风险线索" value={m.highRisk} tone="danger" hint="未处置，需优先复核" />
        <StatCard label="待处理预警" value={m.openAlerts} tone="accent" hint={`处置率 ${m.handledRate}%`} />
        <StatCard label="在监测作品" value={m.games} hint={`素材库 ${m.assets ?? 0} 张 · 图片命中 ${m.imageHits ?? 0}`} />
        <StatCard label="未结案件" value={m.openCases ?? 0} tone="accent" hint="待受理 / 调查 / 发函中" />
        <StatCard label="处置完成率" value={`${m.handledRate}%`} hint="已处理 / 全部预警" />
      </div>

      <div className="grid cols-3" style={{ gridTemplateColumns: '1.55fr 1fr' }}>
        <div className="card">
          <div className="card-head">
            <h2>近 7 日监测趋势</h2>
            <span className="sub">按线索首次入库时间统计</span>
            <span className="spacer" />
            <button className="btn sm" onClick={load}>刷新</button>
          </div>
          <div className="card-body" style={{ padding: '8px 12px 4px' }}>
            <TrendChart data={data.trend} />
            <Legend items={[{ color: '#ff5b2e', label: '全部线索' }, { color: '#2b6cf6', label: '高风险线索' }]} />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>风险构成</h2>
            <span className="sub">按作品与等级</span>
          </div>
          <div className="card-body" style={{ padding: '10px 8px' }}>
            <LevelDonut data={data.levelDist} />
            <div style={{ marginTop: 14 }}>
              <BarList
                items={data.bySource.map((s: any) => ({ label: s.label, value: s.total }))}
                max={Math.max(...data.bySource.map((s: any) => s.total), 1)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid cols-2" style={{ gridTemplateColumns: '1.3fr 1fr', marginTop: 14 }}>
        <div className="card">
          <div className="card-head">
            <h2>高风险作品排行</h2>
            <span className="sub">线索数 / 其中高风险</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>作品</th>
                <th style={{ width: 90 }}>线索数</th>
                <th style={{ width: 100 }}>高风险</th>
                <th style={{ width: 120 }}>风险占比</th>
              </tr>
            </thead>
            <tbody>
              {data.topGames.map((g: any) => (
                <tr key={g.game}>
                  <td><div className="cell-title">{g.game}</div></td>
                  <td className="mono">{g.total}</td>
                  <td className="mono" style={{ color: g.high ? 'var(--danger)' : 'var(--ink-3)' }}>{g.high}</td>
                  <td>
                    <div className="track" style={{ height: 6, background: '#f0f1f5', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.round((g.high / Math.max(g.total, 1)) * 100)}%`, height: '100%', background: 'var(--danger)', opacity: 0.75 }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>最新预警</h2>
            <span className="spacer" />
            <button className="btn sm ghost" onClick={() => onNavigate('alerts')}>查看全部 →</button>
          </div>
          <div className="card-body" style={{ padding: '6px 16px 12px' }}>
            {data.recentAlerts.map((a: any) => (
              <div className="alert-row" key={a.id}>
                <span className="dot" style={{ background: a.severity === '高' ? 'var(--danger)' : a.severity === '中' ? 'var(--warn)' : 'var(--ok)' }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="t" title={a.title}>{a.title}</div>
                  <div className="m">
                    {a.ruleName} · {sourceLabel(a.source)} · {fmtTime(a.createdAt)}
                  </div>
                </div>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
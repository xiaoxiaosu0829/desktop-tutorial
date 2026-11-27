import React from 'react'
import { api, fmtMoney, fmtTime, sourceLabel, SOURCES } from '../api'
import { Loading, Empty, StatusBadge, useToast } from '../components/ui'

const SEVERITIES = ['高', '中', '低']
const STATUSES = ['新建', '处理中', '已处理', '误报']

export default function Alerts() {
  const [filters, setFilters] = React.useState({ status: '', severity: '', source: '' })
  const [data, setData] = React.useState<any>(null)
  const [page, setPage] = React.useState(1)
  const [busy, setBusy] = React.useState<string | null>(null)
  const { show, node } = useToast()

  const load = React.useCallback(() => {
    api.alerts({ ...filters, page, pageSize: 15 }).then(setData).catch((e) => show(e.message, true))
  }, [filters, page, show])

  React.useEffect(() => { load() }, [load])

  const act = async (id: string, status: string) => {
    setBusy(id)
    try {
      await api.updateAlert(id, status)
      load()
      show(`预警已更新为「${status}」`)
    } catch (e: any) {
      show(e.message, true)
    } finally {
      setBusy(null)
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-body">
          <div className="toolbar">
            <select className="select" value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1) }}>
              <option value="">全部状态</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="select" value={filters.severity} onChange={(e) => { setFilters({ ...filters, severity: e.target.value }); setPage(1) }}>
              <option value="">全部等级</option>
              {SEVERITIES.map((s) => <option key={s} value={s}>{s}危</option>)}
            </select>
            <select className="select" value={filters.source} onChange={(e) => { setFilters({ ...filters, source: e.target.value }); setPage(1) }}>
              <option value="">全部渠道</option>
              {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <span className="spacer" />
            <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>共 {data?.total ?? '—'} 条预警</span>
            <button className="btn" onClick={load}>刷新</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>风险预警队列</h2>
          <span className="sub">按「新建 → 处理中 → 已处理」推进</span>
        </div>
        {!data ? <Loading /> : data.items.length === 0 ? <Empty /> : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 92 }}>等级</th>
                <th>命中规则 / 线索</th>
                <th style={{ width: 110 }}>渠道</th>
                <th style={{ width: 96 }}>作品</th>
                <th style={{ width: 90 }}>标价</th>
                <th style={{ width: 92 }}>状态</th>
                <th style={{ width: 108 }}>产生时间</th>
                <th style={{ width: 168 }}>处置</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((a: any) => (
                <tr key={a.id}>
                  <td>
                    <span className={`badge ${a.severity === '高' ? 'high' : a.severity === '中' ? 'mid' : 'low'}`}>{a.severity}危</span>
                  </td>
                  <td>
                    <div className="cell-title" title={a.title}>{a.rule_name}</div>
                    <div className="cell-sub">{a.title}</div>
                  </td>
                  <td>{sourceLabel(a.source)}</td>
                  <td>{a.gameName ?? '未收录'}</td>
                  <td className="mono">{fmtMoney(a.price)}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td style={{ color: 'var(--ink-3)' }}>{fmtTime(a.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {a.status !== '处理中' && a.status !== '已处理' && a.status !== '误报' && (
                        <button className="btn sm" disabled={busy === a.id} onClick={() => act(a.id, '处理中')}>接单</button>
                      )}
                      {a.status !== '已处理' && a.status !== '误报' && (
                        <button className="btn sm primary" disabled={busy === a.id} onClick={() => act(a.id, '已处理')}>已处理</button>
                      )}
                      {a.status !== '误报' && (
                        <button className="btn sm ghost" disabled={busy === a.id} onClick={() => act(a.id, '误报')}>误报</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="pager">
          <span>第 {page} / {totalPages} 页</span>
          <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
          <button className="btn sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</button>
        </div>
      </div>
      {node}
    </>
  )
}
import React from 'react'
import { api, fmtMoney, fmtTime, sourceLabel } from '../api'
import { Drawer, Empty, Loading, RiskBadge, StatusBadge, useToast } from '../components/ui'

const LEVELS = ['高', '中', '低']
const STATUSES = ['待审核', '侵权风险', '合规', '已通知', '已下架', '误报']

export default function Listings() {
  const [filters, setFilters] = React.useState({ q: '', source: '', level: '', status: '', sort: 'risk' })
  const [data, setData] = React.useState<any>(null)
  const [page, setPage] = React.useState(1)
  const [detail, setDetail] = React.useState<any>(null)
  const [busy, setBusy] = React.useState(false)
  const { show, node } = useToast()

  const load = React.useCallback(() => {
    api.listings({ ...filters, page, pageSize: 12 })
      .then(setData)
      .catch((e) => show(e.message, true))
  }, [filters, page, show])

  React.useEffect(() => { load() }, [load])

  const openDetail = async (id: string) => {
    try {
      setDetail(await api.listing(id))
    } catch (e: any) {
      show(e.message, true)
    }
  }

  const act = async (status: string) => {
    if (!detail) return
    setBusy(true)
    try {
      await api.updateListing(detail.listing.id, status)
      setDetail(await api.listing(detail.listing.id))
      load()
      show(`已更新为「${status}」`)
    } catch (e: any) {
      show(e.message, true)
    } finally {
      setBusy(false)
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-body">
          <div className="toolbar">
            <input
              className="input search" placeholder="搜索标题 / 卖家 / 作品…"
              value={filters.q}
              onChange={(e) => { setFilters({ ...filters, q: e.target.value }); setPage(1) }}
            />
            <select className="select" value={filters.source} onChange={(e) => { setFilters({ ...filters, source: e.target.value }); setPage(1) }}>
              <option value="">全部渠道</option>
              <option value="jiaoyimao">交易猫</option>
              <option value="pangxie">螃蟹账号交易</option>
            </select>
            <select className="select" value={filters.level} onChange={(e) => { setFilters({ ...filters, level: e.target.value }); setPage(1) }}>
              <option value="">全部等级</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l}风险</option>)}
            </select>
            <select className="select" value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1) }}>
              <option value="">全部状态</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="select" value={filters.sort} onChange={(e) => { setFilters({ ...filters, sort: e.target.value }); setPage(1) }}>
              <option value="risk">按风险分排序</option>
              <option value="new">按入库时间排序</option>
              <option value="price">按价格排序</option>
            </select>
            <span className="spacer" />
            <button className="btn" onClick={load}>刷新</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>商品线索</h2>
          <span className="sub">{data ? `共 ${data.total} 条` : '—'}</span>
        </div>
        {!data ? <Loading /> : data.items.length === 0 ? <Empty /> : (
          <table className="table">
            <thead>
              <tr>
                <th>商品标题</th>
                <th style={{ width: 110 }}>渠道</th>
                <th style={{ width: 110 }}>作品</th>
                <th style={{ width: 96 }}>价格</th>
                <th style={{ width: 92 }}>风险</th>
                <th style={{ width: 96 }}>状态</th>
                <th style={{ width: 110 }}>快照时间</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it: any) => (
                <tr key={it.id} className="clickable" onClick={() => openDetail(it.id)}>
                  <td>
                    <div className="cell-title" title={it.title}>{it.title}</div>
                    <div className="cell-sub">{it.sellerName} · {it.externalId}</div>
                  </td>
                  <td>{sourceLabel(it.source)}</td>
                  <td>{it.gameName ?? <span style={{ color: 'var(--ink-3)' }}>未收录</span>}</td>
                  <td className="mono">{fmtMoney(it.price)}</td>
                  <td>
                    <RiskBadge level={it.riskLevel} />
                    <span className="mono" style={{ marginLeft: 6, color: 'var(--ink-3)', fontSize: 11.5 }}>{it.riskScore}</span>
                  </td>
                  <td><StatusBadge status={it.status} /></td>
                  <td style={{ color: 'var(--ink-3)' }}>{fmtTime(it.snapshotAt)}</td>
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

      {detail && (
        <Drawer
          title={detail.listing.title}
          subtitle={`${sourceLabel(detail.listing.source)} · ${detail.listing.external_id ?? detail.listing.externalId ?? ''} · 快照 ${fmtTime(detail.listing.snapshot_at ?? detail.listing.snapshotAt)}`}
          onClose={() => setDetail(null)}
          footer={
            <>
              <button className="btn" disabled={busy} onClick={() => act('合规')}>标记合规</button>
              <button className="btn" disabled={busy} onClick={() => act('误报')}>标记误报</button>
              <button className="btn" disabled={busy} onClick={() => act('已通知')}>发起下架通知</button>
              <button className="btn primary" disabled={busy} onClick={() => act('已下架')}>确认已下架</button>
            </>
          }
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <RiskBadge level={detail.verdict.level} />
            <StatusBadge status={detail.listing.status} />
            <span className="badge gray">风险分 {detail.verdict.score}</span>
            {detail.listing.marketAvg ? (
              <span className="badge blue">同作品均价 {fmtMoney(detail.listing.marketAvg)}</span>
            ) : null}
          </div>

          <div className="advise-box">处置建议：{detail.verdict.advise}</div>

          <div className="section-title">商品信息</div>
          <dl className="kv">
            <dt>作品</dt><dd>{detail.listing.game?.name ?? '未收录（建议人工确认）'}</dd>
            <dt>卖家</dt><dd>{detail.listing.seller_name}{detail.listing.seller?.authorized ? '（已备案授权方）' : '（未在授权名单）'}</dd>
            <dt>标价</dt><dd>{fmtMoney(detail.listing.price)}</dd>
            <dt>商品链接</dt><dd>{detail.listing.url}</dd>
            <dt>商品描述</dt><dd>{detail.listing.description || '—'}</dd>
          </dl>

          <div className="section-title">命中规则（{detail.alerts.length}）</div>
          {detail.alerts.length === 0 ? <Empty text="未命中任何规则" /> : detail.alerts.map((a: any) => (
            <div className="rule-item" key={a.id}>
              <span className={`badge ${a.severity === '高' ? 'high' : a.severity === '中' ? 'mid' : 'low'}`}>{a.rule_code}</span>
              <div style={{ flex: 1 }}>
                <div className="rule-name">{a.rule_name}</div>
                <div className="rule-detail">{a.detail}</div>
              </div>
              <StatusBadge status={a.status} />
            </div>
          ))}

          <div className="section-title">原始快照</div>
          <pre style={{ background: '#fafbfc', border: '1px solid var(--line)', borderRadius: 10, padding: 12, fontSize: 11.5, overflow: 'auto', maxHeight: 220 }}>
{JSON.stringify(detail.listing.raw ?? {}, null, 2)}
          </pre>
        </Drawer>
      )}

      {node}
    </>
  )
}
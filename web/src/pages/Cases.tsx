import React from 'react'
import { api, fmtMoney, fmtTime, sourceLabel } from '../api'
import { Drawer, Empty, Loading, RiskBadge, StatusBadge, useToast } from '../components/ui'

const STATUSES = ['待受理', '调查中', '已发函', '渠道处理中', '已结案', '已驳回']
const PRIORITIES = ['高', '中', '低']

const statusTone = (s: string) =>
  s === '已结案' ? 'low' : s === '已驳回' ? 'gray' : s === '已发函' ? 'brand' : s === '渠道处理中' ? 'blue' : 'mid'

export default function Cases() {
  const [data, setData] = React.useState<any>(null)
  const [filters, setFilters] = React.useState({ status: 'open', priority: '', q: '' })
  const [detail, setDetail] = React.useState<any>(null)
  const [showForm, setShowForm] = React.useState(false)
  const [form, setForm] = React.useState({ title: '', priority: '中', owner: '', deadline: '', summary: '' })
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const { show, node } = useToast()

  const load = React.useCallback(() => {
    api.cases(filters).then(setData).catch((e) => show(e.message, true))
  }, [filters, show])

  React.useEffect(() => { load() }, [load])

  const openDetail = async (id: string) => {
    try { setDetail(await api.caseDetail(id)) } catch (e: any) { show(e.message, true) }
  }

  const create = async () => {
    try {
      if (!form.title.trim()) throw new Error('请填写案件标题')
      const c = await api.createCase({ ...form, deadline: form.deadline || null })
      setShowForm(false)
      setForm({ title: '', priority: '中', owner: '', deadline: '', summary: '' })
      load()
      show(`已建案 ${c.code}`)
    } catch (e: any) { show(e.message, true) }
  }

  const changeStatus = async (status: string) => {
    if (!detail) return
    setBusy(true)
    try {
      await api.updateCase(detail.case.id, { status })
      setDetail(await api.caseDetail(detail.case.id))
      load()
      show(`案件状态已更新为「${status}」`)
    } catch (e: any) { show(e.message, true) } finally { setBusy(false) }
  }

  const addNote = async () => {
    if (!detail || !note.trim()) return
    setBusy(true)
    try {
      await api.addCaseEvent(detail.case.id, { type: '备注', content: note, actor: '运营' })
      setNote('')
      setDetail(await api.caseDetail(detail.case.id))
      load()
    } catch (e: any) { show(e.message, true) } finally { setBusy(false) }
  }

  const stats = data?.stats

  return (
    <>
      <div className="grid cols-6" style={{ marginBottom: 14 }}>
        <div className="card stat"><div className="label">案件总数</div><div className="value">{stats?.total ?? '—'}</div></div>
        <div className="card stat accent"><div className="label">未结案件</div><div className="value">{stats?.open ?? '—'}</div></div>
        <div className="card stat ok"><div className="label">已结案</div><div className="value">{stats?.closed ?? '—'}</div></div>
        <div className="card stat danger"><div className="label">已逾期</div><div className="value">{stats?.overdue ?? '—'}</div><div className="hint">超过处置期限</div></div>
      </div>

      <div className="toolbar" style={{ marginBottom: 14 }}>
        <select className="select" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="open">未结案件</option>
          <option value="">全部状态</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="select" value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })}>
          <option value="">全部优先级</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}优先级</option>)}
        </select>
        <input className="input search" placeholder="搜索案件编号 / 标题 / 卖家" value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <span className="spacer" />
        <button className="btn" onClick={load}>刷新</button>
        <button className="btn primary" onClick={() => setShowForm((v) => !v)}>{showForm ? '收起' : '＋ 新建案件'}</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h2>新建案件</h2><span className="sub">也可在「商品线索」详情页从线索直接立案</span></div>
          <div className="card-body">
            <div className="form-grid">
              <div className="field span-2">
                <label>案件标题</label>
                <input value={form.title} placeholder="如：某店铺批量未授权经销王者荣耀账号" onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="field">
                <label>优先级</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="field"><label>负责人</label><input value={form.owner} placeholder="如：法务-张明" onChange={(e) => setForm({ ...form, owner: e.target.value })} /></div>
              <div className="field"><label>处置期限</label><input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></div>
              <div className="field"><label>案情摘要</label><input value={form.summary} placeholder="一句话说明" onChange={(e) => setForm({ ...form, summary: e.target.value })} /></div>
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
              <button className="btn primary" onClick={create}>建案</button>
              <button className="btn" onClick={() => setShowForm(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head"><h2>案件列表</h2><span className="sub">{data ? `共 ${data.items.length} 件` : ''}</span></div>
        {!data ? <Loading /> : data.items.length === 0 ? <Empty text="暂无案件" /> : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 150 }}>案件编号</th>
                <th>标题</th>
                <th style={{ width: 90 }}>优先级</th>
                <th style={{ width: 108 }}>状态</th>
                <th style={{ width: 108 }}>负责人</th>
                <th style={{ width: 120 }}>期限</th>
                <th style={{ width: 90 }}>线索</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c: any) => (
                <tr key={c.id} className="clickable" onClick={() => openDetail(c.id)}>
                  <td className="mono">{c.code}</td>
                  <td>
                    <div className="cell-title">{c.title}</div>
                    <div className="cell-sub">{fmtTime(c.created_at)} 建案</div>
                  </td>
                  <td><span className={`badge ${c.priority === '高' ? 'high' : c.priority === '中' ? 'mid' : 'low'}`}>{c.priority}</span></td>
                  <td><span className={`badge ${statusTone(c.status)}`}>{c.status}</span></td>
                  <td>{c.owner || '—'}</td>
                  <td style={{ color: c.overdue ? 'var(--danger)' : 'var(--ink-3)' }}>
                    {c.deadline ? fmtTime(c.deadline) : '—'}{c.overdue ? ' · 逾期' : ''}
                  </td>
                  <td className="mono">{c.listingCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detail && (
        <Drawer
          title={`${detail.case.code} · ${detail.case.title}`}
          subtitle={`${detail.case.status} · 负责人 ${detail.case.owner || '—'} · ${detail.case.priority}优先级`}
          onClose={() => setDetail(null)}
          footer={
            <>
              {detail.case.status === '待受理' && <button className="btn" disabled={busy} onClick={() => changeStatus('调查中')}>接单调查</button>}
              {detail.case.status === '调查中' && <button className="btn" disabled={busy} onClick={() => changeStatus('已发函')}>已发函</button>}
              {detail.case.status === '已发函' && <button className="btn" disabled={busy} onClick={() => changeStatus('渠道处理中')}>渠道处理中</button>}
              {!['已结案', '已驳回'].includes(detail.case.status) && (
                <>
                  <button className="btn" disabled={busy} onClick={() => changeStatus('已驳回')}>驳回</button>
                  <button className="btn primary" disabled={busy} onClick={() => changeStatus('已结案')}>结案</button>
                </>
              )}
            </>
          }
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <span className={`badge ${statusTone(detail.case.status)}`}>{detail.case.status}</span>
            <span className={`badge ${detail.case.priority === '高' ? 'high' : detail.case.priority === '中' ? 'mid' : 'low'}`}>{detail.case.priority}优先级</span>
            <span className="badge gray">关联 {detail.listings.length} 条线索</span>
            {detail.case.overdue && <span className="badge high">已逾期</span>}
          </div>

          <div className="advise-box" style={{ marginBottom: 16 }}>{detail.case.summary || '暂无案情摘要'}</div>

          <div className="section-title">关联线索</div>
          {detail.listings.length === 0 ? <Empty text="尚未关联线索" /> : detail.listings.map((l: any) => (
            <div className="rule-item" key={l.id}>
              <RiskBadge level={l.riskLevel} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="rule-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</div>
                <div className="rule-detail">{sourceLabel(l.source)} · {l.gameName ?? '未收录'} · {fmtMoney(l.price)} · {l.status}</div>
              </div>
              <span className="badge gray">{l.riskScore}</span>
            </div>
          ))}

          <div className="section-title">处置时间线</div>
          {detail.events.map((e: any) => (
            <div key={e.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #f2f3f6' }}>
              <span className="badge blue" style={{ height: 20 }}>{e.type}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5 }}>{e.content}</div>
                <div className="cell-sub">{e.actor} · {fmtTime(e.created_at)}</div>
              </div>
            </div>
          ))}

          <div className="section-title">追加备注</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" style={{ flex: 1 }} value={note} placeholder="如：已联系渠道客服，等待回执"
              onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} />
            <button className="btn" disabled={busy || !note.trim()} onClick={addNote}>添加</button>
          </div>
        </Drawer>
      )}
      {node}
    </>
  )
}
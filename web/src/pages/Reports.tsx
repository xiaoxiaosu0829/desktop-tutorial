import React from 'react'
import { api, fmtTime } from '../api'
import { BarList } from '../components/charts'
import { Empty, Loading, useToast } from '../components/ui'

export default function Reports() {
  const [reports, setReports] = React.useState<any[] | null>(null)
  const [active, setActive] = React.useState<any | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [range, setRange] = React.useState({ type: '周期报告', from: '', to: '' })
  const { show, node } = useToast()

  const load = React.useCallback(() => {
    api.reports().then((r) => {
      setReports(r.items)
      setActive((cur: any) => cur ?? r.items[0] ?? null)
    }).catch((e) => show(e.message, true))
  }, [show])

  React.useEffect(() => { load() }, [load])

  const create = async () => {
    setCreating(true)
    try {
      const r = await api.createReport({
        type: range.type,
        from: range.from ? new Date(range.from).toISOString() : undefined,
        to: range.to ? new Date(`${range.to}T23:59:59`).toISOString() : undefined,
      })
      await load()
      setActive(r)
      show('报告已生成')
    } catch (e: any) {
      show(e.message, true)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: '280px 1fr' }}>
      <div className="card" style={{ alignSelf: 'start' }}>
        <div className="card-head"><h2>报告列表</h2><span className="spacer" /><span className="sub">{reports?.length ?? 0} 份</span></div>
        <div className="card-body" style={{ padding: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {!reports ? <Loading /> : reports.length === 0 ? <Empty text="暂无报告" /> : reports.map((r) => (
              <div
                key={r.id}
                onClick={() => setActive(r)}
                style={{
                  padding: '10px 12px', borderRadius: 9, cursor: 'pointer',
                  background: active?.id === r.id ? 'var(--brand-soft)' : 'transparent',
                  border: `1px solid ${active?.id === r.id ? '#ffd9cb' : 'transparent'}`,
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 500, color: active?.id === r.id ? '#b23b12' : 'var(--ink)' }}>
                  {r.title}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 3 }}>
                  {r.type} · {r.period} · {fmtTime(r.created_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card-body" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="field" style={{ marginBottom: 8 }}>
            <label>报告类型</label>
            <select value={range.type} onChange={(e) => setRange({ ...range, type: e.target.value })}>
              <option>周期报告</option><option>单案报告</option><option>下架通知函</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>开始</label>
              <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>结束</label>
              <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            </div>
          </div>
          <button className="btn primary" style={{ width: '100%', marginTop: 10 }} disabled={creating} onClick={create}>
            {creating ? '生成中…' : '生成新报告'}
          </button>
        </div>
      </div>

      <div className="card" style={{ alignSelf: 'start' }}>
        {!active ? <Empty text="选择左侧报告查看详情" /> : (
          <>
            <div className="card-head">
              <h2>{active.title}</h2>
              <span className="spacer" />
              <span className="badge gray">{active.type}</span>
              <span className="badge blue">{active.period}</span>
            </div>
            <div className="card-body">
              <div className="grid cols-3" style={{ marginBottom: 18 }}>
                <div><div className="stat"><div className="label">线索总量</div><div className="value">{active.payload.summary.listings}</div></div></div>
                <div><div className="stat"><div className="label">预警数量</div><div className="value">{active.payload.summary.alerts}</div></div></div>
                <div><div className="stat"><div className="label">处置完成率</div><div className="value">{active.payload.summary.handledRate}%</div></div></div>
              </div>

              <div className="section-title">作品分布</div>
              <BarList items={active.payload.byGame.map((g: any) => ({ label: g.game, value: g.c }))} max={Math.max(1, ...active.payload.byGame.map((g: any) => g.c))} />

              <div className="grid cols-2" style={{ marginTop: 20 }}>
                <div>
                  <div className="section-title">渠道构成</div>
                  <BarList color="blue" items={active.payload.bySource.map((s: any) => ({ label: s.source === 'jiaoyimao' ? '交易猫' : '螃蟹账号交易', value: s.c }))} />
                </div>
                <div>
                  <div className="section-title">高频命中规则</div>
                  <table className="table">
                    <thead><tr><th>规则</th><th style={{ width: 60 }}>次数</th></tr></thead>
                    <tbody>
                      {active.payload.topRules.map((r: any) => (
                        <tr key={r.rule_code}>
                          <td><div className="cell-title" style={{ maxWidth: 240 }}>{r.rule_name}</div><div className="cell-sub">{r.severity}危</div></td>
                          <td className="mono">{r.c}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="section-title">数据说明</div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.8 }}>
                本报告由系统按监测窗口自动汇总，仅统计已入库的公开交易页面快照，不含商家或个人隐私信息。
                报告可作为向渠道发起下架、向版权方汇报的初步材料，正式取证与法律文书请以公证 / 时间戳固化的原始快照为准。
              </div>
            </div>
          </>
        )}
      </div>
      {node}
    </div>
  )
}
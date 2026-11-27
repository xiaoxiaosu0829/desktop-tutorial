import React from 'react'
import { api, fmtTime, sourceLabel, SOURCES } from '../api'
import { Empty, Loading, useToast } from '../components/ui'

const emptyForm = { name: '', source: 'jiaoyimao', keywords: '王者荣耀, 原神', intervalMinutes: 360 }

export default function Tasks() {
  const [tasks, setTasks] = React.useState<any[] | null>(null)
  const [runs, setRuns] = React.useState<any[]>([])
  const [showForm, setShowForm] = React.useState(false)
  const [form, setForm] = React.useState(emptyForm)
  const [running, setRunning] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<any>(null)
  const { show, node } = useToast()

  const load = React.useCallback(() => {
    api.tasks().then((r) => setTasks(r.items)).catch((e) => show(e.message, true))
    api.runs().then((r) => setRuns(r.items)).catch(() => {})
  }, [show])

  React.useEffect(() => { load() }, [load])

  const create = async () => {
    try {
      const keywords = form.keywords.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean)
      if (!form.name.trim()) throw new Error('请填写任务名称')
      if (keywords.length === 0) throw new Error('请至少填写一个关键词')
      await api.createTask({ ...form, keywords, intervalMinutes: Number(form.intervalMinutes) })
      setShowForm(false)
      setForm(emptyForm)
      load()
      show('监测任务已创建')
    } catch (e: any) {
      show(e.message, true)
    }
  }

  const toggle = async (t: any) => {
    try {
      await api.updateTask(t.id, { enabled: !t.enabled })
      load()
    } catch (e: any) {
      show(e.message, true)
    }
  }

  const remove = async (t: any) => {
    try {
      await api.deleteTask(t.id)
      load()
      show('任务已删除')
    } catch (e: any) {
      show(e.message, true)
    }
  }

  const runNow = async (t: any) => {
    setRunning(t.id)
    setResult(null)
    try {
      const r = await api.runTask(t.id)
      setResult({ task: t.name, ...r })
      load()
      show(`巡检完成：命中 ${r.found} 条，新增 ${r.created} 条`)
    } catch (e: any) {
      show(e.message, true)
    } finally {
      setRunning(null)
    }
  }

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>
          调度器每 60 秒检查一次到期任务；也可手动触发单次巡检
        </span>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? '收起' : '＋ 新建监测任务'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h2>新建监测任务</h2></div>
          <div className="card-body">
            <div className="form-grid">
              <div className="field">
                <label>任务名称</label>
                <input value={form.name} placeholder="如：王者荣耀重点巡检" onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label>监测渠道</label>
                <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                  {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div className="field span-2">
                <label>关键词（逗号分隔）</label>
                <input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
              </div>
              <div className="field">
                <label>巡检间隔（分钟）</label>
                <input type="number" min={30} value={form.intervalMinutes} onChange={(e) => setForm({ ...form, intervalMinutes: Number(e.target.value) })} />
              </div>
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
              <button className="btn primary" onClick={create}>保存任务</button>
              <button className="btn" onClick={() => setShowForm(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head">
            <h2>巡检结果 · {result.task}</h2>
            <span className="spacer" />
            <button className="btn sm ghost" onClick={() => setResult(null)}>关闭</button>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 22, fontSize: 12.5 }}>
              <span>命中 <strong className="mono">{result.found}</strong> 条</span>
              <span>新增 <strong className="mono" style={{ color: 'var(--brand)' }}>{result.created}</strong> 条</span>
              <span>更新 <strong className="mono">{result.updated}</strong> 条</span>
              <span>生成预警 <strong className="mono" style={{ color: 'var(--danger)' }}>{result.alerts}</strong> 条</span>
            </div>
            <pre style={{ marginTop: 12, background: '#fafbfc', border: '1px solid var(--line)', borderRadius: 10, padding: 12, fontSize: 11.5, maxHeight: 180, overflow: 'auto' }}>
{(result.log ?? []).join('\n')}
            </pre>
          </div>
        </div>
      )}

      {!tasks ? <div className="card"><Loading /></div> : (
        <div className="grid cols-3">
          {tasks.map((t) => (
            <div className="card" key={t.id}>
              <div className="card-head">
                <h2 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</h2>
                <span className="spacer" />
                <span className={`badge ${t.enabled ? 'low' : 'gray'}`}>{t.enabled ? '运行中' : '已停用'}</span>
              </div>
              <div className="card-body">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  <span className="badge blue">{sourceLabel(t.source)}</span>
                  <span className="badge gray">每 {t.interval_minutes} 分钟</span>
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
                  {t.keywords.map((k: string) => <span className="badge brand" key={k}>{k}</span>)}
                </div>
                <dl className="kv" style={{ gridTemplateColumns: '76px 1fr' }}>
                  <dt>累计命中</dt><dd className="mono">{t.total_found}</dd>
                  <dt>累计新增</dt><dd className="mono">{t.total_new}</dd>
                  <dt>上次运行</dt><dd>{fmtTime(t.last_run_at)}</dd>
                  <dt>下次运行</dt><dd>{fmtTime(t.next_run_at)}</dd>
                </dl>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button className="btn sm primary" disabled={running === t.id} onClick={() => runNow(t)}>
                    {running === t.id ? '巡检中…' : '立即巡检'}
                  </button>
                  <button className="btn sm" onClick={() => toggle(t)}>{t.enabled ? '停用' : '启用'}</button>
                  <span style={{ flex: 1 }} />
                  <button className="btn sm danger" onClick={() => remove(t)}>删除</button>
                </div>
              </div>
            </div>
          ))}
          {tasks.length === 0 && <div className="card"><Empty text="还没有监测任务" /></div>}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h2>巡检记录</h2><span className="sub">最近 20 条</span></div>
        {runs.length === 0 ? <Empty /> : (
          <table className="table">
            <thead>
              <tr>
                <th>任务</th><th>渠道</th><th style={{ width: 96 }}>命中</th><th style={{ width: 96 }}>新增</th>
                <th style={{ width: 96 }}>状态</th><th style={{ width: 150 }}>开始时间</th><th>日志</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{r.taskName ?? '—'}</td>
                  <td>{sourceLabel(r.source)}</td>
                  <td className="mono">{r.found}</td>
                  <td className="mono">{r.new_count}</td>
                  <td><span className={`badge ${r.status === '成功' ? 'low' : r.status === '失败' ? 'high' : 'mid'}`}>{r.status}</span></td>
                  <td style={{ color: 'var(--ink-3)' }}>{fmtTime(r.started_at)}</td>
                  <td style={{ color: 'var(--ink-3)', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.log ?? ''}>
                    {(r.log ?? '').split('\n').pop()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {node}
    </>
  )
}
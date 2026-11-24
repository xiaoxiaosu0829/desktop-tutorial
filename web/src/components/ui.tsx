import React from 'react'

export function RiskBadge({ level }: { level?: string }) {
  const cls = level === '高' ? 'high' : level === '中' ? 'mid' : 'low'
  return <span className={`badge ${cls}`}>{level ?? '低'}风险</span>
}

export function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, string> = {
    待审核: 'gray',
    侵权风险: 'high',
    合规: 'low',
    已通知: 'brand',
    已下架: 'blue',
    误报: 'gray',
    新建: 'brand',
    处理中: 'mid',
    已处理: 'low',
  }
  return <span className={`badge ${map[status ?? ''] ?? 'gray'}`}>{status ?? '—'}</span>
}

export function StatCard({
  label, value, hint, tone,
}: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; tone?: 'accent' | 'danger' | 'ok' }) {
  return (
    <div className={`card stat ${tone ?? ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  )
}

export function Drawer({
  title, subtitle, onClose, footer, children,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  onClose: () => void
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="drawer-mask" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div style={{ flex: 1 }}>
            <h3>{title}</h3>
            {subtitle ? <div className="cell-sub">{subtitle}</div> : null}
          </div>
          <button className="btn sm ghost" onClick={onClose}>关闭</button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer ? <div className="drawer-foot">{footer}</div> : null}
      </div>
    </div>
  )
}

export function Toast({ message, error, onDone }: { message: string; error?: boolean; onDone: () => void }) {
  React.useEffect(() => {
    const t = setTimeout(onDone, 2600)
    return () => clearTimeout(t)
  }, [message, onDone])
  return <div className={`toast ${error ? 'err' : ''}`}>{message}</div>
}

export function useToast() {
  const [toast, setToast] = React.useState<{ message: string; error?: boolean } | null>(null)
  const show = React.useCallback((message: string, error = false) => setToast({ message, error }), [])
  const node = toast ? <Toast message={toast.message} error={toast.error} onDone={() => setToast(null)} /> : null
  return { show, node }
}

export function Loading({ text = '加载中…' }: { text?: string }) {
  return <div className="empty">{text}</div>
}

export function Empty({ text = '暂无数据' }: { text?: string }) {
  return <div className="empty">{text}</div>
}
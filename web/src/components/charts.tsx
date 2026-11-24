import React from 'react'

type TrendPoint = { date: string; total: number; high: number }

/** 近 7 日趋势：总量折线 + 高风险折线（原生 SVG，无图表库依赖） */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  const W = 720
  const H = 190
  const P = { l: 34, r: 12, t: 14, b: 26 }
  const iw = W - P.l - P.r
  const ih = H - P.t - P.b
  const max = Math.max(4, ...data.map((d) => d.total)) * 1.15

  const x = (i: number) => P.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw)
  const y = (v: number) => P.t + ih - (v / max) * ih

  const line = (key: 'total' | 'high') =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ')

  const area = `${line('total')} L${x(data.length - 1).toFixed(1)},${P.t + ih} L${x(0).toFixed(1)},${P.t + ih} Z`
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f))

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="近 7 日线索趋势">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff5b2e" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#ff5b2e" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="#eef0f4" strokeWidth="1" />
            <text x={P.l - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#9aa0ae">{t}</text>
          </g>
        ))}
        <path d={area} fill="url(#areaFill)" />
        <path d={line('total')} fill="none" stroke="#ff5b2e" strokeWidth="2" strokeLinejoin="round" />
        <path d={line('high')} fill="none" stroke="#2b6cf6" strokeWidth="1.8" strokeDasharray="4 3" strokeLinejoin="round" />
        {data.map((d, i) => (
          <g key={d.date}>
            <circle cx={x(i)} cy={y(d.total)} r="3" fill="#fff" stroke="#ff5b2e" strokeWidth="2" />
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#9aa0ae">{d.date}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}><i style={{ background: i.color }} />{i.label}</span>
      ))}
    </div>
  )
}

/** 横向条形：用于构成分析（渠道 / 规则 TopN） */
export function BarList({
  items, color = 'brand', max,
}: { items: { label: string; value: number; hint?: string }[]; color?: 'brand' | 'blue'; max?: number }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value))
  return (
    <div className="barlist">
      {items.map((it) => (
        <div className="row" key={it.label}>
          <div style={{ color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.label}>
            {it.label}
          </div>
          <div className="track">
            <div
              className="fill"
              style={{
                width: `${(it.value / top) * 100}%`,
                background: color === 'blue' ? 'linear-gradient(90deg,#7ea2ff,#2b6cf6)' : undefined,
              }}
            />
          </div>
          <div className="num mono">{it.value}</div>
        </div>
      ))}
    </div>
  )
}

/** 风险等级环形占比 */
export function LevelDonut({ data }: { data: { level: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1
  const colors: Record<string, string> = { 高: '#e5484d', 中: '#e79c1d', 低: '#17a673' }
  const R = 52
  const C = 2 * Math.PI * R
  let offset = 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '4px 6px' }}>
      <svg width="132" height="132" viewBox="0 0 132 132">
        <g transform="translate(66,66) rotate(-90)">
          <circle r={R} fill="none" stroke="#f1f2f5" strokeWidth="13" />
          {data.map((d) => {
            const len = (d.count / total) * C
            const el = (
              <circle
                key={d.level} r={R} fill="none" stroke={colors[d.level] ?? '#ccc'} strokeWidth="13"
                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} strokeLinecap="butt"
              />
            )
            offset += len
            return el
          })}
        </g>
        <text x="66" y="62" textAnchor="middle" fontSize="20" fontWeight="650" fill="#16181d">{total}</text>
        <text x="66" y="80" textAnchor="middle" fontSize="10" fill="#8b91a1">线索总量</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
        {data.map((d) => (
          <div key={d.level} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i style={{ width: 8, height: 8, borderRadius: 2, background: colors[d.level], display: 'inline-block' }} />
            <span style={{ color: 'var(--ink-2)', width: 42 }}>{d.level}风险</span>
            <strong className="mono">{d.count}</strong>
            <span style={{ color: 'var(--ink-3)' }}>{Math.round((d.count / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
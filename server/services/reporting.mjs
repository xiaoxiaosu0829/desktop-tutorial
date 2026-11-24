import { all, one, run, nowISO } from '../db.mjs'
import { daysAgo, fmtDate } from '../lib/utils.mjs'

/** 生成一份周期报告的数据载荷（与前端报告页共用结构） */
export function buildReportPayload({ from, to } = {}) {
  const fromISO = from ?? daysAgo(6).toISOString()
  const toISO = to ?? nowISO()

  const total = one(`SELECT COUNT(*) AS c FROM listings WHERE created_at BETWEEN ? AND ?`, [fromISO, toISO]).c
  const byLevel = all(`SELECT risk_level AS level, COUNT(*) AS c FROM listings WHERE created_at BETWEEN ? AND ? GROUP BY risk_level`, [fromISO, toISO])
  const bySource = all(`SELECT source, COUNT(*) AS c, SUM(CASE WHEN risk_level='高' THEN 1 ELSE 0 END) AS high FROM listings WHERE created_at BETWEEN ? AND ? GROUP BY source`, [fromISO, toISO])
  const byGame = all(
    `SELECT COALESCE(game_name,'未收录作品') AS game, COUNT(*) AS c
       FROM listings WHERE created_at BETWEEN ? AND ? GROUP BY game_name ORDER BY c DESC LIMIT 8`, [fromISO, toISO])
  const alerts = all(`SELECT rule_code, rule_name, severity, COUNT(*) AS c FROM alerts WHERE created_at BETWEEN ? AND ? GROUP BY rule_code ORDER BY c DESC`, [fromISO, toISO])
  const handled = one(`SELECT COUNT(*) AS c FROM alerts WHERE status IN ('已处理','误报') AND created_at BETWEEN ? AND ?`, [fromISO, toISO]).c
  const totalAlerts = one(`SELECT COUNT(*) AS c FROM alerts WHERE created_at BETWEEN ? AND ?`, [fromISO, toISO]).c

  return {
    range: { from: fmtDate(new Date(fromISO)), to: fmtDate(new Date(toISO)) },
    summary: {
      listings: total,
      alerts: totalAlerts,
      highRisk: byLevel.find((x) => x.level === '高')?.c ?? 0,
      handledRate: totalAlerts ? Math.round((handled / totalAlerts) * 100) : 0,
    },
    byLevel,
    bySource,
    byGame,
    topRules: alerts.slice(0, 6),
  }
}

export function createReport({ type = '周期报告', title, from, to } = {}) {
  const payload = buildReportPayload({ from, to })
  const id = `rpt_${Date.now().toString(36)}`
  run(`INSERT INTO reports (id, title, type, period, payload, created_at) VALUES (?,?,?,?,?,?)`, [
    id,
    title ?? `${payload.range.from} ~ ${payload.range.to} 版权监测${type}`,
    type,
    `${payload.range.from} ~ ${payload.range.to}`,
    JSON.stringify(payload),
    nowISO(),
  ])
  return one(`SELECT * FROM reports WHERE id = ?`, [id])
}
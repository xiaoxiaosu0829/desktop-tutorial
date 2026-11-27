/**
 * 取证包：把一条线索封存成可校验的 ZIP
 * ------------------------------------------------------------
 * 包含：页面快照（HTML）、原始数据（JSON）、清单（含每个文件的 SHA-256）、说明文件。
 * 说明：这只是「内部取证底稿」，正式维权仍需公证或可信时间戳固化。
 */
import { createHash } from 'node:crypto'
import { createZip } from '../lib/zip.mjs'
import { fmtDateTime } from '../lib/utils.mjs'

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function snapshotHtml({ listing, game, seller, alerts, generatedAt, operator }) {
  const rows = alerts.map((a) => `
      <tr>
        <td class="code">${escapeHtml(a.rule_code)}</td>
        <td>${escapeHtml(a.rule_name)}</td>
        <td>${escapeHtml(a.severity)}</td>
        <td>${escapeHtml(a.detail)}</td>
      </tr>`).join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>取证快照 · ${escapeHtml(listing.title)}</title>
<style>
  body { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; margin: 40px; color: #1a1d24; }
  h1 { font-size: 20px; margin: 0 0 6px; }
  .meta { color: #6b7280; font-size: 12px; margin-bottom: 22px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #f7f8fa; width: 120px; color: #4b5563; font-weight: 600; }
  .code { font-family: Consolas, monospace; white-space: nowrap; }
  .rules th { width: auto; }
  .warn { margin-top: 26px; padding: 12px 14px; background: #fff5f2; border: 1px solid #ffd9cb; border-radius: 8px; font-size: 12px; color: #9a3412; }
  footer { margin-top: 30px; color: #9aa0ae; font-size: 11px; }
</style>
</head>
<body>
  <h1>${escapeHtml(listing.title)}</h1>
  <div class="meta">取证快照 · 生成于 ${generatedAt} · 操作人 ${escapeHtml(operator || '未署名')}</div>

  <table>
    <tr><th>线索编号</th><td class="code">${escapeHtml(listing.id)}</td></tr>
    <tr><th>渠道</th><td>${escapeHtml(listing.source)} · 渠道商品号 ${escapeHtml(listing.external_id)}</td></tr>
    <tr><th>作品</th><td>${escapeHtml(game?.name ?? listing.game_name ?? '未收录')}</td></tr>
    <tr><th>卖家</th><td>${escapeHtml(listing.seller_name || '—')}${seller?.authorized ? '（已备案授权方）' : '（未在授权名单）'}</td></tr>
    <tr><th>标价</th><td>¥${Number(listing.price).toLocaleString('zh-CN')}</td></tr>
    <tr><th>风险判定</th><td>${escapeHtml(listing.risk_level)}风险 · ${listing.risk_score} 分</td></tr>
    <tr><th>快照时间</th><td>${escapeHtml(listing.snapshot_at)}</td></tr>
    <tr><th>商品链接</th><td class="code">${escapeHtml(listing.url || '—')}</td></tr>
    <tr><th>商品描述</th><td>${escapeHtml(listing.description || '—')}</td></tr>
  </table>

  <h2 style="font-size:14px;margin:26px 0 10px;">命中规则</h2>
  <table class="rules">
    <thead><tr><th>规则</th><th>名称</th><th>等级</th><th>依据</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4">未命中规则</td></tr>'}</tbody>
  </table>

  <div class="warn">
    本快照由「网络游戏账号交易版权监测系统」自动生成，内容来源于渠道公开页面。
    仅用于版权方内部维权取证，不构成法律意见；正式维权请以公证或可信时间戳固化的原始页面为准。
  </div>

  <footer>ZIP 内 manifest.json 记录了每个文件的 SHA-256，可用于校验内容未被改动。</footer>
</body>
</html>`
}

/**
 * @returns {{filename: string, buffer: Buffer}}
 */
export function buildEvidenceBundle({ listing, game, seller, alerts, operator }) {
  const generatedAt = fmtDateTime()
  const files = []

  const snapshot = Buffer.from(snapshotHtml({ listing, game, seller, alerts, generatedAt, operator }), 'utf8')
  const raw = Buffer.from(JSON.stringify({ listing, game, seller, alerts, generatedAt, operator }, null, 2), 'utf8')
  const readme = Buffer.from(
    [
      '网络游戏账号交易版权监测系统 · 取证包',
      '',
      `线索编号：${listing.id}`,
      `渠道商品号：${listing.external_id}`,
      `生成时间：${generatedAt}`,
      `操作人：${operator || '未署名'}`,
      '',
      '文件说明：',
      '  snapshot.html  该线索的页面快照（人可读）',
      '  listing.json   结构化原始数据（含命中规则与卖家信息）',
      '  manifest.json  文件清单与 SHA-256 校验值',
      '',
      '校验方式（Windows PowerShell）：',
      '  Get-FileHash .\\snapshot.html -Algorithm SHA256',
      '  # 与 manifest.json 中的 sha256 对比，一致说明文件未被改动',
      '',
      '免责声明：本取证包为内部维权底稿，不构成法律意见。',
      '正式维权请以公证或可信时间戳固化的原始页面为准。',
    ].join('\n'),
    'utf8',
  )

  const manifest = {
    system: '网络游戏账号交易版权监测系统',
    version: 'V1.1',
    listingId: listing.id,
    source: listing.source,
    externalId: listing.external_id,
    generatedAt,
    operator: operator || null,
    files: [
      { name: 'snapshot.html', bytes: snapshot.length, sha256: sha256(snapshot) },
      { name: 'listing.json', bytes: raw.length, sha256: sha256(raw) },
      { name: 'README.txt', bytes: readme.length, sha256: sha256(readme) },
    ],
  }

  files.push({ name: 'snapshot.html', data: snapshot })
  files.push({ name: 'listing.json', data: raw })
  files.push({ name: 'README.txt', data: readme })
  files.push({ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') })

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)
  return {
    filename: `evidence-${listing.source}-${listing.external_id}-${stamp}.zip`,
    buffer: createZip(files),
    manifest,
  }
}
/**
 * 渠道适配器契约
 * ------------------------------------------------------------
 * 真实接入时，适配器负责：分页、限速、失败重试、字段映射。
 * 框架层只依赖本契约，因此新增渠道 = 新增一个 adapter 文件 + 注册。
 */

export const ADAPTER_CONTRACT = {
  id: 'string，渠道唯一标识，如 jiaoyimao',
  name: 'string，渠道展示名',
  mode: "'demo' | 'live'",
  async search({ keywords, maxPages, pageSize, signal }) {
    // 返回 RawListing[]
    throw new Error('not implemented')
  },
}

/**
 * 合规限速器：默认每次请求间隔 1.2s，单次巡检最多 3 页。
 * 真实渠道请以渠道 robots 与服务条款为准，必要时申请正式 API 授权。
 */
export function createRateLimiter({ minIntervalMs = 1200 } = {}) {
  let last = 0
  return async function wait() {
    const gap = Date.now() - last
    if (gap < minIntervalMs) {
      await new Promise((r) => setTimeout(r, minIntervalMs - gap))
    }
    last = Date.now()
  }
}

const UA = 'GameCopyrightMonitor/1.0 (+compliance-research; contact: legal@example.com)'

/**
 * 真实 HTTP 抓取的最小封装：带 UA、超时、AbortSignal。
 * 注意：仅用于抓取**公开可见**的列表页，不绕过登录、不采集个人信息。
 */
export async function fetchPublicHtml(url, { timeoutMs = 10000, signal } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      signal: signal ?? ctrl.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}
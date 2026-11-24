import { demoListings } from './fixtures.mjs'
import { createRateLimiter } from './adapter.mjs'

/** 交易猫适配器（演示模式：不发起真实网络请求） */
export default {
  id: 'jiaoyimao',
  name: '交易猫',
  mode: 'demo',
  baseUrl: 'https://www.jiaoyimao.invalid',
  async search({ keywords = [], maxPages = 2, pageSize = 18 } = {}) {
    const wait = createRateLimiter({ minIntervalMs: 500 })
    const out = []
    for (let page = 1; page <= maxPages; page++) {
      await wait()
      const batch = demoListings('jiaoyimao', { keywords, count: pageSize, seed: 20261112 + page, page })
      out.push(...batch.map((x) => ({ ...x, page })))
    }
    return out
  },
}
import { demoListings } from './fixtures.mjs'
import { createRateLimiter } from './adapter.mjs'

/** 7881 适配器（演示模式：不发起真实网络请求） */
export default {
  id: '7881',
  name: '7881游戏交易',
  mode: 'demo',
  baseUrl: 'https://www.7881.invalid',
  async search({ keywords = [], maxPages = 2, pageSize = 18 } = {}) {
    const wait = createRateLimiter({ minIntervalMs: 500 })
    const out = []
    for (let page = 1; page <= maxPages; page++) {
      await wait()
      const batch = demoListings('7881', { keywords, count: pageSize, seed: 20261112 + page, page })
      out.push(...batch.map((x) => ({ ...x, page })))
    }
    return out
  },
}
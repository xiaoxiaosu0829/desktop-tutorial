import { demoListings } from './fixtures.mjs'
import { createRateLimiter } from './adapter.mjs'

/** 5173 适配器（演示模式：不发起真实网络请求） */
export default {
  id: '5173',
  name: '5173游戏交易',
  mode: 'demo',
  baseUrl: 'https://www.5173.invalid',
  async search({ keywords = [], maxPages = 2, pageSize = 18 } = {}) {
    const wait = createRateLimiter({ minIntervalMs: 500 })
    const out = []
    for (let page = 1; page <= maxPages; page++) {
      await wait()
      const batch = demoListings('5173', { keywords, count: pageSize, seed: 20261112 + page, page })
      out.push(...batch.map((x) => ({ ...x, page })))
    }
    return out
  },
}
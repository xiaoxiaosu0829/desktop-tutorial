import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluate } from '../services/detection.mjs'

const game = { id: 'g_hm', name: '王者荣耀' }

test('作品在版权库且卖家未授权 → 命中 R001 且为高风险', () => {
  const r = evaluate({ title: '【国服】王者荣耀 全英雄 V10', price: 2000, game, authorized: false, marketAvg: 2600 })
  assert.deepEqual(r.alerts.map((a) => a.ruleCode), ['R001'])
  assert.equal(r.level, '中') // R001 权重 40
})

test('已授权卖家不触发 R001，但私服话术仍触发 R002', () => {
  const r = evaluate({ title: '王者荣耀 私服同款资源 全英雄', price: 2000, game, authorized: true, marketAvg: 2600 })
  assert.ok(!r.alerts.some((a) => a.ruleCode === 'R001'))
  assert.ok(r.alerts.some((a) => a.ruleCode === 'R002'))
  assert.equal(r.level, '中')
})

test('私服 + 未授权 + 低价 → 高风险', () => {
  const r = evaluate({
    title: '王者荣耀 满级号 私服资源 包找回',
    price: 300, game, authorized: false, marketAvg: 2600,
  })
  const codes = r.alerts.map((a) => a.ruleCode).sort()
  assert.ok(codes.includes('R001'))
  assert.ok(codes.includes('R002'))
  assert.ok(codes.includes('R005'))
  assert.ok(codes.includes('R006'))
  assert.equal(r.level, '高')
})

test('未收录作品但含交易特征 → R007 且低风险', () => {
  const r = evaluate({ title: '某新游 开局号 资源号 出售', price: 50, game: null, authorized: false })
  assert.deepEqual(r.alerts.map((a) => a.ruleCode), ['R007'])
  assert.equal(r.level, '低')
})

test('评分封顶 100，且最多累计 3 条规则权重', () => {
  const r = evaluate({
    title: '王者荣耀 官方内部号 私服 包找回 租号 代充',
    price: 1, game, authorized: false, marketAvg: 9999,
  })
  assert.ok(r.score <= 100)
  assert.equal(r.alerts.length, 7) // 未命中 R007（作品已收录）
})
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildIndex, matchGame, normalize } from '../services/matcher.mjs'

const games = [
  { id: 'g_hm', name: '王者荣耀', aliases: JSON.stringify(['王者', 'HonorOfKings']) },
  { id: 'g_ys', name: '原神', aliases: JSON.stringify(['Genshin']) },
  { id: 'g_sr', name: '崩坏：星穹铁道', aliases: JSON.stringify(['星铁', '崩铁']) },
]

test('归一化去除符号与空白', () => {
  assert.equal(normalize(' 崩坏： 星穹·铁道 '), '崩坏星穹铁道')
})

test('标题命中作品别名', () => {
  const index = buildIndex(games)
  const r = matchGame('【国服】王者 全英雄 成品号', index)
  assert.equal(r.gameId, 'g_hm')
  assert.equal(r.confidence, 0.9)
})

test('半角符号不影响匹配', () => {
  const index = buildIndex(games)
  const r = matchGame('崩坏:星穹铁道 满命限定', index)
  assert.equal(r.gameId, 'g_sr')
})

test('错别字容错命中', () => {
  const index = buildIndex(games)
  const r = matchGame('原神 holy 全角色', index)
  assert.equal(r.gameId, 'g_ys')
})

test('未收录作品返回空匹配', () => {
  const index = buildIndex(games)
  const r = matchGame('某不知名手游 开局号', index)
  assert.equal(r.gameId, null)
})
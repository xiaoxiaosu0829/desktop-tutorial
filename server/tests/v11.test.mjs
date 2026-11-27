import test from 'node:test'
import assert from 'node:assert/strict'
import { PNG } from 'pngjs'
import { phash, hamming, similarity, variantHash } from '../services/imagehash.mjs'
import { createZip } from '../lib/zip.mjs'
import { evaluate } from '../services/detection.mjs'
import { buildEvidenceBundle } from '../services/evidence.mjs'
import { createHash } from 'node:crypto'

/** 生成确定性图案，用于对比 pHash */
function poster(seed, base) {
  const size = 64
  const png = new PNG({ width: size, height: size })
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) << 2
      const block = Math.floor(x / 16) + 4 * Math.floor(y / 16)
      png.data[i] = (base[0] + block * 17 + (seed % 30)) & 255
      png.data[i + 1] = (base[1] + block * 9) & 255
      png.data[i + 2] = (base[2] + ((x + y) % 12 < 6 ? 60 : 0)) & 255
      png.data[i + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

test('同一张图 pHash 稳定，不同图案差异明显', () => {
  const a = poster(3, [200, 100, 40])
  const b = poster(3, [200, 100, 40])
  const c = poster(9, [40, 120, 200])

  const ha = phash(a).hash
  assert.equal(phash(b).hash, ha, '同一图像应得到相同哈希')
  assert.ok(similarity(ha, phash(c).hash) < 90, '不同图案相似度应明显偏低')
})

test('近似副本仍可识别（翻转 3 bit 后相似度 ≥ 90%）', () => {
  const h = phash(poster(5, [80, 160, 120])).hash
  const near = variantHash(h, 3, 42)
  assert.equal(hamming(h, near), 3)
  assert.ok(similarity(h, near) >= 90)
})

test('pHash 拒绝非图片数据', () => {
  assert.throws(() => phash(Buffer.from('not an image')))
})

test('ZIP 容器结构正确（本地头 + 中央目录 + EOCD）', () => {
  const zip = createZip([
    { name: 'a.txt', data: 'hello' },
    { name: 'b.txt', data: Buffer.from('world') },
  ])
  assert.equal(zip.readUInt32LE(0), 0x04034b50, '应以本地文件头开始')
  const eocd = zip.length - 22
  assert.equal(zip.readUInt32LE(eocd), 0x06054b50, '应以 EOCD 结束')
  assert.equal(zip.readUInt16LE(eocd + 8), 2, '应有 2 个条目')
  assert.ok(zip.includes(Buffer.from('a.txt')))
})

test('取证包包含四个文件，manifest 哈希与实际内容一致', () => {
  const listing = {
    id: 'lst_test', source: 'jiaoyimao', external_id: 'JYM-1', title: '测试商品',
    description: '描述', price: 100, risk_level: '高', risk_score: 88,
    snapshot_at: new Date().toISOString(), url: 'https://example.invalid/1', seller_name: '测试卖家',
  }
  const bundle = buildEvidenceBundle({ listing, game: { name: '王者荣耀' }, seller: { authorized: 0 }, alerts: [], operator: 'tester' })
  assert.ok(bundle.buffer.length > 200)
  assert.equal(bundle.manifest.files.length, 3)
  assert.equal(bundle.manifest.operator, 'tester')
  for (const f of bundle.manifest.files) {
    assert.match(f.sha256, /^[a-f0-9]{64}$/)
  }
})

test('R009：图片相似度 ≥84% 判为盗图', () => {
  const r = evaluate({
    title: '王者荣耀 全英雄', price: 2000, game: { id: 'g_hm', name: '王者荣耀' }, authorized: true,
    imageMatch: { assetName: '官方主视觉', similarity: 92 },
  })
  assert.ok(r.alerts.some((a) => a.ruleCode === 'R009'))
  assert.ok(r.score >= 35)
})

test('R009：相似度不足则不触发', () => {
  const r = evaluate({
    title: '王者荣耀 全英雄', price: 2000, game: { id: 'g_hm', name: '王者荣耀' }, authorized: true,
    imageMatch: { assetName: '官方主视觉', similarity: 60 },
  })
  assert.ok(!r.alerts.some((a) => a.ruleCode === 'R009'))
})

test('R005：优先使用 P20 基线，未低于基线不报警', () => {
  const under = evaluate({
    title: '王者荣耀 成品号', price: 800, game: { id: 'g_hm', name: '王者荣耀' }, authorized: true,
    baseline: { p20: 2000, p50: 2600 },
  })
  assert.ok(under.alerts.some((a) => a.ruleCode === 'R005'))
  assert.match(under.alerts.find((a) => a.ruleCode === 'R005').detail, /P20/)

  const normal = evaluate({
    title: '王者荣耀 成品号', price: 2200, game: { id: 'g_hm', name: '王者荣耀' }, authorized: true,
    baseline: { p20: 2000, p50: 2600 }, marketAvg: 9999,
  })
  assert.ok(!normal.alerts.some((a) => a.ruleCode === 'R005'))
})
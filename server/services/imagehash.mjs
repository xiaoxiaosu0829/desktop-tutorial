/**
 * 图像感知哈希（pHash）
 * ------------------------------------------------------------
 * 思路：灰度 → 缩到 32×32 → 二维 DCT → 取左上 8×8 低频系数 → 与中位数比较得 64 位指纹。
 * 用途：识别「盗用官方素材图」「私服截图」这类文字规则抓不到的线索。
 * 只存哈希，不存原图 —— 既省空间，也避免二次分发他人素材。
 */
import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'

const SIZE = 32
const LOW = 8

/** 解码 PNG/JPEG 为 { width, height, data(RGBA) } */
export function decodeImage(buffer) {
  if (!buffer || buffer.length < 12) throw new Error('图片数据为空')
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8
  if (isPng) {
    const png = PNG.sync.read(buffer)
    return { width: png.width, height: png.height, data: png.data }
  }
  if (isJpeg) {
    const img = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true })
    return { width: img.width, height: img.height, data: img.data }
  }
  throw new Error('仅支持 PNG / JPEG 图片')
}

/** 区域平均缩放到 32×32 灰度 */
function toGray32({ width, height, data }) {
  const out = new Float64Array(SIZE * SIZE)
  for (let ty = 0; ty < SIZE; ty++) {
    for (let tx = 0; tx < SIZE; tx++) {
      const x0 = Math.floor((tx * width) / SIZE)
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * width) / SIZE))
      const y0 = Math.floor((ty * height) / SIZE)
      const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * height) / SIZE))
      let sum = 0
      let n = 0
      for (let y = y0; y < y1 && y < height; y++) {
        for (let x = x0; x < x1 && x < width; x++) {
          const i = (y * width + x) * 4
          sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
          n++
        }
      }
      out[ty * SIZE + tx] = n ? sum / n : 0
    }
  }
  return out
}

/** 二维 DCT，只算左上 8×8 */
function dctLow(gray) {
  const cos = (u, x) => Math.cos(((2 * x + 1) * u * Math.PI) / (2 * SIZE))
  const coeff = new Float64Array(LOW * LOW)
  for (let v = 0; v < LOW; v++) {
    for (let u = 0; u < LOW; u++) {
      let sum = 0
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          sum += gray[y * SIZE + x] * cos(u, x) * cos(v, y)
        }
      }
      coeff[v * LOW + u] = sum
    }
  }
  return coeff
}

/** 计算 pHash，返回 16 位十六进制字符串 */
export function phash(buffer) {
  const decoded = decodeImage(buffer)
  const coeff = dctLow(toGray32(decoded))
  const values = Array.from(coeff).slice(1) // 去掉直流分量
  const sorted = [...values].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0

  let hex = ''
  for (let i = 0; i < 16; i++) {
    let nibble = 0
    for (let j = 0; j < 4; j++) {
      const idx = i * 4 + j + 1
      if ((coeff[idx] ?? 0) > median) nibble |= 1 << (3 - j)
    }
    hex += nibble.toString(16)
  }
  return { hash: hex, width: decoded.width, height: decoded.height }
}

function popcount(n) {
  let c = 0
  while (n) {
    n &= n - 1
    c++
  }
  return c
}

/** 两个 pHash 的汉明距离（0–64） */
export function hamming(hashA, hashB) {
  if (!hashA || !hashB || hashA.length !== hashB.length) return 64
  let d = 0
  for (let i = 0; i < hashA.length; i++) {
    d += popcount(parseInt(hashA[i], 16) ^ parseInt(hashB[i], 16))
  }
  return d
}

/** 相似度百分比（0–100），四舍五入 */
export function similarity(hashA, hashB) {
  return Math.round(((64 - hamming(hashA, hashB)) / 64) * 100)
}

/** 在素材集合中找最相似的一张 */
export function bestMatch(hash, assets) {
  let best = null
  for (const asset of assets) {
    if (!asset.phash) continue
    const sim = similarity(hash, asset.phash)
    if (!best || sim > best.similarity) {
      best = { asset, similarity: sim, hash }
    }
  }
  return best
}

/** 从 data URL（data:image/png;base64,...）解出 Buffer */
export function fromDataUrl(dataUrl) {
  const m = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(String(dataUrl ?? '').trim())
  if (!m) throw new Error('图片格式不正确，请上传 PNG 或 JPEG')
  return Buffer.from(m[2], 'base64')
}

/**
 * 生成"近似副本"哈希：在给定哈希上翻转 n 个 bit。
 * 用于演示"二次压缩/加滤镜后仍能识别"的场景，也用于构造灰度可控的测试样本。
 */
export function variantHash(hex, flips = 3, seed = 1) {
  const bits = hex.split('').map((c) => parseInt(c, 16))
  let state = seed * 2654435761 % 2147483647
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state / 2147483648
  }
  for (let k = 0; k < flips; k++) {
    const pos = Math.floor(next() * 16)
    const bit = Math.floor(next() * 4)
    bits[pos] ^= 1 << bit
  }
  return bits.map((b) => b.toString(16)).join('')
}
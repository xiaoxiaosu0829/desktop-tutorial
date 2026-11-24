/**
 * 作品匹配：把商品标题映射到版权库中的游戏作品。
 * 中文场景下标题常带符号、空格、拼音缩写与俗称，因此先归一化再做包含匹配，
 * 兜底用编辑距离做错别字/谐音容错。
 */

const NOISE = /[\s\u3000·・\-—_+*#~!！?？、,，.。:：;；'"“”‘’()（）[\]【】<>《》|/\\]+/g

export function normalize(text = '') {
  return String(text).toLowerCase().replace(NOISE, '')
}

function levenshtein(a, b) {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[n]
}

function similarity(a, b) {
  const max = Math.max(a.length, b.length)
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max
}

/** 建立匹配索引：{ term, gameId, weight } */
export function buildIndex(games) {
  const terms = []
  for (const g of games) {
    terms.push({ term: normalize(g.name), gameId: g.id, weight: 1, name: g.name })
    for (const alias of safeAliases(g)) {
      if (alias && normalize(alias).length >= 2) {
        terms.push({ term: normalize(alias), gameId: g.id, weight: 0.9, name: alias })
      }
    }
  }
  // 长词优先，避免"英雄"命中"英雄联盟"之后再命中"英雄杀"
  terms.sort((a, b) => b.term.length - a.term.length)
  return terms
}

export function safeAliases(game) {
  try {
    const v = typeof game.aliases === 'string' ? JSON.parse(game.aliases || '[]') : game.aliases
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/**
 * @returns {{gameId:string|null, gameName:string|null, matchedBy:string|null, confidence:number}}
 */
export function matchGame(title, index) {
  const t = normalize(title)
  if (!t) return { gameId: null, gameName: null, matchedBy: null, confidence: 0 }

  for (const item of index) {
    if (item.term && t.includes(item.term)) {
      return {
        gameId: item.gameId,
        gameName: item.name,
        matchedBy: `标题包含「${item.name}」`,
        confidence: item.weight,
      }
    }
  }

  // 兜底：与标题中最相近的片段比较（容错错别字）
  let best = { gameId: null, gameName: null, matchedBy: null, confidence: 0 }
  for (const item of index) {
    if (item.term.length < 3) continue
    for (let i = 0; i + item.term.length <= t.length; i++) {
      const window = t.slice(i, i + item.term.length)
      const sim = similarity(window, item.term)
      if (sim >= 0.8 && sim > best.confidence) {
        best = {
          gameId: item.gameId,
          gameName: item.name,
          matchedBy: `标题近似「${item.name}」(相似度 ${(sim * 100).toFixed(0)}%)`,
          confidence: sim,
        }
      }
    }
  }
  return best
}
/**
 *  Demonstrative fixtures（演示数据）
 *  ------------------------------------------------------------
 *  重要：这里全部是**合成的示例数据**，不含任何真实店铺、真实账号或真实交易信息。
 *  真实接入渠道时，请由 adapter 调用渠道公开接口 / 已获授权的数据合作方接口，
 *  并遵守《网络安全法》《个人信息保护法》与渠道 robots 协议。
 */

const GAMES = [
  { key: 'hm', name: '王者荣耀', price: 2680, traits: ['全英雄', 'V10贵族', '荣耀典藏', '百星王者'] },
  { key: 'hp', name: '和平精英', price: 1880, traits: ['全皮肤', 'M416金皮', '战神号', '载具全'] },
  { key: 'ys', name: '原神', price: 3200, traits: ['满命5星', '深渊满星', '全角色', '精5武器'] },
  { key: 'sr', name: '崩坏：星穹铁道', price: 2400, traits: ['满命限定', '全光锥', '虚构叙事满层', '双五星'] },
  { key: 'lol', name: '英雄联盟', price: 1560, traits: ['全英雄', '皮肤600+', '大师段位', '至臻皮肤'] },
  { key: 'mh', name: '梦幻西游', price: 5600, traits: ['满修', '神兽', '无级别武器', '高价值角色'] },
  { key: 'yj', name: '永劫无间', price: 980, traits: ['全英雄', '金武器', '段位榜前十', '时装全'] },
  { key: 'dz', name: '蛋仔派对', price: 620, traits: ['全典藏', '稀有皮肤', '赛季全', '潮流纤维多'] },
]

const REGIONS = ['国服', '安卓QQ区', 'iOS微信区', '官服', '渠道服', '亚服']
const TRAIT_EXTRA = ['多皮肤', '带月卡', '含季票', '资源充足', '可换绑', '实名已解']

/** 各作品对应的官方素材（演示用：部分商品会"盗用"这些素材的图） */
const ASSET_BY_GAME = { hm: 'ast_hm', ys: 'ast_ys', sr: 'ast_sr', mh: 'ast_mh' }

const RISK_SUFFIX = [
  { text: '，包找回可签协议', tag: 'reclaim' },
  { text: '，支持解绑实名', tag: 'unbind' },
  { text: '，官方内部渠道号', tag: 'insider' },
  { text: '，私服同款资源', tag: 'private' },
  { text: '，可租号按天算', tag: 'rent' },
  { text: '，代充折扣充值', tag: 'topup' },
  { text: '，外挂脚本已配', tag: 'cheat' },
  { text: '，代练上分服务', tag: 'boost' },
]

const SAFE_SUFFIX = ['，支持官方验号', '，走平台担保交易', '，实名可过户', '，无封禁记录']

/** 各渠道的展示元信息：商品号前缀、卖家字号、演示域名、路径 */
const SOURCE_META = {
  jiaoyimao: { prefix: 'JYM', seller: '猫', domain: 'demo.jiaoyimao.invalid', path: 'item', seed: 7 },
  pangxie: { prefix: 'PX', seller: '蟹', domain: 'demo.pangxie.invalid', path: 'goods', seed: 19 },
  taoshouyou: { prefix: 'TSY', seller: '淘', domain: 'demo.taoshouyou.invalid', path: 'goods', seed: 29 },
  '5173': { prefix: 'W5', seller: '五', domain: 'demo.5173.invalid', path: 'goods', seed: 41 },
  '7881': { prefix: 'Q7', seller: '七', domain: 'demo.7881.invalid', path: 'goods', seed: 53 },
}

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)]
const money = (n) => Math.round(n / 10) * 10

/**
 * 生成某渠道的演示挂售列表
 * @param {'jiaoyimao'|'pangxie'|'taoshouyou'|'5173'|'7881'} source
 * @param {{keywords?:string[], count?:number, seed?:number}} opts
 */
export function demoListings(source, { keywords = [], count = 18, seed = 20261112, page = 1 } = {}) {
  const meta = SOURCE_META[source] ?? SOURCE_META.jiaoyimao
  const rng = mulberry32(seed + meta.seed)
  const items = []

  for (let i = 0; i < count; i++) {
    const game = GAMES[Math.floor(rng() * GAMES.length)]
    const t1 = pick(rng, game.traits)
    const t2 = pick(rng, game.traits.filter((t) => t !== t1))
    const regionPool = ['ys', 'sr'].includes(game.key) ? REGIONS : REGIONS.filter((r) => r !== '亚服')
    const region = pick(rng, regionPool)
    const extra = pick(rng, TRAIT_EXTRA)

    // 约 55% 带风险话术，其余干净
    const risky = rng() < 0.55
    const risk = risky ? pick(rng, RISK_SUFFIX) : null
    const suffix = risk ? risk.text : pick(rng, SAFE_SUFFIX)

    // 风险账号常以明显低价倾销
    const base = money(game.price * (0.75 + rng() * 0.6))
    const price = risk && (risk.tag === 'reclaim' || risk.tag === 'cheat') ? money(base * 0.32) : base

    const title = `【${region}】${game.name} ${t1}${t2 ? ' ' + t2 : ''} ${extra}${suffix}`
    const description = [
      `区服：${region}`,
      `亮点：${t1}、${extra}`,
      risk ? `说明：${risk.text.replace('，', '')}` : '说明：正常成品号，支持验号',
      `绑定：${rng() < 0.5 ? '可换绑手机' : '邮箱可改'}`,
    ].join('；')

    const externalId = `${meta.prefix}-${2026}${String(page * 1000 + 1100 + i).padStart(5, '0')}`

    // 约 40% 的商品"盗用"了对应作品的官方素材图（演示盗图检测）
    const assetId = ASSET_BY_GAME[game.key] && rng() < 0.4 ? ASSET_BY_GAME[game.key] : null

    items.push({
      externalId,
      title,
      description,
      price,
      gameKey: game.key,
      gameName: game.name,
      assetId,
      assetFlips: 2 + Math.floor(rng() * 4),
      sellerName: `${meta.seller}字号-${String.fromCharCode(65 + (i % 26))}${100 + (i % 90)}`,
      sellerRef: `${meta.prefix.toLowerCase()}-${(5000 + i * 13).toString(16)}`,
      url: `https://${meta.domain}/${meta.path}/${externalId}`,
      postedAgoMin: Math.floor(rng() * 60 * 48),
    })
  }

  // 关键词命中优先：把含关键词的条目排到前面，模拟渠道搜索行为
  const kw = keywords.filter(Boolean)
  if (kw.length) {
    items.sort((a, b) => {
      const score = (x) => kw.reduce((s, k) => s + (x.title.toLowerCase().includes(k.toLowerCase()) ? 1 : 0), 0)
      return score(b) - score(a)
    })
  }
  return items
}

export const DEMO_GAMES = GAMES
/**
 * 风险判定引擎（规则链）
 * ------------------------------------------------------------
 * 设计原则：
 * 1) 规则可解释：每条规则必须给出 code / 说明 / 命中片段，便于申诉与复核；
 * 2) 评分可调：权重集中在 WEIGHTS，业务方可按自家维权尺度调整；
 * 3) 只基于公开可见的交易页信息做判断，不做账号盗取、不做隐私推断。
 */

export const WEIGHTS = {
  R001: 40, // 未授权经销
  R002: 45, // 私服/破解/外挂
  R003: 20, // 账号租赁/共享
  R004: 15, // 代充/代练/返利
  R005: 18, // 异常低价
  R006: 35, // 找回/解绑风险
  R007: 12, // 未收录作品（疑似新游）
  R008: 30, // 官方内部号/内部渠道
  R009: 35, // 盗用官方素材图（V1.1）
}

export const RULES = [
  {
    code: 'R001',
    name: '未授权经销他人作品账号',
    severity: '高',
    hint: '作品在版权库内，但卖家不在授权台账 → 需核查经销资质',
  },
  {
    code: 'R002',
    name: '涉及私服 / 破解 / 外挂',
    severity: '高',
    hint: '标题或描述出现私服、破解、外挂、修改器等表述',
  },
  {
    code: 'R003',
    name: '账号租赁 / 共享',
    severity: '中',
    hint: '账号租借、共享号、共号行为，可能违反游戏用户协议',
  },
  {
    code: 'R004',
    name: '代充 / 代练 / 返利',
    severity: '中',
    hint: '代充、代练、充值返利等灰色服务',
  },
  {
    code: 'R005',
    name: '成交价显著低于市场均价',
    severity: '中',
    hint: '价格低于同作品同服均价 40%，疑似盗号销赃或黑卡充值',
  },
  {
    code: 'R006',
    name: '找回 / 解绑话术',
    severity: '高',
    hint: '出现「包找回」「解绑实名」「防盗」等话术，存在二次找回风险',
  },
  {
    code: 'R007',
    name: '未收录作品疑似侵权',
    severity: '低',
    hint: '标题未命中版权库，但含交易特征词，建议纳入观察名单',
  },
  {
    code: 'R008',
    name: '官方内部号 / 内部渠道',
    severity: '高',
    hint: '声称官方内部号、内部渠道资源，涉嫌虚假宣传或职务侵占',
  },
  {
    code: 'R009',
    name: '盗用版权方素材图',
    severity: '高',
    hint: '商品主图与素材库中的官方素材高度相似（pHash 比对），涉嫌盗图',
  },
]

const PATTERNS = {
  R002: /(私服|破解|外挂|修改器|脱机挂|脚本挂|免密|无限元宝|GM后台|内购破解)/i,
  R003: /(租号|租借|账号出租|共享号|共号|按天租|按时租)/i,
  R004: /(代充|代练|充值返利|低价充值|折扣充值|首充号)/i,
  R006: /(包找回|找回险|找回包赔|解绑实名|解除实名|可解绑|防盗号|包赔)/i,
  R008: /(内部号|内部渠道|内部资源|官方内部|渠道号|福利号)/i,
  TRADE: /(账号|帐号|成品号|满级号|开局号|初始号|自抽号|资源号|区服)/i,
}

const hit = (text, re) => {
  const m = String(text || '').match(re)
  return m ? m[0] : null
}

/**
 * @param {object} input
 * @param {string} input.title
 * @param {string} input.description
 * @param {number} input.price
 * @param {object|null} input.game        命中作品（含 id/name）
 * @param {boolean} input.authorized      卖家是否在授权名单
 * @param {number|null} input.marketAvg   同作品均价（兜底）
 * @param {object|null} input.baseline    价格基线 { p20, p50 }（V1.1 起优先使用）
 * @param {object|null} input.imageMatch  图片比对结果 { assetName, similarity }（V1.1）
 * @returns {{score:number, level:'高'|'中'|'低', alerts:Array<{ruleCode,ruleName,severity,detail,weight}>}}
 */
export function evaluate({
  title = '', description = '', price = 0, game = null, authorized = false,
  marketAvg = null, baseline = null, imageMatch = null,
}) {
  const text = `${title} ${description}`
  const alerts = []
  const push = (code, detail, weightOverride) => {
    const rule = RULES.find((r) => r.code === code)
    alerts.push({
      ruleCode: rule.code,
      ruleName: rule.name,
      severity: rule.severity,
      detail,
      weight: weightOverride ?? WEIGHTS[code],
    })
  }

  if (game && !authorized) {
    push('R001', `作品「${game.name}」在版权库内，卖家未出现在授权台账`)
  }

  const privateServer = hit(text, PATTERNS.R002)
  if (privateServer) push('R002', `命中「${privateServer}」`)

  const rental = hit(text, PATTERNS.R003)
  if (rental) push('R003', `命中「${rental}」`)

  const service = hit(text, PATTERNS.R004)
  if (service) push('R004', `命中「${service}」`)

  // 异常低价：优先用作品的价格基线 P20，没有基线时退回「均价 40%」
  if (baseline?.p20 && price > 0 && price < baseline.p20) {
    push('R005', `标价 ¥${price} 低于同作品 P20 基线 ¥${baseline.p20}（为基线的 ${Math.round((price / baseline.p20) * 100)}%）`)
  } else if (!baseline?.p20 && marketAvg && price > 0 && price < marketAvg * 0.4) {
    push('R005', `标价 ¥${price} 低于同作品均价 ¥${marketAvg} 的 40%（折扣 ${(price / marketAvg * 100).toFixed(0)}%）`)
  }

  const reclaim = hit(text, PATTERNS.R006)
  if (reclaim) push('R006', `命中「${reclaim}」`)

  if (!game && PATTERNS.TRADE.test(text)) {
    push('R007', '标题未命中版权库，但具备账号交易特征，建议人工判定是否纳入监测')
  }

  const insider = hit(text, PATTERNS.R008)
  if (insider) push('R008', `命中「${insider}」`)

  if (imageMatch && imageMatch.similarity >= 84) {
    push('R009', `商品主图与素材「${imageMatch.assetName}」相似度 ${imageMatch.similarity}%（pHash 比对）`)
  }

  // 同一条线索最多计 3 条高权重规则，避免规则叠加把分数瞬间打满而失去区分度
  const score = Math.min(
    100,
    alerts
      .slice()
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .reduce((sum, a) => sum + a.weight, 0),
  )

  const level = score >= 70 ? '高' : score >= 40 ? '中' : '低'
  return { score, level, alerts }
}

/** 处置建议：按分数与规则给出下一步动作，供前端展示 */
export function advise(level, alerts) {
  const codes = new Set(alerts.map((a) => a.ruleCode))
  if (codes.has('R002') || codes.has('R008')) return '建议立即取证并发送下架通知，必要时移交法务'
  if (level === '高') return '建议 24 小时内人工复核并向渠道发送侵权告知函'
  if (codes.has('R003') || codes.has('R004')) return '建议加入重点观察名单，按周复查'
  if (level === '中') return '建议人工复核，确认卖家资质后升级处置'
  return '低风险，归档观察即可'
}
export type Json = any

function qs(params: Record<string, unknown> = {}) {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') s.set(k, String(v))
  }
  const str = s.toString()
  return str ? `?${str}` : ''
}

export type SessionUser = {
  id: string
  username: string
  displayName: string
  role: string
  status: string
  createdAt: string
  lastLoginAt?: string | null
}

async function request(path: string, options: RequestInit = {}): Promise<Json> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (res.status === 401 && !path.startsWith('/auth/')) {
    // 会话过期：通知外层回到登录页
    window.dispatchEvent(new CustomEvent('ngcms:unauthorized'))
  }
  if (!res.ok) throw new Error(data?.error ?? `请求失败 (${res.status})`)
  return data
}

export const auth = {
  me: () => request('/auth/me') as Promise<{ user: SessionUser; session: { expiresAt: string; daysLeft: number } }>,
  login: (body: { username: string; password: string; remember?: boolean }) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.user as SessionUser),
  register: (body: { username: string; password: string; displayName?: string; remember?: boolean }) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.user as SessionUser),
  logout: () => request('/auth/logout', { method: 'POST' }),
  users: () => request('/auth/users'),
}

export const api = {
  meta: () => request('/meta'),
  overview: () => request('/overview'),

  listings: (params: Record<string, unknown>) => request(`/listings${qs(params)}`),
  listing: (id: string) => request(`/listings/${id}`),
  updateListing: (id: string, status: string) =>
    request(`/listings/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  alerts: (params: Record<string, unknown>) => request(`/alerts${qs(params)}`),
  updateAlert: (id: string, status: string) =>
    request(`/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  tasks: () => request('/tasks'),
  createTask: (body: Json) => request('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  updateTask: (id: string, body: Json) => request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTask: (id: string) => request(`/tasks/${id}`, { method: 'DELETE' }),
  runTask: (id: string) => request(`/tasks/${id}/run`, { method: 'POST' }),
  runs: (taskId?: string) => request(`/runs${qs({ taskId })}`),

  games: () => request('/games'),
  createGame: (body: Json) => request('/games', { method: 'POST', body: JSON.stringify(body) }),
  licenses: () => request('/licenses'),
  createLicense: (body: Json) => request('/licenses', { method: 'POST', body: JSON.stringify(body) }),
  sellers: () => request('/sellers'),
  updateSeller: (id: string, body: Json) => request(`/sellers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  reports: () => request('/reports'),
  createReport: (body: Json) => request('/reports', { method: 'POST', body: JSON.stringify(body) }),
  revaluate: () => request('/revaluate', { method: 'POST' }),

  // 案件（V1.1）
  cases: (params: Record<string, unknown> = {}) => request(`/cases${qs(params)}`),
  caseDetail: (id: string) => request(`/cases/${id}`),
  createCase: (body: Json) => request('/cases', { method: 'POST', body: JSON.stringify(body) }),
  updateCase: (id: string, body: Json) => request(`/cases/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  addCaseEvent: (id: string, body: Json) => request(`/cases/${id}/events`, { method: 'POST', body: JSON.stringify(body) }),
  attachListing: (id: string, listingId: string) =>
    request(`/cases/${id}/listings`, { method: 'POST', body: JSON.stringify({ listingId }) }),

  // 素材库与图片指纹（V1.1）
  assets: () => request('/assets'),
  uploadAsset: (body: Json) => request('/assets', { method: 'POST', body: JSON.stringify(body) }),
  deleteAsset: (id: string) => request(`/assets/${id}`, { method: 'DELETE' }),

  // 价格基线（V1.1）
  baselines: () => request('/baselines'),
  refreshBaselines: () => request('/baselines/refresh', { method: 'POST' }),
}

export const evidenceUrl = (listingId: string) => `/api/listings/${listingId}/evidence`

export const fmtMoney = (n: number) => `¥${Number(n).toLocaleString('zh-CN')}`

export const fmtTime = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 支持的业务渠道（顺序即前端展示顺序） */
export const SOURCES = [
  { id: 'jiaoyimao', label: '交易猫' },
  { id: 'pangxie', label: '螃蟹账号交易' },
  { id: 'taoshouyou', label: '淘手游' },
  { id: '5173', label: '5173游戏交易' },
  { id: '7881', label: '7881游戏交易' },
]

export const sourceLabel = (id: string) => SOURCES.find((s) => s.id === id)?.label ?? id
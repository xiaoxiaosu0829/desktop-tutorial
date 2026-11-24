# 架构说明 · 网络游戏账号交易版权监测系统 V1.0

## 1. 总体分层

```
┌──────────────────────────────────────────────────────────────┐
│  展示层  web/ (React 18 + Vite)                              │
│  总览 · 线索 · 预警 · 任务 · 版权库 · 报告                     │
└───────────────▲──────────────────────────────────────────────┘
                │  HTTP /api/*（开发态 Vite 代理 5173 → 8787）
┌───────────────┴──────────────────────────────────────────────┐
│  接口层  server/routes/*.mjs (Express)                        │
│  参数校验 · 状态白名单 · 分页 · 错误兜底                      │
└───────────────▲──────────────────────────────────────────────┘
                │  领域调用（同步函数，node:sqlite 事务内）
┌───────────────┴──────────────────────────────────────────────┐
│  领域层  server/services/                                     │
│  matcher.mjs    文本归一化 + 别名/别名索引 + 编辑距离容错      │
│  detection.mjs  规则链 + 权重 + 评分 + 处置建议                │
│  reporting.mjs  报告载荷聚合                                  │
│  crawler/       渠道适配器 · 巡检编排 · 限速 · 幂等入库        │
└───────────────▲──────────────────────────────────────────────┘
                │
┌───────────────┴──────────────────────────────────────────────┐
│  数据层  data/app.db (SQLite, node:sqlite 内置驱动)           │
│  games / licenses / sellers / listings / alerts /             │
│  tasks / crawl_runs / reports / settings                      │
└──────────────────────────────────────────────────────────────┘
```

单进程、零外部中间件：Node 24 内置 `node:sqlite`，Express 只做路由，前端构建产物由同一进程托管。适合内网部署与快速验证。

## 2. 监测主流程（一次巡检）

```
tasks(到期)
   │ runTask(taskId)
   ▼
adapter.search({keywords})        ← 契约：返回 RawListing[]
   │  限速器 1.2s/请求，默认最多 3 页
   ▼
批次去重 (source + externalId)
   │
   ▼
ingestForensic()
   ├─ matcher.matchGame(title)     → gameId / 置信度 / 匹配依据
   ├─ sellers.authorized           → 是否白名单
   ├─ marketAverages()             → 同作品均价
   ├─ detection.evaluate()         → score / level / alerts[]
   ├─ UPSERT listings              → 已存在则只刷新快照与评分
   └─ INSERT alerts（按 rule_code 去重）
   │
   ▼
crawl_runs 落库（found / new / status / log）
tasks 更新 last_run_at / next_run_at / 累计统计
```

**幂等设计**：`listings` 上有 `UNIQUE(source, external_id)`，重复巡检不产生重复线索；`alerts` 按 `(listing_id, rule_code)` 去重，避免同一问题反复刷屏。

## 3. 关键决策

| 决策 | 原因 | 代价 |
| --- | --- | --- |
| 规则链而非黑盒模型 | 侵权判定必须可解释、可申诉、可调权重 | 需要业务方维护关键词与权重 |
| 同线索最多计 3 条规则 | 避免规则叠加秒满分，失去区分度 | 极端样本分数被低估 |
| 授权台账驱动 R001 | 是否"授权"是法律事实，不能靠模型猜 | 需持续维护授权数据 |
| 线索状态与预警状态分离 | 一条线索可命中多规则，处置进度可能不同 | 前端需同时展示两层状态 |
| 演示模式与真实模式共用链路 | 换适配器即可上线，避免两套逻辑 | 适配器需严格实现契约 |

## 4. 状态机

**线索状态**：`待审核 → 侵权风险 / 合规`，处置后进入 `已通知 → 已下架`，任一阶段可转 `误报`。

**预警状态**：`新建 → 处理中 → 已处理`，或 `误报`。预警转为已处理 / 误报时，若线索仍在待审核 / 侵权风险，会同步推进线索状态。

## 5. 扩展点

### 新增渠道
1. 在 `server/services/crawler/` 新建 `<id>.mjs`，实现 `search({ keywords, maxPages, pageSize })`；
2. 在 `crawler/index.mjs` 的 `ADAPTERS` 注册；
3. 前端 `SOURCE_LABEL`（`server/routes/analytics.mjs` 与 `web/src/api.ts`）补展示名。

### 新增规则
在 `detection.mjs` 的 `WEIGHTS` / `RULES` / `PATTERNS` 增加条目，并在 `evaluate()` 中挂载命中逻辑；规则会自动出现在 `/api/meta` 与前端详情页。

### 改评分尺度
调整 `WEIGHTS` 与 `level` 阈值（`score >= 70` 等），再调用 `POST /api/revaluate` 全量重算，无需重建数据。

## 6. 性能与容量（V1.0 基线）

- SQLite WAL，单机写入万级线索无压力；列表查询走 `status / risk / source` 索引。
- 巡检为串行请求，单任务每分钟约 50 条；批量场景应改为队列 + 并发池（V1.1）。
- 前端首屏约 184KB JS（gzip 57KB），无图表库依赖。

## 7. 未来演进方向

见 [ROADMAP.md](ROADMAP.md)。核心是把「单机框架」升级为「可运营的合规平台」：RBAC、异步任务、图像指纹、取证存证、渠道 API 对接。
-- 网络游戏账号交易版权监测系统 V1.0 — 数据模型
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 版权库：纳入监测的游戏作品
CREATE TABLE IF NOT EXISTS games (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  aliases     TEXT NOT NULL DEFAULT '[]',   -- JSON 数组：别名/俗称/缩写
  publisher   TEXT,                          -- 发行/运营方
  ip_owner    TEXT,                          -- 版权方
  region      TEXT,                          -- 国服 / 国际服 / 日服
  category    TEXT,                          -- MMO / MOBA / 卡牌 / 二次元 ...
  hot         INTEGER NOT NULL DEFAULT 0,    -- 热度权重 0-100
  created_at  TEXT NOT NULL
);

-- 授权台账：某游戏在交易渠道的合法经销/代售授权
CREATE TABLE IF NOT EXISTS licenses (
  id           TEXT PRIMARY KEY,
  game_id      TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  holder       TEXT NOT NULL,               -- 被授权方（店铺/公司）
  license_type TEXT NOT NULL,               -- 独家 / 普通 / 平台直营 / 无授权
  scope        TEXT,                        -- 授权范围说明
  cert_no      TEXT,                        -- 授权书编号
  valid_from   TEXT,
  valid_to     TEXT,
  status       TEXT NOT NULL DEFAULT '有效', -- 有效 / 已过期 / 已撤销
  created_at   TEXT NOT NULL
);

-- 卖家主体：按渠道记录，用于判断是否在授权名单内
CREATE TABLE IF NOT EXISTS sellers (
  id          TEXT PRIMARY KEY,
  source      TEXT NOT NULL,                -- jiaoyimao / pangxie
  seller_name TEXT NOT NULL,
  seller_ref  TEXT,                         -- 渠道内店铺 ID（脱敏占位）
  authorized  INTEGER NOT NULL DEFAULT 0,
  risk_note   TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE (source, seller_name)
);

-- 商品线索：每条被监测到的账号交易挂售
CREATE TABLE IF NOT EXISTS listings (
  id          TEXT PRIMARY KEY,
  source      TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  price       REAL NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'CNY',
  game_id     TEXT REFERENCES games(id),
  game_name   TEXT,
  seller_name TEXT,
  seller_ref  TEXT,
  url         TEXT,
  snapshot_at TEXT NOT NULL,
  raw         TEXT,                          -- 原始快照 JSON
  status      TEXT NOT NULL DEFAULT '待审核', -- 待审核 / 侵权风险 / 合规 / 已通知 / 已下架 / 误报
  risk_score  INTEGER NOT NULL DEFAULT 0,
  risk_level  TEXT NOT NULL DEFAULT '低',     -- 高 / 中 / 低
  created_at  TEXT NOT NULL,
  UNIQUE (source, external_id)
);

-- 风险预警：由规则引擎对单条线索产出
CREATE TABLE IF NOT EXISTS alerts (
  id         TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  rule_code  TEXT NOT NULL,
  rule_name  TEXT NOT NULL,
  severity   TEXT NOT NULL,                  -- 高 / 中 / 低
  detail     TEXT,
  status     TEXT NOT NULL DEFAULT '新建',   -- 新建 / 处理中 / 已处理 / 误报
  created_at TEXT NOT NULL,
  handled_at TEXT,
  handled_by TEXT
);

-- 监测任务：按关键词在指定渠道周期巡检
CREATE TABLE IF NOT EXISTS tasks (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  source           TEXT NOT NULL,
  keywords         TEXT NOT NULL DEFAULT '[]',
  interval_minutes INTEGER NOT NULL DEFAULT 360,
  enabled          INTEGER NOT NULL DEFAULT 1,
  last_run_at      TEXT,
  next_run_at      TEXT,
  total_found      INTEGER NOT NULL DEFAULT 0,
  total_new        INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);

-- 巡检批次：可审计的执行记录
CREATE TABLE IF NOT EXISTS crawl_runs (
  id          TEXT PRIMARY KEY,
  task_id     TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  source      TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  found       INTEGER NOT NULL DEFAULT 0,
  new_count   INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT '运行中', -- 运行中 / 成功 / 失败
  log         TEXT
);

-- 报告：周期汇总 / 单案报告
CREATE TABLE IF NOT EXISTS reports (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT '周期报告', -- 周期报告 / 单案报告 / 下架通知函
  period     TEXT,
  payload    TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_risk ON listings(risk_level, risk_score);
CREATE INDEX IF NOT EXISTS idx_listings_source ON listings(source);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_listing ON alerts(listing_id);
CREATE INDEX IF NOT EXISTS idx_crawl_runs_task ON crawl_runs(task_id);

-- ------------------------------------------------------------------
-- 账号与登录（V1.0.1）
-- ------------------------------------------------------------------

-- 系统用户：密码只存 scrypt 派生值 + 随机盐，绝不落明文
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,          -- 登录名（统一存小写）
  display_name  TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT '成员',  -- 管理员 / 成员
  status        TEXT NOT NULL DEFAULT '启用',  -- 启用 / 停用
  created_at    TEXT NOT NULL,
  last_login_at TEXT
);

-- 会话：随机 token 存库，浏览器只持有 HttpOnly Cookie
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ------------------------------------------------------------------
-- V1.1：图像指纹、价格基线、案件卷宗
-- ------------------------------------------------------------------

-- 素材库：版权方官方素材，用于「盗图」比对（只存感知哈希，不存原图）
CREATE TABLE IF NOT EXISTS assets (
  id         TEXT PRIMARY KEY,
  game_id    TEXT REFERENCES games(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  phash      TEXT NOT NULL,          -- 64 位感知哈希，16 位十六进制
  width      INTEGER,
  height     INTEGER,
  size_bytes INTEGER,
  note       TEXT,
  created_at TEXT NOT NULL
);

-- 价格基线：按作品统计分位数，替代固定「均价 40%」阈值
CREATE TABLE IF NOT EXISTS price_baselines (
  game_id      TEXT NOT NULL,
  region       TEXT NOT NULL DEFAULT '全部',
  sample_count INTEGER NOT NULL DEFAULT 0,
  p20          REAL,
  p50          REAL,
  p80          REAL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (game_id, region)
);

-- 案件（卷宗）
CREATE TABLE IF NOT EXISTS cases (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  game_id     TEXT,
  seller_name TEXT,
  status      TEXT NOT NULL DEFAULT '待受理',
  priority    TEXT NOT NULL DEFAULT '中',
  owner       TEXT,
  deadline    TEXT,
  summary     TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  closed_at   TEXT
);

CREATE TABLE IF NOT EXISTS case_listings (
  case_id    TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  added_at   TEXT NOT NULL,
  PRIMARY KEY (case_id, listing_id)
);

CREATE TABLE IF NOT EXISTS case_events (
  id         TEXT PRIMARY KEY,
  case_id    TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  content    TEXT,
  actor      TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status, created_at);
CREATE INDEX IF NOT EXISTS idx_case_events_case ON case_events(case_id, created_at);
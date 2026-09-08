# PRD v3 · 实施版
# 高端旅行智能方案生成平台「行策」

---

**文档性质** · 开工用实施规格（v2 是设计文档，本版是可执行版本）
**目标读者** · 开发者本人（单人 + AI 辅助编码）
**技术栈** · Python 3.11+ / FastAPI / PostgreSQL 16 + pgvector / Claude Opus 5
**前置文档** · `高端旅行智能方案生成平台-PRD-v2.md`（设计依据与决策理由）

> **本版与 v2 的差异**
>
> | | v2 设计版 | **v3 实施版** |
> |---|---|---|
> | 目的 | 说明设计意图与权衡 | **能照着写代码** |
> | 范围 | 完整产品蓝图 | **切成 3 个里程碑，M0 是最小可跑闭环** |
> | 内容 | 功能需求 + 决策理由 | **DDL / Pydantic 模型 / API 契约 / 种子数据 / 验证点** |
> | 检索 | 五层完整链路 | **M0 只做硬过滤，向量检索推到 M1** |
> | 约束 | 11 硬 + 9 软 | **M0 实现 7 条硬约束（可被种子数据验证的）** |
>
> **最重要的一条范围决策：M0 不做向量检索。**
> 3 城 40 家酒店，硬过滤后候选通常只剩 5–10 家，语义排序的边际价值极低。
> 先把「抽取 → 检索 → 编排 → 校验 → 核算」闭环跑通，向量是 M1 的事。

---

## 目录

1. [范围收敛：三个里程碑](#1-范围收敛三个里程碑)
2. [技术栈与环境](#2-技术栈与环境)
3. [数据模型（DDL）](#3-数据模型ddl)
4. [种子数据策略](#4-种子数据策略-)
5. [检索服务规格](#5-检索服务规格)
6. [LLM 接口规格](#6-llm-接口规格-)
7. [约束校验器规格](#7-约束校验器规格-)
8. [成本规则引擎规格](#8-成本规则引擎规格)
9. [API 契约](#9-api-契约)
10. [前端对接](#10-前端对接)
11. [构建顺序与验证点](#11-构建顺序与验证点-)
12. [验收测试](#12-验收测试)
13. [配置项清单](#13-配置项清单)
14. [成本与限流](#14-成本与限流)
15. [风险与降级](#15-风险与降级)
16. [开工清单](#16-开工清单)

---

## 1. 范围收敛：三个里程碑

### M0 · 最小可跑闭环（目标 2–3 周）

**验证目标**：粘贴一段客户原话 → 得到一份约束合法、成本正确、全部可溯源的 7 天行程。

| 模块 | M0 做什么 | M0 不做 |
|---|---|---|
| 数据底座 | 3 城种子数据（含**故意埋入的约束陷阱**） | 真实供应商数据、批量导入后台 |
| 检索 | **纯 SQL 硬过滤** + 简单业务排序 | 向量检索、BM25、RRF、rerank |
| 槽位抽取 | 12 个核心槽位（Pydantic structured output） | 18 个全量槽位、委婉表达 few-shot |
| 冲突检测 | 3 条（预算×档次、天数×城市、房型×人数） | 8 条全量 |
| 行程编排 | 骨架 + 逐日填充，LLM 只输出 `resource_id` | 路线模板匹配、相似历史方案 |
| 约束校验 | **7 条硬约束** + 回退重排 | 9 条软约束、软约束评分 |
| 成本核算 | 住宿/交通/餐饮/门票 + 服务费 | 汇率服务、儿童分段价、包车超时费 |
| 防幻觉 | **三道防线全做**（这是核心，不能砍） | — |
| UI | 复用现有 HTML 原型 + fetch 接真 API | React 重写、拖拽编辑 |
| 评测 | 20 条用例 + 约束校验自动跑 | 五维人工评分后台 |

### M1 · 加语义检索（+1–2 周）

- 字段模板化文本生成 + 向量索引
- 混合检索：硬过滤 → 向量 + BM25 → RRF 融合
- 别名表（中日英）
- 槽位补全到 18 个 + 冲突规则补到 8 条

### M2 · 加编辑能力（+1–2 周）

- 锁定 + 增量重排 + 版本 diff
- 资源替换与替代方案
- 降本路径生成
- 4 个人工确认节点的状态机落地

> **别越级。** M0 没跑通之前不要碰 M1。最常见的失败模式是先做向量检索，
> 结果因为种子数据字段不全，硬过滤根本没生效，推出来的酒店住不下客人。

---

## 2. 技术栈与环境

### 2.1 选型

| 层 | 选型 | 版本 | 理由 |
|---|---|---|---|
| 语言 | Python | 3.11+ | Pydantic v2 + FastAPI 生态 |
| Web 框架 | FastAPI | 0.115+ | 自动 OpenAPI，Pydantic 原生 |
| 数据校验 | **Pydantic v2** | 2.9+ | **一套模型两用**：既做 API schema，又做 Claude structured output |
| 数据库 | PostgreSQL | 16 | + pgvector（M1 用）+ PostGIS（可选，M0 用 haversine 够） |
| LLM | **Claude Opus 5** | `claude-opus-5` | 结构化输出稳定，中日文理解好 |
| SDK | `anthropic` | 1.x | 官方 SDK |
| Embedding | 待选（M1） | — | 要求：中日文混合。M0 不需要 |
| 任务队列 | 先不上 | — | M0 用 FastAPI `BackgroundTasks` + 轮询即可 |
| 前端 | 现有 HTML 原型 | — | 单文件改造，加 fetch |

> **Pydantic 一套两用是本项目最重要的工程简化。**
> `SlotExtraction` 这个模型同时是：① Claude `messages.parse()` 的 `output_format`
> ② FastAPI 的 response model ③ 数据库 jsonb 的校验器。写一次，用三处。

### 2.2 环境

```bash
# 目录结构
travel-plan-studio/
├── docker-compose.yml
├── .env
├── requirements.txt
├── app/
│   ├── main.py              # FastAPI 入口
│   ├── config.py            # 配置（约束阈值、权重、模型名）
│   ├── db.py                # 连接池
│   ├── models/              # Pydantic 模型（一套两用）
│   │   ├── slots.py         # 需求卡与槽位
│   │   ├── plan.py          # 行程结构
│   │   └── resource.py      # 资源
│   ├── llm/
│   │   ├── client.py        # Claude 客户端封装
│   │   ├── extract.py       # 槽位抽取
│   │   └── plan.py          # 行程编排
│   ├── retrieval/
│   │   └── search.py        # 硬过滤检索
│   ├── rules/
│   │   ├── constraints.py   # 约束校验器
│   │   ├── conflicts.py     # 冲突检测
│   │   └── cost.py          # 成本规则引擎
│   ├── api/                 # 路由
│   └── render.py            # 事实字段回填 + 引用校验
├── seed/
│   ├── generate.py          # 种子数据生成脚本
│   ├── data/*.json          # 生成结果（提交到 git）
│   └── load.py              # 入库
├── eval/
│   ├── cases/*.yaml         # 测试用例
│   └── run.py               # 跑测脚本
└── prototype/index.html     # 前端
```

```yaml
# docker-compose.yml
services:
  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: travel
      POSTGRES_PASSWORD: dev
    ports: ["5432:5432"]
    volumes: ["./pgdata:/var/lib/postgresql/data"]
```

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...       # 或用 `ant auth login` 后留空
DATABASE_URL=postgresql://postgres:dev@localhost:5432/travel
CLAUDE_MODEL=claude-opus-5
```

```txt
# requirements.txt
anthropic>=1.0
fastapi>=0.115
uvicorn[standard]
pydantic>=2.9
psycopg[binary,pool]>=3.2
pyyaml
python-dotenv
pytest
```

---

## 3. 数据模型（DDL）

### 3.1 M0 需要的表（8 张）

```sql
-- ══════════════ 资源侧 ══════════════

CREATE TABLE supplier (
  supplier_id     TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  contract_to     DATE,
  lead_time_days  INT DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE hotel (
  hotel_id        TEXT PRIMARY KEY,
  name_zh         TEXT NOT NULL,
  name_local      TEXT,
  alias           TEXT[] DEFAULT '{}',      -- M1 用
  city            TEXT NOT NULL,
  district        TEXT,
  lat             DOUBLE PRECISION NOT NULL,   -- 铁律① 必填
  lng             DOUBLE PRECISION NOT NULL,
  tier            TEXT NOT NULL,            -- 4star|5star|luxury|ryokan|boutique
  category        TEXT NOT NULL,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  nearest_station TEXT,
  walk_min        INT,
  advisor_notes   TEXT,                     -- 隐性知识落点
  supplier_id     TEXT REFERENCES supplier,
  status          TEXT NOT NULL DEFAULT 'active',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON hotel (city, tier, status);

CREATE TABLE room_type (
  room_id         TEXT PRIMARY KEY,
  hotel_id        TEXT NOT NULL REFERENCES hotel,
  name_zh         TEXT NOT NULL,
  bed_config      JSONB NOT NULL,           -- {"king":1} / {"twin":2} / {"tatami":1}
  max_occupancy   INT NOT NULL,             -- 铁律③ 硬约束 H1 依据
  max_adults      INT NOT NULL,
  max_children    INT NOT NULL DEFAULT 0,
  min_child_age   INT,                      -- NULL = 未记录（不等于无限制！）
  extra_bed       JSONB,                    -- {"available":true,"fee":8000,"min_age":6}
  features        TEXT[] NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON room_type (hotel_id, max_occupancy);

CREATE TABLE rate_plan (
  rate_id         TEXT PRIMARY KEY,
  resource_type   TEXT NOT NULL,            -- room|vehicle|ticket|restaurant
  resource_id     TEXT NOT NULL,
  supplier_id     TEXT REFERENCES supplier,
  valid_from      DATE NOT NULL,            -- 硬约束 H8 依据
  valid_to        DATE NOT NULL,
  blackout_dates  DATE[] DEFAULT '{}',
  net_price       NUMERIC(12,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'JPY',
  price_basis     TEXT NOT NULL,            -- per_room_night|per_person|per_car_day|per_use
  meal_plan       TEXT,                     -- none|breakfast|half_board|full_board
  season_type     TEXT NOT NULL DEFAULT 'normal',  -- normal|peak|super_peak
  season_uplift   NUMERIC(5,3) NOT NULL DEFAULT 0, -- 0.18 = +18%
  confidence      TEXT NOT NULL,            -- contracted|reference|historical
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON rate_plan (resource_type, resource_id, valid_from, valid_to);

CREATE TABLE vehicle (
  vehicle_id      TEXT PRIMARY KEY,
  name_zh         TEXT NOT NULL,
  city            TEXT NOT NULL,
  seats           INT NOT NULL,             -- 硬约束 H4 依据①
  luggage_28      INT NOT NULL,             -- 硬约束 H4 依据②（等效28寸箱数）
  service_hours   INT NOT NULL DEFAULT 8,
  supplier_id     TEXT REFERENCES supplier,
  status          TEXT NOT NULL DEFAULT 'active',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE restaurant (
  rest_id         TEXT PRIMARY KEY,
  name_zh         TEXT NOT NULL,
  name_local      TEXT,
  city            TEXT NOT NULL,
  district        TEXT,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  cuisine         TEXT NOT NULL,
  price_band      TEXT NOT NULL,            -- budget|mid|high|luxury
  closed_days     INT[],                    -- 0=周日..6=周六；NULL = 未记录！
  open_from       TIME, open_to TIME,
  dietary_support TEXT[] NOT NULL DEFAULT '{}',  -- 硬约束 H2 依据
  child_friendly  BOOLEAN,                  -- NULL = 未记录
  lead_time_days  INT DEFAULT 0,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'active',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON restaurant (city, price_band, status);

CREATE TABLE poi (
  poi_id          TEXT PRIMARY KEY,
  name_zh         TEXT NOT NULL,
  name_local      TEXT,
  city            TEXT NOT NULL,
  district        TEXT,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  category        TEXT NOT NULL,            -- temple|museum|nature|experience|shopping
  closed_days     INT[],                    -- 硬约束 H3 依据；NULL = 未记录！
  open_from       TIME, open_to TIME,
  duration_min    INT NOT NULL DEFAULT 60,
  intensity       TEXT NOT NULL DEFAULT 'moderate',  -- easy|moderate|hard
  accessible      BOOLEAN,                  -- 硬约束 H9 依据；NULL = 未记录
  min_age         INT,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'active',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON poi (city, category, status);

-- ══════════════ 业务侧 ══════════════

CREATE TABLE conversation (
  conv_id     TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE message (
  msg_id      BIGSERIAL PRIMARY KEY,
  conv_id     TEXT NOT NULL REFERENCES conversation,
  role        TEXT NOT NULL,                -- advisor|ai|system
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE requirement_card (
  card_id     TEXT PRIMARY KEY,
  conv_id     TEXT NOT NULL REFERENCES conversation,
  version     INT NOT NULL,
  slots       JSONB NOT NULL,               -- SlotSet 序列化
  completeness NUMERIC(4,3) NOT NULL,
  conflicts   JSONB NOT NULL DEFAULT '[]',
  confirmed_at TIMESTAMPTZ,                 -- 人工节点1 凭证
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conv_id, version)
);

CREATE TABLE plan_version (
  plan_id     TEXT NOT NULL,
  version     INT NOT NULL,
  card_id     TEXT NOT NULL REFERENCES requirement_card,
  structure   JSONB NOT NULL,               -- 渲染后的完整方案
  cost        JSONB NOT NULL,
  violations  JSONB NOT NULL DEFAULT '[]',
  checklist   JSONB NOT NULL DEFAULT '[]',  -- 待人工核实项
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, version)
);

CREATE TABLE trace_log (
  trace_id    BIGSERIAL PRIMARY KEY,
  conv_id     TEXT,
  plan_id     TEXT,
  step        TEXT NOT NULL,                -- extract|search|plan|validate|cost|render
  latency_ms  INT,
  input_tokens INT, output_tokens INT,
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.2 M1 追加

```sql
ALTER TABLE hotel      ADD COLUMN embed_text TEXT, ADD COLUMN embedding vector(1024);
ALTER TABLE restaurant ADD COLUMN embed_text TEXT, ADD COLUMN embedding vector(1024);
ALTER TABLE poi        ADD COLUMN embed_text TEXT, ADD COLUMN embedding vector(1024);
CREATE INDEX ON hotel USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);
-- 维度按最终选定的 embedding 模型调整
```

> ⚠️ **`min_child_age`、`closed_days`、`accessible`、`child_friendly` 允许 NULL 是刻意的。**
> NULL 表示「未记录」，**不等于「无限制」**。约束校验器必须把它判为
> `UNKNOWN` 而非 `PASS`（见第 7 章）。这是本项目最容易写错的地方。

---

## 4. 种子数据策略 ⭐

### 4.1 为什么这一节最关键

没有真实供应商数据，所以种子数据是整个项目的地基。**但种子数据不能只是"看起来合理"——它必须能验证约束校验器。**

如果所有酒店都能住 4 人、所有景点都全年无休，那约束校验器写了也测不出来。

### 4.2 规模（M0）

| 表 | 数量 | 分布 |
|---|---|---|
| hotel | 42 | 东京 18 / 京都 16 / 箱根 8 |
| room_type | ~130 | 每家 2–4 个房型 |
| rate_plan | ~320 | 每房型 2–3 档（平季/旺季）+ 车/票/餐 |
| vehicle | 12 | 每城 4 种（5座/7座/9座/大巴） |
| restaurant | 60 | 每城 20 |
| poi | 75 | 东京 30 / 京都 30 / 箱根 15 |
| supplier | 15 | |

### 4.3 必须埋入的约束陷阱 ⭐

**这张表是种子数据的验收标准。** 生成脚本必须保证每一行都存在对应数据。

| # | 陷阱 | 对应约束 | 种子数据要求 |
|---|---|---|---|
| T1 | 房型只能住 2 人 | H1 | **≥5 家**酒店的全部房型 `max_occupancy = 2` |
| T2 | 旅馆限制儿童年龄 | H1 | **≥3 家** ryokan `min_child_age = 7` 或 `12` |
| T3 | 房型不允许加床 | H1 | **≥4 个**房型 `extra_bed = {"available": false}` |
| T4 | 周一休馆的博物馆 | H3 | **≥6 个** POI `closed_days = {1}` |
| T5 | 周二定休的餐厅 | H3 | **≥5 家** restaurant `closed_days = {2}` |
| T6 | 不支持忌生食的餐厅 | H2 | **≥15 家** restaurant `dietary_support` 不含 `no_raw` |
| T7 | 座位够但行李不够的车 | H4 | **≥2 台**车 `seats=7, luggage_28=3` |
| T8 | 合约已过期的资源 | H8 | **≥4 个** rate_plan `valid_to < 2026-10-01` |
| T9 | 价格超时效 | H11 | **≥8 个** rate_plan `confidence='reference'` 且 `updated_at` 早于 90 天 |
| T10 | 不适配无障碍的景点 | H9 | **≥8 个** POI `accessible = false` |
| T11 | **字段为 NULL（未记录）** | 空值处理 | **≥5 个** POI `closed_days IS NULL`；**≥3 个** room_type `min_child_age IS NULL` |
| T12 | 跨城地理过远 | H5 | 箱根↔京都的通勤时长使同日安排必然超阈值 |

> **T11 是最重要的一条。** 它验证的不是"约束能否拦住违规"，而是
> "**约束能否识别自己无法判定**"。这是 v2 第 13.4 节空值处理原则的落地测试。

### 4.4 生成脚本设计

```python
# seed/generate.py 的核心思路

# 1. 用 Claude 批量生成"基础合理"的资源（分批，每批一类）
#    prompt 里明确给出 JSON schema 与真实感要求
# 2. 生成后用 Python 强制注入约束陷阱（不靠模型保证）
# 3. 校验：跑 assert_traps() 确认 4.3 表格每一行都满足
# 4. 输出到 seed/data/*.json，提交到 git

def assert_traps(data: dict) -> None:
    """种子数据的验收测试——不通过就不许入库"""
    rooms = data["room_type"]
    assert sum(1 for r in rooms if r["max_occupancy"] == 2) >= 12, "T1"
    assert sum(1 for r in rooms if r.get("min_child_age") in (7, 12)) >= 6, "T2"
    assert sum(1 for r in rooms if r.get("min_child_age") is None) >= 3, "T11-a"
    pois = data["poi"]
    assert sum(1 for p in pois if p.get("closed_days") == [1]) >= 6, "T4"
    assert sum(1 for p in pois if p.get("closed_days") is None) >= 5, "T11-b"
    # ... 逐条对应 4.3
```

**生成 prompt 要点**：
- 明确要求「日文原名 + 中文译名」双语（为 M1 的别名表铺路）
- `advisor_notes` 要求写成**顾问口吻的大白话**，不要官方文案（这是 M1 字段模板化的关键信号）
- 经纬度要求落在真实行政区范围内（否则地理聚类会算出荒谬结果）

### 4.5 数据免责标注

所有对外展示（原型页脚、导出方案书）必须标注：**资源数据为模拟数据集，非真实供应商信息。**

代码层面：在 `hotel` 等表加一列 `is_synthetic BOOLEAN DEFAULT true`，导出时若含 synthetic 数据则强制加水印。防止将来接入真实数据后混淆。

---

## 5. 检索服务规格

### 5.1 M0：纯硬过滤

```python
# app/retrieval/search.py

class HotelQuery(BaseModel):
    city: str
    checkin: date
    checkout: date
    adults: int
    children: int
    child_ages: list[int] = []
    tiers: list[str]
    max_price_per_night: Decimal | None = None
    require_tags: list[str] = []        # 如 ["child_friendly"]
    accessible_required: bool = False

def search_hotels(q: HotelQuery) -> list[HotelCandidate]:
    """
    硬过滤顺序按选择性从高到低：city → 日期可售 → 档次 → 容量
    过滤掉的资源绝不进入候选池（v2 决策 D5）
    """
```

**SQL 骨架**（关键是容量子查询 + 空值处理）：

```sql
SELECT h.*, r.room_id, r.max_occupancy, r.min_child_age,
       rp.rate_id, rp.net_price, rp.confidence, rp.updated_at,
       -- 空值不视为通过：min_child_age 为 NULL 时标记待核实
       (r.min_child_age IS NULL) AS child_age_unknown
FROM hotel h
JOIN room_type r  ON r.hotel_id = h.hotel_id
JOIN rate_plan rp ON rp.resource_type = 'room' AND rp.resource_id = r.room_id
WHERE h.status = 'active'
  AND h.city = %(city)s
  AND h.tier = ANY(%(tiers)s)
  -- H8 可售期
  AND rp.valid_from <= %(checkin)s AND rp.valid_to >= %(checkout)s
  AND NOT (rp.blackout_dates && %(stay_dates)s::date[])
  -- H1 容量
  AND r.max_occupancy >= %(pax_total)s
  AND r.max_children  >= %(children)s
  -- H1 儿童年龄：已记录的必须满足；未记录的放行但标记
  AND (r.min_child_age IS NULL OR r.min_child_age <= %(min_child_age)s)
  -- 价带
  AND (%(max_price)s IS NULL OR rp.net_price <= %(max_price)s)
ORDER BY rp.net_price
```

### 5.2 排序（M0 简化版）

```python
score = (
    0.50 * tag_match_ratio        # require_tags 命中比例
  + 0.30 * price_fit              # 与目标价带的接近度
  + 0.20 * freshness              # updated_at 新鲜度
  - 0.15 * (confidence != 'contracted')   # 时效惩罚
)
```

**M1 才引入语义分与合约优先。** 商业优先级权重上限 0.10（v2 决策，写进 config 校验）。

### 5.3 无结果处理

必须返回**放宽建议**，不返回空列表：

```python
class SearchResult(BaseModel):
    candidates: list[HotelCandidate]
    relaxation_hints: list[RelaxationHint] = []

class RelaxationHint(BaseModel):
    field: str          # "tiers" / "max_price_per_night"
    suggestion: str     # "放宽到 4 星可得 7 个结果"
    would_yield: int
```

实现方式：候选为空时，依次去掉一个非硬性条件重跑 count，取收益最大的 2–3 条。

---

## 6. LLM 接口规格 ⭐

### 6.1 客户端封装

```python
# app/llm/client.py
import anthropic
from app.config import settings

client = anthropic.Anthropic()   # 从 ANTHROPIC_API_KEY 或 ant auth profile 解析

MODEL = settings.claude_model          # "claude-opus-5"
THINKING = {"type": "adaptive"}        # Opus 5 默认即 adaptive，显式写便于审计
```

> ⚠️ **Opus 5 的三个注意点**
> - `budget_tokens` 已移除 → 传了会 400。用 `output_config.effort` 控制深度。
> - `temperature` / `top_p` 已移除 → 传了会 400。
> - 不支持 assistant prefill → 用 structured output 控制格式，别用 prefill。

### 6.2 调用一：槽位抽取

```python
# app/models/slots.py
from pydantic import BaseModel, Field
from typing import Literal

Source = Literal["client_verbatim", "advisor_input", "system_inferred"]

class SlotValue(BaseModel):
    value: str | int | float | list[str] | None
    source: Source
    confidence: float = Field(ge=0, le=1)

class SlotSet(BaseModel):
    """M0 的 12 个核心槽位。同时用于 Claude output_format / API response / jsonb 校验"""
    destination_cities: SlotValue | None = None
    date_start:         SlotValue | None = None
    date_end:           SlotValue | None = None
    duration_days:      SlotValue | None = None
    adults:             SlotValue | None = None
    children:           SlotValue | None = None
    child_ages:         SlotValue | None = None
    budget_amount:      SlotValue | None = None
    budget_basis:       SlotValue | None = None   # total | per_person
    budget_incl_flight: SlotValue | None = None   # yes | no | undecided
    hotel_tier:         SlotValue | None = None
    dietary:            SlotValue | None = None
    accessibility:      SlotValue | None = None
    interests:          SlotValue | None = None
    pace:               SlotValue | None = None

class Followup(BaseModel):
    slot: str
    question: str
    options: list[str] = []      # 能枚举就给选项，不问开放题

class SlotExtraction(BaseModel):
    slots: SlotSet
    followups: list[Followup] = Field(max_length=3)   # 单轮≤3问
    notes: str = ""
```

```python
# app/llm/extract.py

SYSTEM = """你是高端定制旅行的需求抽取助手。从顾问提供的客户原话中抽取结构化旅行需求。

规则：
1. 只抽取原话中明确表达或可确定推断的信息。抽不到就留 null，不要猜。
2. 每个槽位标注来源：client_verbatim（客户原话）/ system_inferred（你的推断）。
   推断必须有依据，例如「2大1小、儿童5岁」可推断需要家庭房，标 system_inferred。
3. 以下三项不可静默假设为「无」，缺失时必须生成追问：
   dietary（饮食禁忌）、accessibility（无障碍需求）、budget_basis + budget_incl_flight（预算口径）。
4. 中文表达高度委婉：「生冷的少一点」「肠胃不好」「吃不惯」都应识别为饮食限制倾向。
5. 追问单轮最多 3 个，按影响方案结构的程度排序。能给枚举选项的就给选项，不问开放题。
6. 已在 existing_slots 中确认过的槽位（source=advisor_input）不得改写，也不要重复追问。
"""

def extract_slots(text: str, existing: SlotSet | None) -> SlotExtraction:
    resp = client.messages.parse(
        model=MODEL,
        max_tokens=8000,
        thinking=THINKING,
        cache_control={"type": "ephemeral"},   # SYSTEM 稳定，缓存它
        system=SYSTEM,
        messages=[{
            "role": "user",
            "content": f"<existing_slots>\n{existing.model_dump_json() if existing else '{}'}\n"
                       f"</existing_slots>\n\n<client_message>\n{text}\n</client_message>"
        }],
        output_format=SlotExtraction,
    )
    return resp.parsed_output
```

### 6.3 调用二：行程编排 ⭐ 防幻觉的关键

```python
# app/models/plan.py

Slot = Literal["morning","lunch","afternoon","dinner","evening","accommodation","transport"]
ItemType = Literal["hotel","restaurant","poi","vehicle","transfer","free_time"]

class PlannedItem(BaseModel):
    """⚠️ LLM 的输出边界就到这里。
    没有 name / price / duration / opening_hours 等任何事实字段。
    它想编也没有字段可以编（v2 决策 D2 + 防线①）。"""
    slot: Slot
    type: ItemType
    resource_id: str | None = None      # free_time 时为 None
    room_id: str | None = None          # type=hotel 时必填
    nights: int | None = None
    start_time: str | None = None        # "09:30"
    reason_slots: list[str] = []         # 命中了哪些需求槽位
    reason_note: str = ""                # 一句话理由（允许自然语言，但不含事实数字）

class PlannedDay(BaseModel):
    day_index: int
    date: str
    city: str
    theme: str
    is_transfer: bool = False
    items: list[PlannedItem]

class ItineraryPlan(BaseModel):
    days: list[PlannedDay]
    assumptions: list[str] = []
```

```python
# app/llm/plan.py

SYSTEM_PLAN = """你是高端定制旅行的行程编排助手。

你的输出只包含 resource_id 和结构安排。**你不得输出任何价格、酒店名称、
房型名称、营业时间、容量数字**——这些字段由系统从数据库回填。

编排规则：
1. 只能使用 <candidates> 中给出的 resource_id。使用候选池外的 ID 会被系统拦截。
2. 同一天的条目应地理就近，减少往返。
3. 转场日不安排高强度内容。
4. 住宿优先连住，减少换酒店。
5. 每天必须有 accommodation 条目（除最后一天）。
6. 每个条目给出 reason_slots（命中的需求槽位）与一句话 reason_note。
7. 无法满足某项需求时，写入 assumptions 说明，不要用不合适的资源凑数。

约束提示（系统会二次校验，你尽量先满足）：
- 房型容量必须容纳实际人数
- 餐厅必须支持客户的饮食限制
- 景点与餐厅在安排当日必须营业
- 车辆座位与行李容量都要够
- 同日通勤总时长不超过上限
"""

def plan_itinerary(card: SlotSet, candidates: CandidatePool,
                   constraint_brief: str) -> ItineraryPlan:
    resp = client.messages.parse(
        model=MODEL,
        max_tokens=32000,
        thinking=THINKING,
        output_config={"effort": "high"},
        system=[{"type": "text", "text": SYSTEM_PLAN,
                 "cache_control": {"type": "ephemeral"}}],
        messages=[{
            "role": "user",
            "content": (
                f"<requirement>\n{card.model_dump_json()}\n</requirement>\n\n"
                f"<candidates>\n{candidates.to_compact_json()}\n</candidates>\n\n"
                f"<constraints>\n{constraint_brief}\n</constraints>"
            )
        }],
        output_format=ItineraryPlan,
    )
    return resp.parsed_output
```

> **候选池必须摘要化。** `to_compact_json()` 只输出 `resource_id` + 关键结构化字段
> （城市、区、档次、容量、标签、营业日、经纬度），**不输出描述文本与价格**。
> 全量描述会撑爆上下文，价格根本不该进 prompt。

### 6.4 渲染层：事实回填 + 引用校验（防线②③）

```python
# app/render.py

class RenderError(BaseModel):
    day_index: int
    item_index: int
    kind: Literal["id_not_in_pool", "id_not_found", "field_mismatch"]
    detail: str

def render_plan(plan: ItineraryPlan, pool: CandidatePool) -> tuple[RenderedPlan, list[RenderError]]:
    """
    防线②：resource_id 必须在本次候选池内 —— 拦截"看起来合理但不存在"的资源
    防线③：回填后逐字段与库值比对
    失败时阻断该条目并记录，绝不静默丢弃或留空
    """
    errors = []
    for d in plan.days:
        for i, item in enumerate(d.items):
            if item.type == "free_time":
                continue
            if item.resource_id not in pool.ids():
                errors.append(RenderError(day_index=d.day_index, item_index=i,
                                          kind="id_not_in_pool",
                                          detail=f"{item.resource_id} 不在本次检索候选池"))
                continue
            row = db_fetch(item.type, item.resource_id)
            if row is None:
                errors.append(...)   # id_not_found
                continue
            # 回填 name / 结构化字段 / 来源与更新时间
            ...
    return rendered, errors
```

**M0 的处理策略**：若 `errors` 非空 → 记录 trace，把这些条目标为 `blocked` 并触发一次重排（最多 3 轮）；仍失败则在方案中显式列出，交人工。

---

## 7. 约束校验器规格 ⭐

### 7.1 三态判定（不是二值）

```python
# app/rules/constraints.py
from enum import Enum

class Verdict(str, Enum):
    PASS = "pass"
    FAIL = "fail"
    UNKNOWN = "unknown"      # ⭐ 字段缺失 —— 不等于 PASS

class Violation(BaseModel):
    code: str                # "H1" ... "H11"
    verdict: Verdict
    day_index: int
    item_index: int | None
    message: str
    blocking: bool           # FAIL=True, UNKNOWN=False（但进待核实清单）
```

> **这是本项目最容易写错的地方。** `if room.min_child_age and room.min_child_age > age`
> 这种写法会让 `min_child_age = None` 静默通过。必须显式三分支。

### 7.2 M0 实现的 7 条硬约束

```python
def h1_room_capacity(item, card, row) -> Violation | None:
    """房型容量 + 儿童年龄"""
    pax = card.adults.value + card.children.value
    if row.max_occupancy < pax:
        return Violation(code="H1", verdict=FAIL,
                         message=f"房型最大入住 {row.max_occupancy} 人，不足 {pax} 人")
    if row.max_children < card.children.value:
        return Violation(code="H1", verdict=FAIL, message="儿童数超出房型限制")
    # ⭐ 三态：未记录 ≠ 通过
    if row.min_child_age is None:
        if card.children.value > 0:
            return Violation(code="H1", verdict=UNKNOWN, blocking=False,
                             message="该房型最低入住年龄未记录，需向供应商确认")
    elif min(card.child_ages.value) < row.min_child_age:
        return Violation(code="H1", verdict=FAIL,
                         message=f"该房型限 {row.min_child_age} 岁以上入住")
    return None
```

| # | 约束 | 判定 | UNKNOWN 条件 |
|---|---|---|---|
| **H1** | 房型容量与儿童年龄 | `max_occupancy >= pax` 且 `min_child_age <= min(child_ages)` | `min_child_age IS NULL` 且有儿童 |
| **H2** | 饮食禁忌 | 客户限制项 ⊆ `restaurant.dietary_support` | `dietary_support = '{}'` 且客户有限制 |
| **H3** | 营业日 | `dow(date) NOT IN closed_days` 且在营业时段内 | `closed_days IS NULL` |
| **H4** | 车辆座位 **AND** 行李 | `seats >= pax` 且 `luggage_28 >= luggage_est` | `luggage_28 IS NULL` |
| **H5** | 同日通勤上限 | `Σ commute_min <= 180`（转场日 300） | 缺经纬度 |
| **H8** | 资源可售期 | `valid_from <= date <= valid_to` 且不在 blackout | — |
| **H11** | 价格来源 | `confidence = 'contracted'` 且 `updated_at` 在 90 天内 | 其余情况 → UNKNOWN，进待核实清单 |

**H5 的通勤估算（M0 简化）**：haversine 直线距离 × 1.35（路网系数）÷ 城市平均车速（东京 22km/h、京都 25、箱根 30）。M1 再考虑接真实路径服务。

### 7.3 回退重排

```python
MAX_REPLAN_ROUNDS = 3     # config

def generate_with_validation(card, pool) -> tuple[RenderedPlan, list[Violation]]:
    brief = build_constraint_brief(card)
    for round_i in range(MAX_REPLAN_ROUNDS):
        plan = plan_itinerary(card, pool, brief)
        rendered, render_errors = render_plan(plan, pool)
        violations = validate_all(rendered, card)
        blocking = [v for v in violations if v.blocking] + render_errors_as_violations(render_errors)
        if not blocking:
            return rendered, violations       # UNKNOWN 项保留，进待核实清单
        # 把违规反馈进下一轮 prompt
        brief = build_constraint_brief(card, previous_violations=blocking)
    # 3 轮仍未通过 → 显式交人工，不静默通过
    return rendered, violations
```

> **绝不静默通过。** 3 轮后仍有 blocking 违规，返回时把它们放在
> `plan_version.violations` 里，前端顶部提示条显示数量并禁用导出。

---

## 8. 成本规则引擎规格

```python
# app/rules/cost.py  —— 纯确定性代码，不经过模型（v2 决策 D6）

class CostLine(BaseModel):
    category: Literal["accommodation","transport","dining","tickets","service_fee"]
    resource_id: str
    rate_id: str
    qty: Decimal
    unit_price: Decimal
    season_uplift: Decimal
    amount: Decimal
    rule_trace: str          # "9800 × 2晚 × (1+0.12) = 21952" —— 可下钻

class CostSummary(BaseModel):
    lines: list[CostLine]
    breakdown: dict[str, Decimal]
    currency: str
    total: Decimal
    per_person: Decimal
    budget_target: Decimal | None
    variance_pct: Decimal | None
```

**M0 计算规则**：

| 类别 | 公式 |
|---|---|
| 住宿 | `net_price × nights × rooms × (1 + season_uplift)` |
| 交通（包车） | `net_price × days`（超时费 M1 再做） |
| 餐饮 | `net_price × adults + net_price × 0.5 × children` |
| 门票 | `net_price × pax`（儿童价 M1 再做） |
| 服务费 | `sum(above) × service_fee_rate`（config，默认 0.08） |

**M0 简化**：币种统一 JPY，展示时用 config 里的固定汇率（`fx_rate` + `fx_time` 一并存入 `cost` jsonb，供审计）。**不接汇率服务**。

**铁律**：`amount` 只能由本模块计算。任何从 LLM 响应里读金额的代码都是 bug。

---

## 9. API 契约

| Method | Path | 说明 |
|---|---|---|
| `POST` | `/conversations` | 建会话 |
| `POST` | `/conversations/{id}/messages` | 发消息 → 返回 `SlotExtraction` + 更新后的需求卡 |
| `GET` | `/conversations/{id}/card` | 取当前需求卡（含完整度与冲突） |
| `PATCH` | `/conversations/{id}/card` | 顾问覆盖某槽位（`source=advisor_input`，优先级最高） |
| `POST` | `/conversations/{id}/card/confirm` | **人工节点1** → 冻结版本，返回 `card_id` |
| `POST` | `/plans` | body: `{card_id}` → 异步生成，返回 `{plan_id, task_id}` |
| `GET` | `/plans/{plan_id}/status` | 轮询进度：`searching / planning / validating / costing / done / failed` |
| `GET` | `/plans/{plan_id}/versions/{v}` | 完整方案（含 violations 与 checklist） |
| `GET` | `/search/hotels` | 手动检索（query params → `SearchResult`） |
| `GET` | `/trace/{plan_id}` | 轨迹回放（调试用） |

```python
# 生成接口的响应
class PlanStatus(BaseModel):
    plan_id: str
    stage: Literal["searching","planning","validating","costing","done","failed"]
    progress: float                  # 0..1
    replan_round: int = 0
    error: str | None = None
```

**M0 用 `BackgroundTasks` + 内存字典存状态**，不上 Celery。生成耗时 30–60s，轮询间隔 2s。

---

## 10. 前端对接

**不重写，改造现有 `prototype/index.html`。**

| 原型位置 | 改造 |
|---|---|
| `SCRIPT` 数组（写死的对话脚本） | 删掉，改成 `POST /conversations/{id}/messages` |
| `renderSlots(step)` | 参数从 step 改为真实 `SlotSet`，按 `source` 渲染四态角标 |
| `RESOURCES` 常量 | 改成 `GET /search/hotels` 返回值 |
| `DAYS` 常量 | 改成 `GET /plans/{id}/versions/{v}` 返回值 |
| `COST` / `COSTTBL` 常量 | 改成方案里的 `cost.breakdown` / `cost.lines` |
| 生成按钮 | `POST /plans` → 轮询 `status` → 渲染进度条 |
| ⓘ 悬停浮层 | 数据源改为 item 的 `reason` + `source`（已是现成结构） |
| ③ 检索过程页 | 改成 `GET /trace/{plan_id}` 的真实漏斗数据 |
| ⑥ 评测框架页 | 保持静态（它展示的是设计，不是运行时数据） |

**跨域**：`app/main.py` 加 CORS 允许 `file://` 与 `localhost`，或直接用 FastAPI 的 `StaticFiles` 托管原型，避免 CORS。**推荐后者**，一行搞定：

```python
app.mount("/", StaticFiles(directory="prototype", html=True), name="ui")
```

---

## 11. 构建顺序与验证点 ⭐

**每一步都有可验证的 checkpoint。不通过不要往下走。**

| # | 步骤 | 产出 | ✅ 验证点 |
|---|---|---|---|
| **1** | Docker + DDL | 表建好 | `\dt` 见 8 张表；空值列允许 NULL |
| **2** | 种子数据生成 | `seed/data/*.json` | **`assert_traps()` 全绿**（4.3 的 12 条陷阱） |
| **3** | 入库 | 数据在 PG | `SELECT count(*) FROM hotel` = 42；抽查经纬度落在真实区域 |
| **4** | 硬过滤检索 | `search_hotels()` | **给「京都 / 2大1小5岁 / 10-15~18 / 5星+奢华」→ T1/T2 的酒店必须不在结果里** |
| **5** | 无结果放宽建议 | `relaxation_hints` | 给一个必然无解的 query → 返回 ≥2 条放宽建议，不返回空 |
| **6** | 槽位抽取 | `extract_slots()` | 给一段 180 字原话 → 抽出 ≥5 槽位；**dietary 缺失时必须生成追问** |
| **7** | 冲突检测 | 3 条规则 | 给「8万/4人/5星/10天」→ 命中预算×档次冲突 |
| **8** | 成本引擎 | `calc_cost()` | **手工算一遍 3 家酒店的住宿费，与代码结果逐分一致** |
| **9** | 约束校验器 | 7 条 H | **每条约束写 1 个 PASS + 1 个 FAIL + 1 个 UNKNOWN 单测，共 21 个** |
| **10** | 行程编排 | `plan_itinerary()` | 输出的 `PlannedItem` **不含任何 name/price 字段**（schema 保证）|
| **11** | 渲染 + 引用校验 | `render_plan()` | **手动往 LLM 输出里塞一个假 resource_id → 必须被防线② 拦截** |
| **12** | 回退重排 | `generate_with_validation()` | 故意给一个只有 T1 酒店的候选池 → 触发重排，3 轮后显式报违规 |
| **13** | API 串起来 | FastAPI 跑通 | curl 走完「建会话 → 发消息 → 确认 → 生成 → 取方案」 |
| **14** | 前端对接 | 原型接真数据 | 浏览器点「生成」→ 看到真实行程与真实成本 |
| **15** | 评测集 | 20 条用例 | `python eval/run.py` 出报告；**硬约束陷阱族必须 100% 通过** |

> **第 9 步和第 11 步是本项目的技术核心，别图快跳过。**
> 21 个约束单测（含 7 个 UNKNOWN 用例）是唯一能证明"空值不被当作通过"的东西。

---

## 12. 验收测试

### 12.1 M0 上线门槛（对应 v2 的 G1–G5）

| # | 门槛 | 可执行判定 |
|---|---|---|
| **G1** | 硬约束零违反 | 20 条评测用例中，`blocking` violations 数 = 0；硬约束陷阱族 100% 通过 |
| **G2** | 事实无编造 | 方案中每个非 `free_time` 条目都有有效 `resource_id`；引用校验拦截数记录在 trace |
| **G3** | 成本核算一致 | 3 份方案手工核算 vs `calc_cost()`，**逐分一致** |
| **G4** | 人工卡点有效 | 未 confirm 的 `card_id` 调 `POST /plans` → 返回 409 |
| **G5** | 空值不静默通过 | 7 个 UNKNOWN 单测全绿；`min_child_age IS NULL` + 有儿童 → 出现在 checklist |

### 12.2 评测用例格式

```yaml
# eval/cases/family_kyoto.yaml
id: family_kyoto_01
family: hard_constraint_trap        # 陷阱族，要求 100% 通过
input: |
  客户两大一小，孩子5岁，10月15到18号在京都，住奢华档，
  预算不限。老人肠胃不好这次不去，就他们三口。
expect:
  slots:
    adults: 2
    children: 1
    child_ages: [5]
  must_not_contain_resources:       # T1/T2 的酒店绝不能出现
    - HTL-KYO-T1-001                # max_occupancy=2
    - HTL-KYO-T2-002                # min_child_age=7
  must_have_followup_slots:
    - dietary                        # "肠胃不好"应触发澄清
  max_blocking_violations: 0
```

```python
# eval/run.py 输出
# case_id | family | slots_f1 | blocking_violations | unknown_count | pass
```

### 12.3 必写的单测清单

```
tests/
├── test_seed_traps.py        # 4.3 的 12 条陷阱（种子数据的验收）
├── test_search_filter.py     # 硬过滤：T1/T2/T8 资源不得进候选
├── test_constraints.py       # 21 个：7 条约束 × (PASS/FAIL/UNKNOWN)
├── test_cost.py              # 手工算例逐分比对
├── test_render_guard.py      # 塞假 resource_id 必须被拦
└── test_api_gate.py          # 未 confirm 不得生成（G4）
```

---

## 13. 配置项清单

**全部可配置，不硬编码**（v2 非功能需求要求）。

```python
# app/config.py
class Settings(BaseSettings):
    claude_model: str = "claude-opus-5"
    plan_effort: str = "high"

    # 约束阈值
    commute_max_min: int = 180
    commute_max_min_transfer: int = 300
    price_staleness_days: int = 90
    resource_staleness_days: int = 180

    # 编排
    max_replan_rounds: int = 3
    completeness_threshold: float = 0.85

    # 成本
    service_fee_rate: Decimal = Decimal("0.08")
    fx_jpy_cny: Decimal = Decimal("0.0479")

    # 排序权重（商业优先级上限锁死）
    w_tag_match: float = 0.50
    w_price_fit: float = 0.30
    w_freshness: float = 0.20
    w_commercial: float = 0.00       # M0 不启用

    @field_validator("w_commercial")
    def cap_commercial(cls, v):
        assert v <= 0.10, "商业优先级权重上限 0.10（v2 决策，不可调高）"
        return v
```

---

## 14. 成本与限流

### 14.1 单次生成的模型调用

| 调用 | 输入量级 | 输出量级 | 次数 |
|---|---|---|---|
| 槽位抽取 | ~1.5K tokens | ~1K | 每轮对话 1 次（平均 2–3 轮） |
| 行程编排 | ~8K（含候选池摘要） | ~4K | 1 + 回退轮数（平均 1.4） |

按 Opus 5 定价（$5/MTok 入、$25/MTok 出）粗估：**单次完整生成约 $0.15–0.25**。开发期每天跑 50 次约 $10。

### 14.2 省钱的三件事

1. **缓存 system prompt**：`cache_control={"type":"ephemeral"}`。抽取与编排的 SYSTEM 都是稳定前缀，命中后输入成本大幅下降。
2. **候选池摘要化**：`to_compact_json()` 只输出结构化字段，不输出描述文本。这是输入 token 的最大来源。
3. **验证缓存生效**：查 `response.usage.cache_read_input_tokens`。**如果重复请求它一直是 0，说明前缀里有变动内容**（常见元凶：把时间戳或 conv_id 写进了 system）。

### 14.3 开发期建议

- 跑评测集时给一个 `--dry-run` 开关，只走检索与约束校验（不调 LLM），验证规则层改动。规则层的迭代不该花模型钱。
- 把 LLM 响应缓存到本地文件（按 input hash），重复调试时复用。

---

## 15. 风险与降级

| 风险 | 概率 | 缓解 |
|---|---|---|
| **种子数据质量不足导致硬过滤失效** | 高 | `assert_traps()` 作为入库前门禁；步骤 4 的验证点专门测这个 |
| 编排 LLM 反复违反约束，3 轮跑不出合法方案 | 中 | 把 violations 明确反馈进下一轮 prompt；仍失败则交人工（不静默通过） |
| 候选池太小导致 LLM 无从选择 | 中 | 硬过滤后候选 < 3 时，先返回放宽建议给顾问，不硬生成 |
| 上下文超限（候选池太大） | 低 | 摘要化 + 每类资源限 Top 12 进 prompt |
| 生成超时 | 中 | 异步任务 + 前端轮询；返回已完成部分 |
| Opus 5 参数报 400 | 中 | 别传 `temperature` / `top_p` / `budget_tokens`；用 `effort` |
| 结构化输出解析失败 | 低 | `messages.parse()` 已做校验；捕获后重试 1 次，再失败则降级为手工编排 |
| 成本算错 | 中 | 步骤 8 的手工比对是唯一保障，别省 |

**核心降级路径**：LLM 全部不可用时，系统仍应支持「手动检索 + 手工拖入 + 自动核算」，不阻塞使用。M0 至少保证 `GET /search/hotels` 与 `calc_cost()` 独立可用。

---

## 16. 开工清单

**今天就能做的前三件事**（不需要写业务代码）：

- [ ] `docker compose up -d` 起 PG，跑第 3 章 DDL
- [ ] 写 `seed/generate.py`，先只生成 hotel + room_type 两类，跑通 `assert_traps()` 的 T1/T2/T3/T11
- [ ] 用 `client.messages.parse()` 跑一次最小的槽位抽取，确认 Pydantic 模型能被正确约束

**第一周目标**：走完验证点 1–8（数据 + 检索 + 抽取 + 成本）。
**第二周目标**：验证点 9–12（约束校验 + 编排 + 防幻觉），这是核心。
**第三周目标**：验证点 13–15（API + 前端 + 评测）。

**三条不要违反的纪律**：

1. **`assert_traps()` 不绿不入库。** 种子数据是地基，地基歪了后面全白做。
2. **21 个约束单测（含 7 个 UNKNOWN）写完再写编排。** 否则你无法证明约束层在工作。
3. **成本手工比对做完再往下。** 报价错了是这个产品唯一不可接受的错误。

---

## 附：与 v2 的对应关系

| v2 章节 | v3 落地位置 |
|---|---|
| 第 7 章 关键设计决策 | 贯穿：D2→§6.3/6.4，D5→§5.1，D6→§8，D7→§2.1 |
| 第 10 章 槽位设计 | §6.2（M0 收敛到 12 个） |
| 第 11 章 知识库 | §3 DDL + §4 种子数据 |
| 第 12 章 RAG 检索 | §5（M0 只做硬过滤，M1 补语义层） |
| 第 13 章 约束体系 | §7（M0 实现 7 条硬约束） |
| 第 13.4 空值处理原则 | §7.1 三态判定 + §4.3 陷阱 T11 |
| 第 14 章 防幻觉三道防线 | §6.3（防线①）+ §6.4（防线②③） |
| 第 18 章 评测体系 | §12 + `eval/` |
| 第 19 章 验收标准 | §12.1（G1–G5 转成可执行判定） |

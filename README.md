# 行策 · 高端旅行智能方案生成平台 — M0 最小可跑闭环

面向高端旅行顾问的 AI 行程方案生成工作台。M0 验证的是一条完整链路：

```
客户原话 → [槽位抽取] → 需求卡 → [人工确认①] → [硬过滤检索] → [编排]
   → [引用校验] → [约束校验(三态)] → 违规则回退重排(≤3) → [成本核算] → 方案可视化
```

设计依据见 `docs/`（PRD-v2 / PRD-v3 / 技术适配声明与第一阶段技术开发文档）。

## 快速开始

```bash
# 1. 数据库（二选一）
docker compose up -d                       # A. PostgreSQL 16（pgvector 镜像），占用 5432
#   或：无 Docker 时把 .env 里的 DATABASE_URL 改为 embedded:///.pgdata（内嵌 PostgreSQL 16，随进程启动）

# 2. Python 3.11 环境
python3.11 -m venv .venv && source .venv/bin/activate     # 或 uv venv -p 3.11 .venv
pip install -r backend/requirements.txt
cp .env.example .env                       # 填 ANTHROPIC_API_KEY（留空则由 ant auth profile 解析）

# 3. 建表 + 种子数据
(cd backend && alembic upgrade head)
python seed/generate.py                    # 末行应为「约束陷阱校验：12/12 通过」
python seed/load.py                        # 各表入库条数（酒店 42）

# 4. 启动
(cd backend && uvicorn app.main:app --reload --port 8000)
# 浏览器打开 http://localhost:8000 （验收界面）；http://localhost:8000/docs（Swagger）
```

## 接模型：Claude 或 DeepSeek

默认 `LLM_PROVIDER=anthropic`（Claude Opus 5，原生结构化输出）。切到 DeepSeek 只改 `.env`：

```bash
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...            # https://platform.deepseek.com 申请
DEEPSEEK_MODEL=deepseek-v4-pro     # 或 deepseek-v4-flash
PLANNER_MODE=llm
```

DeepSeek 走其 Anthropic 兼容端点，复用同一个 SDK；因该端点不支持 Claude 的 `output_format`，后端改用「强制调用唯一工具（input_schema 即 Pydantic JSON Schema）」拿结构化结果。DeepSeek 对 schema 的遵循弱于 Claude：偶尔多包一层 `result`、用同义词、或工具参数为空，后端有通用解包、别名归一化、`DEEPSEEK_MAX_ATTEMPTS`（默认 3）次重试兜底；回退 3 轮仍有违规时再做一次确定性资源替换。切换后跑 `python eval/smoke_real_model.py` 记录两种契约的结构合规率、耗时与 token。

## 正式前端（Next.js）

```bash
cd frontend && npm install && npm run dev      # http://localhost:3000，需后端在 8000
npm run lint && npm run typecheck && npm run test && npm run build && npm run e2e
```

详见 `frontend/README.md` 与 `docs/前端技术适配声明与第一阶段前端开发文档.md`。`backend/app/static/index.html` 保留为 API 冒烟兜底。

## 测试与评测

```bash
(cd backend && python -m pytest -q)        # 第一层：mock 自动化测试（不调用模型），含 21 个约束三态单测
python eval/run.py --dry-run               # 20 条评测用例，只测规则层（确定性编排器，不花模型钱）
python eval/run.py                         # 真实模型：抽取 + LLM 编排
python eval/smoke_real_model.py            # 第二层：两种模型契约的真实冒烟，输出 eval/smoke_report.json
```

测试用独立的内嵌数据库 `.pgdata-test/`，不影响开发库。

## 目录

```
backend/app/
  api/v1/          conversations / plans / search / trace（前缀 /api/v1 集中定义）
  core/            config（阈值与权重）/ db / llm（Opus 5 注意点）/ errors（统一错误结构）/ logging（trace_log）
  models/          SQLAlchemy：资源侧 7 张 + 业务侧 6 张（含 generation_task）
  schemas/         Pydantic 一套三用：slots / plan / search / cost / facts / common
  services/        extract / planner（LLM + 确定性编排器 + 回退重排）/ retrieval / render（三道防线）
                   constraints（7 条硬约束三态）/ conflicts（3 条）/ cost（规则引擎）/ card / tasks
  services/prompts/ extract_slots.md / plan_itinerary.md（Prompt 独立文件）
  static/index.html 最小验收界面（三栏：对话 / 需求卡 / 方案）
backend/tests/     test_seed_traps / test_constraints(21) / test_search_filter / test_cost / test_render_guard
                   test_conflicts / test_api_gate / test_tasks / test_card / test_pipeline
backend/alembic/   迁移（af351a7a956b 初始 13 张表）
seed/              generate.py（确定性生成 + assert_traps 门禁）/ load.py / data/*.json
eval/              cases/*.yaml（20 条）/ run.py / smoke_real_model.py
docs/              PRD 与阶段文档副本
```

## 关键约定（写代码前先看）

- **空值 ≠ 无限制。** `min_child_age` / `closed_days` / `accessible` / `child_friendly` / `luggage_28` 为 NULL 表示「未记录」，约束校验器必须判 `UNKNOWN`（进待核实清单），不得静默通过。见 `services/constraints.py`。
- **金额只来自 `services/cost.py`。** 模型输出 schema（`PlannedItem`）里没有价格、名称、营业时间等事实字段；任何从 LLM 响应读金额的代码都是 bug。
- **三道防线。** ① schema 限定模型只输出 `resource_id`；② `render.py` 校验 ID 必须在本次候选池内；③ 回填后逐字段与库值比对。拦截项标 `blocked` 并触发重排，绝不静默丢弃。
- **人工节点①。** 需求卡未 confirm 时 `POST /api/v1/plans` 返回 409 `CARD_NOT_CONFIRMED`；完整度低于阈值不允许 confirm。
- **任务可恢复。** 生成状态落 `generation_task` 表并带心跳；服务启动时把僵死任务标 `failed/ORPHANED`。
- **Opus 5 参数。** 不传 `temperature` / `top_p` / `budget_tokens`；深度用 `output_config.effort`；结构化输出用 `messages.parse()`，不用 prefill。
- **编排器模式。** `PLANNER_MODE=llm`（默认）| `heuristic`（确定性编排器，供 `eval --dry-run`、测试与 LLM 不可用时的降级）。

## 验收清单

见 `docs/技术适配声明与第一阶段技术开发文档.md` 第十一节。免责：**资源数据为模拟数据集，非真实供应商信息**（`is_synthetic=true`，界面页脚已标注）。

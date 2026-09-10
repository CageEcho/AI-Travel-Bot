# 行策 · 前端（Next.js 16 / React 19 / Tailwind 4 / TypeScript strict）

正式前端工作台，对接 `../backend` 的 `/api/v1`。设计依据见 `../docs/前端技术适配声明与第一阶段前端开发文档.md`。

## 运行

```bash
# 先起后端（无模型 Key 时用确定性编排器）
(cd ../backend && PLANNER_MODE=heuristic ../.venv/bin/uvicorn app.main:app --port 8000)

npm install --legacy-peer-deps
cp .env.example .env         # BACKEND_URL 默认 http://localhost:8000（构建时固化进 rewrites）
npm run dev                  # http://localhost:3000
```

## 检查（每次交付必跑）

```bash
npm run lint && npm run typecheck && npm run test && npm run build
npm run e2e                  # Playwright：自动拉起后端 + 前端，跑核心闭环（含刷新恢复、防重复提交、390px）
```

## 结构

```
app/                 路由：/（首页）、/c/[convId]（工作台）、/search（手动检索）、error / loading / not-found
components/ui        Button / Badge / Card / Tabs / Dialog / Alert / Skeleton
components/layout    AppShell
features/conversation   对话面板 + 会话 API
features/requirement-card  需求卡（四态角标、槽位编辑对话框）
features/plan           方案面板（轮询 Hook、按天行程、成本、溯源、客户版 A4 预览、PDF 与长图导出）
features/search         手动检索
features/workspace      工作台编排（URL 存 convId / plan / tab）
lib/api              集中式客户端、类型、错误归一化、任务状态映射
tests/  e2e/         Vitest + RTL；Playwright
```

## 约定
- 后端是事实来源：任务状态每 2s 轮询，页面不可见暂停，完成即停，连续失败退避并提示「连接中断」；未知状态映射为 stale。
- URL 可恢复：`/c/CNV-xxx?plan=PLN-xxx&tab=cost` 刷新后重新拉取需求卡与方案。
- 无密钥进前端；所有请求走同源 `/api` → rewrites → FastAPI。
- 客户版导出基于同一份 `PlanVersionView`：只展示规则引擎核算后的参考总价，并移除内部资源号、价格档与计算轨迹。
- 部署：`output: "standalone"`；`BACKEND_URL` 必须在构建命令时注入。

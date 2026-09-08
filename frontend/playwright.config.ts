import { defineConfig } from "@playwright/test";

// E2E 对接真实后端（PLANNER_MODE=heuristic，不需要模型 Key）。两个服务都由 Playwright 拉起；已在跑则复用。
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  use: { baseURL: "http://localhost:3000", viewport: { width: 1440, height: 900 } },
  webServer: [
    {
      command: "cd ../backend && PLANNER_MODE=heuristic ../.venv/bin/uvicorn app.main:app --port 8000",
      url: "http://localhost:8000/healthz",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
  ],
});

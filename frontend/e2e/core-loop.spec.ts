import { expect, test, type Page } from "@playwright/test";

/** 核心闭环：建会话 → 需求卡补齐 → 确认并生成 → 看到 7 天方案 → 刷新后仍在。后端 PLANNER_MODE=heuristic，不需要模型 Key。 */
const FULL: Record<string, unknown> = {
  destination_cities: ["东京", "箱根", "京都"], date_start: "2026-10-15", duration_days: 7, adults: 2, children: 1, child_ages: [5],
  budget_amount: 150000, budget_basis: "total", budget_incl_flight: "no", hotel_tier: ["5star", "luxury"], dietary: ["no_raw"], accessibility: "none",
};

test.beforeEach(async ({ page }) => {
  page.on("console", (msg) => { if (msg.type() === "error") throw new Error(`浏览器 Console 报错：${msg.text()}`); });
  page.on("pageerror", (err) => { throw new Error(`页面异常：${err.message}`); });
});

async function newConv(page: Page): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: "新建会话并开始" }).click();
  await page.waitForURL(/\/c\/CNV-/);
  return page.url().match(/\/c\/(CNV-[a-z0-9]+)/)![1];
}

test("空需求卡：生成按钮禁用并说明缺失项", async ({ page }) => {
  await newConv(page);
  const btn = page.getByRole("button", { name: "确认需求卡并生成方案" });
  await expect(btn).toBeDisabled();
  await expect(page.getByText(/完整度不足/)).toBeVisible();
  await expect(page.getByText("● 必须确认").first()).toBeVisible();
});

test("手动编辑槽位对话框可保存并显示顾问填写角标", async ({ page }) => {
  await newConv(page);
  await page.getByRole("button", { name: "修改成人" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("成人").fill("2");
  await dialog.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByText("✎ 顾问填写")).toBeVisible();
});

test("核心闭环：确认并生成 → 方案 → 刷新恢复 → 连点只创建一个任务", async ({ page, request }) => {
  const convId = await newConv(page);
  for (const [slot, value] of Object.entries(FULL)) {
    const r = await request.patch(`http://localhost:8000/api/v1/conversations/${convId}/card`, { data: { slot, value } });
    expect(r.ok()).toBeTruthy();
  }
  await page.reload();
  const btn = page.getByRole("button", { name: "确认需求卡并生成方案" });
  await expect(btn).toBeEnabled();
  let planPosts = 0;
  page.on("request", (req) => { if (req.method() === "POST" && req.url().endsWith("/api/v1/plans")) planPosts += 1; });
  await btn.click();
  await btn.click({ force: true }).catch(() => undefined);
  await page.waitForURL(/plan=PLN-/);
  await expect(page.getByText(/硬约束 .* 项违反/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Day 7")).toBeVisible();
  expect(planPosts).toBe(1);
  // 刷新恢复：URL 里的 plan 是事实来源
  await page.reload();
  await expect(page.getByText("Day 1")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: /成本/ }).click();
  await expect(page.getByText("地面总计（JPY，含服务费）")).toBeVisible();
  await page.getByRole("tab", { name: /待核实清单/ }).click();
  await expect(page.getByText(/待核实|没有待核实项/).first()).toBeVisible();
});

test("移动端 390px：底部切换可用，方案区域可达", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await newConv(page);
  await page.getByRole("tab", { name: "需求卡" }).click();
  await expect(page.getByRole("button", { name: "确认需求卡并生成方案" })).toBeVisible();
  await page.getByRole("tab", { name: "方案" }).click();
  await expect(page.getByText(/确认需求卡并生成后/)).toBeVisible();
});

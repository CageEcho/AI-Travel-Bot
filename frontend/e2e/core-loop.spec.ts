import { expect, test, type Page } from "@playwright/test";
import { stat } from "node:fs/promises";

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
  const response = await page.request.post("http://localhost:8000/api/v1/conversations");
  expect(response.ok()).toBeTruthy();
  const { conv_id: convId } = await response.json() as { conv_id: string };
  await page.goto(`/c/${convId}`);
  return convId;
}

test("首页空输入：不跳转；蓝色示例可填入多轮需求文案", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /AI 为我生成方案/ }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("请先填写客户需求，或点击输入框中的蓝色示例快速填入。")).toBeVisible();
  await expect(page.getByText(/请先填写客户原话/)).toHaveCount(0);
  await page.getByRole("button", { name: /一家三口十月去日本/ }).click();
  await expect(page.getByLabel("告诉我们需求")).toHaveValue(/一家三口，2 位成人和 1 名 5 岁儿童/);
  await expect(page).toHaveURL("/");
});

test("空需求卡：生成按钮禁用并说明缺失项", async ({ page }) => {
  await newConv(page);
  const btn = page.getByRole("button", { name: "确认需求卡并生成方案" });
  await expect(btn).toBeDisabled();
  await expect(page.getByText(/完整度不足|必问项未确认/)).toBeVisible();
  await expect(page.getByText("● 必须确认").first()).toBeVisible();
});

test("手动编辑槽位对话框可保存并显示顾问填写角标", async ({ page }) => {
  await newConv(page);
  await page.getByRole("button", { name: "修改成人" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("成人").fill("2");
  await dialog.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByText("✎ 顾问填写").first()).toBeVisible();
});

test("真实条件无候选：显示精确建议，一键修改后自动继续生成", async ({ page, request }) => {
  const convId = await newConv(page);
  const values = {
    ...FULL,
    destination_cities: ["东京"], date_start: "2030-02-15", duration_days: 3,
    children: 0, child_ages: [], hotel_tier: ["luxury"], dietary: ["none"],
  };
  for (const [slot, value] of Object.entries(values)) {
    const response = await request.patch(`http://localhost:8000/api/v1/conversations/${convId}/card`, { data: { slot, value } });
    expect(response.ok()).toBeTruthy();
  }
  const confirmation = await request.post(`http://localhost:8000/api/v1/conversations/${convId}/card/confirm`);
  expect(confirmation.ok()).toBeTruthy();
  const { card_id: cardId } = await confirmation.json() as { card_id: string };
  const creation = await request.post("http://localhost:8000/api/v1/plans", { data: { card_id: cardId } });
  const { plan_id: failedPlanId } = await creation.json() as { plan_id: string };
  await page.goto(`/c/${convId}?plan=${failedPlanId}&tab=plan`);

  const recovery = page.getByRole("button", { name: /改为 2026-10-15 出发/ });
  await expect(recovery).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("本次酒店候选：东京 0 家")).toBeVisible();
  await recovery.click();
  await expect(page).not.toHaveURL(new RegExp(`plan=${failedPlanId}`), { timeout: 30_000 });
  await expect(page.locator('[role="status"]').filter({ hasText: /硬约束 0 项违反/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "客户版预览与导出" })).toBeEnabled();
});

test("核心闭环：确认并生成 → 方案 → 刷新恢复 → 连点只创建一个任务", async ({ page, request }) => {
  test.setTimeout(300_000);
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
  // 连点两次：第二次在按钮进入提交态 / 改名前后都不该再创建任务
  await btn.click();
  await btn.click({ force: true, timeout: 1500 }).catch(() => undefined);
  await expect(page).toHaveURL(/plan=PLN-/, { timeout: 30_000 });
  // 真实模型模式下编排含回退重排可能超过 1 分钟
  // 只看方案面板的结果条（侧栏会话列表里也可能出现「生成失败」字样，须限定作用域）
  const outcome = page.locator('[role="status"], [role="alert"]').filter({ hasText: /硬约束 .* 项违反|生成失败|服务重启/ }).first();
  await expect(outcome).toBeVisible({ timeout: 240_000 });
  await expect(outcome).toHaveText(/硬约束 .* 项违反/);
  await expect(page.getByText("Day 7")).toBeVisible();
  expect(planPosts).toBe(1);
  // 刷新恢复：URL 里的 plan 是事实来源
  await page.reload();
  await expect(page.getByText("Day 1")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: /成本/ }).click();
  await expect(page.getByText("地面总计（JPY，含服务费）")).toBeVisible();
  await page.getByRole("tab", { name: /待核实清单/ }).click();
  await expect(page.locator("main").getByText(/以下 \d+ 项系统|没有待核实项/)).toBeVisible();   // 限定主区域，帮助弹窗里也有「待核实」字样

  // 客户版：预览内容不显示内部 ID，并能下载有效 PDF。
  await page.getByRole("tab", { name: "方案" }).click();
  await page.getByRole("button", { name: "客户版预览与导出" }).click();
  const proposal = page.getByRole("dialog", { name: "客户版方案预览" });
  await expect(proposal).toBeVisible();
  await expect(proposal.getByText(/定制旅行方案/).first()).toBeVisible();
  await expect(proposal).not.toContainText(/HTL-|POI-|RATE-/);
  const downloadPromise = page.waitForEvent("download");
  await proposal.getByRole("button", { name: "下载 PDF" }).click();
  const download = await downloadPromise;
  const pdfPath = test.info().outputPath("customer-proposal.pdf");
  await download.saveAs(pdfPath);
  expect((await stat(pdfPath)).size).toBeGreaterThan(50_000);
});

test("移动端 390px：底部切换可用，方案区域可达", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await newConv(page);
  await page.getByRole("tab", { name: "需求卡" }).click();
  await expect(page.getByRole("button", { name: "确认需求卡并生成方案" })).toBeVisible();
  await page.getByRole("tab", { name: "方案" }).click();
  await expect(page.getByText(/确认需求卡并生成后/)).toBeVisible();
});

import { test, expect, goTo, expectNoJSErrors, expectNoErrorBoundary, waitForCards } from "./fixtures";

test.describe("Finance", () => {
  test.beforeEach(async ({ page }) => {
    await goTo(page, "/finance");
  });

  test("page loads without error boundary", async ({ page }) => {
    await expectNoErrorBoundary(page);
  });

  test("summary cards visible (income, expense, balance)", async ({ page }) => {
    await waitForCards(page, 3);
    const body = await page.locator("body").textContent();
    // Demo account should show EUR amounts
    expect(body).toMatch(/€|EUR/);
  });

  test("account balances section visible", async ({ page }) => {
    // Account balances card with wallet icon
    const balanceCard = page.locator('[data-slot="card"]').filter({ hasText: /account|рахун|balance|баланс/i });
    await expect(balanceCard.first()).toBeVisible({ timeout: 15000 });
  });

  test("period selector switches without crash", async ({ page }) => {
    const yearBtn = page.locator("button").filter({ hasText: /Цей рік|This year/i });
    await expect(yearBtn).toBeVisible({ timeout: 10000 });
    await yearBtn.click();
    await expectNoErrorBoundary(page);
  });

  test("category breakdown renders", async ({ page }) => {
    // Category breakdown uses chart or progress elements — either may render depending on data
    const chart = page.locator('figure[role="img"]').first();
    const progress = page.locator('[class*="rounded-full"][class*="h-"]').first();
    const chartVisible = await chart.waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false);
    const progressVisible = await progress.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false);
    expect(chartVisible || progressVisible).toBeTruthy();
  });

  test("FAB opens add-transaction dialog on mobile", async ({ page }) => {
    // Set mobile viewport to see FAB
    await page.setViewportSize({ width: 390, height: 844 });
    await goTo(page, "/finance");
    const fab = page.locator('button[class*="fixed"][class*="rounded-full"]').last();
    await expect(fab).toBeVisible({ timeout: 10000 });
    await fab.click();
    await expect(page.locator("input").first()).toBeVisible({ timeout: 5000 });
  });

  test("no unexpected JS errors", async ({ page, jsErrors }) => {
    await page.locator('[data-slot="card"]').first().waitFor({ timeout: 15000 });
    expectNoJSErrors(jsErrors);
  });
});

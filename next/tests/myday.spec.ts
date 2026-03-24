import { test, expect, goTo, expectNoJSErrors, expectNoErrorBoundary } from "./fixtures";

test.describe("My Day", () => {
  test.beforeEach(async ({ page }) => {
    await goTo(page, "/my-day");
  });

  test("page loads without error boundary", async ({ page }) => {
    await expectNoErrorBoundary(page);
  });

  test("mood slider is visible and interactive", async ({ page }) => {
    const slider = page.locator('[data-slot="slider"]');
    await expect(slider.first()).toBeVisible({ timeout: 15000 });
  });

  test("health cards render (mood + optional garmin data)", async ({ page }) => {
    // At minimum, mood card should appear
    const cards = page.locator('[data-slot="card"]');
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
  });

  test("save button is present and clickable", async ({ page }) => {
    const saveBtn = page.locator("button").filter({ hasText: /save|зберегти/i });
    await expect(saveBtn.first()).toBeVisible({ timeout: 10000 });
    await saveBtn.first().click();
    // Should not crash after save
    await expectNoErrorBoundary(page);
  });

  test("recent logs section can be expanded", async ({ page }) => {
    const toggle = page.locator("text=Останні записи").or(page.locator("text=Recent")).first();
    await expect(toggle).toBeVisible({ timeout: 10000 });
    await toggle.click();
    // Should show table with at least a header row
    await expect(page.locator("table").first()).toBeVisible({ timeout: 5000 });
  });

  test("date navigation works", async ({ page }) => {
    // Left arrow button navigates to previous day
    const prevBtn = page.locator('button:has-text("←")').or(page.locator('button[aria-label*="prev"]')).first();
    await expect(prevBtn).toBeVisible({ timeout: 10000 });
    await prevBtn.click();
    await expectNoErrorBoundary(page);
  });

  test("no unexpected JS errors", async ({ page, jsErrors }) => {
    await page.locator('[data-slot="slider"]').first().waitFor({ timeout: 15000 });
    expectNoJSErrors(jsErrors);
  });
});

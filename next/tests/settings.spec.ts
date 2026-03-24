import { test, expect, goTo, expectNoJSErrors, expectNoErrorBoundary } from "./fixtures";

test.describe("Settings", () => {
  test("settings page redirects to accounts", async ({ page }) => {
    await goTo(page, "/settings");
    await expect(page).toHaveURL(/\/settings\/accounts/);
  });

  test("accounts page loads", async ({ page }) => {
    await goTo(page, "/settings/accounts");
    await expectNoErrorBoundary(page);
    // Should show account list or create form
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("budgets page loads with form", async ({ page }) => {
    await goTo(page, "/settings/budgets");
    await expectNoErrorBoundary(page);
    // Budget page should have a selector or form
    const selector = page.locator('[role="combobox"], select, button').first();
    await expect(selector).toBeVisible({ timeout: 10000 });
  });

  test("categories page shows list", async ({ page }) => {
    await goTo(page, "/settings/categories");
    await expectNoErrorBoundary(page);
    // Should show category items
    const items = page.locator('[class*="hover:bg-muted"], li, tr');
    await expect(items.first()).toBeVisible({ timeout: 10000 });
  });

  test("integrations page shows cards", async ({ page }) => {
    await goTo(page, "/settings/integrations");
    await expectNoErrorBoundary(page);
    const cards = page.locator('[data-slot="card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
  });

  test("garmin integration page has eye toggle", async ({ page }) => {
    await goTo(page, "/settings/integrations/garmin");
    await expectNoErrorBoundary(page);
    // Eye icon for password toggle
    const eyeIcon = page.locator('[class*="lucide-eye"]').first();
    await expect(eyeIcon).toBeVisible({ timeout: 10000 });
    await eyeIcon.click();
    // Should toggle without error
    await expectNoErrorBoundary(page);
  });

  test("no unexpected JS errors on settings", async ({ page, jsErrors }) => {
    await goTo(page, "/settings/accounts");
    await page.locator("h1, h2").first().waitFor({ timeout: 10000 });
    expectNoJSErrors(jsErrors);
  });
});

import { test, expect, goTo, expectNoJSErrors, expectNoErrorBoundary, waitForCards } from "./fixtures";

test.describe("Reporting", () => {
  test("page loads without error boundary", async ({ page }) => {
    await goTo(page, "/reporting");
    await expectNoErrorBoundary(page);
  });

  test("reporting shows KPI cards", async ({ page }) => {
    await goTo(page, "/reporting");
    await waitForCards(page, 1);
  });

  test("tax-ua settings page loads", async ({ page }) => {
    await goTo(page, "/reporting/settings/tax-ua");
    await expectNoErrorBoundary(page);
  });

  test("tax-es settings page loads", async ({ page }) => {
    await goTo(page, "/reporting/settings/tax-es");
    await expectNoErrorBoundary(page);
  });

  test("no unexpected JS errors", async ({ page, jsErrors }) => {
    await goTo(page, "/reporting");
    await page.locator('[data-slot="card"]').first().waitFor({ timeout: 15000 });
    expectNoJSErrors(jsErrors);
  });
});

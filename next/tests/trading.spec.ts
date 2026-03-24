import { test, expect, goTo, expectNoJSErrors, expectNoErrorBoundary } from "./fixtures";

test.describe("Trading", () => {
  test("page loads without error boundary", async ({ page }) => {
    await goTo(page, "/trading");
    await expectNoErrorBoundary(page);
  });

  test("trading page shows content", async ({ page }) => {
    await goTo(page, "/trading");
    // Should show connection info or trading dashboard
    const body = await page.locator("body").textContent();
    expect(body!.length).toBeGreaterThan(100);
  });

  test("no unexpected JS errors", async ({ page, jsErrors }) => {
    await goTo(page, "/trading");
    expectNoJSErrors(jsErrors);
  });
});

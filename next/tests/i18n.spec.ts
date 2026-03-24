import { test, expect } from "@playwright/test";


test.describe("i18n Language Switching", () => {

  test("dashboard shows Ukrainian text by default", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    // Ukrainian text should be present (from uk.json translations)
    const body = await page.locator("body").textContent();
    // Should contain at least some Ukrainian characters
    expect(body).toMatch(/[а-яіїєґ]/i);
  });
});

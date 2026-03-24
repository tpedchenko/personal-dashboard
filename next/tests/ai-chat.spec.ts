import { test, expect, goTo, expectNoJSErrors, expectNoErrorBoundary } from "./fixtures";

test.describe("AI Chat", () => {
  test("page loads without error boundary", async ({ page }) => {
    await goTo(page, "/ai-chat");
    await expectNoErrorBoundary(page);
  });

  test("chat input area is visible", async ({ page }) => {
    await goTo(page, "/ai-chat");
    // Textarea for chat input
    const input = page.locator("textarea").first();
    await expect(input).toBeVisible({ timeout: 10000 });
  });

  test("model selector is available", async ({ page }) => {
    await goTo(page, "/ai-chat");
    // Select element for model choice (gemini/groq)
    const selector = page.locator("select, [role='combobox']").first();
    await expect(selector).toBeVisible({ timeout: 10000 });
  });

  test("no unexpected JS errors", async ({ page, jsErrors }) => {
    await goTo(page, "/ai-chat");
    await page.locator("textarea").first().waitFor({ timeout: 10000 });
    expectNoJSErrors(jsErrors);
  });
});

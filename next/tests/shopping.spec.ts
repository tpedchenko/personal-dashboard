import { test, expect, goTo, expectNoJSErrors, expectNoErrorBoundary } from "./fixtures";

test.describe("Shopping List", () => {
  /** Track test item names created during each test for cleanup */
  const createdItems: string[] = [];

  test.beforeEach(async ({ page }) => {
    await goTo(page, "/list");
  });

  test.afterEach(async ({ page }) => {
    // Delete all test items created during this test
    for (const itemName of createdItems) {
      const itemRow = page.locator("li", { hasText: itemName });
      if (await itemRow.isVisible()) {
        const deleteBtn = itemRow.locator('button:has([class*="lucide-trash"])');
        if (await deleteBtn.isVisible()) {
          await deleteBtn.click();
          await itemRow.waitFor({ state: "detached", timeout: 5000 });
        }
      }
    }
    createdItems.length = 0;
  });

  test("page loads without error boundary", async ({ page }) => {
    await expectNoErrorBoundary(page);
  });

  test("shopping list loads with input field", async ({ page }) => {
    const input = page.locator("input").first();
    await expect(input).toBeVisible({ timeout: 10000 });
  });

  test("can add item to shopping list", async ({ page }) => {
    const input = page.locator("input").first();
    await expect(input).toBeVisible({ timeout: 10000 });
    const itemName = `Test item ${Date.now()}`;
    createdItems.push(itemName);
    await input.fill(itemName);
    await input.press("Enter");
    // Item should appear in the list
    await expect(page.locator(`text=${itemName}`)).toBeVisible({ timeout: 10000 });
  });

  test("no unexpected JS errors", async ({ page, jsErrors }) => {
    await page.locator("input").first().waitFor({ timeout: 10000 });
    expectNoJSErrors(jsErrors);
  });
});

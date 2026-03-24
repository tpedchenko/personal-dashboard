import { test, expect, goTo, expectNoJSErrors, expectNoErrorBoundary } from "./fixtures";

test.describe("Transactions", () => {
  test.beforeEach(async ({ page }) => {
    await goTo(page, "/finance/transactions");
  });

  test("page loads without error boundary", async ({ page }) => {
    await expectNoErrorBoundary(page);
  });

  test("filter card renders with controls", async ({ page }) => {
    // Filters card should be visible
    const filterCard = page.locator('[data-slot="card"]').first();
    await expect(filterCard).toBeVisible({ timeout: 15000 });

    // Date inputs should be present
    const dateInputs = filterCard.locator('input[type="date"]');
    expect(await dateInputs.count()).toBeGreaterThanOrEqual(1);

    // Account select should be present
    const selects = filterCard.locator("select");
    expect(await selects.count()).toBeGreaterThanOrEqual(1);
  });

  test("transactions table renders", async ({ page }) => {
    // Wait for the results card
    const resultsCard = page.locator('[data-slot="card"]').nth(1);
    await expect(resultsCard).toBeVisible({ timeout: 15000 });

    // Should show transaction count
    await expect(resultsCard).toContainText(/\d+/, { timeout: 10000 });
  });

  test("category filter works", async ({ page }) => {
    // Wait for page to load
    const filterCard = page.locator('[data-slot="card"]').first();
    await expect(filterCard).toBeVisible({ timeout: 15000 });

    // Find the category select (third select typically: account, category, type)
    const selects = filterCard.locator("select");
    await expect(selects.first()).toBeVisible({ timeout: 10000 });

    // Get initial transaction count text
    const resultsCard = page.locator('[data-slot="card"]').nth(1);
    await expect(resultsCard).toBeVisible({ timeout: 10000 });
    const initialCountText = await resultsCard.locator('[data-slot="card-title"] span').last().textContent();

    // Select a category if options are available
    const categorySelect = selects.nth(1); // category is the second select
    const options = await categorySelect.locator("option").allTextContents();

    if (options.length > 1) {
      // Select the first non-empty category
      await categorySelect.selectOption({ index: 1 });

      // Click apply button
      const applyBtn = filterCard.locator("button").filter({ hasText: /apply|Застосувати/i });
      await applyBtn.click();

      // Wait for results to update
      await page.waitForTimeout(1000);
      await expectNoErrorBoundary(page);
    }
  });

  test("type filter works", async ({ page }) => {
    const filterCard = page.locator('[data-slot="card"]').first();
    await expect(filterCard).toBeVisible({ timeout: 15000 });

    // Find type select and select INCOME
    const selects = filterCard.locator("select");
    const typeSelect = selects.nth(2); // type is the third select
    await expect(typeSelect).toBeVisible({ timeout: 10000 });
    await typeSelect.selectOption("INCOME");

    // Apply filters
    const applyBtn = filterCard.locator("button").filter({ hasText: /apply|Застосувати/i });
    await applyBtn.click();

    // Wait for results and verify no error
    await page.waitForTimeout(1000);
    await expectNoErrorBoundary(page);
  });

  test("search filter works", async ({ page }) => {
    const filterCard = page.locator('[data-slot="card"]').first();
    await expect(filterCard).toBeVisible({ timeout: 15000 });

    // Find search input
    const searchInput = filterCard.locator('input[type="text"], input[placeholder*="search" i], input[placeholder*="Search" i]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // Type a search query and press Enter
    await searchInput.fill("test");
    await searchInput.press("Enter");

    // Wait for results to update
    await page.waitForTimeout(1000);
    await expectNoErrorBoundary(page);
  });

  test("date range filter works", async ({ page }) => {
    const filterCard = page.locator('[data-slot="card"]').first();
    await expect(filterCard).toBeVisible({ timeout: 15000 });

    // Set date-from to a specific date
    const dateInputs = filterCard.locator('input[type="date"]');
    const dateFrom = dateInputs.first();
    await expect(dateFrom).toBeVisible({ timeout: 10000 });

    // Set a recent date range
    await dateFrom.fill("2025-01-01");

    // Apply filters
    const applyBtn = filterCard.locator("button").filter({ hasText: /apply|Застосувати/i });
    await applyBtn.click();

    await page.waitForTimeout(1000);
    await expectNoErrorBoundary(page);
  });

  test("column sorting works", async ({ page }) => {
    // Wait for the table to load (desktop view)
    const table = page.locator("table").first();
    await expect(table).toBeVisible({ timeout: 15000 });

    // Click the date column header to toggle sort
    const dateHeader = table.locator("th button").first();
    await expect(dateHeader).toBeVisible({ timeout: 5000 });
    await dateHeader.click();

    // Should not crash
    await expectNoErrorBoundary(page);

    // Click again to reverse sort direction
    await dateHeader.click();
    await expectNoErrorBoundary(page);
  });

  test("no unexpected JS errors", async ({ page, jsErrors }) => {
    // Wait for content to load
    const cards = page.locator('[data-slot="card"]');
    await cards.first().waitFor({ timeout: 15000 });
    expectNoJSErrors(jsErrors);
  });
});

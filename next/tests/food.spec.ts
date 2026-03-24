import { test, expect, goTo, expectNoJSErrors, expectNoErrorBoundary } from "./fixtures";

test.describe("Food", () => {
  test.beforeEach(async ({ page }) => {
    await goTo(page, "/food");
  });

  test("page loads without error boundary", async ({ page }) => {
    await expectNoErrorBoundary(page);
  });

  test("daily summary cards render", async ({ page }) => {
    // Summary cards: calories, protein, fat, carbs
    const cards = page.locator('[data-slot="card"]');
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
    // At least 4 summary cards + calorie trend + meals table
    expect(await cards.count()).toBeGreaterThanOrEqual(4);
  });

  test("calorie trend chart displays", async ({ page }) => {
    const chart = page.locator('figure[role="img"]');
    await expect(chart).toBeVisible({ timeout: 15000 });
  });

  test("meals table card renders", async ({ page }) => {
    // The meals card has a table or a "no food" message
    const mealsCard = page.locator('[data-slot="card"]').last();
    await expect(mealsCard).toBeVisible({ timeout: 15000 });
  });

  test("date navigation works - previous day", async ({ page }) => {
    // Get current date displayed
    const dateButton = page.locator("button").filter({ hasText: /\d{4}-\d{2}-\d{2}/ });
    await expect(dateButton).toBeVisible({ timeout: 15000 });
    const initialDate = await dateButton.textContent();

    // Click previous day button (←)
    const prevBtn = page.locator("button").filter({ hasText: "←" });
    await prevBtn.click();

    // Date should change
    await expect(dateButton).not.toHaveText(initialDate!);
    await expectNoErrorBoundary(page);
  });

  test("date navigation works - next day", async ({ page }) => {
    // Click previous first to go back, then next to come back
    const prevBtn = page.locator("button").filter({ hasText: "←" });
    await expect(prevBtn).toBeVisible({ timeout: 15000 });
    await prevBtn.click();

    const dateButton = page.locator("button").filter({ hasText: /\d{4}-\d{2}-\d{2}/ });
    const dateAfterPrev = await dateButton.textContent();

    const nextBtn = page.locator("button").filter({ hasText: "→" });
    await nextBtn.click();

    await expect(dateButton).not.toHaveText(dateAfterPrev!);
    await expectNoErrorBoundary(page);
  });

  test("can add and delete a food entry", async ({ page }) => {
    const testDesc = `E2E Test Meal ${Date.now()}`;
    let entryCreated = false;

    try {
      // Open add dialog via the "Add" button in the card header
      const addButton = page.locator("button").filter({ hasText: /add_meal|Add|Додати/ }).first();
      await expect(addButton).toBeVisible({ timeout: 15000 });
      await addButton.click();

      // Fill in the form
      const descInput = page.locator('input[placeholder*="Chicken"], input[placeholder*="chicken"], input[placeholder*="e.g."]');
      await expect(descInput).toBeVisible({ timeout: 5000 });
      await descInput.fill(testDesc);

      // Fill calories
      const calInput = page.locator('input[placeholder="kcal"]');
      await calInput.fill("350");

      // Fill protein
      const proteinInput = page.locator('input[placeholder="g"]').first();
      await proteinInput.fill("30");

      // Submit
      const submitBtn = page.locator('[role="dialog"] button').filter({ hasText: /^(Add|Додати)$/ });
      await submitBtn.click();
      entryCreated = true;

      // Wait for dialog to close and entry to appear
      await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 10000 });
      await expect(page.locator("table")).toContainText(testDesc, { timeout: 10000 });

      // Delete the entry - find the row with our test description and click delete
      const row = page.locator("tr").filter({ hasText: testDesc });
      const deleteBtn = row.locator("button").first();
      await deleteBtn.click();

      // Confirm deletion
      const confirmBtn = page.locator('[role="dialog"] button').filter({ hasText: /delete|Видалити/i });
      await expect(confirmBtn).toBeVisible({ timeout: 5000 });
      await confirmBtn.click();

      // Entry should be gone
      await expect(page.locator("tr").filter({ hasText: testDesc })).toBeHidden({ timeout: 10000 });
      entryCreated = false;
    } catch (e) {
      // Cleanup: if entry was created but delete failed, try to delete it
      if (entryCreated) {
        try {
          const row = page.locator("tr").filter({ hasText: testDesc });
          if (await row.isVisible()) {
            await row.locator("button").first().click();
            const confirmBtn = page.locator('[role="dialog"] button').filter({ hasText: /delete|Видалити/i });
            await confirmBtn.click({ timeout: 5000 });
          }
        } catch {
          // Best effort cleanup
        }
      }
      throw e;
    }
  });

  test("no unexpected JS errors", async ({ page, jsErrors }) => {
    // Wait for page content to load
    const cards = page.locator('[data-slot="card"]');
    await cards.first().waitFor({ timeout: 15000 });
    expectNoJSErrors(jsErrors);
  });
});

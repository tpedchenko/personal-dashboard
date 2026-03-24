import { test, expect, goTo, expectNoJSErrors, expectNoErrorBoundary } from "./fixtures";

test.describe("Gym", () => {
  test.beforeEach(async ({ page }) => {
    await goTo(page, "/gym");
  });

  test("page loads without error boundary", async ({ page }) => {
    await expectNoErrorBoundary(page);
  });

  test("recovery chips show muscle groups", async ({ page }) => {
    const chips = page.locator('[data-testid="recovery-chip"]');
    await expect(chips.first()).toBeVisible({ timeout: 15000 });
    expect(await chips.count()).toBeGreaterThan(0);
  });

  test("workout calendar displays day names", async ({ page }) => {
    // Day names: Пн/Mon, Вт/Tue, etc.
    const dayNames = page.locator("text=Пн").or(page.locator("text=Mon"));
    await expect(dayNames.first()).toBeVisible({ timeout: 15000 });
  });

  test("calendar month navigation works", async ({ page }) => {
    const nextBtn = page.locator('button:has-text("›")').or(page.locator('button[aria-label*="next"]')).first();
    await expect(nextBtn).toBeVisible({ timeout: 10000 });
    await nextBtn.click();
    await expectNoErrorBoundary(page);
  });

  test("exercises page loads with sections", async ({ page }) => {
    await goTo(page, "/settings/gym/exercises");
    await expectNoErrorBoundary(page);
    const headings = page.locator("h2");
    await expect(headings.first()).toBeVisible({ timeout: 10000 });
    expect(await headings.count()).toBeGreaterThan(0);
  });

  test("no unexpected JS errors", async ({ page, jsErrors }) => {
    await page.locator('[data-testid="recovery-chip"]').first().waitFor({ timeout: 15000 });
    expectNoJSErrors(jsErrors);
  });
});

test.describe("Workout flow", () => {
  test("start free workout → add exercise → complete", async ({ page, jsErrors }) => {
    // 1. Navigate to /gym and wait for page to load
    await goTo(page, "/gym");
    await page.locator('[data-testid="recovery-chip"]').first().waitFor({ timeout: 15000 });

    // 2. Click FAB to open Start Workout dialog
    const fab = page.locator('[data-testid="fab"]');
    await expect(fab).toBeVisible({ timeout: 10000 });
    await fab.click();

    // 3. Click "Free workout" button in the dialog
    const freeWorkoutBtn = page.locator('[data-testid="free-workout-btn"]');
    await expect(freeWorkoutBtn).toBeVisible({ timeout: 5000 });
    await freeWorkoutBtn.click();

    // 4. Verify ActiveWorkoutPanel appears (has finish button and exercise list)
    const finishBtn = page.locator('[data-testid="finish-workout-btn"]');
    await expect(finishBtn).toBeVisible({ timeout: 15000 });

    const exerciseList = page.locator('[data-testid="exercise-list"]');
    await expect(exerciseList).toBeVisible({ timeout: 5000 });

    // 5. Click "Add Exercise" to open the exercise picker dialog
    const addExerciseBtn = page.locator('[data-testid="add-exercise-btn"]');
    await expect(addExerciseBtn).toBeVisible({ timeout: 5000 });
    await addExerciseBtn.click();

    // 6. Wait for exercise picker dialog to appear
    const exerciseDialog = page.locator('[role="dialog"]').filter({
      has: page.locator('input[placeholder]'),
    });
    await expect(exerciseDialog).toBeVisible({ timeout: 5000 });

    // 7. Select the first available exercise from the list
    const exerciseOption = exerciseDialog.locator("button.flex-1").first();
    await expect(exerciseOption).toBeVisible({ timeout: 5000 });
    const exerciseName = await exerciseOption.locator(".font-medium").first().textContent();
    await exerciseOption.click();

    // 8. Verify exercise appears in the active workout panel
    await expect(exerciseList.locator("text=" + exerciseName!.trim())).toBeVisible({ timeout: 10000 });

    // 9. Click "Finish Workout" button
    await finishBtn.click();

    // 10. Verify workout completed: finish button disappears, FAB returns
    await expect(finishBtn).not.toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="fab"]')).toBeVisible({ timeout: 10000 });

    // 11. No unexpected JS errors
    await expectNoErrorBoundary(page);
    expectNoJSErrors(jsErrors);

    // Note: completed workout remains in history (no cleanup needed per design)
  });
});

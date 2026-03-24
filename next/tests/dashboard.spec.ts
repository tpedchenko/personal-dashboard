import { test, expect, goTo, expectNoJSErrors, expectNoErrorBoundary, waitForCards } from "./fixtures";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await goTo(page, "/dashboard");
  });

  test("page loads without error boundary", async ({ page }) => {
    await expectNoErrorBoundary(page);
  });

  test("KPI cards display with values", async ({ page }) => {
    const cards = await waitForCards(page, 3);
    expect(await cards.count()).toBeGreaterThan(3);
  });

  test("period selector has preset buttons", async ({ page }) => {
    const periodBtn = page.locator("button").filter({ hasText: /місяць|month/i });
    await expect(periodBtn.first()).toBeVisible({ timeout: 10000 });
  });

  test("period selector changes data without crash", async ({ page }) => {
    const prevMonth = page.locator("button").filter({ hasText: /Мин\. місяць|Prev month/i });
    await expect(prevMonth).toBeVisible({ timeout: 10000 });
    await prevMonth.click();
    await expectNoErrorBoundary(page);
  });

  test("daily records table can be expanded", async ({ page }) => {
    const toggle = page.locator("text=Записи якості життя").or(page.locator("text=Daily records")).first();
    await expect(toggle).toBeVisible({ timeout: 10000 });
    await toggle.click();
    await expect(page.locator("table").first()).toBeVisible({ timeout: 5000 });
  });

  test("no unexpected JS errors", async ({ page, jsErrors }) => {
    await page.locator('[data-slot="card"]').first().waitFor({ timeout: 15000 });
    expectNoJSErrors(jsErrors);
  });
});

// ─── Chart rendering tests ───────────────────────────────────────────────────

test.describe("Dashboard — Life tab charts", () => {
  test.beforeEach(async ({ page }) => {
    await goTo(page, "/dashboard");
    // Wait for charts to mount (client-side rendering)
    await page.locator('figure[role="img"]').first().waitFor({ timeout: 15000 });
  });

  test("Life tab has chart figures with SVG content", async ({ page }) => {
    const figures = page.locator('figure[role="img"]');
    const count = await figures.count();
    expect(count).toBeGreaterThan(0);
  });

  test("Mood timeline chart renders SVG paths", async ({ page }) => {
    // Mood chart is the first figure on Life tab
    const moodFigure = page.locator('figure[role="img"]').first();
    await expect(moodFigure).toBeVisible({ timeout: 10000 });
    // Figure must have non-zero height (the bug we fixed)
    const box = await moodFigure.boundingBox();
    expect(box?.height).toBeGreaterThan(50);
    // SVG inside must have rendered paths
    const svgPaths = moodFigure.locator("svg path");
    expect(await svgPaths.count()).toBeGreaterThan(0);
  });

  test("ResponsiveContainer has correct dimensions", async ({ page }) => {
    const containerSizes = await page.evaluate(() => {
      const containers = document.querySelectorAll(".recharts-responsive-container");
      return Array.from(containers).map((el) => {
        const rect = el.getBoundingClientRect();
        return { w: rect.width, h: rect.height };
      });
    });
    expect(containerSizes.length).toBeGreaterThan(0);
    // Every container must have width > 0 and height > 0
    for (const size of containerSizes) {
      expect(size.w).toBeGreaterThan(0);
      expect(size.h).toBeGreaterThan(0);
    }
  });

  test("Body Battery and Sleep Quality charts render", async ({ page }) => {
    // Scroll down to garmin charts section
    await page.evaluate(() => window.scrollBy(0, 800));
    const bodyBattery = page.locator("text=Body Battery").first();
    const sleepQuality = page.locator("text=Якість сну").or(page.locator("text=Sleep Quality")).first();
    // At least one Garmin chart should be visible (wait for either to appear)
    const bbVisible = await bodyBattery.waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false);
    const sqVisible = await sleepQuality.waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false);
    expect(bbVisible || sqVisible).toBeTruthy();
  });
});

test.describe("Dashboard — Finance tab charts", () => {
  test.beforeEach(async ({ page }) => {
    await goTo(page, "/dashboard");
    // Click Finance tab
    const finTab = page.locator("button, a, [role=tab]").filter({ hasText: /Фінанси|Finance/i }).first();
    await expect(finTab).toBeVisible({ timeout: 10000 });
    await finTab.click();
    await page.locator('[data-slot="card"]').first().waitFor({ timeout: 15000 });
  });

  test("Income vs Expenses chart renders with bars", async ({ page }) => {
    const figure = page.locator('figure[role="img"]').first();
    await expect(figure).toBeVisible({ timeout: 10000 });
    const box = await figure.boundingBox();
    expect(box?.height).toBeGreaterThan(50);
    // SVG must have rendered rectangles (bars) or paths
    const svgElements = figure.locator("svg path, svg rect");
    expect(await svgElements.count()).toBeGreaterThan(0);
  });
});

test.describe("Dashboard — Training tab charts", () => {
  test.beforeEach(async ({ page }) => {
    await goTo(page, "/dashboard");
    // Click Training tab
    const trainTab = page.locator("button, a, [role=tab]").filter({ hasText: /Тренування|Training/i }).first();
    await expect(trainTab).toBeVisible({ timeout: 10000 });
    await trainTab.click();
    await page.locator('[data-slot="card"]').first().waitFor({ timeout: 15000 });
  });

  test("Exercise progress section renders", async ({ page }) => {
    const chartTitle = page.locator("text=Прогрес вправ").or(page.locator("text=Exercise progress")).first();
    await expect(chartTitle).toBeVisible({ timeout: 10000 });
    // Exercise selector should show exercise name, not just ID
    const selector = page.locator('[data-slot="select-trigger"]').first();
    await expect(selector).toBeVisible({ timeout: 10000 });
    const text = await selector.textContent();
    expect(text?.length).toBeGreaterThan(3);
  });

  test("Weekly muscle volume section renders", async ({ page }) => {
    const chartTitle = page.locator("text=Тижневий об'єм м'язів").or(page.locator("text=Weekly muscle volume")).first();
    await expect(chartTitle).toBeVisible({ timeout: 10000 });
    await chartTitle.scrollIntoViewIfNeeded();
    const figure = page.locator('figure[role="img"]').first();
    await expect(figure).toBeVisible({ timeout: 10000 });
    const box = await figure.boundingBox();
    expect(box?.height).toBeGreaterThan(50);
  });
});

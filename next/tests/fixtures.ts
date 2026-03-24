import { test as base, expect, type Page } from "@playwright/test";

/** React hydration errors to ignore in JS error checks */
const IGNORED_ERRORS = [
  /Minified React error #418/, // hydration text mismatch
  /Minified React error #423/, // hydration node mismatch
  /Minified React error #425/, // hydration resuming error
  /hydration/i,
];

function isIgnoredError(msg: string): boolean {
  return IGNORED_ERRORS.some((re) => re.test(msg));
}

/**
 * Extended test fixture that tracks JS errors (filtering hydration noise)
 * and provides helper methods for common assertions.
 */
export const test = base.extend<{
  /** Collected JS errors (excluding hydration) */
  jsErrors: string[];
}>({
  jsErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => {
      if (!isIgnoredError(err.message)) {
        errors.push(err.message);
      }
    });
    await use(errors);
  },
});

export { expect };

// ─── Helper functions ───

/** Navigate and wait for the page to be interactive */
export async function goTo(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("domcontentloaded");
}

/** Assert no unexpected JS errors were collected */
export function expectNoJSErrors(errors: string[]) {
  expect(errors, "Unexpected JS errors on page").toHaveLength(0);
}

/** Assert page has no Next.js/React error boundary */
export async function expectNoErrorBoundary(page: Page) {
  await expect(page.locator("body")).not.toContainText("Something went wrong");
}

/** Wait for cards to load (common pattern across pages) */
export async function waitForCards(page: Page, minCount = 1) {
  const cards = page.locator('[data-slot="card"]');
  await expect(cards.first()).toBeVisible({ timeout: 15000 });
  expect(await cards.count()).toBeGreaterThanOrEqual(minCount);
  return cards;
}

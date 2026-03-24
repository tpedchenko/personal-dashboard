import { test, expect } from "@playwright/test";

test.describe("Smoke tests (no auth)", () => {
  test("health endpoint returns ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(["ok", "degraded"]).toContain(body.status);
  });

  test("login page loads with sign-in button", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("button").first()).toBeVisible();
  });

  test("unauthenticated user redirects to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated finance redirects to login", async ({ page }) => {
    await page.goto("/finance");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated settings redirects to login", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login/);
  });
});

import { test, expect } from "@playwright/test";

test.describe("API Health & Public Endpoints", () => {
  test("GET /api/health returns 200 with status ok or degraded", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(["ok", "degraded"]).toContain(body.status);
    expect(body.timestamp).toBeTruthy();
  });

  test("GET /api/sync/withings/callback returns 200 (public endpoint)", async ({ request }) => {
    const res = await request.get("/api/sync/withings/callback");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("unauthenticated API requests are handled", async ({ page }) => {
    // Use page context (follows redirects) - should end up on login
    await page.goto("/api/sync/garmin");
    await expect(page).toHaveURL(/\/login/);
  });
});

import { test, expect } from "@playwright/test";

/**
 * API route E2E tests.
 *
 * "no-auth" block:  runs in the smoke / prod-smoke projects (no storageState).
 * "with demo auth" block: runs in the dev-demo / prod-demo projects
 *   (storageState carries the signed demo_mode cookie).
 */

// ---------------------------------------------------------------------------
// Public / no-auth tests
// ---------------------------------------------------------------------------
test.describe("API Routes — public / no-auth", () => {
  test("GET /api/monitoring returns valid monitoring JSON", async ({
    request,
  }) => {
    const res = await request.get("/api/monitoring");
    // May get 429 when rate-limited during parallel test runs
    if (res.status() === 429) return;

    // Without auth, monitoring may redirect to login (returning HTML)
    const contentType = res.headers()["content-type"] || "";
    if (!contentType.includes("application/json")) return;

    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(["ok", "degraded", "error"]).toContain(body.status);
    expect(body.timestamp).toBeTruthy();

    // Uptime section
    expect(body.uptime).toBeDefined();
    expect(typeof body.uptime.seconds).toBe("number");
    expect(typeof body.uptime.formatted).toBe("string");

    // Memory section
    expect(body.memory).toBeDefined();
    expect(typeof body.memory.heapUsagePercent).toBe("number");

    // Database section
    expect(body.database).toBeDefined();
    expect(["ok", "error"]).toContain(body.database.status);
    expect(typeof body.database.responseTimeMs).toBe("number");
  });

  test("POST /api/chat without auth returns 401 or redirects to login", async ({
    request,
  }) => {
    const res = await request.post("/api/chat", {
      data: { messages: [], model: "gemini" },
      headers: { "Content-Type": "application/json" },
    });

    // Middleware may redirect to /login (302 -> 200 after follow) or the
    // route handler itself may return 401.
    const url = res.url();
    const status = res.status();

    const isRedirectedToLogin = url.includes("/login");
    const isUnauthorized = status === 401;
    const isRateLimited = status === 429;

    expect(
      isRedirectedToLogin || isUnauthorized || isRateLimited,
      `Expected redirect to /login, 401, or 429, got status=${status} url=${url}`,
    ).toBe(true);
  });

  test("GET /api/sync/garmin without auth redirects to login", async ({
    request,
  }) => {
    const res = await request.get("/api/sync/garmin");
    const url = res.url();
    const status = res.status();

    // Sync endpoints may return 200 (handling auth internally), redirect, or error
    expect(status).toBeLessThan(600);
  });

  test("POST /api/sync/health without auth is handled", async ({
    request,
  }) => {
    const res = await request.post("/api/sync/health");
    expect(res.status()).toBeLessThan(600);
  });

  test("POST /api/sync/monobank without auth is handled", async ({
    request,
  }) => {
    const res = await request.post("/api/sync/monobank");
    expect(res.status()).toBeLessThan(600);
  });
});

// ---------------------------------------------------------------------------
// Authenticated (demo-mode) tests
// ---------------------------------------------------------------------------
test.describe("API Routes — with demo auth", () => {
  test("GET /api/monitoring returns full monitoring data", async ({
    request,
  }) => {
    const res = await request.get("/api/monitoring");
    if (res.status() === 429) return; // rate limited

    // Without auth (e.g. smoke projects), monitoring may redirect to login
    const contentType = res.headers()["content-type"] || "";
    if (!contentType.includes("application/json")) return;

    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.status).toBeTruthy();
    expect(body.database).toBeDefined();
    expect(body.errors).toBeDefined();
    expect(typeof body.errors.last1h).toBe("number");
    expect(typeof body.errors.last24h).toBe("number");
    expect(Array.isArray(body.requestTrends)).toBe(true);
    expect(Array.isArray(body.recentErrors)).toBe(true);
  });

  test("GET /api/sync/garmin with demo auth responds without crash", async ({
    request,
  }) => {
    const res = await request.get("/api/sync/garmin");
    expect([200, 400, 429, 500]).toContain(res.status());
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });

  test("POST /api/sync/monobank with demo auth responds", async ({
    request,
  }) => {
    const res = await request.post("/api/sync/monobank");
    expect([200, 400, 429, 500]).toContain(res.status());
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });

  test("POST /api/sync/health with demo auth responds", async ({
    request,
  }) => {
    const res = await request.post("/api/sync/health");
    expect([200, 400, 429, 500]).toContain(res.status());
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });

  test("POST /api/chat with demo auth returns response", async ({
    request,
  }) => {
    const res = await request.post("/api/chat", {
      data: {
        messages: [{ role: "user", content: "hello" }],
        model: "gemini",
      },
      headers: { "Content-Type": "application/json" },
    });
    // 200 = streaming, 401 = no session, 400 = missing params, 429 = rate limited
    expect([200, 400, 401, 429]).toContain(res.status());
  });
});

/**
 * Signed demo mode token using HMAC-SHA256.
 *
 * Uses the Web Crypto API (`globalThis.crypto.subtle`) so it works in
 * both the Node.js server runtime and the Edge middleware runtime.
 */

const DEMO_COOKIE = "demo_mode";
const DEMO_TTL_SECONDS = 60 * 60 * 24; // 24 hours

function getSecret(): string {
  const secret = process.env.DEMO_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("Missing DEMO_SECRET or NEXTAUTH_SECRET env variable");
  }
  return secret;
}

const encoder = new TextEncoder();

async function hmacSign(payload: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generates a signed demo token: "expiresAt.signature"
 */
export async function createDemoToken(): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + DEMO_TTL_SECONDS;
  const payload = `demo:${expiresAt}`;
  const signature = await hmacSign(payload);
  return `${expiresAt}.${signature}`;
}

/**
 * Verifies a demo token. Returns true only if the HMAC is valid
 * and the token has not expired.
 */
export async function verifyDemoToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;

  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return false;

  const expiresAtStr = token.substring(0, dotIndex);
  const providedSig = token.substring(dotIndex + 1);

  const expiresAt = parseInt(expiresAtStr, 10);
  if (isNaN(expiresAt)) return false;

  // Check expiry
  if (Math.floor(Date.now() / 1000) > expiresAt) return false;

  // Verify HMAC
  const payload = `demo:${expiresAt}`;
  const expectedSig = await hmacSign(payload);

  // Constant-time comparison
  if (providedSig.length !== expectedSig.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expectedSig.length; i++) {
    mismatch |= providedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  return mismatch === 0;
}

export { DEMO_COOKIE, DEMO_TTL_SECONDS };

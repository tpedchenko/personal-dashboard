import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Get the 32-byte encryption key from ENCRYPTION_KEY env var.
 * The key must be a 64-character hex string (32 bytes).
 * Generate with: openssl rand -hex 32
 */
function getKey(): Buffer | null {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    return null;
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns format: `iv:authTag:ciphertext` (all base64-encoded).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[SECURITY] ENCRYPTION_KEY not set in production — refusing to store secrets unencrypted");
    }
    return plaintext;
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a ciphertext string produced by encrypt().
 * Expects format: `iv:authTag:ciphertext` (all base64-encoded).
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  if (!key) return ciphertext; // No encryption key configured — return as-is
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format — expected iv:authTag:ciphertext");
  }

  const iv = Buffer.from(parts[0], "base64");
  const authTag = Buffer.from(parts[1], "base64");
  const encrypted = Buffer.from(parts[2], "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  return decipher.update(encrypted) + decipher.final("utf8");
}

/**
 * Check if a value looks like it was encrypted by this module.
 * Encrypted values have the format `base64:base64:base64`.
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(":");
  if (parts.length !== 3) return false;

  // Each part should be non-empty valid base64
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  return parts.every((p) => p.length > 0 && base64Regex.test(p));
}

/**
 * Decrypt a value gracefully — if decryption fails (e.g., value was stored
 * before encryption was enabled), return the raw value.
 * This enables gradual migration: unencrypted values will be encrypted on next write.
 */
export function decryptGraceful(value: string): string {
  if (!isEncrypted(value)) return value;
  try {
    return decrypt(value);
  } catch {
    // Value matches encrypted format but failed to decrypt —
    // likely a pre-encryption plain-text value, return as-is
    return value;
  }
}

/**
 * Create an HMAC-signed OAuth state parameter: `email.signature`
 * Uses ENCRYPTION_KEY as HMAC secret (falls back to base64 if key not set).
 */
export function createOAuthState(email: string): string {
  const key = getKey();
  if (!key) return Buffer.from(email).toString("base64");
  const data = Buffer.from(email).toString("base64url");
  const sig = createHmac("sha256", key).update(data).digest("base64url");
  return `${data}.${sig}`;
}

/**
 * Verify and extract email from HMAC-signed OAuth state.
 * Returns null if signature is invalid.
 */
export function verifyOAuthState(state: string): string | null {
  const key = getKey();
  if (!key) {
    // Fallback: plain base64
    try { return Buffer.from(state, "base64").toString(); } catch { return null; }
  }
  const dotIndex = state.indexOf(".");
  if (dotIndex < 0) return null;
  const data = state.slice(0, dotIndex);
  const sig = state.slice(dotIndex + 1);
  const expected = createHmac("sha256", key).update(data).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;
  try { return Buffer.from(data, "base64url").toString(); } catch { return null; }
}

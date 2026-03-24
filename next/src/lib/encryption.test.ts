import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt, isEncrypted, decryptGraceful, createOAuthState, verifyOAuthState } from "./encryption";
import { randomBytes } from "crypto";

// A valid 64-char hex string (32 bytes) for AES-256
const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("encryption", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
    vi.unstubAllEnvs();
  });

  describe("encrypt / decrypt round-trip", () => {
    it("returns original plaintext after encrypt then decrypt", () => {
      const plaintext = "hello world";
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it("handles empty string", () => {
      const encrypted = encrypt("");
      expect(decrypt(encrypted)).toBe("");
    });

    it("handles Ukrainian characters", () => {
      const plaintext = "Привіт, світе! Тарас — це я. Їжак у лісі.";
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it("handles long strings", () => {
      const plaintext = "a".repeat(100_000);
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it("handles special characters and JSON", () => {
      const plaintext = '{"token":"abc-123","refresh":"xyz!@#$%^&*()"}';
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });
  });

  describe("random IV — different ciphertexts", () => {
    it("produces different ciphertexts for the same plaintext", () => {
      const plaintext = "same input twice";
      const a = encrypt(plaintext);
      const b = encrypt(plaintext);
      expect(a).not.toBe(b);
      // Both should decrypt to the same value
      expect(decrypt(a)).toBe(plaintext);
      expect(decrypt(b)).toBe(plaintext);
    });
  });

  describe("tampering detection", () => {
    it("throws when ciphertext is modified", () => {
      const encrypted = encrypt("secret data");
      const parts = encrypted.split(":");
      // Flip a character in the ciphertext part
      const tampered = parts[2].replace(/[A-Za-z]/, (c) =>
        c === "a" ? "b" : "a",
      );
      const modified = `${parts[0]}:${parts[1]}:${tampered}`;
      expect(() => decrypt(modified)).toThrow();
    });

    it("throws when auth tag is modified", () => {
      const encrypted = encrypt("secret data");
      const parts = encrypted.split(":");
      const tampered = parts[1].replace(/[A-Za-z]/, (c) =>
        c === "a" ? "b" : "a",
      );
      const modified = `${parts[0]}:${tampered}:${parts[2]}`;
      expect(() => decrypt(modified)).toThrow();
    });

    it("throws when IV is modified", () => {
      const encrypted = encrypt("secret data");
      const parts = encrypted.split(":");
      const tampered = parts[0].replace(/[A-Za-z]/, (c) =>
        c === "a" ? "b" : "a",
      );
      const modified = `${tampered}:${parts[1]}:${parts[2]}`;
      expect(() => decrypt(modified)).toThrow();
    });

    it("throws on invalid format (not 3 parts)", () => {
      expect(() => decrypt("onlyonepart")).toThrow("Invalid encrypted format");
      expect(() => decrypt("two:parts")).toThrow("Invalid encrypted format");
    });
  });

  describe("without ENCRYPTION_KEY", () => {
    beforeEach(() => {
      delete process.env.ENCRYPTION_KEY;
    });

    it("encrypt returns plaintext as-is in non-production", () => {
      const plaintext = "not encrypted";
      expect(encrypt(plaintext)).toBe(plaintext);
    });

    it("decrypt returns ciphertext as-is", () => {
      const raw = "some:thing:here";
      expect(decrypt(raw)).toBe(raw);
    });

    it("encrypt throws in production without key", () => {
      process.env.NODE_ENV = "production";
      expect(() => encrypt("secret")).toThrow("ENCRYPTION_KEY not set");
      process.env.NODE_ENV = "test";
    });

    it("encrypt returns plaintext with invalid key length", () => {
      process.env.ENCRYPTION_KEY = "too-short";
      expect(encrypt("hello")).toBe("hello");
    });
  });

  describe("isEncrypted", () => {
    it("returns true for encrypted values", () => {
      const encrypted = encrypt("test");
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it("returns false for empty string", () => {
      expect(isEncrypted("")).toBe(false);
    });

    it("returns false for plain text", () => {
      expect(isEncrypted("just a normal string")).toBe(false);
    });

    it("returns false for two-part string", () => {
      expect(isEncrypted("part1:part2")).toBe(false);
    });

    it("returns false for three parts with non-base64", () => {
      expect(isEncrypted("not valid!:also bad!:nope!")).toBe(false);
    });

    it("returns true for three valid base64 parts", () => {
      expect(isEncrypted("YWJj:ZGVm:Z2hp")).toBe(true);
    });
  });

  describe("decryptGraceful", () => {
    it("decrypts valid encrypted value", () => {
      const encrypted = encrypt("graceful test");
      expect(decryptGraceful(encrypted)).toBe("graceful test");
    });

    it("returns plain text as-is if not encrypted format", () => {
      expect(decryptGraceful("plain text value")).toBe("plain text value");
    });

    it("returns value as-is if format matches but decryption fails", () => {
      // Three valid base64 parts but not actually encrypted by us
      const fake = "YWJj:ZGVmZGVmZGVmZGVmZGVmZA==:Z2hp";
      expect(decryptGraceful(fake)).toBe(fake);
    });
  });

  describe("createOAuthState / verifyOAuthState", () => {
    it("round-trips email through state", () => {
      const email = "taras@example.com";
      const state = createOAuthState(email);
      expect(verifyOAuthState(state)).toBe(email);
    });

    it("rejects tampered state", () => {
      const state = createOAuthState("taras@example.com");
      const tampered = state.replace(/[a-z]/, (c) => (c === "a" ? "b" : "a"));
      // Tampered state should return null (unless mutation didn't change anything)
      if (tampered !== state) {
        expect(verifyOAuthState(tampered)).toBeNull();
      }
    });

    it("rejects state without dot separator", () => {
      expect(verifyOAuthState("nodothere")).toBeNull();
    });

    it("works without encryption key (base64 fallback)", () => {
      delete process.env.ENCRYPTION_KEY;
      const email = "user@test.com";
      const state = createOAuthState(email);
      expect(verifyOAuthState(state)).toBe(email);
    });
  });
});

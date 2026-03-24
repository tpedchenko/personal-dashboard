/**
 * Generates demo-auth-dev.json and demo-auth-prod.json with a valid
 * HMAC-signed demo token.
 *
 * Run: npx tsx tests/generate-demo-auth.ts
 * Also invoked automatically by Playwright global-setup.
 */

import { writeFileSync } from "fs";
import { join } from "path";

const DEMO_COOKIE = "demo_mode";
const DEMO_TTL_SECONDS = 60 * 60 * 24; // 24 hours

function getSecret(): string {
  const secret = process.env.DEMO_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Missing DEMO_SECRET or NEXTAUTH_SECRET env variable. " +
        "Set one before running tests.",
    );
  }
  return secret;
}

async function createDemoToken(): Promise<string> {
  const encoder = new TextEncoder();
  const expiresAt = Math.floor(Date.now() / 1000) + DEMO_TTL_SECONDS;
  const payload = `demo:${expiresAt}`;

  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${expiresAt}.${hex}`;
}

interface StorageState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    httpOnly: boolean;
    sameSite: string;
    secure: boolean;
    expires: number;
  }>;
  origins: never[];
}

async function main() {
  const token = await createDemoToken();
  const expiresAt = Math.floor(Date.now() / 1000) + DEMO_TTL_SECONDS;

  const envs = [
    { file: "demo-auth-dev.json", domain: "dev.taras.cloud" },
    { file: "demo-auth-prod.json", domain: "pd.taras.cloud" },
  ];

  for (const { file, domain } of envs) {
    const state: StorageState = {
      cookies: [
        {
          name: DEMO_COOKIE,
          value: token,
          domain,
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
          secure: true,
          expires: expiresAt,
        },
      ],
      origins: [],
    };

    const outPath = join(__dirname, file);
    writeFileSync(outPath, JSON.stringify(state, null, 2) + "\n");
    console.log(`Wrote ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export default main;

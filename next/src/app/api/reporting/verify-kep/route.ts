export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { getSecretValue } from "@/actions/settings";
import { parseKepKey } from "@/lib/reporting/kep-signer";

/**
 * Verify KEP key file — parse and return certificate info.
 * POST /api/reporting/verify-kep
 */
export async function POST() {
  try {
    const user = await requireUser();

    const [keyBase64, password] = await Promise.all([
      getSecretValue(user.id, "tax_ua_kep_file"),
      getSecretValue(user.id, "tax_ua_kep_password"),
    ]);

    if (!keyBase64 || !password) {
      return NextResponse.json(
        { error: "KEP file or password not configured. Go to Settings → Integrations → Tax UA." },
        { status: 400 },
      );
    }

    const result = await parseKepKey(keyBase64, password);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification failed" },
      { status: 500 },
    );
  }
}

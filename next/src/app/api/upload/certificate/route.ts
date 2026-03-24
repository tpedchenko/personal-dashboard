export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUser, isCurrentUserDemo } from "@/lib/current-user";
import { setSecretValue } from "@/actions/settings";

/**
 * Upload certificate file (KEP Key-6.dat, .jks, .pfx, .p12)
 * Stores as base64 in secrets table (encrypted)
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();

    // Demo users cannot upload files
    if (await isCurrentUserDemo()) {
      return NextResponse.json({ error: "Uploads are not available in demo mode" }, { status: 403 });
    }
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null; // "kep_ua" | "cert_es"

    if (!file || !type) {
      return NextResponse.json({ error: "Missing file or type" }, { status: 400 });
    }

    // Validate file size (max 1MB)
    if (file.size > 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 1MB)" }, { status: 400 });
    }

    // Validate file type
    const validExtensions = [".dat", ".jks", ".pfx", ".p12", ".zs2"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!validExtensions.includes(ext)) {
      return NextResponse.json(
        { error: `Invalid file type. Allowed: ${validExtensions.join(", ")}` },
        { status: 400 }
      );
    }

    // Read file as base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    // Determine secret key
    const secretKey = type === "kep_ua" ? "tax_ua_kep_file" : "tax_es_cert_file";
    const fileNameKey = type === "kep_ua" ? "tax_ua_kep_filename" : "tax_es_cert_filename";

    // Store encrypted
    await setSecretValue(user.id, secretKey, base64);
    await setSecretValue(user.id, fileNameKey, file.name);

    return NextResponse.json({
      success: true,
      fileName: file.name,
      fileSize: file.size,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}

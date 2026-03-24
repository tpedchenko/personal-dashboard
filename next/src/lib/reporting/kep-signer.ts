/**
 * KEP (Qualified Electronic Signature) operations using jkurwa.
 * Handles Ukrainian DSTU 4145 signatures for tax declarations.
 */

/**
 * Parse a KEP key file (Key-6.dat, .jks, .pfx) and return key info.
 * Does NOT store the private key — only validates and extracts metadata.
 */
export async function parseKepKey(
  fileBase64: string,
  password: string,
): Promise<{
  valid: boolean;
  owner?: string;
  issuer?: string;
  serial?: string;
  validFrom?: string;
  validTo?: string;
  error?: string;
}> {
  try {
    // Dynamic import to avoid bundling issues
    // @ts-expect-error jkurwa has no type declarations
    const { Priv } = await import("jkurwa");

    const keyBuffer = Buffer.from(fileBase64, "base64");

    // Try to parse the key
    const priv = new Priv({
      priv: keyBuffer,
      password,
    });

    if (!priv.type) {
      return { valid: false, error: "Could not parse key file" };
    }

    // Extract certificate info if available
    const cert = priv.cert;
    return {
      valid: true,
      owner: cert?.subject?.commonName || cert?.subject?.organizationName,
      issuer: cert?.issuer?.commonName,
      serial: cert?.serial?.toString(16),
      validFrom: cert?.validFrom?.toISOString(),
      validTo: cert?.validTo?.toISOString(),
    };
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : "Failed to parse key",
    };
  }
}

/**
 * Sign XML content with KEP for tax submission.
 * Returns signed content as base64.
 */
export async function signXml(
  xmlContent: string,
  keyBase64: string,
  password: string,
): Promise<{ signed: string } | { error: string }> {
  try {
    // @ts-expect-error jkurwa has no type declarations
    const { Priv, Message } = await import("jkurwa");

    const keyBuffer = Buffer.from(keyBase64, "base64");
    const priv = new Priv({ priv: keyBuffer, password });

    // Create PKCS7 signed message
    const message = new Message({
      type: "signedData",
      cert: priv.cert,
      data: Buffer.from(xmlContent, "utf-8"),
      signer: priv,
      detached: false,
    });

    const signed = message.as_transport();
    return { signed: signed.toString("base64") };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Signing failed" };
  }
}

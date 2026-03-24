/**
 * DPS (Ukrainian Tax Service) Authorization.
 * Forms the Authorization header for cabinet.tax.gov.ua REST API.
 *
 * Auth scheme: Base64( CMS_signed(РНОКПП) + certificate )
 * Uses jkurwa (DSTU 4145) for signing.
 */

/**
 * Build the Authorization header value for DPS API requests.
 * Signs the РНОКПП (tax ID) with KEP using CMS/PKCS#7 format.
 */
export async function buildDpsAuthHeader(
  ipn: string,
  kepFileBase64: string,
  kepPassword: string,
): Promise<string> {
  // @ts-expect-error jkurwa has no type declarations
  const { Priv, Message } = await import("jkurwa");

  const keyBuffer = Buffer.from(kepFileBase64, "base64");
  const priv = new Priv({ priv: keyBuffer, password: kepPassword });

  if (!priv.type) {
    throw new Error("Could not parse KEP key file");
  }

  // Sign the IPN (РНОКПП) as CMS/PKCS#7 message
  const message = new Message({
    type: "signedData",
    cert: priv.cert,
    data: Buffer.from(ipn, "utf-8"),
    signer: priv,
    detached: false,
  });

  const signed = message.as_transport();
  return signed.toString("base64");
}

/**
 * Load DPS credentials from user secrets and build auth header.
 */
export async function getDpsAuthHeader(userId: number): Promise<string> {
  const { getSecretValue } = await import("@/actions/settings");

  const [ipn, kepFile, kepPassword] = await Promise.all([
    getSecretValue(userId, "tax_ua_ipn"),
    getSecretValue(userId, "tax_ua_kep_file"),
    getSecretValue(userId, "tax_ua_kep_password"),
  ]);

  if (!ipn || !kepFile || !kepPassword) {
    throw new Error(
      "DPS credentials not configured. Set IPN, KEP file and password in Settings → Tax UA.",
    );
  }

  return buildDpsAuthHeader(ipn, kepFile, kepPassword);
}

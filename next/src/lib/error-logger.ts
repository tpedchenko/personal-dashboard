import { prisma } from "@/lib/db";

/**
 * Log an error to the audit_log table for admin visibility.
 * Non-blocking — catches its own errors to avoid cascading failures.
 */
export async function logError(
  userEmail: string,
  location: string,
  error: unknown
): Promise<void> {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack?.slice(0, 500) : undefined;
    const details = `[${location}] ${message}${stack ? `\n${stack}` : ""}`;

    await prisma.$executeRaw`
      INSERT INTO audit_log (user_email, action, details)
      VALUES (${userEmail}, 'ERROR', ${details})
    `;
  } catch {
    // Silently fail — don't cascade errors
    console.error("[ErrorLogger] Failed to log error:", error);
  }
}

/**
 * Get recent errors from audit_log for admin dashboard.
 */
export async function getRecentErrors(limit = 50) {
  const errors = await prisma.auditLog.findMany({
    where: { action: "ERROR" },
    orderBy: { id: "desc" },
    take: limit,
  });
  return errors;
}

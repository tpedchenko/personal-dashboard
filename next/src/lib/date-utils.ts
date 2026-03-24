/**
 * Shared date formatting utilities.
 */

/** Format any Date as YYYY-MM-DD string. */
export function formatDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Return today's date as YYYY-MM-DD string. */
export function todayString(): string {
  return formatDateString(new Date());
}

/**
 * Convert a YYYY-MM-DD string to a Date suitable for Prisma @db.Date columns.
 * Uses UTC midnight to avoid timezone shifts.
 */
export function toDateOnly(s: string): Date {
  return new Date(s + "T00:00:00.000Z");
}

/**
 * Serialize a Prisma Date (@db.Date) back to YYYY-MM-DD string.
 * Handles both Date objects and string passthrough.
 */
export function dateToString(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

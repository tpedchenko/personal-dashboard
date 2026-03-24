"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { toDateOnly, dateToString } from "@/lib/date-utils";

// ---------- CSV Export ----------

export async function exportTransactionsCsv(filters: {
  dateFrom?: string;
  dateTo?: string;
  type?: string;
  account?: string;
  category?: string;
  search?: string;
}) {
  const user = await requireUser();
  const where: Record<string, unknown> = { userId: user.id };

  if (filters.dateFrom || filters.dateTo) {
    where.date = {
      ...(filters.dateFrom ? { gte: toDateOnly(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: toDateOnly(filters.dateTo) } : {}),
    };
  }
  if (filters.type) {
    if (filters.type === "TRANSFER") {
      where.subType = "TRANSFER";
    } else {
      where.type = filters.type;
      where.NOT = { subType: "TRANSFER" };
    }
  }
  if (filters.account) where.account = filters.account;
  if (filters.category) where.category = filters.category;
  if (filters.search) {
    where.description = { contains: filters.search, mode: "insensitive" };
  }

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { date: "desc" },
    take: 10000,
  });

  const header = "date,type,category,amount_eur,amount_original,currency,account,description";
  const rows = transactions.map((tx) => {
    const escapeCsv = (val: string | null | undefined) => {
      if (val == null) return "";
      const s = String(val);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    return [
      dateToString(tx.date),
      tx.type ?? "",
      escapeCsv(tx.category),
      tx.amountEur?.toFixed(2) ?? "",
      tx.amountOriginal?.toFixed(2) ?? "",
      tx.currencyOriginal ?? "",
      escapeCsv(tx.account),
      escapeCsv(tx.description),
    ].join(",");
  });

  return [header, ...rows].join("\n");
}

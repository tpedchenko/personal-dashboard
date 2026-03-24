"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { z } from "zod";
import { dateSchema, addQuickExpenseSchema, addShoppingItemSchema, shoppingStatsSchema } from "@/lib/validations";
import { toDateOnly, dateToString } from "@/lib/date-utils";

// ---------- Quick Supermarket Expense ----------

export async function addQuickExpense(data: {
  account: string;
  amount: number;
  date: string;
  items: string[];
}) {
  const validated = addQuickExpenseSchema.parse(data);
  const user = await requireUser();
  const d = new Date(validated.date);
  const description = validated.items.join(", ");

  await prisma.transaction.create({
    data: {
      userId: user.id,
      date: toDateOnly(validated.date),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      type: "EXPENSE",
      account: validated.account,
      category: "Супермаркет",
      amountOriginal: validated.amount,
      currencyOriginal: "EUR",
      amountEur: validated.amount,
      description,
      source: "manual",
    },
  });
  updateTag(CACHE_TAGS.finance);
  updateTag(CACHE_TAGS.shopping);
}

// ---------- Send Shopping Report ----------

export async function sendShoppingReport() {
  const user = await requireUser();
  const boughtItems = await prisma.shoppingItem.findMany({
    where: { boughtAt: { not: null }, userId: user.id },
    orderBy: { boughtAt: "desc" },
  });

  if (boughtItems.length === 0) return;

  const reportLines = boughtItems.map(
    (item) =>
      `${item.itemName}${item.quantity && item.quantity !== "1" ? ` x${item.quantity}` : ""}`,
  );
  const reportText = `Shopping Report (${new Date().toISOString().slice(0, 10)}):\n${reportLines.join("\n")}`;

  await prisma.auditLog.create({
    data: {
      userEmail: user.email,
      action: "shopping_report",
      details: reportText,
    },
  });
}

// ---------- Get Accounts (for quick expense) ----------

export async function getShoppingAccounts() {
  const user = await requireUser();
  return prisma.customAccount.findMany({
    where: { userId: user.id, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getActiveItems() {
  const user = await requireUser();
  return prisma.shoppingItem.findMany({
    where: { boughtAt: null, userId: user.id },
    orderBy: { addedAt: "desc" },
  });
}

export async function getBoughtItems() {
  const user = await requireUser();
  return prisma.shoppingItem.findMany({
    where: { boughtAt: { not: null }, userId: user.id },
    orderBy: { boughtAt: "desc" },
  });
}

/**
 * Parse bulk input: "Хліб, Яйця x3, Сир" → [{name:"Хліб",qty:"1"},{name:"Яйця",qty:"3"},{name:"Сир",qty:"1"}]
 */
function parseBulkItems(raw: string): { name: string; qty: string }[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token) => {
      // Match "Item x2", "Item X3", "Item ×2"
      const m = token.match(/^(.+?)\s*[xXхХ×]\s*(\d+)$/);
      if (m) return { name: m[1].trim(), qty: m[2] };
      return { name: token, qty: "1" };
    })
    .filter((i) => i.name.length > 0);
}

export async function addItem(itemName: string, quantity?: string) {
  const validated = addShoppingItemSchema.parse({ itemName, quantity });
  const user = await requireUser();
  const items = parseBulkItems(validated.itemName);

  // If a single item was entered without comma, honour the separate quantity field
  if (items.length === 1 && validated.quantity && validated.quantity !== "1") {
    items[0].qty = validated.quantity;
  }

  await prisma.$transaction(
    items.map((i) =>
      prisma.shoppingItem.create({
        data: {
          itemName: i.name,
          quantity: i.qty,
          addedBy: "app",
          userId: user.id,
        },
      })
    )
  );
  updateTag(CACHE_TAGS.shopping);
}

export async function toggleBought(id: number) {
  z.number().int().positive().parse(id);
  const user = await requireUser();
  const item = await prisma.shoppingItem.findFirst({ where: { id, userId: user.id } });
  if (!item) return;

  await prisma.shoppingItem.update({
    where: { id },
    data: {
      boughtAt: item.boughtAt ? null : new Date(),
      boughtBy: item.boughtAt ? null : "app",
    },
  });
  updateTag(CACHE_TAGS.shopping);
}

export async function deleteItem(id: number) {
  z.number().int().positive().parse(id);
  const user = await requireUser();
  await prisma.shoppingItem.delete({ where: { id, userId: user.id } });
  updateTag(CACHE_TAGS.shopping);
}

export async function clearBought() {
  const user = await requireUser();
  const boughtItems = await prisma.shoppingItem.findMany({
    where: { boughtAt: { not: null }, userId: user.id },
  });

  if (boughtItems.length === 0) return;

  await prisma.$transaction([
    ...boughtItems.map((item) =>
      prisma.shoppingHistory.create({
        data: {
          itemName: item.itemName,
          quantity: item.quantity,
          boughtDate: toDateOnly(item.boughtAt!.toISOString().slice(0, 10)),
          boughtBy: item.boughtBy,
          userId: user.id,
        },
      })
    ),
    prisma.shoppingItem.deleteMany({
      where: { boughtAt: { not: null }, userId: user.id },
    }),
  ]);
  updateTag(CACHE_TAGS.shopping);
}

export async function getHistory() {
  const user = await requireUser();
  const rows = await prisma.shoppingHistory.findMany({
    where: { userId: user.id },
    orderBy: { boughtDate: "desc" },
    take: 50,
  });
  return rows.map(r => ({ ...r, boughtDate: dateToString(r.boughtDate) }));
}

export async function getHistoryByDate(date: string) {
  dateSchema.parse(date);
  const user = await requireUser();
  // date is "YYYY-MM-DD"; boughtDate is now a DATE column — exact match
  const rows = await prisma.shoppingHistory.findMany({
    where: {
      userId: user.id,
      boughtDate: toDateOnly(date),
    },
    orderBy: { boughtDate: "desc" },
  });
  return rows.map(r => ({ ...r, boughtDate: dateToString(r.boughtDate) }));
}

export async function getShoppingStats(from: string, to: string) {
  const validated = shoppingStatsSchema.parse({ from, to });
  const user = await requireUser();
  // Combine shopping_history + currently bought items from shopping_items
  const stats = await prisma.$queryRaw<
    { item_name: string; count: bigint; last_bought: string }[]
  >`
    SELECT item_name, SUM(cnt)::bigint as count, MAX(last_bought) as last_bought
    FROM (
      SELECT item_name, COUNT(*)::bigint as cnt, MAX(bought_date::text) as last_bought
      FROM shopping_history
      WHERE user_id = ${user.id}
        AND bought_date >= ${from}::date
        AND bought_date <= ${to}::date
      GROUP BY item_name
      UNION ALL
      SELECT item_name, COUNT(*)::bigint as cnt, MAX(bought_at::date::text) as last_bought
      FROM shopping_items
      WHERE user_id = ${user.id}
        AND bought_at IS NOT NULL
        AND bought_at::date::text >= ${from}
        AND bought_at::date::text <= ${to}
      GROUP BY item_name
    ) combined
    GROUP BY item_name
    ORDER BY count DESC, item_name
  `;

  return stats.map((s) => ({
    itemName: s.item_name,
    count: Number(s.count),
    lastBought: s.last_bought,
  }));
}

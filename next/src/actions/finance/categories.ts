"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { toDateOnly } from "@/lib/date-utils";

// ---------- Categories ----------

export async function getCategories() {
  const user = await requireUser();
  try {
    const [customCats, txCatsRaw] = await Promise.all([
      prisma.customCategory.findMany({
        where: { userId: user.id },
        orderBy: { category: "asc" },
      }),
      prisma.transaction.groupBy({
        by: ["category"],
        where: { userId: user.id, category: { not: null } },
      }),
    ]);
    const allCats = new Set<string>();
    for (const c of customCats) allCats.add(c.category);
    for (const t of txCatsRaw) {
      if (t.category && !t.category.startsWith("Transfer")) allCats.add(t.category);
    }
    const result = Array.from(allCats).sort();
    process.stderr.write(`[getCategories] userId=${user.id} custom=${customCats.length} tx=${txCatsRaw.length} total=${result.length}\n`);
    return result;
  } catch (e) {
    process.stderr.write(`[getCategories] ERROR: ${e}\n`);
    return [];
  }
}

export async function getCategoriesWithFavourites(): Promise<{ category: string; isFavourite: boolean }[]> {
  const user = await requireUser();
  try {
    const [customCats, txCatsRaw, favs] = await Promise.all([
      prisma.customCategory.findMany({
        where: { userId: user.id },
        orderBy: { category: "asc" },
      }),
      prisma.transaction.groupBy({
        by: ["category"],
        where: { userId: user.id, category: { not: null } },
      }),
      prisma.categoryFavourite.findMany({
        where: { userId: user.id },
      }),
    ]);
    const favSet = new Set(favs.map((f) => f.category));
    const allCats = new Set<string>();
    for (const c of customCats) allCats.add(c.category);
    for (const t of txCatsRaw) {
      if (t.category && !t.category.startsWith("Transfer")) allCats.add(t.category);
    }
    const result = Array.from(allCats).map((category) => ({
      category,
      isFavourite: favSet.has(category),
    }));
    result.sort((a, b) => {
      if (a.isFavourite !== b.isFavourite) return a.isFavourite ? -1 : 1;
      return a.category.localeCompare(b.category);
    });
    return result;
  } catch (e) {
    console.error("[getCategoriesWithFavourites] error:", e);
    return [];
  }
}

export async function getCategoriesForPeriod(dateFrom?: string, dateTo?: string): Promise<string[]> {
  const user = await requireUser();
  const where: Record<string, unknown> = { userId: user.id };
  if (dateFrom) where.date = { ...(where.date as object || {}), gte: toDateOnly(dateFrom) };
  if (dateTo) where.date = { ...(where.date as object || {}), lte: toDateOnly(dateTo) };
  const result = await prisma.transaction.findMany({
    where,
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  return result
    .map((r) => r.category)
    .filter((c): c is string => c != null && c !== "" && !c.startsWith("Transfer"));
}

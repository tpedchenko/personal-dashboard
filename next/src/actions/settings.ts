"use server";

import { prisma } from "@/lib/db";
import { requireUser, requireNonDemoUser, isCurrentUserDemo } from "@/lib/current-user";
import { createOAuthState } from "@/lib/encryption";
import { z, ZodError } from "zod";
import { userPreferenceSchema } from "@/lib/validations";
import { ALL_MODULE_KEYS } from "@/lib/modules";
import { toDateOnly, dateToString } from "@/lib/date-utils";

// ── Modules ──

export async function getEnabledModules(): Promise<string[]> {
  const user = await requireUser();
  const pref = await prisma.userPreference.findUnique({
    where: { userId_key: { userId: user.id, key: "enabled_modules" } },
  });
  if (!pref?.value) return ALL_MODULE_KEYS;
  try {
    const parsed = JSON.parse(pref.value) as string[];
    if (!Array.isArray(parsed)) return ALL_MODULE_KEYS;
    // Filter to only known module keys
    const valid = parsed.filter((k) => ALL_MODULE_KEYS.includes(k));
    return valid.length > 0 ? valid : ALL_MODULE_KEYS;
  } catch (e) {
    console.error("[settings/getEnabledModules] JSON parse error:", e);
    return ALL_MODULE_KEYS;
  }
}

export async function setEnabledModules(modules: string[]): Promise<void> {
  await requireNonDemoUser();
  const user = await requireUser();
  // Validate: only known module keys
  const valid = modules.filter((k) => ALL_MODULE_KEYS.includes(k));
  const value = JSON.stringify(valid);
  await prisma.userPreference.upsert({
    where: { userId_key: { userId: user.id, key: "enabled_modules" } },
    update: { value },
    create: { userId: user.id, key: "enabled_modules", value },
  });
}

// ── Accounts ──

export async function getAccounts() {
  const user = await requireUser();
  return prisma.customAccount.findMany({
    where: { userId: user.id },
    orderBy: { sortOrder: "asc" },
  });
}

export async function addAccount(data: {
  name: string;
  currency: string;
  initialBalance?: number;
}) {
  const user = await requireUser();
  const maxOrder = await prisma.customAccount.aggregate({
    where: { userId: user.id },
    _max: { sortOrder: true },
  });
  return prisma.customAccount.create({
    data: {
      name: data.name,
      currency: data.currency,
      initialBalance: data.initialBalance ?? 0,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      userId: user.id,
    },
  });
}

export async function updateAccount(
  id: number,
  data: Partial<{
    name: string;
    currency: string;
    isActive: boolean;
    sortOrder: number;
    initialBalance: number;
  }>
) {
  const user = await requireUser();
  // If name is changing, update all references in transactions and recurring atomically
  if (data.name) {
    const oldAccount = await prisma.customAccount.findUnique({ where: { id, userId: user.id } });
    if (oldAccount && oldAccount.name !== data.name) {
      return prisma.$transaction([
        prisma.transaction.updateMany({
          where: { userId: user.id, account: oldAccount.name },
          data: { account: data.name },
        }),
        prisma.recurringTransaction.updateMany({
          where: { userId: user.id, account: oldAccount.name },
          data: { account: data.name },
        }),
        prisma.customAccount.update({ where: { id, userId: user.id }, data }),
      ]).then(([, , updated]) => updated);
    }
  }
  return prisma.customAccount.update({ where: { id, userId: user.id }, data });
}

export async function deleteAccount(id: number) {
  const user = await requireUser();
  return prisma.customAccount.delete({ where: { id, userId: user.id } });
}

export async function migrateAndDeleteAccount(id: number, migrateToAccountName: string | null) {
  const user = await requireUser();
  const account = await prisma.customAccount.findUnique({ where: { id, userId: user.id } });
  if (!account) return;

  if (migrateToAccountName) {
    await prisma.transaction.updateMany({
      where: { userId: user.id, account: account.name },
      data: { account: migrateToAccountName },
    });
  }
  await prisma.customAccount.delete({ where: { id, userId: user.id } });
}

export async function swapAccountOrder(id1: number, id2: number) {
  const user = await requireUser();
  const [a1, a2] = await Promise.all([
    prisma.customAccount.findUnique({ where: { id: id1, userId: user.id } }),
    prisma.customAccount.findUnique({ where: { id: id2, userId: user.id } }),
  ]);
  if (!a1 || !a2) return;
  await Promise.all([
    prisma.customAccount.update({ where: { id: id1, userId: user.id }, data: { sortOrder: a2.sortOrder } }),
    prisma.customAccount.update({ where: { id: id2, userId: user.id }, data: { sortOrder: a1.sortOrder } }),
  ]);
}

// ── Categories ──

export async function getCategories() {
  const user = await requireUser();
  return prisma.customCategory.findMany({
    where: { userId: user.id },
    orderBy: { category: "asc" },
  });
}

export async function getAllCategoriesFromTransactions(): Promise<string[]> {
  const user = await requireUser();
  const [txCats, customCats] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: user.id },
      select: { category: true },
      distinct: ["category"],
    }),
    prisma.customCategory.findMany({
      where: { userId: user.id },
      select: { category: true },
    }),
  ]);
  const allCats = new Set<string>();
  for (const r of txCats) {
    if (r.category && !r.category.startsWith("Transfer")) allCats.add(r.category);
  }
  for (const r of customCats) {
    allCats.add(r.category);
  }
  return [...allCats].sort((a, b) => a.localeCompare(b));
}

export async function getCategoryTypes(): Promise<Record<string, "EXPENSE" | "INCOME" | "MIXED">> {
  const user = await requireUser();
  const result = await prisma.transaction.groupBy({
    by: ["category", "type"],
    where: { userId: user.id, category: { not: null }, subType: { not: "TRANSFER" } },
    _count: { id: true },
  });
  const map: Record<string, Set<string>> = {};
  for (const r of result) {
    if (!r.category) continue;
    if (!map[r.category]) map[r.category] = new Set();
    if (r.type) map[r.category].add(r.type);
  }
  const types: Record<string, "EXPENSE" | "INCOME" | "MIXED"> = {};
  for (const [cat, typeSet] of Object.entries(map)) {
    if (typeSet.has("EXPENSE") && typeSet.has("INCOME")) types[cat] = "MIXED";
    else if (typeSet.has("INCOME")) types[cat] = "INCOME";
    else types[cat] = "EXPENSE";
  }
  return types;
}

export async function getCategoryUsageStats() {
  const user = await requireUser();
  const result = await prisma.transaction.groupBy({
    by: ["category"],
    where: { userId: user.id, category: { not: null } },
    _count: { id: true },
    _max: { date: true },
    orderBy: { _count: { id: "desc" } },
  });
  return result.map((r) => ({
    category: r.category ?? "",
    count: r._count.id,
    lastUsed: r._max.date ? dateToString(r._max.date) : null,
  }));
}

export async function removeFutureTransactions() {
  const user = await requireUser();
  const today = new Date().toISOString().slice(0, 10);
  const deleted = await prisma.transaction.deleteMany({
    where: { userId: user.id, date: { gt: toDateOnly(today) } },
  });
  return deleted.count;
}

export async function getNbuCacheStats() {
  const user = await requireUser();
  if (!user) return null;
  const total = await prisma.nbuRate.count();
  const oldest = await prisma.nbuRate.findFirst({ orderBy: { date: "asc" }, select: { date: true } });
  const newest = await prisma.nbuRate.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  const uniqueDates = await prisma.nbuRate.groupBy({ by: ["date"], _count: true });
  return {
    totalRecords: total,
    uniqueDates: uniqueDates.length,
    oldest: oldest ? dateToString(oldest.date) : null,
    newest: newest ? dateToString(newest.date) : null,
  };
}

export async function renameCategory(oldName: string, newName: string) {
  const user = await requireUser();
  await prisma.$transaction(async (tx) => {
    await Promise.all([
      tx.transaction.updateMany({
        where: { userId: user.id, category: oldName },
        data: { category: newName },
      }),
      tx.budget.updateMany({
        where: { userId: user.id, category: oldName },
        data: { category: newName },
      }),
      tx.recurringTransaction.updateMany({
        where: { userId: user.id, category: oldName },
        data: { category: newName },
      }),
      tx.mandatoryCategory.updateMany({
        where: { userId: user.id, category: oldName },
        data: { category: newName },
      }),
    ]);
    // Also update custom_categories if exists
    const customCat = await tx.customCategory.findFirst({
      where: { category: oldName, userId: user.id },
    });
    if (customCat) {
      await tx.customCategory.update({
        where: { userId_category: { userId: user.id, category: oldName } },
        data: { category: newName },
      });
    }
    // Update favourites (scoped to current user)
    await tx.categoryFavourite.updateMany({
      where: { category: oldName, userId: user.id },
      data: { category: newName },
    });
  });
}

export async function getFavourites() {
  const user = await requireUser();
  return prisma.categoryFavourite.findMany({
    where: { userId: user.id },
  });
}

export async function addCategory(category: string) {
  const user = await requireUser();
  return prisma.customCategory.create({ data: { category, userId: user.id } });
}

export async function deleteCategory(category: string) {
  const user = await requireUser();
  await prisma.categoryFavourite.deleteMany({ where: { category, userId: user.id } });
  return prisma.customCategory.delete({ where: { userId_category: { userId: user.id, category } } });
}

export async function toggleFavourite(category: string) {
  const user = await requireUser();
  const existing = await prisma.categoryFavourite.findFirst({ where: { category, userId: user.id } });
  if (existing) {
    return prisma.categoryFavourite.delete({ where: { userId_category: { userId: user.id, category: existing.category } } });
  }
  try {
    return await prisma.categoryFavourite.create({ data: { category, userId: user.id } });
  } catch (e) {
    console.error("[settings/toggleFavourite] Unique constraint or DB error:", e);
    return null;
  }
}

// ── Savings Goals ──

export async function getSavingsGoals() {
  const user = await requireUser();
  return prisma.savingsGoal.findMany({
    where: { active: true, userId: user.id },
    orderBy: { name: "asc" },
  });
}

export async function addSavingsGoal(data: {
  name: string;
  targetEur: number;
  deadline?: string;
}) {
  const user = await requireUser();
  return prisma.savingsGoal.create({
    data: {
      name: data.name,
      targetEur: data.targetEur,
      currentEur: 0,
      deadline: data.deadline ?? null,
      active: true,
      userId: user.id,
    },
  });
}

export async function updateSavingsGoal(
  id: number,
  data: Partial<{
    name: string;
    targetEur: number;
    currentEur: number;
    deadline: string;
    active: boolean;
  }>
) {
  const user = await requireUser();
  return prisma.savingsGoal.update({ where: { id, userId: user.id }, data });
}

export async function deleteSavingsGoal(id: number) {
  const user = await requireUser();
  return prisma.savingsGoal.delete({ where: { id, userId: user.id } });
}

// ── Guest Invites ──

export async function getGuestInvites() {
  const user = await requireUser();
  if (user.role !== "owner") return [];
  return prisma.guestInvite.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createGuestInvite(email: string) {
  const user = await requireUser();
  if (user.role !== "owner") throw new Error("Only owner can invite guests");
  return prisma.guestInvite.create({
    data: {
      email,
      invitedBy: user.email,
    },
  });
}

export async function deleteGuestInvite(email: string) {
  const user = await requireUser();
  if (user.role !== "owner") throw new Error("Only owner can manage guests");
  return prisma.guestInvite.delete({ where: { email } });
}

// ── Secrets ──

export async function generateWithingsOAuthState(): Promise<string> {
  const user = await requireUser();
  return createOAuthState(user.email);
}

export async function getSecret(key: string) {
  const user = await requireUser();
  return getSecretValue(user.id, key);
}

export async function setSecret(key: string, value: string) {
  const user = await requireUser();
  return setSecretValue(user.id, key, value);
}

/**
 * Read a secret value by userId and key, decrypting if encrypted.
 * Handles graceful migration: if the value is not encrypted, returns it as-is.
 */
export async function getSecretValue(userId: number, key: string): Promise<string | null> {
  const secret = await prisma.secret.findUnique({
    where: { userId_key: { userId, key } },
  });
  if (!secret?.value) return null;
  try {
    const { decryptGraceful } = await import("@/lib/encryption");
    return decryptGraceful(secret.value);
  } catch (e) {
    console.error(`[settings/getSecretValue] Decryption failed for key="${key}":`, e);
    return secret.value;
  }
}

/**
 * Write a secret value by userId and key, encrypting before storage.
 * Uses upsert to create or update as needed.
 */
export async function setSecretValue(userId: number, key: string, value: string) {
  await requireNonDemoUser();
  let storedValue = value;
  try {
    const { encrypt } = await import("@/lib/encryption");
    storedValue = encrypt(value);
  } catch (err) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Encryption failed in production — refusing to store plaintext: ${err}`);
    }
    /* fallback to plaintext only in dev */
  }

  return prisma.secret.upsert({
    where: { userId_key: { userId, key } },
    update: { value: storedValue },
    create: { key, value: storedValue, userId },
  });
}

// ── User Preferences ──

export async function getUserPreference(key: string): Promise<string | null> {
  try {
    z.string().min(1).max(100).parse(key);
  } catch (e) {
    if (e instanceof ZodError) return null;
    throw e;
  }
  const user = await requireUser();
  const pref = await prisma.userPreference.findUnique({
    where: { userId_key: { userId: user.id, key } },
  });
  return pref?.value ?? null;
}

export async function setUserPreference(
  key: string,
  value: string
): Promise<void> {
  try {
    userPreferenceSchema.parse({ key, value });
  } catch (e) {
    if (e instanceof ZodError) return;
    throw e;
  }
  const user = await requireUser();
  await prisma.userPreference.upsert({
    where: { userId_key: { userId: user.id, key } },
    update: { value },
    create: { userId: user.id, key, value },
  });
}

// ── Delete Account ──

export async function deleteUserAccount(): Promise<void> {
  await requireNonDemoUser();
  const user = await requireUser();
  const id = user.id;
  const email = user.email;

  // Delete all user data atomically
  await prisma.$transaction(async (tx) => {
    await tx.gymSet.deleteMany({ where: { userId: id } });
    await tx.gymWorkoutExercise.deleteMany({ where: { userId: id } });
    await tx.gymWorkout.deleteMany({ where: { userId: id } });
    await tx.gymProgramExercise.deleteMany({ where: { userId: id } });
    await tx.gymProgramDay.deleteMany({ where: { userId: id } });
    await tx.gymProgram.deleteMany({ where: { userId: id } });
    await tx.gymExercise.deleteMany({ where: { userId: id } });
    await tx.foodLog.deleteMany({ where: { userId: id } });
    await tx.shoppingItem.deleteMany({ where: { userId: id } });
    await tx.shoppingHistory.deleteMany({ where: { userId: id } });
    await tx.dailyLog.deleteMany({ where: { userId: id } });
    await tx.transaction.deleteMany({ where: { userId: id } });
    await tx.budget.deleteMany({ where: { userId: id } });
    await tx.recurringTransaction.deleteMany({ where: { userId: id } });
    await tx.savingsGoal.deleteMany({ where: { userId: id } });
    await tx.customAccount.deleteMany({ where: { userId: id } });
    await tx.customCategory.deleteMany({ where: { userId: id } });
    await tx.categoryFavourite.deleteMany({ where: { userId: id } });
    await tx.secret.deleteMany({ where: { userId: id } });
    await tx.aiNote.deleteMany({ where: { userId: id } });
    await tx.aiContextSnapshot.deleteMany({ where: { userId: id } });
    await tx.chatHistory.deleteMany({ where: { userEmail: email } });
    await tx.auditLog.deleteMany({ where: { userEmail: email } });
    await tx.userPreference.deleteMany({ where: { userId: id } });
    await tx.telegramLink.deleteMany({ where: { userEmail: email } });
    await tx.user.delete({ where: { id } });
  });
}

// ── Withings Data Check ──

export async function checkWithingsData() {
  const user = await requireUser();
  const latest = await prisma.withingsMeasurement.findFirst({
    where: { userId: user.id },
    orderBy: { date: "desc" },
  });
  if (!latest) {
    return { found: false, message: "No Withings measurements found in the database." };
  }
  return {
    found: true,
    date: latest.date,
    weight: latest.weight,
    fatRatio: latest.fatRatio,
    message: `Latest measurement: ${latest.date} — Weight: ${latest.weight ?? "N/A"} kg, Fat: ${latest.fatRatio ?? "N/A"}%`,
  };
}

// ── Bug Report ──

export async function submitBugReport(description: string): Promise<void> {
  try {
    z.string().min(1).max(5000).parse(description);
  } catch (e) {
    if (e instanceof ZodError) return;
    throw e;
  }
  const user = await requireUser();
  await prisma.auditLog.create({
    data: {
      userEmail: user.email,
      action: "bug_report",
      details: description,
    },
  });
}

// ── Demo Mode ──

export async function isDemoMode(): Promise<boolean> {
  const { isCurrentUserDemo } = await import("@/lib/current-user");
  return isCurrentUserDemo();
}

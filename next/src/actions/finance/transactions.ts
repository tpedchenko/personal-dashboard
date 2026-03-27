"use server";

import { prisma } from "@/lib/db";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { requireUser } from "@/lib/current-user";
import { invalidateAiContextSnapshot } from "@/actions/chat-context/index";
import { invalidateKpiCache } from "@/actions/dashboard/kpi";
import { upsertEmbedding } from "@/lib/embeddings";
import { z, ZodError } from "zod";
import {
  getTransactionsSchema,
  addTransactionSchema,
  updateTransactionSchema,
  addTransferSchema,
} from "@/lib/validations";
import { toDateOnly, dateToString } from "@/lib/date-utils";

// ---------- Transactions ----------

export async function getTransactions(filters: {
  dateFrom?: string;
  dateTo?: string;
  type?: string;
  account?: string;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  try {
    getTransactionsSchema.parse(filters);
  } catch (e) {
    if (e instanceof ZodError) return { transactions: [], count: 0, error: "Invalid input" };
    throw e;
  }
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
      where.subType = { not: "TRANSFER" };
    }
  }
  if (filters.account) where.account = filters.account;
  if (filters.category) where.category = filters.category;
  if (filters.search) {
    where.description = { contains: filters.search, mode: "insensitive" };
  }

  const [transactions, count] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { date: "desc" },
      take: filters.limit ?? 20,
      skip: filters.offset ?? 0,
    }),
    prisma.transaction.count({ where }),
  ]);

  return { transactions: transactions.map(t => ({ ...t, date: dateToString(t.date) })), count };
}

export async function addTransaction(data: {
  date: string;
  type: string;
  account: string;
  category: string;
  amountOriginal: number;
  currencyOriginal?: string;
  amountEur: number;
  nbuRateEurUsed?: number;
  description?: string;
  owner?: string;
}) {
  try {
    addTransactionSchema.parse(data);
  } catch (e) {
    if (e instanceof ZodError) return { error: "Invalid input" };
    throw e;
  }
  const user = await requireUser();
  const d = new Date(data.date);
  const tx = await prisma.transaction.create({
    data: {
      userId: user.id,
      date: toDateOnly(data.date),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      type: data.type,
      account: data.account,
      category: data.category,
      amountOriginal: data.amountOriginal,
      currencyOriginal: data.currencyOriginal ?? "EUR",
      amountEur: data.amountEur,
      nbuRateEurUsed: data.nbuRateEurUsed ?? null,
      description: data.description ?? null,
      owner: data.owner ?? null,
      source: "manual",
    },
  });
  updateTag(CACHE_TAGS.finance);
  await invalidateKpiCache(user.id);
  await invalidateAiContextSnapshot(user.id);

  // Fire-and-forget embedding for transaction with description
  if (data.description) {
    upsertEmbedding(
      user.id,
      "transaction",
      tx.id,
      `[${data.date}] ${data.type} ${data.category}: ${data.description} (${data.amountEur} EUR)`,
    ).catch((err) => console.error("[embeddings] transaction embed failed:", err));
  }
}

export async function updateTransaction(
  id: number,
  data: {
    date?: string;
    type?: string;
    account?: string;
    category?: string;
    amountOriginal?: number;
    currencyOriginal?: string;
    amountEur?: number;
    description?: string;
    owner?: string;
  },
) {
  try {
    z.number().int().positive().parse(id);
    updateTransactionSchema.parse(data);
  } catch (e) {
    if (e instanceof ZodError) return { error: "Invalid input" };
    throw e;
  }
  const user = await requireUser();
  const update: Record<string, unknown> = { ...data };
  if (data.currencyOriginal) {
    update.currencyOriginal = data.currencyOriginal;
  }
  if (data.date) {
    const d = new Date(data.date);
    update.date = toDateOnly(data.date);
    update.year = d.getFullYear();
    update.month = d.getMonth() + 1;
  }
  const tx = await prisma.transaction.update({ where: { id, userId: user.id }, data: update });
  updateTag(CACHE_TAGS.finance);
  await invalidateKpiCache(user.id);
  await invalidateAiContextSnapshot(user.id);

  // Fire-and-forget embedding update for transaction with description
  if (tx.description) {
    const dateStr = String(tx.date).slice(0, 10);
    upsertEmbedding(
      user.id,
      "transaction",
      tx.id,
      `[${dateStr}] ${tx.type} ${tx.category}: ${tx.description} (${tx.amountEur} EUR)`,
    ).catch((err) => console.error("[embeddings] transaction embed failed:", err));
  }
}

export async function deleteTransaction(id: number) {
  try {
    z.number().int().positive().parse(id);
  } catch (e) {
    if (e instanceof ZodError) return { error: "Invalid input" };
    throw e;
  }
  const user = await requireUser();
  await prisma.transaction.delete({ where: { id, userId: user.id } });
  updateTag(CACHE_TAGS.finance);
  await invalidateKpiCache(user.id);
  await invalidateAiContextSnapshot(user.id);
}

export async function deleteTransactions(ids: number[]) {
  try {
    z.array(z.number().int().positive()).min(1).parse(ids);
  } catch (e) {
    if (e instanceof ZodError) return { error: "Invalid input" };
    throw e;
  }
  const user = await requireUser();
  await prisma.transaction.deleteMany({ where: { id: { in: ids }, userId: user.id } });
  updateTag(CACHE_TAGS.finance);
  await invalidateKpiCache(user.id);
  await invalidateAiContextSnapshot(user.id);
}

// ---------- Transfer ----------

export async function addTransfer(data: {
  date: string;
  fromAccount: string;
  toAccount: string;
  fromAmount: number;
  toAmount: number;
  fromCurrency: string;
  toCurrency: string;
  fromEur: number;
  toEur: number;
  nbuRate?: number;
  description?: string;
}) {
  try {
    addTransferSchema.parse(data);
  } catch (e) {
    if (e instanceof ZodError) return { error: "Invalid input" };
    throw e;
  }
  const user = await requireUser();
  const d = new Date(data.date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;

  await prisma.$transaction([
    prisma.transaction.create({
      data: {
        userId: user.id,
        date: toDateOnly(data.date),
        year,
        month,
        type: "EXPENSE",
        subType: "TRANSFER",
        account: data.fromAccount,
        category: `Transfer → ${data.toAccount}`,
        amountOriginal: data.fromAmount,
        currencyOriginal: data.fromCurrency,
        amountEur: data.fromEur,
        nbuRateEurUsed: data.nbuRate ?? null,
        description: data.description ?? null,
        source: "manual",
      },
    }),
    prisma.transaction.create({
      data: {
        userId: user.id,
        date: toDateOnly(data.date),
        year,
        month,
        type: "INCOME",
        subType: "TRANSFER",
        account: data.toAccount,
        category: `Transfer ← ${data.fromAccount}`,
        amountOriginal: data.toAmount,
        currencyOriginal: data.toCurrency,
        amountEur: data.toEur,
        nbuRateEurUsed: data.nbuRate ?? null,
        description: data.description ?? null,
        source: "manual",
      },
    }),
  ]);

  updateTag(CACHE_TAGS.finance);
  await invalidateKpiCache(user.id);
  await invalidateAiContextSnapshot(user.id);
}

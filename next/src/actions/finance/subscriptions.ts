"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";

// ---------- Types ----------

export type SubscriptionData = {
  id: number;
  name: string;
  provider: string;
  amount: number;
  currency: string;
  billingCycle: string;
  nextBilling: string | null;
  category: string | null;
  isActive: boolean;
  url: string | null;
  notes: string | null;
};

// ---------- Read ----------

export async function getSubscriptions(): Promise<SubscriptionData[]> {
  const user = await requireUser();
  const rows = await prisma.subscription.findMany({
    where: { userId: user.id },
    orderBy: [{ isActive: "desc" }, { nextBilling: "asc" }, { name: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    provider: r.provider,
    amount: r.amount,
    currency: r.currency,
    billingCycle: r.billingCycle,
    nextBilling: r.nextBilling ? r.nextBilling.toISOString().slice(0, 10) : null,
    category: r.category,
    isActive: r.isActive,
    url: r.url,
    notes: r.notes,
  }));
}

// ---------- Create ----------

export async function addSubscription(data: {
  name: string;
  provider: string;
  amount: number;
  currency: string;
  billingCycle: string;
  nextBilling?: string;
  category?: string;
  isActive?: boolean;
  url?: string;
  notes?: string;
}) {
  const user = await requireUser();
  await prisma.subscription.create({
    data: {
      userId: user.id,
      name: data.name,
      provider: data.provider,
      amount: data.amount,
      currency: data.currency,
      billingCycle: data.billingCycle,
      nextBilling: data.nextBilling ? new Date(data.nextBilling) : null,
      category: data.category || null,
      isActive: data.isActive ?? true,
      url: data.url || null,
      notes: data.notes || null,
    },
  });
  updateTag(CACHE_TAGS.finance);
}

// ---------- Update ----------

export async function updateSubscription(
  id: number,
  data: {
    name?: string;
    provider?: string;
    amount?: number;
    currency?: string;
    billingCycle?: string;
    nextBilling?: string | null;
    category?: string | null;
    isActive?: boolean;
    url?: string | null;
    notes?: string | null;
  },
) {
  const user = await requireUser();
  // Verify ownership
  const existing = await prisma.subscription.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) throw new Error("Not found");

  await prisma.subscription.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.provider !== undefined && { provider: data.provider }),
      ...(data.amount !== undefined && { amount: data.amount }),
      ...(data.currency !== undefined && { currency: data.currency }),
      ...(data.billingCycle !== undefined && { billingCycle: data.billingCycle }),
      ...(data.nextBilling !== undefined && {
        nextBilling: data.nextBilling ? new Date(data.nextBilling) : null,
      }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.url !== undefined && { url: data.url }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  });
  updateTag(CACHE_TAGS.finance);
}

// ---------- Delete ----------

export async function deleteSubscription(id: number) {
  const user = await requireUser();
  const existing = await prisma.subscription.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) throw new Error("Not found");
  await prisma.subscription.delete({ where: { id } });
  updateTag(CACHE_TAGS.finance);
}

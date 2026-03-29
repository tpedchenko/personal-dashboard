"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";

// ---------- Types ----------

export type BigPurchaseData = {
  id: number;
  name: string;
  description: string | null;
  estimatedPrice: number | null;
  currency: string;
  url: string | null;
  category: string | null;
  status: string;
  investigateNotes: string | null;
  coolingStartedAt: string | null;
  coolingDays: number;
  confirmedAt: string | null;
  purchasedAt: string | null;
  createdAt: string;
  updatedAt: string;
  coolingEndsAt: string | null;
  coolingComplete: boolean;
};

function toData(r: {
  id: number;
  name: string;
  description: string | null;
  estimatedPrice: number | null;
  currency: string;
  url: string | null;
  category: string | null;
  status: string;
  investigateNotes: string | null;
  coolingStartedAt: Date | null;
  coolingDays: number;
  confirmedAt: Date | null;
  purchasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): BigPurchaseData {
  const coolingEndsAt = r.coolingStartedAt
    ? new Date(r.coolingStartedAt.getTime() + r.coolingDays * 86400000).toISOString()
    : null;
  const coolingComplete = coolingEndsAt ? new Date() >= new Date(coolingEndsAt) : false;

  return {
    id: r.id,
    name: r.name,
    description: r.description,
    estimatedPrice: r.estimatedPrice,
    currency: r.currency,
    url: r.url,
    category: r.category,
    status: r.status,
    investigateNotes: r.investigateNotes,
    coolingStartedAt: r.coolingStartedAt?.toISOString() ?? null,
    coolingDays: r.coolingDays,
    confirmedAt: r.confirmedAt?.toISOString() ?? null,
    purchasedAt: r.purchasedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    coolingEndsAt,
    coolingComplete,
  };
}

// ---------- Read ----------

export async function getBigPurchases(): Promise<BigPurchaseData[]> {
  const user = await requireUser();
  const rows = await prisma.bigPurchase.findMany({
    where: { userId: user.id },
    orderBy: [{ createdAt: "desc" }],
  });
  return rows.map(toData);
}

// ---------- Create ----------

export async function addBigPurchase(data: {
  name: string;
  description?: string;
  estimatedPrice?: number;
  currency?: string;
  url?: string;
  category?: string;
  coolingDays?: number;
}) {
  const user = await requireUser();
  await prisma.bigPurchase.create({
    data: {
      userId: user.id,
      name: data.name,
      description: data.description || null,
      estimatedPrice: data.estimatedPrice ?? null,
      currency: data.currency || "EUR",
      url: data.url || null,
      category: data.category || null,
      status: "investigating",
      coolingDays: data.coolingDays ?? 7,
    },
  });
  updateTag(CACHE_TAGS.finance);
}

// ---------- Update ----------

export async function updateBigPurchase(
  id: number,
  data: {
    name?: string;
    description?: string | null;
    estimatedPrice?: number | null;
    currency?: string;
    url?: string | null;
    category?: string | null;
    investigateNotes?: string | null;
    coolingDays?: number;
  },
) {
  const user = await requireUser();
  const existing = await prisma.bigPurchase.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) throw new Error("Not found");

  await prisma.bigPurchase.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.estimatedPrice !== undefined && { estimatedPrice: data.estimatedPrice }),
      ...(data.currency !== undefined && { currency: data.currency }),
      ...(data.url !== undefined && { url: data.url }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.investigateNotes !== undefined && { investigateNotes: data.investigateNotes }),
      ...(data.coolingDays !== undefined && { coolingDays: data.coolingDays }),
    },
  });
  updateTag(CACHE_TAGS.finance);
}

// ---------- Start Cooling Off ----------

export async function startCoolingOff(id: number) {
  const user = await requireUser();
  const existing = await prisma.bigPurchase.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) throw new Error("Not found");
  if (existing.status !== "investigating") {
    throw new Error("Can only start cooling-off from investigating status");
  }

  await prisma.bigPurchase.update({
    where: { id },
    data: {
      status: "cooling_off",
      coolingStartedAt: new Date(),
    },
  });
  updateTag(CACHE_TAGS.finance);
}

// ---------- Confirm Purchase ----------

export async function confirmPurchase(id: number) {
  const user = await requireUser();
  const existing = await prisma.bigPurchase.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) throw new Error("Not found");
  if (existing.status !== "cooling_off") {
    throw new Error("Can only confirm from cooling_off status");
  }
  if (!existing.coolingStartedAt) {
    throw new Error("Cooling-off not started");
  }

  const coolingEnds = new Date(
    existing.coolingStartedAt.getTime() + existing.coolingDays * 86400000,
  );
  if (new Date() < coolingEnds) {
    throw new Error("Cooling-off period not yet complete");
  }

  await prisma.bigPurchase.update({
    where: { id },
    data: {
      status: "ready",
      confirmedAt: new Date(),
    },
  });
  updateTag(CACHE_TAGS.finance);
}

// ---------- Mark Purchased ----------

export async function markPurchased(id: number) {
  const user = await requireUser();
  const existing = await prisma.bigPurchase.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) throw new Error("Not found");
  if (existing.status !== "ready") {
    throw new Error("Can only mark purchased when status is ready (confirmed)");
  }

  await prisma.bigPurchase.update({
    where: { id },
    data: {
      status: "purchased",
      purchasedAt: new Date(),
    },
  });
  updateTag(CACHE_TAGS.finance);
}

// ---------- Cancel ----------

export async function cancelBigPurchase(id: number) {
  const user = await requireUser();
  const existing = await prisma.bigPurchase.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) throw new Error("Not found");

  await prisma.bigPurchase.update({
    where: { id },
    data: { status: "cancelled" },
  });
  updateTag(CACHE_TAGS.finance);
}

// ---------- Delete ----------

export async function deleteBigPurchase(id: number) {
  const user = await requireUser();
  const existing = await prisma.bigPurchase.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) throw new Error("Not found");
  await prisma.bigPurchase.delete({ where: { id } });
  updateTag(CACHE_TAGS.finance);
}

export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { requireOwner } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { batchUpsertEmbeddings } from "@/lib/embeddings";
import { dateToString } from "@/lib/date-utils";

const BATCH_SIZE = 100;

export async function POST() {
  let user;
  try {
    user = await requireOwner();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalDailyLogs = 0;
  let totalTransactions = 0;

  // Process daily logs with cursor-based pagination
  let dailyLogCursor: number | undefined;
  while (true) {
    const batch = await prisma.dailyLog.findMany({
      where: {
        userId: user.id,
        generalNote: { not: "" },
      },
      select: { id: true, date: true, generalNote: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(dailyLogCursor != null ? { skip: 1, cursor: { id: dailyLogCursor } } : {}),
    });
    if (batch.length === 0) break;
    totalDailyLogs += batch.length;
    dailyLogCursor = batch[batch.length - 1].id;

    const records = batch
      .filter((log) => log.generalNote)
      .map((log) => ({
        sourceTable: "daily_log",
        sourceId: log.id,
        text: `[${dateToString(log.date)}] ${log.generalNote}`,
      }));
    const result = await batchUpsertEmbeddings(user.id, records);
    totalProcessed += result.processed;
    totalSkipped += result.skipped;
  }

  // Process transactions with cursor-based pagination
  let txCursor: number | undefined;
  while (true) {
    const batch = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        description: { not: "" },
      },
      select: { id: true, date: true, description: true, category: true, amountEur: true, type: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(txCursor != null ? { skip: 1, cursor: { id: txCursor } } : {}),
    });
    if (batch.length === 0) break;
    totalTransactions += batch.length;
    txCursor = batch[batch.length - 1].id;

    const records = batch
      .filter((tx) => tx.description)
      .map((tx) => ({
        sourceTable: "transaction",
        sourceId: tx.id,
        text: `[${dateToString(tx.date)}] ${tx.type} ${tx.category}: ${tx.description} (${tx.amountEur} EUR)`,
      }));
    const result = await batchUpsertEmbeddings(user.id, records);
    totalProcessed += result.processed;
    totalSkipped += result.skipped;
  }

  return Response.json({
    dailyLogs: totalDailyLogs,
    transactions: totalTransactions,
    processed: totalProcessed,
    skipped: totalSkipped,
  });
}

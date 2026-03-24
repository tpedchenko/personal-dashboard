export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { requireOwner } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { batchUpsertEmbeddings } from "@/lib/embeddings";
import { dateToString } from "@/lib/date-utils";

const BATCH_SIZE = 50;

export async function POST() {
  let user;
  try {
    user = await requireOwner();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const dailyLogs = await prisma.dailyLog.findMany({
    where: {
      userId: user.id,
      generalNote: { not: "" },
    },
    select: { id: true, date: true, generalNote: true },
  });

  const transactions = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      description: { not: "" },
    },
    select: { id: true, date: true, description: true, category: true, amountEur: true, type: true },
  });

  let totalProcessed = 0;
  let totalSkipped = 0;

  // Process daily logs in batches
  for (let i = 0; i < dailyLogs.length; i += BATCH_SIZE) {
    const batch = dailyLogs.slice(i, i + BATCH_SIZE);
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

  // Process transactions in batches
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
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
    dailyLogs: dailyLogs.length,
    transactions: transactions.length,
    processed: totalProcessed,
    skipped: totalSkipped,
  });
}

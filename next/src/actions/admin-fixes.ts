"use server";

import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/current-user";

// ── Fix non-EUR transactions with missing conversion ──

export async function fixMissingCurrencyConversion(): Promise<{
  found: number;
  fixed: number;
  errors: string[];
}> {
  const owner = await requireOwner();
  const errors: string[] = [];

  // Find transactions where currencyOriginal is not EUR and either:
  // 1. nbuRateEurUsed is null (no conversion attempted), or
  // 2. amountEur ≈ amountOriginal (rate saved but conversion not applied)
  const broken = await prisma.$queryRaw<Array<{
    id: number; date: Date; category: string | null;
    currencyOriginal: string | null; amountOriginal: number | null;
    amountEur: number | null; nbuRateEurUsed: number | null;
  }>>`
    SELECT id, date, category, currency_original as "currencyOriginal",
           amount_original as "amountOriginal", amount_eur as "amountEur",
           nbu_rate_eur_used as "nbuRateEurUsed"
    FROM transactions
    WHERE user_id = ${owner.id}
      AND currency_original IS NOT NULL
      AND currency_original != 'EUR'
      AND amount_original IS NOT NULL
      AND amount_original > 0
      AND (
        nbu_rate_eur_used IS NULL
        OR ABS(amount_eur - amount_original) < 0.01
      )
  `;

  // Collect unique currency codes needed
  const currencyCodes = new Set<string>();
  currencyCodes.add("EUR"); // always needed
  for (const tx of broken) {
    const currency = tx.currencyOriginal ?? "UAH";
    if (currency !== "UAH" && currency !== "EUR") {
      currencyCodes.add(currency);
    }
  }

  // Fetch ALL NBU rates for required currencies in a single query, ordered by date desc
  const allRates = await prisma.nbuRate.findMany({
    where: { currencyCode: { in: Array.from(currencyCodes) } },
    orderBy: { date: "desc" },
    select: { currencyCode: true, date: true, rate: true },
  });

  // Group rates by currency code (already sorted desc by date)
  const ratesByCurrency = new Map<string, Array<{ date: Date; rate: number }>>();
  for (const rate of allRates) {
    let list = ratesByCurrency.get(rate.currencyCode);
    if (!list) {
      list = [];
      ratesByCurrency.set(rate.currencyCode, list);
    }
    list.push({ date: new Date(rate.date), rate: rate.rate });
  }

  // Find the closest rate on or before a given date (rates are sorted desc)
  function findRate(currencyCode: string, txDate: string): number | null {
    const rates = ratesByCurrency.get(currencyCode);
    if (!rates) return null;
    const d = new Date(txDate);
    for (const r of rates) {
      if (r.date <= d) return r.rate;
    }
    return null;
  }

  // Process all transactions in memory and collect updates
  let fixed = 0;
  const updates: Array<{ id: number; amountEur: number; nbuRateEurUsed: number }> = [];

  for (const tx of broken) {
    try {
      const currency = tx.currencyOriginal ?? "UAH";
      const amount = tx.amountOriginal ?? tx.amountEur ?? 0;
      const txDateStr = tx.date instanceof Date ? tx.date.toISOString().slice(0, 10) : String(tx.date);

      if (currency === "UAH") {
        const eurRate = findRate("EUR", txDateStr);
        if (eurRate && eurRate > 0) {
          const amountEur = Math.round((amount / eurRate) * 100) / 100;
          updates.push({ id: tx.id, amountEur, nbuRateEurUsed: eurRate });
          fixed++;
        }
      } else if (currency !== "EUR") {
        const eurRate = findRate("EUR", txDateStr);
        const currRate = findRate(currency, txDateStr);
        if (eurRate && eurRate > 0 && currRate) {
          const amountEur = Math.round(((amount * currRate) / eurRate) * 100) / 100;
          updates.push({ id: tx.id, amountEur, nbuRateEurUsed: eurRate });
          fixed++;
        }
      }
    } catch (err) {
      if (errors.length < 10) {
        errors.push(`TX #${tx.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Batch all updates in a single database transaction
  if (updates.length > 0) {
    try {
      await prisma.$transaction(
        updates.map((u) =>
          prisma.transaction.update({
            where: { id: u.id },
            data: { amountEur: u.amountEur, nbuRateEurUsed: u.nbuRateEurUsed },
          })
        )
      );
    } catch (err) {
      errors.push(`Batch update failed: ${err instanceof Error ? err.message : String(err)}`);
      fixed = 0;
    }
  }

  await prisma.auditLog.create({
    data: {
      userEmail: owner.email,
      action: "fix_currency_conversion",
      details: `Found ${broken.length} broken, fixed ${fixed}`,
    },
  });

  return { found: broken.length, fixed, errors };
}

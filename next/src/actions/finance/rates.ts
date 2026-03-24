"use server";

import { prisma } from "@/lib/db";
import { cached, invalidateCache } from "@/lib/cache";
import { toDateOnly, dateToString } from "@/lib/date-utils";

// ---------- NBU Exchange Rates ----------

export async function getNbuRates(date: string) {
  return cached(
    `nbu-rates:${date}`,
    3600, // 1 hour
    async () => {
      // Find the latest rates on or before the given date for USD and EUR
      const currencies = ["USD", "EUR"];
      const rates: { currencyCode: string; rate: number; date: string }[] = [];

      for (const code of currencies) {
        const rate = await prisma.nbuRate.findFirst({
          where: {
            currencyCode: code,
            date: { lte: toDateOnly(date) },
          },
          orderBy: { date: "desc" },
        });
        if (rate) {
          rates.push({
            currencyCode: rate.currencyCode,
            rate: rate.rate,
            date: dateToString(rate.date),
          });
        }
      }

      return rates;
    },
  );
}

/** Invalidate NBU rate caches (call after sync) */
export async function invalidateNbuRateCache() {
  return invalidateCache("nbu-rates:*");
}

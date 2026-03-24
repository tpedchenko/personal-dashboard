export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { getAccountBalances } from "@/actions/finance/account-balances";
import { getInvestmentsSummary } from "@/actions/brokers-common";

export async function GET() {
  try {
    await requireUser();
    const [balances, portfolio] = await Promise.all([
      getAccountBalances(),
      getInvestmentsSummary().catch(() => null),
    ]);

    const accountsTotal = balances
      .filter((b) => b.currency === "EUR")
      .reduce((s, b) => s + b.balance, 0);
    const portfolioTotal = portfolio?.totalPortfolio ?? 0;
    const capitalEur = Math.round((accountsTotal + portfolioTotal) * 100) / 100;

    return NextResponse.json({
      capitalEur,
      totalPortfolio: portfolio?.totalPortfolio ?? 0,
      totalPnl: portfolio?.totalPnl ?? 0,
      positionsCount: portfolio?.positionsCount ?? 0,
    });
  } catch (e) {
    console.error("[api/capital] Error:", e);
    return NextResponse.json({ capitalEur: null }, { status: 401 });
  }
}

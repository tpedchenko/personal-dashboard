export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { getDeclarationList, getDeclarationXml } from "@/lib/reporting/dps-client";

/**
 * GET /api/reporting/dps/declarations?year=2025&month=3
 * Get list of declarations from DPS.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = req.nextUrl;
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
    const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : undefined;

    const declarations = await getDeclarationList(user.id, year, month);
    return NextResponse.json({ declarations });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch declarations" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/reporting/dps/declarations
 * Get declaration XML by year and docId.
 * Body: { year: number, docId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { year, docId } = await req.json();

    if (!year || !docId) {
      return NextResponse.json({ error: "year and docId are required" }, { status: 400 });
    }

    const xml = await getDeclarationXml(user.id, year, docId);
    return NextResponse.json({ xml });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch declaration XML" },
      { status: 500 },
    );
  }
}

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { periodKeyFromPreset } from "@/lib/ai-insights-prompts";
import { generateInsightsCore } from "@/actions/insights";
import { checkRateLimit, RateLimitError, rateLimitResponse } from "@/lib/rate-limit";

const langNames: Record<string, string> = {
  uk: "Ukrainian",
  en: "English",
  es: "Spanish",
};

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    await checkRateLimit(session.user.email, "/api/insights");
  } catch (e) {
    if (e instanceof RateLimitError) return rateLimitResponse(e);
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return Response.json({ insights: [] });

  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page") || "finance";
  const periodPreset = searchParams.get("period") || undefined;
  const period = periodKeyFromPreset(periodPreset);

  // Try exact period match first
  let insight = await prisma.aiInsight.findFirst({
    where: { userId: user.id, page, period },
  });

  // Fallback: latest for this page
  if (!insight) {
    insight = await prisma.aiInsight.findFirst({
      where: { userId: user.id, page },
      orderBy: { date: "desc" },
    });
  }

  if (insight) {
    try {
      const insights = JSON.parse(insight.insightsJson);
      return Response.json({ insights, insightId: insight.id, generatedAt: insight.createdAt, page, period: insight.period });
    } catch (e) {
      console.error("[api/insights] JSON parse error for page:", page, e);
      return Response.json({ insights: [], generatedAt: insight.createdAt, page, period: insight.period });
    }
  }

  return Response.json({ insights: [], generatedAt: null, page, period });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    await checkRateLimit(session.user.email, "/api/insights");
  } catch (e) {
    if (e instanceof RateLimitError) return rateLimitResponse(e);
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  let page = "finance";
  let periodPreset: string | undefined;
  let bodyLocale: string | undefined;
  try {
    const body = await request.json();
    page = body.page || "finance";
    periodPreset = body.period || undefined;
    bodyLocale = body.locale || undefined;
  } catch {
    // defaults
  }

  // Prefer locale from request body (sent by client), fallback to cookie
  let locale = bodyLocale;
  if (!locale) {
    const cookieStore = await cookies();
    locale = cookieStore.get("locale")?.value || "uk";
  }
  const language = langNames[locale] || "Ukrainian";

  try {
    const result = await generateInsightsCore(page, periodPreset, language, user.id);

    return Response.json({
      insights: result.insights,
      insightId: result.insightId,
      generatedAt: new Date(),
      page,
      period: result.period,
      model: result.model,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to generate insights" },
      { status: 500 }
    );
  }
}

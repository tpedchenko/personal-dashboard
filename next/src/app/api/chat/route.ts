export const dynamic = "force-dynamic";
import { streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getUserContext } from "@/actions/chat-context/index";
import { parseIntent } from "@/lib/chat-intent";
import { buildRagContext, getRagCacheKey } from "@/lib/rag-context";
import { cached } from "@/lib/cache";
import { logError } from "@/lib/error-logger";
import { checkRateLimit, RateLimitError, rateLimitResponse } from "@/lib/rate-limit";
import { z } from "zod";

const ALLOWED_MODELS = ["gemini", "groq", "ollama"] as const;

const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.string(),
    content: z.string().optional(),
    parts: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
  })).min(1, "messages must not be empty"),
  model: z.enum(ALLOWED_MODELS).optional().default("gemini"),
});

async function saveChat(role: string, content: string, email: string) {
  try {
    // Use raw SQL because chat_history has user_id NOT NULL which Prisma schema doesn't model
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.$executeRaw`
        INSERT INTO chat_history (user_id, role, content, user_email)
        VALUES (${user.id}, ${role}, ${content}, ${email})
      `;
    }
  } catch (e) {
    console.error("[Chat] saveChat error:", e);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    await checkRateLimit(session.user.email, "/api/chat");
  } catch (e) {
    if (e instanceof RateLimitError) return rateLimitResponse(e);
    console.warn("[rate-limit] Unexpected error in /api/chat, allowing request:", e);
  }

  const body = await req.json();
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.issues[0]?.message || "Invalid request" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const { messages: rawMessages, model: modelName } = parsed.data;

  // Convert UIMessage format to CoreMessage format for streamText
  const messages = rawMessages.map((m) => {
    const text = typeof m.content === "string" ? m.content
      : Array.isArray(m.parts) ? m.parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("") : "";
    return { role: m.role as "user" | "assistant", content: text };
  }).filter((m) => m.content);

  // Get API keys from secrets table (filtered by user, decrypted)
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });

  let geminiKeyValue: string | null = null;
  let groqKeyValue: string | null = null;
  if (user) {
    const { getSecretValue } = await import("@/actions/settings");
    [geminiKeyValue, groqKeyValue] = await Promise.all([
      getSecretValue(user.id, "gemini_api_key"),
      getSecretValue(user.id, "groq_api_key"),
    ]);
  }

  let modelInstance;
  if (modelName === "ollama") {
    const ollama = createOpenAI({
      baseURL: process.env.OLLAMA_BASE_URL || "http://ollama:11434/v1",
      apiKey: "ollama",
    });
    // Qwen2.5 14B — better reasoning than fine-tuned 8B, RAG-first approach
    modelInstance = ollama("qwen2.5:14b-instruct-q4_K_M");
  } else if (modelName === "groq" && groqKeyValue) {
    const groq = createGroq({ apiKey: groqKeyValue });
    modelInstance = groq("llama-3.3-70b-versatile");
  } else if (geminiKeyValue) {
    const googleAI = createGoogleGenerativeAI({ apiKey: geminiKeyValue });
    modelInstance = googleAI("gemini-2.5-flash");
  } else {
    return new Response("No AI provider configured", { status: 400 });
  }

  // Save user message to history
  const lastUserMessage = messages[messages.length - 1];
  if (lastUserMessage?.role === "user" && lastUserMessage.content) {
    await saveChat("user", lastUserMessage.content, session.user.email);
  }

  // Fetch user data context for the AI (RAG: intent-aware)
  let userContext = "";
  try {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === "user" && lastMsg.content && user) {
      const intent = parseIntent(lastMsg.content);
      console.log(`[Chat] RAG intent: domains=${intent.domains.join(",")}, type=${intent.questionType}, range=${JSON.stringify(intent.timeRange)}`);
      const cacheKey = getRagCacheKey(intent, user.id);
      userContext = await cached(cacheKey, 300, () => buildRagContext(intent, user.id, lastMsg.content));
    }
    if (!userContext) {
      userContext = await getUserContext();
    }
  } catch (e) {
    console.error("[Chat] RAG context error, falling back to getUserContext:", e);
    logError(session.user.email, "api/chat/ragContext", e);
    try {
      userContext = await getUserContext();
    } catch { /* ignore */ }
  }

  const systemPrompt = [
    "You are a helpful personal assistant for a personal dashboard app.",
    "You have access to the user's recent health, finance, and lifestyle data.",
    "Use this data to provide personalized, actionable insights when relevant.",
    "Be concise and friendly. Answer in the same language the user writes in.",
    "When the user asks about a specific finance category, you can append a filter command at the end of your response: /filter category=CategoryName",
    "This will automatically apply a filter in the Finance tab. Only use this when the user clearly asks about a specific category.",
    userContext,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    console.log(`[Chat] Starting stream with model=${modelName}, messages=${messages.length}`);
    const result = streamText({
      model: modelInstance,
      system: systemPrompt,
      messages,
      onError: async ({ error }) => {
        console.error("[Chat] Mid-stream error:", error);
        await logError(session.user.email, "api/chat/streamError", error);
      },
      onFinish: async ({ text }) => {
        try {
          if (text) {
            await saveChat("assistant", text, session.user.email);
          }
        } catch (e) {
          console.error("[Chat] onFinish error:", e);
          await logError(session.user.email, "api/chat/onFinish", e);
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (e) {
    console.error("[Chat] streamText error:", e);
    await logError(session.user.email, "api/chat/streamText", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Chat failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

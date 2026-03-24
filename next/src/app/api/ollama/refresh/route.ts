export const dynamic = "force-dynamic";
import { auth } from "@/lib/auth";

/**
 * Ollama model warmup endpoint.
 * Warms up the Qwen2.5 14B model to reduce first-request latency.
 * RAG context is injected per-request in the chat route (via chat-intent + rag-context).
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }

  const baseURL = process.env.OLLAMA_BASE_URL || "http://ollama:11434/v1";
  const ollamaHost = baseURL.replace(/\/v1$/, "");

  try {
    // Warm up pd-assistant model (load into memory without generating)
    const res = await fetch(`${ollamaHost}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5:14b-instruct-q4_K_M",
        prompt: "",
        keep_alive: "10m",
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const text = await res.text();
      return Response.json({ error: text }, { status: 500 });
    }

    await res.text();
    return Response.json({ status: "ok", message: "qwen2.5:14b warmed up (RAG-first, no fine-tuning needed)" });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Warmup failed" },
      { status: 500 }
    );
  }
}

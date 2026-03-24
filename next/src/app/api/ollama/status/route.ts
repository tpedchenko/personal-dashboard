export const dynamic = "force-dynamic";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }

  const baseURL = process.env.OLLAMA_BASE_URL || "http://ollama:11434/v1";
  const ollamaHost = baseURL.replace(/\/v1$/, "");

  try {
    const res = await fetch(`${ollamaHost}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return Response.json({ status: "error", message: "Ollama returned " + res.status });
    }
    const data = await res.json();
    const models = (data.models || []).map((m: { name: string; size: number }) => ({
      name: m.name,
      size: m.size,
    }));
    return Response.json({ status: "online", models });
  } catch {
    return Response.json({ status: "offline", models: [] });
  }
}

/**
 * Semantic search via pgvector embeddings.
 *
 * Embedding generation uses Ollama nomic-embed-text (384 dimensions) on Mini.
 * Falls back gracefully when the model is unavailable — operations become no-ops
 * so the rest of the app continues to work.
 */

import { prisma } from "@/lib/db";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://ollama:11434";
const EMBEDDING_MODEL = "nomic-embed-text";
const EMBEDDING_DIMS = 384;

/** Check if the embedding model is available in Ollama. Cached per process. */
let modelAvailable: boolean | null = null;

async function isModelAvailable(): Promise<boolean> {
  if (modelAvailable !== null) return modelAvailable;

  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      modelAvailable = false;
      return false;
    }
    const data = (await res.json()) as { models?: { name: string }[] };
    modelAvailable = data.models?.some((m) => m.name.startsWith(EMBEDDING_MODEL)) ?? false;
    if (!modelAvailable) {
      console.warn(`[embeddings] Model ${EMBEDDING_MODEL} not found in Ollama. Pull it with: docker exec ollama ollama pull ${EMBEDDING_MODEL}`);
    }
    return modelAvailable;
  } catch {
    modelAvailable = false;
    return false;
  }
}

/**
 * Generate a 384-dimensional embedding vector for the given text
 * using Ollama's nomic-embed-text model.
 * Returns null if the model is unavailable.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!(await isModelAvailable())) return null;

  try {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 2048), // nomic-embed-text max context ~2048 tokens
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(`[embeddings] Ollama returned ${res.status}: ${await res.text()}`);
      return null;
    }

    const data = (await res.json()) as { embeddings?: number[][] };
    const vec = data.embeddings?.[0];
    if (!vec || vec.length !== EMBEDDING_DIMS) {
      console.error(`[embeddings] Unexpected embedding dimensions: ${vec?.length}`);
      return null;
    }

    return vec;
  } catch (err) {
    console.error("[embeddings] Failed to generate embedding:", err);
    return null;
  }
}

/**
 * Format a vector as a PostgreSQL vector literal: '[0.1,0.2,...]'
 */
function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/**
 * Search for semantically similar records using cosine similarity.
 * Returns results ordered by similarity (highest first).
 */
export async function searchSimilar(
  userId: number,
  query: string,
  limit = 5,
): Promise<{ sourceTable: string; sourceId: number; text: string; similarity: number }[]> {
  const queryVec = await generateEmbedding(query);
  if (!queryVec) return [];

  try {
    const vecLiteral = toVectorLiteral(queryVec);
    const results = await prisma.$queryRawUnsafe<
      { source_table: string; source_id: number; text: string; similarity: number }[]
    >(
      `SELECT source_table, source_id, text,
              1 - (embedding <=> $1::vector) AS similarity
       FROM embeddings
       WHERE user_id = $2
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      vecLiteral,
      userId,
      limit,
    );

    return results.map((r) => ({
      sourceTable: r.source_table,
      sourceId: r.source_id,
      text: r.text,
      similarity: r.similarity,
    }));
  } catch (err) {
    console.error("[embeddings] Search failed:", err);
    return [];
  }
}

/**
 * Generate an embedding for the given text and store it (upsert).
 * No-op if the embedding model is unavailable.
 */
export async function upsertEmbedding(
  userId: number,
  sourceTable: string,
  sourceId: number,
  text: string,
): Promise<void> {
  const vec = await generateEmbedding(text);
  if (!vec) return;

  try {
    const vecLiteral = toVectorLiteral(vec);
    await prisma.$executeRawUnsafe(
      `INSERT INTO embeddings (user_id, source_table, source_id, text, embedding, created_at)
       VALUES ($1, $2, $3, $4, $5::vector, NOW())
       ON CONFLICT (source_table, source_id)
       DO UPDATE SET text = $4, embedding = $5::vector, created_at = NOW()`,
      userId,
      sourceTable,
      sourceId,
      text,
      vecLiteral,
    );
  } catch (err) {
    console.error("[embeddings] Upsert failed:", err);
  }
}

/**
 * Batch-embed multiple records. Useful for initial backfill.
 * Processes sequentially to avoid overloading Ollama.
 */
export async function batchUpsertEmbeddings(
  userId: number,
  records: { sourceTable: string; sourceId: number; text: string }[],
): Promise<{ processed: number; skipped: number }> {
  let processed = 0;
  let skipped = 0;

  for (const record of records) {
    if (!record.text || record.text.trim().length < 3) {
      skipped++;
      continue;
    }
    await upsertEmbedding(userId, record.sourceTable, record.sourceId, record.text);
    processed++;
  }

  return { processed, skipped };
}

/**
 * Reset model availability cache — useful after pulling a new model.
 */
export function resetModelCache(): void {
  modelAvailable = null;
}

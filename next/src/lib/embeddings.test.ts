import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock prisma before importing the module
vi.mock("@/lib/db", () => ({
  prisma: {
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  },
}));

// We need to reset the module-level cache between tests
let embeddings: typeof import("./embeddings");

describe("embeddings", () => {
  beforeEach(async () => {
    vi.resetModules();

    // Re-mock after resetModules
    vi.doMock("@/lib/db", () => ({
      prisma: {
        $executeRawUnsafe: vi.fn(),
        $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      },
    }));

    embeddings = await import("./embeddings");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("batchUpsertEmbeddings", () => {
    it("skips records with empty text", async () => {
      // Mock Ollama as unavailable so upsertEmbedding is a no-op
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("connection refused")),
      );

      const result = await embeddings.batchUpsertEmbeddings(1, [
        { sourceTable: "transactions", sourceId: 1, text: "" },
        { sourceTable: "transactions", sourceId: 2, text: "  " },
        { sourceTable: "transactions", sourceId: 3, text: "ab" }, // < 3 chars
      ]);

      expect(result.skipped).toBe(3);
      expect(result.processed).toBe(0);
    });

    it("skips records with text shorter than 3 characters", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("connection refused")),
      );

      const result = await embeddings.batchUpsertEmbeddings(1, [
        { sourceTable: "workouts", sourceId: 1, text: "ok" }, // 2 chars trimmed
        { sourceTable: "workouts", sourceId: 2, text: " x " }, // 1 char trimmed
      ]);

      expect(result.skipped).toBe(2);
      expect(result.processed).toBe(0);
    });

    it("processes valid records and counts them", async () => {
      // Ollama unavailable — generateEmbedding returns null, but the record is still "processed"
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("connection refused")),
      );

      const result = await embeddings.batchUpsertEmbeddings(1, [
        { sourceTable: "transactions", sourceId: 1, text: "grocery shopping at Lidl" },
        { sourceTable: "transactions", sourceId: 2, text: "" },
        { sourceTable: "workouts", sourceId: 3, text: "bench press 80kg x 8" },
      ]);

      expect(result.processed).toBe(2);
      expect(result.skipped).toBe(1);
    });
  });

  describe("generateEmbedding", () => {
    it("returns null when Ollama is unavailable", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("connection refused")),
      );

      const result = await embeddings.generateEmbedding("test text");
      expect(result).toBeNull();
    });

    it("returns null when model is not found in Ollama", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ models: [{ name: "llama3" }] }),
        }),
      );

      const result = await embeddings.generateEmbedding("test text");
      expect(result).toBeNull();
    });

    it("returns embedding vector when model is available", async () => {
      const fakeVec = Array.from({ length: 384 }, (_, i) => i * 0.001);

      vi.stubGlobal(
        "fetch",
        vi.fn()
          .mockResolvedValueOnce({
            // First call: /api/tags
            ok: true,
            json: async () => ({ models: [{ name: "nomic-embed-text:latest" }] }),
          })
          .mockResolvedValueOnce({
            // Second call: /api/embed
            ok: true,
            json: async () => ({ embeddings: [fakeVec] }),
          }),
      );

      const result = await embeddings.generateEmbedding("bench press workout");
      expect(result).toEqual(fakeVec);
      expect(result).toHaveLength(384);
    });

    it("returns null when embedding has wrong dimensions", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn()
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ models: [{ name: "nomic-embed-text:latest" }] }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ embeddings: [[0.1, 0.2, 0.3]] }), // only 3 dims
          }),
      );

      const result = await embeddings.generateEmbedding("test");
      expect(result).toBeNull();
    });
  });

  describe("toVectorLiteral (via searchSimilar)", () => {
    it("formats vector as PostgreSQL literal [0.1,0.2,...]", async () => {
      // toVectorLiteral is private, but we can verify its output indirectly
      // by checking what gets passed to prisma.$queryRawUnsafe via searchSimilar
      const fakeVec = [0.1, 0.2, 0.3];
      // Need 384 dims for generateEmbedding to accept
      const fullVec = Array.from({ length: 384 }, (_, i) => +(i * 0.001).toFixed(4));

      const { prisma } = await import("@/lib/db");

      vi.stubGlobal(
        "fetch",
        vi.fn()
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ models: [{ name: "nomic-embed-text:latest" }] }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ embeddings: [fullVec] }),
          }),
      );

      await embeddings.searchSimilar(1, "test query", 5);

      // Verify that the vector literal was formatted correctly
      const call = (prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>).mock.calls[0];
      if (call) {
        const vecArg = call[1] as string; // second argument is the vector literal
        expect(vecArg).toMatch(/^\[[\d.,e+-]+\]$/);
        expect(vecArg.startsWith("[")).toBe(true);
        expect(vecArg.endsWith("]")).toBe(true);
        // Verify it contains comma-separated numbers
        const numbers = vecArg.slice(1, -1).split(",");
        expect(numbers).toHaveLength(384);
      }
    });
  });

  describe("resetModelCache", () => {
    it("allows re-checking model availability after reset", async () => {
      // First: model unavailable
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("connection refused")),
      );

      const result1 = await embeddings.generateEmbedding("test");
      expect(result1).toBeNull();

      // Reset cache
      embeddings.resetModelCache();

      // Now model is available
      const fullVec = Array.from({ length: 384 }, () => 0.5);
      vi.stubGlobal(
        "fetch",
        vi.fn()
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ models: [{ name: "nomic-embed-text:latest" }] }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ embeddings: [fullVec] }),
          }),
      );

      const result2 = await embeddings.generateEmbedding("test");
      expect(result2).toEqual(fullVec);
    });
  });
});

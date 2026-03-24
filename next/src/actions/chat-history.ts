"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import type { UIMessage } from "ai";

export async function getChatHistory(limit = 50): Promise<UIMessage[]> {
  const user = await requireUser();

  const rows = await prisma.chatHistory.findMany({
    where: { userEmail: user.email },
    orderBy: { id: "asc" },
    take: limit,
  });

  return rows.map((m) => ({
    id: String(m.id),
    role: m.role as "user" | "assistant",
    content: m.content,
    parts: [{ type: "text" as const, text: m.content }],
  }));
}

export async function clearChatHistory() {
  const user = await requireUser();

  await prisma.chatHistory.deleteMany({
    where: { userEmail: user.email },
  });
}

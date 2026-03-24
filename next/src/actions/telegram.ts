"use server";

import { prisma } from "@/lib/db";
import { requireUser, requireOwner, requireNonDemoUser } from "@/lib/current-user";

// ── User: save/get/remove Telegram Chat ID ──

/**
 * Save user's Telegram Chat ID by creating/updating a telegram_links record.
 * The chatId is stored as telegramId (integer).
 */
export async function saveTelegramChatId(chatId: string) {
  await requireNonDemoUser();
  const user = await requireUser();
  const telegramId = parseInt(chatId, 10);
  if (isNaN(telegramId)) throw new Error("Invalid Chat ID");

  await prisma.telegramLink.upsert({
    where: { telegramId },
    update: { userEmail: user.email },
    create: {
      telegramId,
      userEmail: user.email,
      telegramUsername: "",
    },
  });

  await prisma.auditLog.create({
    data: {
      userEmail: user.email,
      action: "telegram_link_chatid",
      details: `Linked Telegram Chat ID ${telegramId}`,
    },
  });
}

/**
 * Get user's Telegram Chat ID from telegram_links table.
 */
export async function getTelegramChatId(): Promise<string | null> {
  const user = await requireUser();
  const link = await prisma.telegramLink.findFirst({
    where: { userEmail: user.email },
  });
  return link ? String(link.telegramId) : null;
}

/**
 * Remove user's Telegram link.
 */
export async function removeTelegramChatId() {
  const user = await requireUser();
  await prisma.telegramLink.deleteMany({
    where: { userEmail: user.email },
  });
}

// ── Admin: Bot Token management ──

/**
 * Get admin bot token status (not the actual token value, just whether it's set).
 */
export async function getAdminBotTokenStatus(): Promise<{ isSet: boolean; maskedToken: string | null }> {
  const owner = await requireOwner();
  const secret = await prisma.secret.findUnique({
    where: { userId_key: { userId: owner.id, key: "telegram_bot_token_admin" } },
  });
  if (!secret?.value) return { isSet: false, maskedToken: null };

  // Decrypt to get actual value for masking
  try {
    const { decryptGraceful } = await import("@/lib/encryption");
    const token = decryptGraceful(secret.value);
    if (!token) return { isSet: false, maskedToken: null };
    // Show first 8 and last 4 chars
    const masked = token.length > 12
      ? token.slice(0, 8) + "..." + token.slice(-4)
      : "***";
    return { isSet: true, maskedToken: masked };
  } catch (e) {
    console.error("[telegram/getAdminBotTokenStatus] Decryption error:", e);
    return { isSet: true, maskedToken: "***" };
  }
}

/**
 * Save admin bot token.
 */
export async function setAdminBotToken(token: string) {
  const owner = await requireOwner();

  let storedValue = token;
  try {
    const { encrypt } = await import("@/lib/encryption");
    storedValue = encrypt(token);
  } catch (err) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Encryption failed: ${err}`);
    }
  }

  await prisma.secret.upsert({
    where: { userId_key: { userId: owner.id, key: "telegram_bot_token_admin" } },
    update: { value: storedValue },
    create: { key: "telegram_bot_token_admin", value: storedValue, userId: owner.id },
  });

  await prisma.auditLog.create({
    data: {
      userEmail: owner.email,
      action: "set_telegram_bot_token",
      details: "Bot token updated",
    },
  });
}

/**
 * Test bot token by calling getMe endpoint.
 */
export async function testBotToken(token: string): Promise<{ ok: boolean; botName?: string; error?: string }> {
  await requireOwner();
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    if (data.ok) {
      return { ok: true, botName: `@${data.result.username} (${data.result.first_name})` };
    }
    return { ok: false, error: data.description || "Connection failed" };
  } catch (e) {
    console.error("[telegram/testBotToken] Network error:", e);
    return { ok: false, error: "Network error" };
  }
}

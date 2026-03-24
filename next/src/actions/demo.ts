"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  createDemoToken,
  verifyDemoToken,
  DEMO_COOKIE,
  DEMO_TTL_SECONDS,
} from "@/lib/demo-token";

const DEMO_EMAIL = "demo@example.com";

export async function enterDemoMode() {
  // Ensure demo user exists
  const existing = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
  });
  if (!existing) {
    await prisma.user.create({
      data: {
        email: DEMO_EMAIL,
        name: "Demo User",
        role: "user",
      },
    });
  }

  const token = await createDemoToken();

  const cookieStore = await cookies();
  cookieStore.set(DEMO_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: DEMO_TTL_SECONDS,
  });

  redirect("/finance");
}

export async function exitDemoMode() {
  const cookieStore = await cookies();
  cookieStore.delete(DEMO_COOKIE);
  redirect("/login");
}

export async function isDemoMode(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(DEMO_COOKIE)?.value;
  return verifyDemoToken(token);
}

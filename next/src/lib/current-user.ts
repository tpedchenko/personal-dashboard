import { auth } from "./auth";
import { prisma } from "./db";
import { cookies } from "next/headers";
import { verifyDemoToken, DEMO_COOKIE } from "./demo-token";

const DEMO_EMAIL = "demo@example.com";

// In-memory user cache (short TTL to reduce DB queries on dashboard load)
const USER_CACHE_TTL_MS = 30_000; // 30 seconds
const userCache = new Map<string, { user: NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>; expiresAt: number }>();

export async function getCurrentUser() {
  // Check demo mode first
  const cookieStore = await cookies();
  const demoToken = cookieStore.get(DEMO_COOKIE)?.value;
  const isDemo = await verifyDemoToken(demoToken);

  if (isDemo) {
    const cachedDemo = userCache.get(DEMO_EMAIL);
    if (cachedDemo && cachedDemo.expiresAt > Date.now()) {
      return cachedDemo.user;
    }

    let user = await prisma.user.findUnique({
      where: { email: DEMO_EMAIL },
    });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: DEMO_EMAIL,
          name: "Demo User",
          role: "user",
        },
      });
    }
    userCache.set(DEMO_EMAIL, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
    return user;
  }

  const session = await auth();
  if (!session?.user?.email) return null;

  const email = session.user.email;
  const cached = userCache.get(email);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (user) {
    userCache.set(email, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
  }

  return user;
}

/** Get current user ID without throwing. Returns null if not authenticated. */
export async function getCurrentUserId(): Promise<number | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function requireOwner() {
  const user = await requireUser();
  if (user.role !== "owner") throw new Error("Forbidden");
  return user;
}

export async function requireNonDemoUser() {
  const isDemo = await isCurrentUserDemo();
  if (isDemo) throw new Error("This action is not available in demo mode");
}

export async function isCurrentUserDemo(): Promise<boolean> {
  const cookieStore = await cookies();
  const demoToken = cookieStore.get(DEMO_COOKIE)?.value;
  return verifyDemoToken(demoToken);
}

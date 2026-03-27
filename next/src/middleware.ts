import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { verifyDemoToken, DEMO_COOKIE } from "@/lib/demo-token";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public routes (no auth required)
  const publicPaths = ["/login", "/about", "/api/auth", "/api/health", "/api/sync/withings", "/api/sync/monobank/webhook", "/api/garmin-mfa"];
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));

  if (isPublic) return NextResponse.next();

  // Allow static assets from public/
  if (/\.(png|jpg|jpeg|svg|ico|webp|gif|webmanifest)$/i.test(pathname)) {
    return NextResponse.next();
  }

  // Demo mode: allow access only if the signed demo token is valid
  const demoToken = req.cookies.get(DEMO_COOKIE)?.value;
  if (demoToken && (await verifyDemoToken(demoToken))) {
    return NextResponse.next();
  }

  // Verify JWT session token (checks signature + expiry, not just cookie existence)
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    secureCookie: process.env.NEXTAUTH_URL?.startsWith("https://"),
  });

  if (!token?.email) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js|serwist).*)"],
};

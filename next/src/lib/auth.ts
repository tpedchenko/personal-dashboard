import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "./db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      checks: ["pkce", "state"],
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      // Check if any users exist (first user becomes owner)
      // Use serializable transaction to prevent race condition where
      // two concurrent requests both see count === 0 and create two owners
      const created = await prisma.$transaction(async (tx) => {
        const userCount = await tx.user.count();
        if (userCount === 0) {
          await tx.user.create({
            data: {
              email: user.email!,
              name: user.name || user.email || "",
              role: "owner",
            },
          });
          return true;
        }
        return false;
      }, { isolationLevel: "Serializable" });
      if (created) return true;

      // Check if user is authorized
      const dbUser = await prisma.user.findUnique({
        where: { email: user.email },
      });

      if (!dbUser) {
        // Check guest invites
        const invite = await prisma.guestInvite.findUnique({
          where: { email: user.email },
        });
        if (invite) {
          await prisma.user.create({
            data: {
              email: user.email,
              name: user.name || user.email,
              role: "guest",
            },
          });
          return true;
        }
        return false;
      }

      return true;
    },
    async session({ session }) {
      if (session.user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: session.user.email },
        });
        if (dbUser) {
          (session.user as unknown as Record<string, unknown>).role = dbUser.role;
        }
      }
      return session;
    },
  },
});

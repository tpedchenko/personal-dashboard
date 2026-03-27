import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "./db";

const oauthProviders = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    checks: ["pkce", "state"],
  }),
  ...((process.env.GITHUB_CLIENT_ID || process.env.GITHUB_ID) && (process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_SECRET)
    ? [
        GitHub({
          clientId: (process.env.GITHUB_CLIENT_ID || process.env.GITHUB_ID)!,
          clientSecret: (process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_SECRET)!,
        }),
      ]
    : []),
];

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    ...oauthProviders,
    // Credentials provider used only for passkey authentication flow
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) return null;

        // Passkey flow: password starts with __magic_link__passkey_
        if (!password.startsWith("__magic_link__")) return null;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
        });
        if (!user) return null;
        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;

      // Credentials provider: user already validated in authorize()
      if (account?.provider === "credentials") return true;

      // OAuth providers (Google, GitHub): original logic
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
        // Check free spots limit (max 10 users)
        const MAX_FREE_USERS = 10;
        const currentCount = await prisma.user.count({
          where: { email: { not: "demo@example.com" } },
        });
        if (currentCount >= MAX_FREE_USERS) {
          return false; // No free spots remaining
        }

        // Check if user has a guest invite (gets guest role)
        const invite = await prisma.guestInvite.findUnique({
          where: { email: user.email },
        });

        // Open registration: create user with "user" role (or "guest" if invited)
        await prisma.user.create({
          data: {
            email: user.email,
            name: user.name || user.email,
            role: invite ? "guest" : "user",
          },
        });
        return true;
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

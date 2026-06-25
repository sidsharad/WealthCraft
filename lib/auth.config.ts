import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";

const hasRealDb =
  !!process.env.DATABASE_URL &&
  !process.env.DATABASE_URL.includes("your-") &&
  !process.env.DATABASE_URL.includes("password@your");

const hasGoogleOAuth =
  !!process.env.AUTH_GOOGLE_ID &&
  !process.env.AUTH_GOOGLE_ID.includes("your-") &&
  !!process.env.AUTH_GOOGLE_SECRET &&
  !process.env.AUTH_GOOGLE_SECRET.includes("your-");

const providers: NextAuthConfig["providers"] = [];

if (hasGoogleOAuth) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    })
  );
}

providers.push(
  Credentials({
    name: "Email & Password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!hasRealDb) return null;
      if (!credentials?.email || !credentials?.password) return null;

      // Dynamic import to avoid loading DB logic if not needed, 
      // although lib/db/index.ts is already guarded.
      const { getUserByEmail } = await import("./db/queries");
      const { default: bcrypt } = await import("bcryptjs");

      const user = await getUserByEmail(credentials.email as string);
      if (!user || !user.passwordHash) return null;
      const valid = await bcrypt.compare(
        credentials.password as string,
        user.passwordHash
      );
      if (!valid) return null;
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.avatarUrl,
      };
    },
  })
);

import { cleanupExpiredRooms } from "./db/cleanup";

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (Math.random() < 0.01) {
        cleanupExpiredRooms().catch(console.error);
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};

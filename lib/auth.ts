import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

const hasRealDb =
  !!process.env.DATABASE_URL &&
  !process.env.DATABASE_URL.includes("your-") &&
  !process.env.DATABASE_URL.includes("password@your");

const config = { ...authConfig };

if (hasRealDb) {
  const { DrizzleAdapter } = require("@auth/drizzle-adapter");
  const { db } = require("./db");
  const { users, accounts, sessions, verificationTokens } = require("./db/schema");

  const adapter = DrizzleAdapter(db, {
    usersTable: users as any,
    accountsTable: accounts as any,
    sessionsTable: sessions as any,
    verificationTokensTable: verificationTokens as any,
  });

  const originalCreateUser = adapter.createUser;
  adapter.createUser = async (data: any) => {
    const { image, emailVerified, ...rest } = data;
    const insertedUser = await originalCreateUser({ ...rest, avatarUrl: image });
    return { ...insertedUser, image: insertedUser.avatarUrl };
  };

  config.adapter = adapter;
}

export const { handlers, auth, signIn, signOut } = NextAuth(config);

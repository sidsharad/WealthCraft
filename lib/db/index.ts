import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const dbUrl = (process.env.DATABASE_URL ?? "").trim();
const isRealDb =
  dbUrl.length > 0 &&
  !dbUrl.includes("your-") &&
  !dbUrl.includes("password@your");

// Only create a real connection when DATABASE_URL is properly configured.
// This prevents the module from crashing during local-only / pass-and-play use.
const sql = isRealDb
  ? neon(dbUrl)
  : (() => { throw new Error("DATABASE_URL is not configured"); }) as never;

export const db = isRealDb
  ? drizzle(sql, { schema })
  : (null as unknown as ReturnType<typeof drizzle>);

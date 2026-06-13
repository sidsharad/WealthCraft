import { db } from "./lib/db";
import { sql } from "drizzle-orm";

async function verify() {
  const res = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
  console.log(JSON.stringify(res.rows.map((r: any) => r.table_name)));
  process.exit(0);
}

verify();

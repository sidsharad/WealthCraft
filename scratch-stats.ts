import { db } from "./lib/db";
import { sql } from "drizzle-orm";

async function checkPgStats() {
  try {
    const result = await db.execute(sql`
      SELECT query, calls, rows, total_exec_time 
      FROM pg_stat_statements 
      ORDER BY calls DESC 
      LIMIT 10;
    `);
    console.log(JSON.stringify(result.rows || result, null, 2));
  } catch (e: any) {
    console.error("pg_stat_statements error:", e.message);
  }
  process.exit(0);
}

checkPgStats();

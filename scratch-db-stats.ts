import { db } from "./lib/db";
import { sql } from "drizzle-orm";

async function investigate() {
  try {
    // Attempt to query pg_stat_statements to see which exact SQL query is taking all the bytes
    const result = await db.execute(sql`
      SELECT 
        query, 
        calls, 
        total_exec_time, 
        rows, 
        shared_blks_hit, 
        shared_blks_read
      FROM pg_stat_statements
      ORDER BY calls DESC
      LIMIT 10;
    `);
    
    console.log(JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error("Failed to query pg_stat_statements:", error.message);
  }
  process.exit(0);
}

investigate();

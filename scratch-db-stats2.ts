import { db } from "./lib/db";
import { sql } from "drizzle-orm";

async function investigate() {
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_stat_statements;`);
    
    // Wait a second for stats to be readable
    await new Promise(r => setTimeout(r, 1000));
    
    const result = await db.execute(sql`
      SELECT 
        query, 
        calls, 
        total_exec_time, 
        rows
      FROM pg_stat_statements
      ORDER BY calls DESC
      LIMIT 10;
    `);
    
    console.log(JSON.stringify(result.rows, null, 2));
  } catch (error: any) {
    console.error("Failed to query pg_stat_statements:", error.message);
  }
  process.exit(0);
}

investigate();

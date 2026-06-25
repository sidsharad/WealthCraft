import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "./lib/db";
import { sql } from "drizzle-orm";

async function runDiagnostics() {
  try {
    console.log("--- NEON DB DIAGNOSTICS ---");

    // 1. Active Connections
    console.log("\n1. Active Connections (pg_stat_activity):");
    const activityResult = await db.execute(sql`
      SELECT 
        pid, 
        usename, 
        application_name, 
        client_addr, 
        state, 
        query_start, 
        state_change, 
        wait_event_type, 
        wait_event,
        query
      FROM pg_stat_activity
      WHERE datname = current_database();
    `);
    console.table(activityResult.rows);

    // 2. Database Stats (tuples read, hits, etc)
    console.log("\n2. Database Stats (pg_stat_database):");
    const dbStatsResult = await db.execute(sql`
      SELECT 
        datname, 
        numbackends, 
        xact_commit, 
        xact_rollback, 
        blks_read, 
        blks_hit, 
        tup_returned, 
        tup_fetched, 
        tup_inserted, 
        tup_updated, 
        tup_deleted
      FROM pg_stat_database
      WHERE datname = current_database();
    `);
    console.table(dbStatsResult.rows);

    // 3. Try to get pg_stat_statements
    console.log("\n3. Query Statistics (pg_stat_statements):");
    try {
      const statsResult = await db.execute(sql`
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
      if (statsResult.rows.length === 0) {
        console.log("pg_stat_statements returned 0 rows.");
      } else {
        console.table(statsResult.rows);
      }
    } catch (e: any) {
      console.log("pg_stat_statements error:", e.message);
    }

  } catch (error: any) {
    console.error("Diagnostic script failed:", error.message);
  }
  process.exit(0);
}

runDiagnostics();

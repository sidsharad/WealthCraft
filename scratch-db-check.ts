import { db } from "./lib/db";
import { sql } from "drizzle-orm";

async function check() {
  const dbName = await db.execute(sql`SELECT current_database();`);
  console.log("Current DB:", dbName.rows);
  
  const allDbs = await db.execute(sql`SELECT datname FROM pg_database;`);
  console.log("All DBs:", allDbs.rows);

  const allActivity = await db.execute(sql`SELECT pid, datname, usename, state FROM pg_stat_activity;`);
  console.log("All Activity:", allActivity.rows);

  process.exit(0);
}

check();

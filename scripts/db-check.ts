import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("--- Step 1: Verify Database Migration Exists ---");
  const columnCheck = await db.execute(sql`
    SELECT column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'rooms' AND column_name = 'game_version';
  `);
  console.log("Migration check:", columnCheck.rows);

  if (columnCheck.rows.length === 0) {
    console.log("Migration missing. Applying ALTER TABLE...");
    await db.execute(sql`ALTER TABLE rooms ADD COLUMN game_version INTEGER NOT NULL DEFAULT 1;`);
    console.log("Migration applied.");
  } else {
    console.log("Migration already exists.");
  }

  console.log("\n--- Step 2: Verify Existing Rows ---");
  const rowCheck = await db.execute(sql`
    SELECT id, game_version 
    FROM rooms 
    LIMIT 10;
  `);
  console.log("Sample rows:", rowCheck.rows);

  const nullCheck = await db.execute(sql`
    SELECT COUNT(*) 
    FROM rooms 
    WHERE game_version IS NULL;
  `);
  console.log("Null game_version rows:", nullCheck.rows);

  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});

import { db } from './lib/db';
import { sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  try {
    const res1 = await db.execute(sql`SELECT COUNT(*) FROM rooms`);
    console.log("1. COUNT(*):", JSON.stringify(res1));

    const res2 = await db.execute(sql`SELECT status, COUNT(*) FROM rooms GROUP BY status`);
    console.log("2. STATUS COUNT:", JSON.stringify(res2));

    const res3 = await db.execute(sql`SELECT COUNT(*) FROM game_results`);
    console.log("3. GAME RESULTS COUNT:", JSON.stringify(res3));

    const res4 = await db.execute(sql`SELECT code, status, updated_at FROM rooms ORDER BY updated_at DESC LIMIT 10`);
    console.log("4. TOP 10 ROOMS:", JSON.stringify(res4));
  } catch (err) {
    console.error(err);
  }
}

run();

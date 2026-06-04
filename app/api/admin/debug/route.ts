import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const q1 = await db.execute(sql`SELECT COUNT(*) FROM rooms;`);
    const q2 = await db.execute(sql`SELECT status, COUNT(*) FROM rooms GROUP BY status;`);
    const q3 = await db.execute(sql`SELECT COUNT(*) FROM game_results;`);
    const q4 = await db.execute(sql`SELECT code, status, updated_at FROM rooms ORDER BY updated_at DESC LIMIT 10;`);

    return NextResponse.json({
      q1: q1.rows || q1,
      q2: q2.rows || q2,
      q3: q3.rows || q3,
      q4: q4.rows || q4
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

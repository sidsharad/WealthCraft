import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user?.email !== "siddharth1359@gmail.com") {
    console.error("ADMIN_ACCESS_DENIED", { email: session.user?.email, path: "/api/admin/migrate" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "game_results" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "room_id" uuid NOT NULL,
        "room_code" text NOT NULL,
        "winner_id" text NOT NULL,
        "winner_name" text NOT NULL,
        "winner_net_worth" integer NOT NULL,
        "player_ids" jsonb NOT NULL,
        "player_names" jsonb NOT NULL,
        "player_count" integer NOT NULL,
        "turn_count" integer NOT NULL,
        "year_count" integer NOT NULL,
        "started_at" timestamp,
        "completed_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "idx_game_results_winner" ON "game_results" USING btree ("winner_id");
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "idx_game_results_completed" ON "game_results" USING btree ("completed_at");
    `);

    return NextResponse.json({ success: true, message: "Migration applied successfully" });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

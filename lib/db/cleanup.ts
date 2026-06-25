"use server";
import { db } from "./index";
import { sql } from "drizzle-orm";

export async function cleanupExpiredRooms() {
  try {
    // 1. Delete lobby rooms older than 1 hour
    await db.execute(sql`
      DELETE FROM rooms 
      WHERE status = 'lobby' 
      AND updated_at < NOW() - INTERVAL '1 hour'
    `);

    // 2. Mark active rooms as abandoned after 24 hours of inactivity
    await db.execute(sql`
      UPDATE rooms 
      SET status = 'abandoned' 
      WHERE status = 'active' 
      AND updated_at < NOW() - INTERVAL '24 hours'
    `);

    // 3. Delete old abandoned/finished/lobby rooms older than 7 days
    await db.execute(sql`
      DELETE FROM rooms 
      WHERE status IN ('lobby', 'finished', 'abandoned') 
      AND updated_at < NOW() - INTERVAL '7 days'
    `);
    
  } catch (error) {
    console.error("[CLEANUP_JOB_FAILED]", error);
  }
}

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function GET() {
  const rawUrl = process.env.DATABASE_URL || "";
  let configured = false;
  let hostname = null;
  let database = null;

  try {
    if (rawUrl && !rawUrl.includes("your-") && !rawUrl.includes("password@your")) {
      const parsedUrl = new URL(rawUrl);
      hostname = parsedUrl.hostname;
      // Remove leading slash from pathname
      database = parsedUrl.pathname.replace(/^\//, "");
      configured = true;
    }
  } catch (e) {
    // URL parsing failed
  }

  if (!configured) {
    return NextResponse.json({
      configured: false,
      hostname: null,
      database: null,
      connectionTest: "SKIPPED",
      error: "DATABASE_URL is not configured or is a placeholder"
    });
  }

  try {
    // Execute a lightweight query to test the connection
    await db.execute(sql`SELECT 1`);
    
    return NextResponse.json({
      configured: true,
      hostname,
      database,
      connectionTest: "SUCCESS",
      error: null
    });
  } catch (error: any) {
    // Extract a safe error message without leaking credentials
    const safeErrorMessage = error?.message || String(error);
    
    return NextResponse.json({
      configured: true,
      hostname,
      database,
      connectionTest: "FAILED",
      error: safeErrorMessage
    }, { status: 500 });
  }
}

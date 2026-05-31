import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rooms } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { roomLocks } from "@/lib/locks";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    if (!code) {
      return NextResponse.json({ error: "Room code required" }, { status: 400 });
    }

    const [room] = await db
      .select()
      .from(rooms)
      .where(eq(rooms.code, code.toUpperCase()));

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const lock = roomLocks.get(room.id);
    const now = Date.now();
    const lockAgeSeconds = lock ? Math.floor((now - lock.lockedAt) / 1000) : 0;

    const serializedGameState = room.gameState ? JSON.stringify(room.gameState) : "{}";
    const serializedGameStateSizeBytes = serializedGameState.length;

    const state = room.gameState as any;

    return NextResponse.json({
      roomId: room.id,
      roomCode: room.code,
      phase: state?.phase || "lobby",
      year: state?.year || 1,
      turn: state?.turn || 0,
      currentPlayerIndex: state?.currentPlayerIndex ?? -1,
      currentPlayerId: state?.players?.[state?.currentPlayerIndex]?.id || null,
      roomLock: {
        isLocked: !!lock,
        holder: lock?.holder || null,
        lockedAt: lock?.lockedAt || null,
        lockAgeSeconds
      },
      pendingTrade: state?.pendingTrade || null,
      auctionState: state?.auctionState || null,
      logLength: state?.log?.length || 0,
      serializedGameStateSizeBytes,
      players: state?.players || []
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      }
    });
  } catch (error: any) {
    console.error("[DebugAPI] Failed to fetch debug details:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rooms } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { safeTrigger, PUSHER_EVENTS, getRoomChannel } from "@/lib/pusher";

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { roomId, playerId, cash, bonds, stocks, triggerEmergency } = body;

    const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
    if (!room || !room.gameState) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    let gs = room.gameState;
    const pIdx = gs.players.findIndex((p: any) => p.id === playerId);
    if (pIdx === -1) return NextResponse.json({ error: "Player not found" }, { status: 404 });

    if (cash !== undefined) gs.players[pIdx].cash = cash;
    if (bonds !== undefined) gs.players[pIdx].bonds = bonds;
    if (stocks !== undefined) gs.players[pIdx].stocks = stocks;

    if (triggerEmergency !== undefined) {
      const eventId = `DEV_EMC_${Date.now()}`;
      gs.emergencyState = {
        eventId,
        playerId,
        amount: triggerEmergency,
        tradeAttempted: false,
        status: "awaiting-decision"
      };
    }

    await db.update(rooms).set({ gameState: gs, updatedAt: new Date() }).where(eq(rooms.id, roomId));
    
    await safeTrigger(getRoomChannel(room.code), PUSHER_EVENTS.GAME_STATE_UPDATE, {
      event: "dev-harness",
      timestamp: Date.now()
    });

    return NextResponse.json({ success: true, gameState: gs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { rooms, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { pusherServer, getRoomChannel, PUSHER_EVENTS } from "@/lib/pusher";

// Generate a 6-character room code
function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// POST /api/rooms — create or join a room
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { action, code, mode, playerName } = body;

  const userId = (session.user as { id?: string }).id!;

  if (action === "create") {
    // Create a new room
    let roomCode = generateCode();
    // Ensure uniqueness
    let existing = await db.select().from(rooms).where(eq(rooms.code, roomCode));
    while (existing.length > 0) {
      roomCode = generateCode();
      existing = await db.select().from(rooms).where(eq(rooms.code, roomCode));
    }

    const [room] = await db
      .insert(rooms)
      .values({
        code: roomCode,
        mode: mode || "online",
        status: "lobby",
        hostId: userId,
        playerIds: [userId],
        gameState: null,
      })
      .returning();

    return NextResponse.json({ room });
  }

  if (action === "join") {
    if (!code) return NextResponse.json({ error: "Room code required" }, { status: 400 });

    const [room] = await db.select().from(rooms).where(eq(rooms.code, code.toUpperCase()));
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    if (room.status !== "lobby") return NextResponse.json({ error: "Game already started" }, { status: 400 });

    const playerIds = room.playerIds as string[];
    if (playerIds.includes(userId)) {
      return NextResponse.json({ room }); // already in room
    }
    if (playerIds.length >= 4) {
      return NextResponse.json({ error: "Room is full (max 4 players)" }, { status: 400 });
    }

    const updatedPlayerIds = [...playerIds, userId];
    const [updated] = await db
      .update(rooms)
      .set({ playerIds: updatedPlayerIds, updatedAt: new Date() })
      .where(eq(rooms.id, room.id))
      .returning();

    // Notify all players via Pusher
    await pusherServer.trigger(getRoomChannel(code), PUSHER_EVENTS.PLAYER_JOINED, {
      playerId: userId,
      playerName: session.user.name,
      playerIds: updatedPlayerIds,
    });

    return NextResponse.json({ room: updated });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// GET /api/rooms?code=XXXXXX — get room details
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });

  const [room] = await db.select().from(rooms).where(eq(rooms.code, code.toUpperCase()));
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  // Fetch player details
  const playerIds = room.playerIds as string[];
  const playerDetails = await Promise.all(
    playerIds.map(async (id) => {
      const [u] = await db.select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
        .from(users).where(eq(users.id, id));
      return u;
    })
  );

  return NextResponse.json({ room, players: playerDetails });
}

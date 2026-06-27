export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { rooms, users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getRoomChannel, PUSHER_EVENTS, safeTrigger } from "@/lib/pusher";
import { auditDatabaseRoomState } from "@/lib/db/queries";
import { cleanupExpiredRooms } from "@/lib/db/cleanup";
import { checkRateLimit } from "@/lib/rate-limit";

// Generate a 6-character room code
function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

let getCounter = 0;
function logResponseMetric(endpoint: string, source: string, code: string, body: any, forceLog: boolean = false) {
  if (endpoint === "GET /api/rooms") {
    getCounter++;
    const isNormal = source === "pusher" || source === "unknown" || !source;
    if (isNormal && getCounter % 100 !== 1 && !forceLog) {
      return;
    }
  }
  const size = Buffer.byteLength(JSON.stringify(body));
  console.log({
    source: source || "unknown",
    roomId: code,
    gameVersion: body.room?.gameVersion,
    turn: body.room?.gameState?.turn,
    currentPlayer: body.room?.gameState?.currentPlayerIndex,
    timestamp: Date.now()
  });
  console.log(JSON.stringify({
    event: "API_RESPONSE_METRIC",
    endpoint,
    source: source || "unknown",
    roomCode: code,
    responseSizeBytes: size,
    timestamp: new Date().toISOString()
  }));
}


// POST /api/rooms — create or join a room
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.action === "debug-db") {
    try {
      await db.select().from(rooms).limit(1);
      return NextResponse.json({ success: true, host: process.env.DATABASE_URL?.match(/@([^/]+)/)?.[1] });
    } catch (e: any) {
      return NextResponse.json({ 
        error: e.message, 
        host: process.env.DATABASE_URL?.match(/@([^/]+)/)?.[1] 
      }, { status: 500 });
    }
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action, code, mode, playerName } = body;

  const userId = (session.user as { id?: string }).id!;

  if (action === "create") {
    if (Math.random() < 0.01) {
      cleanupExpiredRooms().catch(console.error);
    }
    // Create a new room
    let roomCode = generateCode();
    // Ensure uniqueness
    let existing = await db.select().from(rooms).where(eq(rooms.code, roomCode));
    while (existing.length > 0) {
      roomCode = generateCode();
      existing = await db.select().from(rooms).where(eq(rooms.code, roomCode));
    }

    let payload;
    try {
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
      payload = { room };
    } catch (error) {
      console.error({
        databaseHost: process.env.DATABASE_URL?.match(/@([^/]+)/)?.[1],
        error
      });
      throw error;
    }

    logResponseMetric("POST /api/rooms", action, roomCode, payload, true);
    return NextResponse.json(payload);
  }

  if (action === "join") {
    if (Math.random() < 0.01) {
      cleanupExpiredRooms().catch(console.error);
    }
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
    safeTrigger(getRoomChannel(code), PUSHER_EVENTS.PLAYER_JOINED, {
      playerId: userId,
      playerName: session.user.name,
      playerIds: updatedPlayerIds,
    }).catch(err =>
      console.error("[Pusher] Broadcast failed:", err)
    );

    const payload = { room: updated };
    logResponseMetric("POST /api/rooms", action, room.code, payload, true);
    return NextResponse.json(payload);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// GET /api/rooms?code=XXXXXX — get room details
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const source = req.nextUrl.searchParams.get("source") || "unknown";
  if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });

  // Auth check happens BEFORE any DB query so unauthenticated loops cost nothing.
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;

  // Rate limit: 1 request per 2s per user+room. DB is never touched if limited.
  if (userId) {
    const rl = checkRateLimit(userId, code.toUpperCase());
    if (!rl.allowed) {
      const response = NextResponse.json(
        { error: "Too Many Requests", retryAfterMs: rl.retryAfterMs },
        { status: 429 }
      );
      response.headers.set("Retry-After", String(Math.ceil(rl.retryAfterMs / 1000)));
      return response;
    }
  }

  const [room] = await db.select().from(rooms).where(eq(rooms.code, code.toUpperCase()));
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  auditDatabaseRoomState(room);

  // Fetch player details using a single query (Priority 2)
  const playerIds = room.playerIds as string[];
  let playerDetails: any[] = [];
  
  if (playerIds && playerIds.length > 0) {
    const fetchedUsers = await db
      .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
      .from(users)
      .where(inArray(users.id, playerIds));
      
    // Map them back to the original order to preserve response structure
    playerDetails = playerIds.map(id => fetchedUsers.find((u: any) => u.id === id)).filter(Boolean);
  }

  const responseBody = { room, players: playerDetails, appVersion: process.env.NEXT_PUBLIC_APP_VERSION };
  logResponseMetric("GET /api/rooms", source, room.code, responseBody);
  const response = NextResponse.json(responseBody);
  
  // Ensure strict no-caching headers
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");

  return response;
}

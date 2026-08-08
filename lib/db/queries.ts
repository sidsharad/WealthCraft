import { db } from "./index";
import { rooms, users, gameResults, type GameState } from "./schema";
import { eq, inArray, sql } from "drizzle-orm";

export function auditDatabaseRoomState(room: any) {
  if (!room || !room.gameState) return;
  const state = room.gameState as GameState;
  const errors: string[] = [];

  // 1. currentPlayerIndex within bounds
  if (
    typeof state.currentPlayerIndex !== "number" ||
    state.currentPlayerIndex < 0 ||
    state.currentPlayerIndex >= (state.players?.length || 0)
  ) {
    errors.push("currentPlayerIndex out of bounds or invalid type");
  }

  // 2. currentPlayer exists
  const currentPlayer = state.players ? state.players[state.currentPlayerIndex] : null;
  if (!currentPlayer) {
    errors.push("currentPlayer is undefined or null at currentPlayerIndex");
  }

  // 3. phase is valid
  const validPhases = ["roll", "action", "trade", "year-end", "auction", "finished", "waiting-trade"];
  if (!state.phase || !validPhases.includes(state.phase)) {
    errors.push(`Invalid game phase value: ${state.phase}`);
  }

  // 4. pendingTrade consistency & present in non-trade phase
  if (state.pendingTrade && state.phase !== "waiting-trade") {
    errors.push("pendingTrade is present but phase is not waiting-trade");
  }

  // 5. auctionState consistency & present in non-auction phase
  if (state.auctionState && state.auctionState.open && state.phase !== "auction") {
    errors.push("auctionState is active (open: true) but phase is not auction");
  }

  if (errors.length > 0) {
    console.error(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          event: "INVALID_ROOM_STATE",
          roomId: room.id,
          errors: errors,
          persistedState: {
            phase: state.phase,
            currentPlayerIndex: state.currentPlayerIndex,
            currentPlayerId: currentPlayer?.id || null,
            year: state.year,
            turn: state.turn,
            pendingTrade: state.pendingTrade || null,
            auctionState: state.auctionState || null
          },
          fullRoomSnapshot: room
        },
        null,
        2
      )
    );
  }
}

export async function insertAnalyticsGameResult(
  roomId: string,
  roomCode: string,
  winnerId: string,
  winnerName: string,
  winnerNetWorth: number,
  playerIds: string[],
  playerNames: string[],
  playerCount: number,
  turnCount: number,
  yearCount: number,
  startedAt: Date | null,
) {
  return await db.insert(gameResults).values({
    roomId,
    roomCode,
    winnerId,
    winnerName,
    winnerNetWorth,
    playerIds,
    playerNames,
    playerCount,
    turnCount,
    yearCount,
    startedAt,
    completedAt: new Date(),
  }).onConflictDoNothing({ target: gameResults.roomId }).returning({ id: gameResults.id });
}

export async function getRoomByCode(code: string) {
  const result = await db.select().from(rooms).where(eq(rooms.code, code));
  const room = result[0] ?? null;
  if (room) auditDatabaseRoomState(room);
  return room;
}

export async function getRoomById(id: string) {
  const result = await db.select().from(rooms).where(eq(rooms.id, id));
  const room = result[0] ?? null;
  if (room) auditDatabaseRoomState(room);
  return room;
}

export async function updateGameState(roomId: string, gameState: GameState, currentVersion: number) {
  const ts = new Date();
  const nextVersion = currentVersion + 1;
  gameState.version = nextVersion;
  await db
    .update(rooms)
    .set({ gameState, updatedAt: ts, gameVersion: nextVersion })
    .where(eq(rooms.id, roomId));
  return { ts, gameVersion: nextVersion };
}

export async function getUserById(id: string) {
  const result = await db.select().from(users).where(eq(users.id, id));
  return result[0] ?? null;
}

export async function getUserByEmail(email: string) {
  const result = await db.select().from(users).where(eq(users.email, email));
  return result[0] ?? null;
}

/**
 * Records a game result: increments the winner's wins and all losers' losses
 * in two bulk queries instead of N+1 read-modify-write round trips.
 */
export async function recordGameResult(winnerId: string, loserIds: string[]) {
  await db
    .update(users)
    .set({ wins: sql`${users.wins} + 1` })
    .where(eq(users.id, winnerId));

  if (loserIds.length > 0) {
    await db
      .update(users)
      .set({ losses: sql`${users.losses} + 1` })
      .where(inArray(users.id, loserIds));
  }
}

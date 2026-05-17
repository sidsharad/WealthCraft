import { db } from "./index";
import { rooms, users, type GameState } from "./schema";
import { eq, inArray, sql } from "drizzle-orm";

export async function getRoomByCode(code: string) {
  const result = await db.select().from(rooms).where(eq(rooms.code, code));
  return result[0] ?? null;
}

export async function getRoomById(id: string) {
  const result = await db.select().from(rooms).where(eq(rooms.id, id));
  return result[0] ?? null;
}

export async function updateGameState(roomId: string, gameState: GameState) {
  await db
    .update(rooms)
    .set({ gameState, updatedAt: new Date() })
    .where(eq(rooms.id, roomId));
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

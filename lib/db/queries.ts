import { db } from "./index";
import { rooms, users, type GameState } from "./schema";
import { eq } from "drizzle-orm";

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

export async function recordGameResult(
  winnerId: string,
  loserIds: string[]
) {
  // Increment wins for winner
  const winner = await getUserById(winnerId);
  if (winner) {
    await db
      .update(users)
      .set({ wins: winner.wins + 1 })
      .where(eq(users.id, winnerId));
  }
  // Increment losses for losers
  for (const loserId of loserIds) {
    const loser = await getUserById(loserId);
    if (loser) {
      await db
        .update(users)
        .set({ losses: loser.losses + 1 })
        .where(eq(users.id, loserId));
    }
  }
}

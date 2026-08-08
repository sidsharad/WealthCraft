import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rooms, gameResults } from "@/lib/db/schema";
import { eq, ne, and, lt, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user?.email !== "siddharth1359@gmail.com") {
    console.error("ADMIN_ACCESS_DENIED", { email: session.user?.email, path: "/api/admin/analytics" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (process.env.NODE_ENV !== "production") { console.log(JSON.stringify({ event: "ANALYTICS_API_REQUEST" })); }

  try {
    if (process.env.NODE_ENV !== "production") { console.log("ANALYTICS_STEP", "rooms query"); }
    const [createdResult] = await db.select({ count: sql<number>`count(*)` }).from(rooms);
    const gamesCreated = Number(createdResult.count);

    const [startedResult] = await db.select({ count: sql<number>`count(*)` }).from(rooms).where(ne(rooms.status, "lobby"));
    const gamesStarted = Number(startedResult.count);

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [abandonedResult] = await db.select({ count: sql<number>`count(*)` })
      .from(rooms)
      .where(and(ne(rooms.status, "finished"), lt(rooms.updatedAt, oneDayAgo)));
    const gamesAbandoned = Number(abandonedResult.count);

    if (process.env.NODE_ENV !== "production") { console.log("ANALYTICS_STEP", "game results query"); }
    // Fetch all game results for aggregation
    const rawResults = await db.select().from(gameResults);
    
    // Deduplicate by roomId (keep only one result per game to handle race conditions)
    const resultsMap = new Map<string, typeof rawResults[0]>();
    for (const r of rawResults) {
      if (!resultsMap.has(r.roomId)) {
        resultsMap.set(r.roomId, r);
      }
    }
    const results = Array.from(resultsMap.values());
    const gamesCompleted = results.length;

    if (process.env.NODE_ENV !== "production") { console.log("ANALYTICS_STEP", "aggregation"); }
    const startRate = gamesCreated > 0 ? Number(((gamesStarted / gamesCreated) * 100).toFixed(2)) : 0;
    const completionRate = gamesStarted > 0 ? Number(((gamesCompleted / gamesStarted) * 100).toFixed(2)) : 0;

    let totalTurns = 0;
    let totalYears = 0;

    // Aggregations
    const playerStatsMap = new Map<string, { playerId: string, playerName: string, gamesPlayed: number, gamesCompleted: number, wins: number }>();
    const winnerMap = new Map<string, { playerName: string, wins: number }>();

    for (const result of results) {
      totalTurns += result.turnCount;
      totalYears += result.yearCount;

      // Winner logic
      if (!winnerMap.has(result.winnerId)) {
        winnerMap.set(result.winnerId, { playerName: result.winnerName, wins: 0 });
      }
      winnerMap.get(result.winnerId)!.wins += 1;

      // Player Stats logic
      for (let i = 0; i < result.playerIds.length; i++) {
        const pId = result.playerIds[i];
        const pName = result.playerNames[i];

        if (!playerStatsMap.has(pId)) {
          playerStatsMap.set(pId, { playerId: pId, playerName: pName, gamesPlayed: 0, gamesCompleted: 0, wins: 0 });
        }
        const stats = playerStatsMap.get(pId)!;
        stats.gamesPlayed += 1;
        stats.gamesCompleted += 1; // since this is from completed games
        if (pId === result.winnerId) {
          stats.wins += 1;
        }
      }
    }

    const averageTurns = gamesCompleted > 0 ? Math.round(totalTurns / gamesCompleted) : 0;
    const averageYears = gamesCompleted > 0 ? Number((totalYears / gamesCompleted).toFixed(1)) : 0;

    const winners = Array.from(winnerMap.values()).sort((a, b) => b.wins - a.wins);

    const playerStats = Array.from(playerStatsMap.values()).map(stats => {
      const winRate = stats.gamesCompleted > 0 ? Number(((stats.wins / stats.gamesCompleted) * 100).toFixed(2)) : 0;
      
      console.log(JSON.stringify({
        event: "PLAYER_STATS_COMPUTED",
        playerName: stats.playerName,
        gamesPlayed: stats.gamesPlayed,
        gamesCompleted: stats.gamesCompleted,
        wins: stats.wins
      }));

      return {
        ...stats,
        winRate
      };
    });

    // Sort Player Stats: Wins DESC, Win Rate DESC, Games Played DESC
    playerStats.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.gamesPlayed - a.gamesPlayed;
    });

    return NextResponse.json({
      gamesCreated,
      gamesStarted,
      gamesCompleted,
      gamesAbandoned,
      startRate,
      completionRate,
      averageTurns,
      averageYears,
      winners,
      playerStats
    });
  } catch (error: any) {
    console.error("ANALYTICS_ROUTE_ERROR", error);
    return NextResponse.json(
      {
        error: String(error),
        stack: error instanceof Error ? error.stack : null
      },
      { status: 500 }
    );
  }
}

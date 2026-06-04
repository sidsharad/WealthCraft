import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rooms, gameResults } from "@/lib/db/schema";
import { eq, ne, and, lt } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  console.log(JSON.stringify({ event: "ANALYTICS_API_REQUEST" }));

  try {
    // Games Started: rooms where status != 'lobby'
    const startedRooms = await db.select().from(rooms).where(ne(rooms.status, "lobby"));
    const gamesStarted = startedRooms.length;

    // Games Abandoned: status != 'finished' AND updatedAt older than 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const abandonedRooms = await db
      .select()
      .from(rooms)
      .where(
        and(
          ne(rooms.status, "finished"),
          lt(rooms.updatedAt, oneDayAgo)
        )
      );
    const gamesAbandoned = abandonedRooms.length;

    // Fetch all game results for aggregation
    const results = await db.select().from(gameResults);
    const gamesCompleted = results.length;

    let completionRate = 0;
    if (gamesStarted > 0) {
      completionRate = Number(((gamesCompleted / gamesStarted) * 100).toFixed(2));
    }

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
      gamesStarted,
      gamesCompleted,
      gamesAbandoned,
      completionRate,
      averageTurns,
      averageYears,
      winners,
      playerStats
    });
  } catch (error: any) {
    console.error("[AnalyticsAPI] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

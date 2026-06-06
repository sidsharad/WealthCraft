import { db } from "@/lib/db";
import { users, gameResults } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

export interface UserStats {
  id: string;
  name: string;
  email: string;
  signupDate: string;
  lastGamePlayed: string | null;
  gamesPlayed: number;
  gamesCompleted: number;
  wins: number;
  winRate: string;
  // Future metrics
  averageNetWorth: number | null;
  firstGameDate: string | null;
  totalTurnsPlayed: number | null;
  totalYearsPlayed: number | null;
}

export interface AdminUsersData {
  users: UserStats[];
  summary: {
    totalUsers: number;
    usersWithCompletedGames: number;
    activeUsers: number; // played within last 30 days
  };
}

export async function getAdminUsersData(): Promise<AdminUsersData> {
  // Fetch users and game results
  const allUsers = await db.select().from(users);
  const allResults = await db.select().from(gameResults);

  const statsMap = new Map<string, UserStats>();

  // Initialize map
  for (const user of allUsers) {
    statsMap.set(user.id, {
      id: user.id,
      name: user.name,
      email: user.email,
      signupDate: user.createdAt.toISOString(),
      lastGamePlayed: null,
      gamesPlayed: 0,
      gamesCompleted: 0,
      wins: 0,
      winRate: "0.00",
      averageNetWorth: null,
      firstGameDate: null,
      totalTurnsPlayed: null,
      totalYearsPlayed: null,
    });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).getTime();

  // Aggregate results
  for (const result of allResults) {
    const completedTime = result.completedAt ? new Date(result.completedAt).getTime() : 0;
    const completedStr = result.completedAt ? result.completedAt.toISOString() : null;

    // Process each player
    for (const pId of result.playerIds) {
      if (statsMap.has(pId)) {
        const stats = statsMap.get(pId)!;
        stats.gamesPlayed += 1;
        stats.gamesCompleted += 1; // gameResults only stores completed games

        // Update last game played
        if (!stats.lastGamePlayed || (completedTime > new Date(stats.lastGamePlayed).getTime())) {
          stats.lastGamePlayed = completedStr;
        }

        if (result.winnerId === pId) {
          stats.wins += 1;
        }
      }
    }
  }

  let usersWithCompletedGames = 0;
  let activeUsers = 0;

  const usersList = Array.from(statsMap.values()).map(stats => {
    // Calculate win rate
    stats.winRate = stats.gamesPlayed > 0 ? ((stats.wins / stats.gamesPlayed) * 100).toFixed(2) : "0.00";

    if (stats.gamesCompleted > 0) {
      usersWithCompletedGames += 1;
    }

    if (stats.lastGamePlayed && new Date(stats.lastGamePlayed).getTime() >= thirtyDaysAgo) {
      activeUsers += 1;
    }

    return stats;
  });

  return {
    users: usersList,
    summary: {
      totalUsers: allUsers.length,
      usersWithCompletedGames,
      activeUsers,
    }
  };
}

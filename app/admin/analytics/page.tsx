"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

interface Winner {
  playerName: string;
  wins: number;
}

interface PlayerStats {
  playerId: string;
  playerName: string;
  gamesPlayed: number;
  gamesCompleted: number;
  wins: number;
  winRate: number;
}

interface AnalyticsData {
  gamesStarted: number;
  gamesCompleted: number;
  gamesAbandoned: number;
  completionRate: number;
  averageTurns: number;
  averageYears: number;
  winners: Winner[];
  playerStats: PlayerStats[];
}

export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch analytics");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="p-8 text-center text-red-500">
        <h1 className="text-2xl font-bold mb-4">Error loading analytics</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 space-y-8">
      <h1 className="text-4xl font-bold tracking-tight">WealthCraft Analytics</h1>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Games Started</h3>
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{data.gamesStarted}</div>
          </div>
        </div>
        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Games Completed</h3>
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{data.gamesCompleted}</div>
          </div>
        </div>
        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Games Abandoned</h3>
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{data.gamesAbandoned}</div>
          </div>
        </div>
        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Completion Rate</h3>
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{data.completionRate}%</div>
          </div>
        </div>
        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Avg Turns</h3>
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{data.averageTurns}</div>
          </div>
        </div>
        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Avg Years</h3>
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{data.averageYears}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="flex flex-col space-y-1.5 p-6">
            <h3 className="font-semibold leading-none tracking-tight">Top Winners</h3>
          </div>
          <div className="p-6 pt-0">
            <div className="relative w-full overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="[&_tr]:border-b">
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Player</th>
                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Wins</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {data.winners.map((winner) => (
                    <tr key={winner.playerName} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <td className="p-4 align-middle font-medium">{winner.playerName}</td>
                      <td className="p-4 align-middle text-right">{winner.wins}</td>
                    </tr>
                  ))}
                  {data.winners.length === 0 && (
                    <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <td colSpan={2} className="p-4 align-middle text-center text-muted-foreground">No data available</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="flex flex-col space-y-1.5 p-6">
            <h3 className="font-semibold leading-none tracking-tight">Player Statistics</h3>
          </div>
          <div className="p-6 pt-0">
            <div className="relative w-full overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="[&_tr]:border-b">
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Player</th>
                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Games Played</th>
                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Games Completed</th>
                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Wins</th>
                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Win Rate</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {data.playerStats.map((stat) => (
                    <tr key={stat.playerId} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <td className="p-4 align-middle font-medium">{stat.playerName}</td>
                      <td className="p-4 align-middle text-right">{stat.gamesPlayed}</td>
                      <td className="p-4 align-middle text-right">{stat.gamesCompleted}</td>
                      <td className="p-4 align-middle text-right">{stat.wins}</td>
                      <td className="p-4 align-middle text-right">{stat.winRate}%</td>
                    </tr>
                  ))}
                  {data.playerStats.length === 0 && (
                    <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <td colSpan={5} className="p-4 align-middle text-center text-muted-foreground">No data available</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

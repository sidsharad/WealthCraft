import { vi, describe, it, expect, beforeEach } from 'vitest';
import { GET } from '@/app/api/admin/analytics/route';

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn(),
  },
}));

vi.mock('@/lib/db/schema', () => {
  return {
    rooms: { status: 'status', updatedAt: 'updatedAt' },
    gameResults: {
      id: 'id',
      roomId: 'roomId',
      roomCode: 'roomCode',
      winnerId: 'winnerId',
      winnerName: 'winnerName',
      playerIds: 'playerIds',
      playerNames: 'playerNames',
      playerCount: 'playerCount',
      turnCount: 'turnCount',
      yearCount: 'yearCount',
      completedAt: 'completedAt'
    },
  };
});

// Import the mocked db to adjust return values per test
import { db } from '@/lib/db';

describe('Analytics API GET endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Calculates aggregations correctly with no data', async () => {
    vi.mocked(db.where).mockResolvedValue([]);
    // First two queries in GET are on rooms with `.where()`. Third query is on gameResults without `.where()`.
    // Wait, `db.select().from(gameResults)` does not have a `.where()` so it resolves immediately.
    // Let's adjust the mock to allow `.where()` to return an array, and `.from()` to return an array if `.where` is not called.
    vi.mocked(db.from).mockReturnValue(Object.assign([], {
      where: vi.fn().mockResolvedValue([])
    }) as any);

    const response = await GET();
    const data = await response.json();
    
    expect(data.gamesCreated).toBe(0);
    expect(data.gamesStarted).toBe(0);
    expect(data.gamesCompleted).toBe(0);
    expect(data.gamesAbandoned).toBe(0);
    expect(data.startRate).toBe(0);
    expect(data.completionRate).toBe(0);
    expect(data.averageTurns).toBe(0);
    expect(data.averageYears).toBe(0);
    expect(data.winners).toEqual([]);
    expect(data.playerStats).toEqual([]);
  });

  it('Calculates aggregations correctly with multiple game results', async () => {
    const mockStartedRooms = [{}, {}, {}, {}]; // 4 started
    const mockAbandonedRooms = [{}]; // 1 abandoned
    
    const mockGameResults = [
      {
        roomId: "r1",
        winnerId: "p1",
        winnerName: "Siddharth",
        playerIds: ["p1", "p2"],
        playerNames: ["Siddharth", "Tanushree"],
        turnCount: 50,
        yearCount: 5
      },
      {
        roomId: "r2",
        winnerId: "p1",
        winnerName: "Siddharth",
        playerIds: ["p1", "p3"],
        playerNames: ["Siddharth", "Amit"],
        turnCount: 60,
        yearCount: 6
      },
      {
        roomId: "r3",
        winnerId: "p2",
        winnerName: "Tanushree",
        playerIds: ["p1", "p2", "p3"],
        playerNames: ["Siddharth", "Tanushree", "Amit"],
        turnCount: 40,
        yearCount: 4
      }
    ];

    let callCount = 0;
    vi.mocked(db.from).mockImplementation(() => {
      const currentCall = callCount++;
      if (currentCall === 1) {
        // gameResults
        return mockGameResults as any;
      }
      return {
        // allRooms
        then: (cb: any) => cb([
          { playerIds: ['p1', 'p2'], gameState: { turn: 2 } }, // Started
          { playerIds: ['p1', 'p3'], gameState: { turn: 5 } }, // Started
          { playerIds: ['p1', 'p2', 'p3'], gameState: { log: [{}] } }, // Started
          { playerIds: ['p1', 'p2'], gameState: { turn: 1, log: [] } }, // Created but not started
          { status: "lobby" }, // Created but not started
          { status: "lobby", updatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000) } // Abandoned
        ])
      } as any;
    });

    const response = await GET();
    const data = await response.json();

    expect(data.gamesCreated).toBe(6);
    expect(data.gamesStarted).toBe(3);
    expect(data.gamesAbandoned).toBe(1);
    expect(data.gamesCompleted).toBe(3);
    expect(data.startRate).toBe(50); // 3/6 * 100
    expect(data.completionRate).toBe(100); // 3/3 * 100
    
    expect(data.averageTurns).toBe(50); // (50 + 60 + 40) / 3
    expect(data.averageYears).toBe(5); // (5 + 6 + 4) / 3

    // Winner Sorting Validation
    expect(data.winners[0].playerName).toBe("Siddharth");
    expect(data.winners[0].wins).toBe(2);
    expect(data.winners[1].playerName).toBe("Tanushree");
    expect(data.winners[1].wins).toBe(1);

    // Player Stats Sorting Validation:
    // P1: 3 games, 2 wins, 66.67%
    // P2: 2 games, 1 win, 50%
    // P3: 2 games, 0 wins, 0%
    expect(data.playerStats[0].playerName).toBe("Siddharth");
    expect(data.playerStats[0].gamesPlayed).toBe(3);
    expect(data.playerStats[0].wins).toBe(2);
    expect(data.playerStats[0].winRate).toBe(66.67);

    expect(data.playerStats[1].playerName).toBe("Tanushree");
    expect(data.playerStats[1].gamesPlayed).toBe(2);
    expect(data.playerStats[1].wins).toBe(1);
    expect(data.playerStats[1].winRate).toBe(50);

    expect(data.playerStats[2].playerName).toBe("Amit");
    expect(data.playerStats[2].gamesPlayed).toBe(2);
    expect(data.playerStats[2].wins).toBe(0);
    expect(data.playerStats[2].winRate).toBe(0);
  });
});

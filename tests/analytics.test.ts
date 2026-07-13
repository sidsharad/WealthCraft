import { vi, describe, it, expect, beforeEach } from 'vitest';
import { GET } from '@/app/api/admin/analytics/route';

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
  },
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: "siddharth1359@gmail.com", role: "admin" } }),
}));

vi.mock('@/lib/db/schema', () => {
  return {
    rooms: { status: 'status', updatedAt: 'updatedAt' },
    gameResults: {}
  };
});

import { db } from '@/lib/db';

describe('Analytics API GET endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Calculates aggregations correctly with no data', async () => {
    let callCount = 0;
    vi.mocked(db.from).mockImplementation(() => {
      callCount++;
      return {
        where: vi.fn().mockReturnThis(),
        then: (cb: any) => {
            if (callCount <= 3) return cb([{ count: 0 }]);
            return cb([]);
        }
      } as any;
    });
    
    vi.mocked(db.select).mockReturnValue({
      from: vi.mocked(db.from)
    } as any);

    const response = await GET();
    const data = await response.json();

    expect(data.gamesCreated).toBe(0);
    expect(data.gamesStarted).toBe(0);
    expect(data.gamesCompleted).toBe(0);
    expect(data.gamesAbandoned).toBe(0);
    expect(data.averageTurns).toBe(0);
    expect(data.averageYears).toBe(0);
    expect(data.winners).toEqual([]);
    expect(data.playerStats).toEqual([]);
  });

  it('Calculates aggregations correctly with multiple game results', async () => {
    let callCount = 0;
    vi.mocked(db.from).mockImplementation(() => {
      callCount++;
      return {
        where: vi.fn().mockReturnThis(),
        then: (cb: any) => {
            if (callCount === 1) return cb([{ count: 6 }]); // created
            if (callCount === 2) return cb([{ count: 3 }]); // started
            if (callCount === 3) return cb([{ count: 1 }]); // abandoned
            return cb([
              { winnerId: "p1", winnerName: "Siddharth", playerIds: ["p1", "p2"], playerNames: ["Siddharth", "Tanushree"], turnCount: 50, yearCount: 5 },
              { winnerId: "p1", winnerName: "Siddharth", playerIds: ["p1", "p3"], playerNames: ["Siddharth", "Amit"], turnCount: 60, yearCount: 6 },
              { winnerId: "p2", winnerName: "Tanushree", playerIds: ["p1", "p2", "p3"], playerNames: ["Siddharth", "Tanushree", "Amit"], turnCount: 40, yearCount: 4 }
            ]); // results
        }
      } as any;
    });

    vi.mocked(db.select).mockReturnValue({
      from: vi.mocked(db.from)
    } as any);

    const response = await GET();
    const data = await response.json();

    expect(data.gamesCreated).toBe(6);
    expect(data.gamesStarted).toBe(3);
    expect(data.gamesAbandoned).toBe(1);
    expect(data.gamesCompleted).toBe(3);
    expect(data.startRate).toBe(50);
    expect(data.completionRate).toBe(100);
    expect(data.averageTurns).toBe(50);
    expect(data.averageYears).toBe(5);
    expect(data.winners[0].playerName).toBe("Siddharth");
    expect(data.winners[0].wins).toBe(2);
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

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/rooms/route';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn(),
  },
}));

vi.mock('@/lib/db/schema', () => {
  const mockTable = {
    code: 'code',
    id: 'id',
    name: 'name',
    avatarUrl: 'avatarUrl',
  };
  return {
    rooms: mockTable,
    users: mockTable,
  };
});

describe('Rooms API GET endpoint robustness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Returns 400 if room code is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/rooms');
    const response = await GET(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Code required');
  });

  it('Bypasses strict authentication and fetches room details successfully with valid code', async () => {
    // 1. Mock session to be null (simulating a background request with temporary auth/session flakiness)
    vi.mocked(auth).mockResolvedValue(null);

    // 2. Mock DB select for the room
    const mockRoom = {
      id: 'room-uuid-123',
      code: 'ABCDEF',
      playerIds: ['player-uuid-1'],
      gameState: {
        currentPlayerIndex: 0,
        phase: 'roll',
        players: [],
        log: [],
      },
    };

    const mockUser = {
      id: 'player-uuid-1',
      name: 'Test Player',
      avatarUrl: '',
    };

    // Chain mock: db.select().from().where()
    const mockWhere = vi.fn();
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: mockWhere,
      }),
    } as any);

    // First DB call: getRoomByCode
    // Second DB call: getUserById for each player ID
    mockWhere
      .mockResolvedValueOnce([mockRoom])
      .mockResolvedValueOnce([mockUser]);

    const request = new NextRequest('http://localhost:3000/api/rooms?code=ABCDEF');
    const response = await GET(request);

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.room.code).toBe('ABCDEF');
    expect(body.players[0].name).toBe('Test Player');

    // 3. Verify robust non-caching headers are explicitly set
    expect(response.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate, proxy-revalidate');
    expect(response.headers.get('Pragma')).toBe('no-cache');
    expect(response.headers.get('Expires')).toBe('0');
  });
});

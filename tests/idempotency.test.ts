import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/rooms/[id]/action/route';
import { getRoomById, updateGameState } from '@/lib/db/queries';
import { createInitialGameState } from '@/lib/game-engine/actions';
import type { GameState } from '@/lib/db/schema';

// Mock DB, Auth, and Pusher dependencies
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db/queries', () => ({
  getRoomById: vi.fn(),
  updateGameState: vi.fn().mockResolvedValue({ ts: new Date(), gameVersion: 2 }),
  recordGameResult: vi.fn(),
}));

vi.mock('@/lib/pusher', () => ({
  pusherServer: {
    trigger: vi.fn().mockResolvedValue({}),
  },
  safeTrigger: vi.fn().mockResolvedValue(true),
  getRoomChannel: vi.fn().mockReturnValue('test-channel'),
  PUSHER_EVENTS: {
    GAME_STATE_UPDATE: 'GAME_STATE_UPDATE',
    TRADE_OFFER: 'TRADE_OFFER',
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue({}),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
  },
}));

import { auth } from '@/lib/auth';

describe('Server-Side Action Idempotency Protection', () => {
  let initialGameState: GameState;
  const mockUserId = 'p1';

  beforeEach(() => {
    vi.clearAllMocks();

    const mockPlayers = [
      { id: 'p1', name: 'Player 1', avatar: '', isBot: false },
      { id: 'p2', name: 'Player 2', avatar: '', isBot: false },
    ];
    initialGameState = createInitialGameState(mockPlayers);

    // Mock successful auth session
    vi.mocked(auth).mockResolvedValue({
      user: { id: mockUserId, name: 'Player 1' },
      expires: '',
    });
  });

  const createAPIRequest = (action: string, payload: any, actionId?: string) => {
    return new NextRequest('http://localhost:3000/api/rooms/room-1/action', {
      method: 'POST',
      body: JSON.stringify({ action, payload, actionId }),
    });
  };

  it('Verifies duplicate actionId requests execute exactly once and return the latest state', async () => {
    const actionId = 'roll_test_unique_id_123';
    
    // First setup of the active room state
    const roomState = {
      id: 'room-1',
      code: 'TEST',
      hostId: mockUserId,
      mode: 'online',
      status: 'active',
      playerIds: ['p1', 'p2'],
      gameState: initialGameState,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(getRoomById).mockResolvedValue(roomState as any);

    // 1. Dispatch first request
    const request1 = createAPIRequest('roll', { dice: 4 }, actionId);
    const response1 = await POST(request1, { params: Promise.resolve({ id: 'room-1' }) });
    expect(response1.status).toBe(200);

    const result1 = await response1.json();
    const updatedState = result1.gameState;
    
    // Verify first roll succeeded (index moved from 0 to 4)
    expect(updatedState.players[0].position).toBe(4);
    // Verify actionId was cached in processedActionIds
    expect(updatedState.processedActionIds).toContain(actionId);

    // Capture updated money/assets
    const finalCash = updatedState.players[0].cash;
    const finalBonds = updatedState.players[0].bonds;
    const finalStocks = updatedState.players[0].stocks;

    // Update the mock for the second request to use the updated state in the database
    const roomStateUpdated = {
      ...roomState,
      gameState: updatedState,
    };
    vi.mocked(getRoomById).mockResolvedValue(roomStateUpdated as any);

    // 2. Dispatch second request (duplicate actionId retry)
    const request2 = createAPIRequest('roll', { dice: 4 }, actionId);
    const response2 = await POST(request2, { params: Promise.resolve({ id: 'room-1' }) });
    
    // Status must still be 200, but it must return the cache result without executing again
    expect(response2.status).toBe(200);

    const result2 = await response2.json();
    const duplicateState = result2.gameState;

    // Verify player is STILL at index 4 (not moved to 8, which would happen if double-rolled!)
    expect(duplicateState.players[0].position).toBe(4);

    // Verify balances/assets remain absolutely unchanged
    expect(duplicateState.players[0].cash).toBe(finalCash);
    expect(duplicateState.players[0].bonds).toBe(finalBonds);
    expect(duplicateState.players[0].stocks).toBe(finalStocks);

    // Verify updateGameState database helper was only called once during the first action!
    expect(vi.mocked(updateGameState)).toHaveBeenCalledTimes(1);
  });
});

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/rooms/[id]/action/route';
import { dispatch } from '@/lib/game-engine/dispatcher';
import { createInitialGameState } from '@/lib/game-engine/actions';
import type { GameState } from '@/lib/db/schema';

// Mock DB, Auth, and Pusher dependencies
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db/queries', () => ({
  getRoomById: vi.fn(),
  updateGameState: vi.fn(),
  recordGameResult: vi.fn(),
}));

vi.mock('@/lib/pusher', () => ({
  pusherServer: {
    trigger: vi.fn().mockResolvedValue({}),
  },
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
  },
}));

import { auth } from '@/lib/auth';
import { getRoomById } from '@/lib/db/queries';

describe('Parity between Pass & Play (dispatcher) and Online (API Route)', () => {
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

  const createAPIRequest = (action: string, payload?: any) => {
    return new NextRequest('http://localhost:3000/api/rooms/room-1/action', {
      method: 'POST',
      body: JSON.stringify({ action, payload }),
    });
  };

  // Helper to normalize state logs by resetting timestamps to zero, preventing false failures
  const normalizeState = (state: GameState): GameState => {
    const s = JSON.parse(JSON.stringify(state)) as GameState;
    if (s.log) {
      s.log = s.log.map(log => ({
        ...log,
        timestamp: 0,
      }));
    }
    return s;
  };

  it('Exhaustive Parity Test 1: Rolling the Dice', async () => {
    const diceRoll = 4; // Move from 0 (START) to 4 (HOUSE AUCTION)
    
    // Setup dispatcher state
    const localResult = dispatch(initialGameState, 'roll', { dice: diceRoll });

    // Setup Mock for Online API Room
    vi.mocked(getRoomById).mockResolvedValue({
      id: 'room-1',
      code: 'TEST',
      hostId: mockUserId,
      mode: 'online',
      status: 'active',
      playerIds: ['p1', 'p2'],
      gameState: initialGameState,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const request = createAPIRequest('roll', { dice: diceRoll });
    const response = await POST(request, { params: Promise.resolve({ id: 'room-1' }) });
    expect(response.status).toBe(200);

    const apiResult = await response.json();

    // Verify online state matches local state perfectly
    expect(apiResult.gameState.players[0].position).toBe(localResult.state.players[0].position);
    expect(apiResult.gameState.phase).toBe(localResult.state.phase);
    expect(apiResult.dice).toBe(localResult.dice);
    expect(normalizeState(apiResult.gameState)).toEqual(normalizeState(localResult.state));
  });

  it('Exhaustive Parity Test 2: Emergency Modal triggering sideEffect', async () => {
    // Put current player on an Emergency tile (tile at index 7 is Emergency)
    const stateWithEmergency = { ...initialGameState };
    stateWithEmergency.players[0].position = 7; 
    stateWithEmergency.phase = 'action';

    // Local dispatcher: requesting tile action without payload
    const localResult = dispatch(stateWithEmergency, 'tile-action');
    expect(localResult.sideEffect?.type).toBe('show-modal');
    expect((localResult.sideEffect as any).modal).toBe('emergency');

    // Online API: requesting tile action without payload
    vi.mocked(getRoomById).mockResolvedValue({
      id: 'room-1',
      code: 'TEST',
      hostId: mockUserId,
      mode: 'online',
      status: 'active',
      playerIds: ['p1', 'p2'],
      gameState: stateWithEmergency,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const request = createAPIRequest('tile-action');
    const response = await POST(request, { params: Promise.resolve({ id: 'room-1' }) });
    expect(response.status).toBe(200);

    const apiResult = await response.json();

    // The core desync fix: verify sideEffect is propagated in online response
    expect(apiResult.sideEffect).toBeDefined();
    expect(apiResult.sideEffect.type).toBe('show-modal');
    expect(apiResult.sideEffect.modal).toBe('emergency');
    expect(apiResult.sideEffect.emergencyAmount).toBeDefined();
  });

  it('Exhaustive Parity Test 3: Emergency Resolve (with payload)', async () => {
    const stateWithEmergency = { ...initialGameState };
    stateWithEmergency.players[0].position = 7;
    stateWithEmergency.phase = 'action';
    const originalCash = stateWithEmergency.players[0].cash; // should be 10L

    // Pay 3L emergency cost
    const localResult = dispatch(stateWithEmergency, 'tile-action', { amount: 3 });
    expect(localResult.state.players[0].cash).toBe(originalCash - 3);
    expect(localResult.state.phase).toBe('trade'); // should advance to trade phase

    // Online API: pay 3L emergency cost
    vi.mocked(getRoomById).mockResolvedValue({
      id: 'room-1',
      code: 'TEST',
      hostId: mockUserId,
      mode: 'online',
      status: 'active',
      playerIds: ['p1', 'p2'],
      gameState: stateWithEmergency,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const request = createAPIRequest('tile-action', { amount: 3 });
    const response = await POST(request, { params: Promise.resolve({ id: 'room-1' }) });
    expect(response.status).toBe(200);

    const apiResult = await response.json();

    // Verify online state matches local state perfectly
    expect(apiResult.gameState.players[0].cash).toBe(localResult.state.players[0].cash);
    expect(apiResult.gameState.phase).toBe(localResult.state.phase);
    expect(normalizeState(apiResult.gameState)).toEqual(normalizeState(localResult.state));
  });

  it('Exhaustive Parity Test 4: Lottery Modal triggering sideEffect', async () => {
    // Put player on Lottery tile (tile at index 9 is Lottery)
    const stateWithLottery = { ...initialGameState };
    stateWithLottery.players[0].position = 9;
    stateWithLottery.phase = 'action';

    const localResult = dispatch(stateWithLottery, 'tile-action');
    expect(localResult.sideEffect?.type).toBe('show-modal');
    expect((localResult.sideEffect as any).modal).toBe('lottery');

    // Online API
    vi.mocked(getRoomById).mockResolvedValue({
      id: 'room-1',
      code: 'TEST',
      hostId: mockUserId,
      mode: 'online',
      status: 'active',
      playerIds: ['p1', 'p2'],
      gameState: stateWithLottery,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const request = createAPIRequest('tile-action');
    const response = await POST(request, { params: Promise.resolve({ id: 'room-1' }) });
    expect(response.status).toBe(200);

    const apiResult = await response.json();

    // Verify online gets the lottery sideEffect as well
    expect(apiResult.sideEffect).toBeDefined();
    expect(apiResult.sideEffect.type).toBe('show-modal');
    expect(apiResult.sideEffect.modal).toBe('lottery');
  });

  it('Exhaustive Parity Test 5: End Turn clears emergency announcement and privateMessage', async () => {
    const stateWithEmergencyResolved = { ...initialGameState };
    stateWithEmergencyResolved.players[0].position = 7;
    stateWithEmergencyResolved.players[0].cash = 7;
    stateWithEmergencyResolved.phase = 'trade';
    stateWithEmergencyResolved.announcement = '🚨 EMERGENCY!';
    stateWithEmergencyResolved.privateMessage = '🚨 EMERGENCY!\n➖ Cash: 3L (Emergency Fee)';

    // Local dispatcher: ending turn
    const localResult = dispatch(stateWithEmergencyResolved, 'end-turn');
    expect(localResult.state.currentPlayerIndex).toBe(1);
    expect(localResult.state.announcement).toBeUndefined();
    expect(localResult.state.privateMessage).toBeUndefined();

    // Online API: ending turn
    vi.mocked(getRoomById).mockResolvedValue({
      id: 'room-1',
      code: 'TEST',
      hostId: mockUserId,
      mode: 'online',
      status: 'active',
      playerIds: ['p1', 'p2'],
      gameState: stateWithEmergencyResolved,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const request = createAPIRequest('end-turn');
    const response = await POST(request, { params: Promise.resolve({ id: 'room-1' }) });
    expect(response.status).toBe(200);

    const apiResult = await response.json();
    expect(apiResult.gameState.currentPlayerIndex).toBe(1);
    expect(apiResult.gameState.announcement).toBeUndefined();
    expect(apiResult.gameState.privateMessage).toBeUndefined();
  });
});

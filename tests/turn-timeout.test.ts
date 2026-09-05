// tests/turn-timeout.test.ts

import { describe, it, expect } from 'vitest';
import { dispatch } from '@/lib/game-engine/dispatcher';
import { createInitialGameState } from '@/lib/game-engine/actions';
import type { GameState } from '@/lib/db/schema';

/**
 * Ensure that when a turn has exceeded the 30‑second limit, the dispatcher
 * automatically advances the turn (equivalent to the end‑turn action).
 */
describe('Server‑authoritative 30‑second turn timeout', () => {
  it('automatically ends turn after 30s of inactivity', () => {
    const mockPlayers = [
      { id: 'p1', name: 'Player 1', avatar: '', isBot: false },
      { id: 'p2', name: 'Player 2', avatar: '', isBot: false },
    ];
    let state: GameState = createInitialGameState(mockPlayers);
    // Simulate that the turn started >30s ago
    state = { ...state, turnStartTimestamp: Date.now() - 31000 };

    // Dispatch any action – the dispatcher should detect timeout and end the turn
    const result = dispatch(state, 'roll');

    // The turn should have advanced by 1
    expect(result.state.turn).toBe(state.turn + 1);
    // Phase should be set to the next appropriate phase (roll for next player)
    expect(result.state.phase).toBe('roll');
  });
});

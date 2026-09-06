// tests/turn-phase.test.ts
// Regression test: Player 1 must be able to roll on their first real turn.
// The initial "year-end" phase (portfolio setup) must NOT repeat during normal gameplay.

import { describe, it, expect } from 'vitest';
import { createInitialGameState, advanceTurn } from '@/lib/game-engine/actions';
import { dispatch } from '@/lib/game-engine/dispatcher';
import type { GameState } from '@/lib/db/schema';

function makePlayers(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    avatar: '',
    isBot: false,
  }));
}

describe('Turn phase transitions', () => {
  describe('Initial setup (portfolio allocation)', () => {
    it('starts all players in year-end phase for initial rebalance', () => {
      const state = createInitialGameState(makePlayers(2));
      expect(state.turn).toBe(0);
      expect(state.currentPlayerIndex).toBe(0);
      expect(state.phase).toBe('year-end');
    });

    it('keeps year-end phase for each player during initial setup', () => {
      const players = makePlayers(3);
      let state = createInitialGameState(players);

      // Player 0 initial rebalance → advance
      state = advanceTurn(state);
      expect(state.turn).toBe(1);
      expect(state.currentPlayerIndex).toBe(1);
      expect(state.phase).toBe('year-end'); // Player 1 also needs initial rebalance

      // Player 1 initial rebalance → advance
      state = advanceTurn(state);
      expect(state.turn).toBe(2);
      expect(state.currentPlayerIndex).toBe(2);
      expect(state.phase).toBe('year-end'); // Player 2 also needs initial rebalance
    });
  });

  describe('First real gameplay turn (Player 1 must roll)', () => {
    it('sets phase to roll after all players complete initial setup (2 players)', () => {
      const players = makePlayers(2);
      let state = createInitialGameState(players);

      // Both players do initial rebalance
      state = advanceTurn(state); // turn 0 → 1 (Player 1 initial)
      state = advanceTurn(state); // turn 1 → 2 (Player 0's first real turn)

      expect(state.turn).toBe(2);
      expect(state.currentPlayerIndex).toBe(0);
      expect(state.phase).toBe('roll'); // Player 1 must be able to roll!
    });

    it('sets phase to roll after all players complete initial setup (3 players)', () => {
      const players = makePlayers(3);
      let state = createInitialGameState(players);

      state = advanceTurn(state); // turn 0 → 1
      state = advanceTurn(state); // turn 1 → 2
      state = advanceTurn(state); // turn 2 → 3 (Player 0's first real turn)

      expect(state.turn).toBe(3);
      expect(state.currentPlayerIndex).toBe(0);
      expect(state.phase).toBe('roll');
    });

    it('sets phase to roll after all players complete initial setup (4 players)', () => {
      const players = makePlayers(4);
      let state = createInitialGameState(players);

      for (let i = 0; i < 4; i++) state = advanceTurn(state);

      expect(state.turn).toBe(4);
      expect(state.currentPlayerIndex).toBe(0);
      expect(state.phase).toBe('roll');
    });
  });

  describe('Normal turn transitions (no premature year-end)', () => {
    it('all players in a full round get roll phase (2 players)', () => {
      const players = makePlayers(2);
      let state = createInitialGameState(players);

      // Complete initial setup
      state = advanceTurn(state); // turn 1
      state = advanceTurn(state); // turn 2 — Player 0 first real turn

      // First full round of gameplay
      expect(state.phase).toBe('roll'); // Player 0
      state = advanceTurn(state);       // turn 3
      expect(state.phase).toBe('roll'); // Player 1

      // Second full round
      state = advanceTurn(state);       // turn 4
      expect(state.phase).toBe('roll'); // Player 0 again
      state = advanceTurn(state);       // turn 5
      expect(state.phase).toBe('roll'); // Player 1 again
    });

    it('all players in a full round get roll phase (3 players)', () => {
      const players = makePlayers(3);
      let state = createInitialGameState(players);

      // Complete initial setup
      for (let i = 0; i < 3; i++) state = advanceTurn(state);

      // Full round: every player should get roll
      for (let round = 0; round < 2; round++) {
        for (let p = 0; p < 3; p++) {
          expect(state.phase).toBe('roll');
          state = advanceTurn(state);
        }
      }
    });
  });

  describe('Dispatcher integration: Player 1 can roll dice on first real turn', () => {
    it('dispatch("roll") succeeds when phase is roll on the first gameplay turn', () => {
      const players = makePlayers(2);
      let state: GameState = createInitialGameState(players);

      // Simulate initial setup via dispatcher end-turn
      // Player 0 rebalances
      let result = dispatch(state, 'end-turn');
      state = result.state;

      // Player 1 rebalances
      result = dispatch(state, 'end-turn');
      state = result.state;

      // Now it should be Player 0's first real turn, phase = roll
      expect(state.currentPlayerIndex).toBe(0);
      expect(state.phase).toBe('roll');

      // Player 0 should be able to roll dice
      result = dispatch(state, 'roll', { dice: 3 });
      // After rolling, phase should move to action or year-end (if passed start), not error
      expect(result.state.phase).not.toBe('year-end');
      expect(['action', 'trade'].some(p => result.state.phase === p || result.state.phase === 'year-end')).toBe(true);
    });
  });
});

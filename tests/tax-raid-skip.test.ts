import { describe, it, expect } from 'vitest';
import { dispatch } from '../lib/game-engine/dispatcher';
import { GameState, PlayerState } from '../lib/db/schema';

function createMockState(): GameState {
  return {
    players: [
      { id: 'p1', name: 'Player 1', cash: 0, bonds: 0, stocks: 0, position: 0, hasHouse: false, jobLossActive: false, turnsWithJobLoss: 0, isBot: false, incomeFreezeActive: false, wealthDeclared: false },
      { id: 'p2', name: 'Player 2', cash: 0, bonds: 0, stocks: 0, position: 0, hasHouse: false, jobLossActive: false, turnsWithJobLoss: 0, isBot: false, incomeFreezeActive: false, wealthDeclared: false },
      { id: 'p3', name: 'Player 3', cash: 0, bonds: 0, stocks: 0, position: 0, hasHouse: false, jobLossActive: false, turnsWithJobLoss: 0, isBot: false, incomeFreezeActive: false, wealthDeclared: false }
    ],
    currentPlayerIndex: 0,
    phase: 'action',
    turn: 1,
    year: 1,
    log: [],
    endgameCandidate: false,
    turnStartTimestamp: Date.now()
  };
}

describe('Tax Raid skips', () => {
  it('₹0 cash + Tax Raid + Skip → no error → Tax Raid completes → next player\'s turn', () => {
    let state = createMockState();
    
    // Setup player 1 on Tax Raid (Tile 3 -> index 2)
    state.players[0].position = 2;
    state.players[0].cash = 0;
    state.phase = 'action';
    state.currentPlayerIndex = 0;

    // Simulate clicking skip
    const result = dispatch(state, 'tile-action', { skip: true });
    
    // There should be no error
    expect(result.sideEffect?.type).not.toBe('error');
    
    const newState = result.state as GameState;
    // The turn should NOT have advanced to player 2 (index 1) because they need to trade first
    expect(newState.currentPlayerIndex).toBe(0);
    
    // The phase should be "trade"
    expect(newState.phase).toBe('trade');
    
    // Player can now end turn
    const endTurnResult = dispatch(newState, 'end-turn', null);
    expect(endTurnResult.sideEffect?.type).not.toBe('error');
    
    const finalState = endTurnResult.state as GameState;
    
    // Now it is player 2's turn (index 1)
    expect(finalState.currentPlayerIndex).toBe(1);
    
    // And phase is "roll"
    expect(finalState.phase).toBe('roll');
  });

  it('Normal Tax Raid works when player has sufficient cash', () => {
    let state = createMockState();
    
    // Setup player 1 on Tax Raid (Tile 3 -> index 2)
    state.players[0].position = 2;
    state.players[0].cash = 10;
    state.players[1].cash = 10;
    state.phase = 'action';
    state.currentPlayerIndex = 0;

    // Simulate clicking confirm
    const result = dispatch(state, 'tile-action', { targetIdx: 1 });
    console.log(JSON.stringify(result, null, 2));
    
    // There should be no error
    expect(result.sideEffect?.type).not.toBe('error');
    
    const newState = result.state as GameState;
    
    // Current player pays 2L
    expect(newState.players[0].cash).toBe(8);
    // Target pays 5L
    expect(newState.players[1].cash).toBe(5);
    
    // Phase should be trade
    expect(newState.phase).toBe('trade');
    // Still player 1's turn
    expect(newState.currentPlayerIndex).toBe(0);
  });

  it('Tax Raid fails correctly if player has insufficient cash but tries to raid anyway', () => {
    let state = createMockState();
    
    // Setup player 1 on Tax Raid (Tile 3 -> index 2)
    state.players[0].position = 2;
    state.players[0].cash = 1; // Insufficient cash (needs 2L)
    state.players[1].cash = 10;
    state.phase = 'action';
    state.currentPlayerIndex = 0;

    // Simulate clicking confirm
    const result = dispatch(state, 'tile-action', { targetIdx: 1 });
    
    // There should be an error
    expect(result.sideEffect?.type).toBe('error');
    expect((result.sideEffect as any).message).toContain('cannot afford Tax Raid');
    
  });
});

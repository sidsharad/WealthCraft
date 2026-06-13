import { describe, it, expect } from "vitest";
import { dispatch } from "../lib/game-engine/dispatcher";
import { GameState, PlayerState } from "../lib/db/schema";
import { getTileByPosition } from "../lib/game-engine/tiles";

function createTestState(playerUpdate: Partial<PlayerState>): GameState {
  return {
    turn: 1,
    year: 1,
    currentPlayerIndex: 0,
    phase: "action",
    players: [
      {
        id: "p1",
        name: "Test Player",
        avatar: "",
        isBot: false,
        cash: 0,
        bonds: 0,
        stocks: 0,
        hasHouse: false,
        jobLossActive: false,
        incomeFreezeActive: false,
        wealthDeclared: false,
        position: 0,
        year: 1,
        turnsWithJobLoss: 0,
        hasTraded: false,
        ...playerUpdate
      }
    ],
    log: []
  };
}

describe("Emergency Payment Deadlock Fix", () => {
  it("Case A: No legal rebalance (total assets >= 5L, but no 5L blocks). Pays partial, continues game.", () => {
    // 3L bonds + 2L stocks = 5L total, but neither is >= 5L.
    let state = createTestState({ cash: 7, bonds: 3, stocks: 2 });
    state.players[0].position = 7; // Emergency tile
    
    // 1. Land on tile
    let result = dispatch(state, "tile-action", { amount: 10 });
    expect(result.sideEffect?.type).toBe("show-modal");
    expect((result.sideEffect as any).modal).toBe("emergency-decision");
    
    // 2. Choose rebalance
    result = dispatch(result.state, "emergency-decision", { decision: "rebalance" });
    expect(result.sideEffect?.type).toBe("needs-rebalance");
    
    // 3. Process rebalance (simulate doing nothing because no 5L blocks exist)
    result = dispatch(result.state, "rebalance", { newCash: 7, newBonds: 3, newStocks: 2, penalty: 0 }); // penalty 0 because they didn't liquidate any blocks
    
    // The player couldn't legally rebalance, so they pay 7L cash and continue.
    expect(result.sideEffect).toBeUndefined();
    expect(result.state.players[0].cash).toBe(0);
    expect(result.state.players[0].bonds).toBe(3);
    expect(result.state.players[0].stocks).toBe(2);
    expect(result.state.emergencyState).toBeUndefined();
  });

  it("Case B: One legal rebalance possible. Triggers needs-rebalance.", () => {
    // 5L bonds, 0L stocks. They CAN legally rebalance.
    let state = createTestState({ cash: 4, bonds: 5, stocks: 0 });
    state.players[0].position = 7;
    
    // 1. Land on tile
    let result = dispatch(state, "tile-action", { amount: 10 });
    
    // 2. Choose rebalance
    result = dispatch(result.state, "emergency-decision", { decision: "rebalance" });
    expect(result.sideEffect?.type).toBe("needs-rebalance");
    
    // 3. Process rebalance (liquidate 5L bonds)
    result = dispatch(result.state, "rebalance", { newCash: 6, newBonds: 0, newStocks: 0, penalty: 3 }); 
    
    // They still owe 10L, but only have 6L. Since no more 5L blocks exist, they pay 6L and continue.
    expect(result.sideEffect).toBeUndefined();
    expect(result.state.players[0].cash).toBe(0);
    expect(result.state.players[0].bonds).toBe(0);
    expect(result.state.emergencyState).toBeUndefined();
  });

  it("Case C: Full payment possible via repeated rebalancing. Triggers needs-rebalance.", () => {
    let state = createTestState({ cash: 1, bonds: 15, stocks: 10 });
    state.players[0].position = 7;
    
    // 1. Land on tile
    let result = dispatch(state, "tile-action", { amount: 10 });
    
    // 2. Choose rebalance
    result = dispatch(result.state, "emergency-decision", { decision: "rebalance" });
    
    // 3. Process rebalance (liquidate 15L bonds)
    result = dispatch(result.state, "rebalance", { newCash: 13, newBonds: 0, newStocks: 10, penalty: 3 });
    
    // Now they have 13L cash, which covers the 10L emergency. They pay it, keep 3L, and continue.
    expect(result.sideEffect).toBeUndefined();
    expect(result.state.players[0].cash).toBe(3);
    expect(result.state.players[0].bonds).toBe(0);
    expect(result.state.players[0].stocks).toBe(10);
    expect(result.state.emergencyState).toBeUndefined();
  });
});

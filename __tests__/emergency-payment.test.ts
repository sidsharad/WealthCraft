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
    
    // Simulate landing on emergency tile (index 7 is emergency)
    state.players[0].position = 7; // Emergency tile
    
    const result = dispatch(state, "tile-action", { amount: 10 });
    
    // The player couldn't legally rebalance, so they pay 7L cash and continue.
    expect(result.sideEffect).toBeUndefined();
    expect(result.state.players[0].cash).toBe(0);
    expect(result.state.players[0].bonds).toBe(3);
    expect(result.state.players[0].stocks).toBe(2);
  });

  it("Case B: One legal rebalance possible. Triggers needs-rebalance.", () => {
    // 5L bonds, 0L stocks. They CAN legally rebalance.
    let state = createTestState({ cash: 4, bonds: 5, stocks: 0 });
    state.players[0].position = 7;
    
    const result = dispatch(state, "tile-action", { amount: 10 });
    
    // The player CAN rebalance, so it forces them into the rebalance modal.
    expect(result.sideEffect).toBeDefined();
    expect(result.sideEffect?.type).toBe("needs-rebalance");
  });

  it("Case C: Full payment possible via repeated rebalancing. Triggers needs-rebalance.", () => {
    let state = createTestState({ cash: 1, bonds: 15, stocks: 10 });
    state.players[0].position = 7;
    
    const result = dispatch(state, "tile-action", { amount: 10 });
    
    // The player CAN rebalance, so it forces them into the rebalance modal.
    expect(result.sideEffect).toBeDefined();
    expect(result.sideEffect?.type).toBe("needs-rebalance");
  });
});

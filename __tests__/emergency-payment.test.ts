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

describe("Emergency Rebalance Flow Verification", () => {
  it("Test C: Emergency -> Rebalance -> Bonds+Stocks < 5L -> Cash < amount (Deadlock prevention)", () => {
    // 3L bonds + 2L stocks = 5L total, but neither is >= 5L block.
    let state = createTestState({ cash: 7, bonds: 3, stocks: 2 });
    state.players[0].position = 7; // Emergency tile
    
    // 1. Land on tile
    let result = dispatch(state, "tile-action", { amount: 10 });
    
    // 2. Choose rebalance
    result = dispatch(result.state, "emergency-decision", { decision: "rebalance" });
    expect(result.sideEffect?.type).toBe("needs-rebalance");
    
    // 3. Process rebalance (simulate doing nothing because no 5L blocks exist)
    result = dispatch(result.state, "rebalance", { newCash: 7, newBonds: 3, newStocks: 2, penalty: 0 }); 
    
    // Verify cash reduced to 0, no infinite loop, emergency cleared
    expect(result.sideEffect).toBeUndefined(); // no second rebalance triggered
    expect(result.state.players[0].cash).toBe(0);
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

  it("Test A & B: Emergency -> Rebalance -> 3L Penalty -> Cash sufficient -> One-time deduction & no loops", () => {
    let state = createTestState({ cash: 1, bonds: 15, stocks: 10 });
    state.players[0].position = 7;
    
    // 1. Land on tile
    let result = dispatch(state, "tile-action", { amount: 10 });
    
    // 2. Choose rebalance
    result = dispatch(result.state, "emergency-decision", { decision: "rebalance" });
    
    // 3. Process rebalance (liquidate 15L bonds)
    // Here we explicitly apply the 3L penalty as requested
    result = dispatch(result.state, "rebalance", { newCash: 13, newBonds: 0, newStocks: 10, penalty: 3 });
    
    // Verify 10L is deducted exactly once (13L - 10L = 3L remaining)
    expect(result.state.players[0].cash).toBe(3);
    
    // Verify emergency state cleared completely
    expect(result.state.emergencyState).toBeUndefined();
    
    // Verify no secondary modal/rebalance loop triggered
    expect(result.sideEffect).toBeUndefined();
  });
});

describe("Emergency Trade Initiation Tests", () => {
  it("Test 1: Click Initiate Trade maintains state and opens Trade Modal", () => {
    let state = createTestState({ cash: 0, bonds: 0, stocks: 0 });
    state.players[0].position = 7;
    
    // 1. Trigger emergency
    let result = dispatch(state, "tile-action", { amount: 10 });
    expect(result.sideEffect?.type).toBe("show-modal");
    expect((result.sideEffect as any).modal).toBe("emergency-decision");
    
    const emergencyStateBefore = result.state.emergencyState;
    expect(emergencyStateBefore).toBeDefined();
    expect(emergencyStateBefore?.amount).toBe(10);
    
    // 2. Click Initiate Trade
    let tradeResult = dispatch(result.state, "emergency-decision", { decision: "trade" });
    
    // Verify side effect
    expect(tradeResult.sideEffect?.type).toBe("show-trade");
    
    // Verify state unchanged
    expect(tradeResult.state.emergencyState?.amount).toBe(10);
    expect(tradeResult.state.emergencyState?.eventId).toBe(emergencyStateBefore?.eventId);
  });

  it("Test 2: Dispatching emergency-decision 'trade' does not enter tile-logic or generate new amount", () => {
    let state = createTestState({ cash: 0, bonds: 0, stocks: 0 });
    state.players[0].position = 7;
    
    let result = dispatch(state, "tile-action", { amount: 5 });
    
    const emergencyStateBefore = result.state.emergencyState;
    expect(emergencyStateBefore?.amount).toBe(5);
    
    // Even if we pass random garbage in payload that might mimic a tile-action
    let tradeResult = dispatch(result.state, "emergency-decision", { decision: "trade", amount: undefined });
    
    // It should STILL exactly return show-trade and not touch the emergency state
    expect(tradeResult.sideEffect?.type).toBe("show-trade");
    expect(tradeResult.state.emergencyState?.amount).toBe(5);
  });

  it("Test 3: Dispatching unknown actions maintains emergency state (simulate refresh/invalid action)", () => {
    let state = createTestState({ cash: 0, bonds: 0, stocks: 0 });
    state.players[0].position = 7;
    
    let result = dispatch(state, "tile-action", { amount: 3 });
    const eventIdBefore = result.state.emergencyState?.eventId;
    
    // Simulate a page refresh calling an unhandled action or doing nothing
    let refreshResult = dispatch(result.state, "unknown-action", {});
    
    expect(refreshResult.state.emergencyState?.amount).toBe(3);
    expect(refreshResult.state.emergencyState?.eventId).toBe(eventIdBefore);
    expect(refreshResult.state.emergencyState?.status).toBe("awaiting-decision");
  });
});

 

import { describe, it, expect, vi, beforeEach } from "vitest";
import { dispatch } from "../lib/game-engine/dispatcher";
import { GameState } from "../lib/db/schema";

// Create a basic state with two players for trading tests
function createTradeState(): GameState {
  return {
    phase: "action",
    currentPlayerIndex: 0, // Siddharth's turn
    turn: 1,
    year: 1,
    log: [],
    players: [
      {
        id: "p1",
        name: "Siddharth",
        cash: 10,
        bonds: 5,
        stocks: 5,
        position: 0,
        hasHouse: false,
        isActive: true,
      },
      {
        id: "p2",
        name: "Tanushree",
        cash: 10,
        bonds: 5,
        stocks: 5,
        position: 0,
        hasHouse: false,
        isActive: true,
      }
    ]
  };
}

describe("Trade Ownership & Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Test 1: Siddharth (p1) -> Tanushree (p2)", () => {
    const state = createTradeState();
    // Siddharth is currentPlayerIndex 0
    
    const payload = {
      toPlayerId: "p2",
      offer: { cash: 5, bonds: 0, stocks: 0 },
      request: { cash: 0, bonds: 5, stocks: 0 }
    };
    
    const { state: nextState, sideEffect } = dispatch(state, "trade-offer", payload);
    
    expect(sideEffect?.type).toBe("show-pass-device");
    expect(nextState.phase).toBe("waiting-trade");
    expect(nextState.pendingTrade).toBeDefined();
    
    // Proposer is Siddharth (p1)
    expect(nextState.pendingTrade?.fromPlayerId).toBe("p1");
    // Receiver is Tanushree (p2)
    expect(nextState.pendingTrade?.toPlayerId).toBe("p2");
    
    // In UI, Tanushree gets Accept/Reject because toPlayerId === "p2"
  });

  it("Test 2: Tanushree (p2) -> Siddharth (p1)", () => {
    const state = createTradeState();
    state.currentPlayerIndex = 1; // Tanushree's turn
    
    const payload = {
      toPlayerId: "p1",
      offer: { cash: 0, bonds: 5, stocks: 0 },
      request: { cash: 5, bonds: 0, stocks: 0 }
    };
    
    const { state: nextState, sideEffect } = dispatch(state, "trade-offer", payload);
    
    expect(sideEffect?.type).toBe("show-pass-device");
    expect(nextState.phase).toBe("waiting-trade");
    expect(nextState.pendingTrade).toBeDefined();
    
    // Proposer is Tanushree (p2)
    expect(nextState.pendingTrade?.fromPlayerId).toBe("p2");
    // Receiver is Siddharth (p1)
    expect(nextState.pendingTrade?.toPlayerId).toBe("p1");
    
    // In UI, Siddharth gets Accept/Reject because toPlayerId === "p1"
  });

  it("Test 3: Self-trade attempt returns Validation error", () => {
    const state = createTradeState();
    // Siddharth is currentPlayerIndex 0
    
    const payload = {
      toPlayerId: "p1", // Siddharth sending to himself
      offer: { cash: 5, bonds: 0, stocks: 0 },
      request: { cash: 0, bonds: 5, stocks: 0 }
    };
    
    const { state: nextState, sideEffect } = dispatch(state, "trade-offer", payload);
    
    // Trade should NOT be created
    expect(nextState.phase).toBe("action");
    expect(nextState.pendingTrade).toBeUndefined();
    
    // Validation error should be returned
    expect(sideEffect?.type).toBe("error");
    expect(sideEffect?.message).toBe("Invalid Trade: You cannot trade with yourself.");
  });
});

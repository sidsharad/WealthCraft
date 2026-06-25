import { describe, it, expect, beforeEach } from "vitest";
import { dispatch } from "../lib/game-engine/dispatcher";
import { GameState, PlayerState } from "../lib/db/schema";
import { createInitialGameState } from "../lib/game-engine/actions";

describe("Emergency Trade Feature Scenarios", () => {
  let baseState: GameState;
  
  beforeEach(() => {
    // Set up a deterministic base state for tests
    baseState = createInitialGameState(["p1", "p2"], 10); // Start cash 10
    
    // Customize players for specific scenarios
    baseState.players[0] = {
      ...baseState.players[0],
      id: "p1",
      name: "Alice",
      cash: 2, // Needs 3L for emergency
      bonds: 10,
      stocks: 10,
    };
    
    baseState.players[1] = {
      ...baseState.players[1],
      id: "p2",
      name: "Bob",
      cash: 20,
      bonds: 5,
      stocks: 5,
    };
    
    // Simulate landing on an emergency tile
    baseState.players[0].position = 5; // Tile 8 is emergency
    baseState.phase = "action";
  });

  const getEmergencyState = (s: GameState) => s.emergencyState;

  it("Scenario 1: Trade accepted, cash becomes sufficient", () => {
    console.log("=== SCENARIO 1: Trade accepted, cash sufficient ===");
    console.log("Initial Cash:", baseState.players[0].cash);
    
    // Step 1: Emergency trigger (requires 5L)
    const res1 = dispatch(baseState, "tile-action", { amount: 5 });
    console.log("RES1", JSON.stringify(res1));
    expect(res1.sideEffect?.type).toBe("show-modal");
    expect((res1.sideEffect as any).modal).toBe("emergency-decision");
    
    let state = res1.state;
    expect(state.emergencyState?.status).toBe("awaiting-decision");
    
    // Step 2: Player selects "Initiate Trade"
    const res2 = dispatch(state, "emergency-decision", { decision: "trade" });
    expect(res2.sideEffect?.type).toBe("show-trade");
    state = res2.state;
    expect(state.emergencyState?.status).toBe("awaiting-trade-response");
    
    // Step 3: Player sends trade offer
    const offerPayload = { offer: { bonds: 5, cash: 0, stocks: 0 }, request: { cash: 5, bonds: 0, stocks: 0 }, toPlayerId: "p2" };
    const res3 = dispatch(state, "trade-offer", offerPayload);
    state = res3.state;
    expect(state.pendingTrade).toBeDefined();
    
    // Step 4: Bob accepts trade
    state.currentPlayerIndex = 1; 
    const res4 = dispatch(state, "trade-response", { accept: true });
    state = res4.state;
    
    // Check outcome
    expect(state.players[0].cash).toBe(2); // Started with 2 + 5 (from trade) - 5 (emergency)
    expect(state.emergencyState).toBeUndefined();
    
    // Trade should be deleted
    expect(state.trades || []).toHaveLength(0);
    console.log("Final Cash:", state.players[0].cash);
    console.log("===================================================\n");
  });

  it("Scenario 2: Trade rejected, rebalance forced", () => {
    console.log("=== SCENARIO 2: Trade rejected, rebalance forced ===");
    const res1 = dispatch(baseState, "tile-action", { amount: 5 });
    let state = res1.state;
    
    const res2 = dispatch(state, "emergency-decision", { decision: "trade" });
    state = res2.state;
    
    const offerPayload = { offer: { bonds: 5, cash: 0, stocks: 0 }, request: { cash: 5, bonds: 0, stocks: 0 }, toPlayerId: "p2" };
    const res3 = dispatch(state, "trade-offer", offerPayload);
    state = res3.state;
    
    // Bob REJECTS trade
    state.currentPlayerIndex = 1;
    const res4 = dispatch(state, "trade-response", { accept: false });
    state = res4.state;
    
    expect(state.emergencyState?.status).toBe("rebalance-required");
    expect(state.emergencyState?.resolution).toBe("Mandatory Rebalance");
    expect(state.players[0].cash).toBe(2); // Unchanged
    
    console.log("Final State Emergency:", JSON.stringify(state.emergencyState));
    console.log("===================================================\n");
  });

  it("Scenario 3: Trade accepted, cash STILL insufficient", () => {
    console.log("=== SCENARIO 3: Trade accepted, cash STILL insufficient ===");
    const res1 = dispatch(baseState, "tile-action", { amount: 10 }); // Need 10
    let state = res1.state;
    
    const res2 = dispatch(state, "emergency-decision", { decision: "trade" });
    state = res2.state;
    
    // Offer 5 bonds for 5 cash (total cash will be 2 + 5 = 7 < 10)
    const offerPayload = { offer: { bonds: 5, cash: 0, stocks: 0 }, request: { cash: 5, bonds: 0, stocks: 0 }, toPlayerId: "p2" };
    const res3 = dispatch(state, "trade-offer", offerPayload);
    state = res3.state;
    
    // Bob ACCEPTS trade
    state.currentPlayerIndex = 1;
    const res4 = dispatch(state, "trade-response", { accept: true });
    state = res4.state;
    
    // Should force rebalance
    expect(state.emergencyState?.status).toBe("rebalance-required");
    expect(state.emergencyState?.resolution).toBe("Mandatory Rebalance");
    expect(state.players[0].cash).toBe(7); // Got the 5 cash, but emergency not paid
    
    console.log("Final State Emergency:", JSON.stringify(state.emergencyState));
    console.log("===================================================\n");
  });

  it("Scenario 4: Second trade request blocked", () => {
    console.log("=== SCENARIO 4: Second trade request blocked ===");
    const res1 = dispatch(baseState, "tile-action", { amount: 5 });
    let state = res1.state;
    
    const res2 = dispatch(state, "emergency-decision", { decision: "trade" });
    state = res2.state;
    
    // Attempt trade 1
    const offerPayload = { offer: { bonds: 5, cash: 0, stocks: 0 }, request: { cash: 5, bonds: 0, stocks: 0 }, toPlayerId: "p2" };
    const res3 = dispatch(state, "trade-offer", offerPayload);
    state = res3.state; // Trade pending
    
    // Bob REJECTS trade
    state.currentPlayerIndex = 1;
    const res4 = dispatch(state, "trade-response", { accept: false });
    state = res4.state; // Now in rebalance-required
    
    // Attempt trade 2 (should fail)
    state.currentPlayerIndex = 0; // back to Alice
    const res5 = dispatch(state, "trade-offer", offerPayload);
    
    expect(res5.sideEffect?.type).toBe("error");
    expect((res5.sideEffect as any).message).toContain("Trade already attempted");
    
    console.log("Blocked Error Message:", (res5.sideEffect as any).message);
    console.log("===================================================\n");
  });
});

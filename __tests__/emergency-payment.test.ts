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
      },
      {
        id: "p2",
        name: "Other Player",
        avatar: "",
        isBot: false,
        cash: 10,
        bonds: 10,
        stocks: 10,
        hasHouse: false,
        jobLossActive: false,
        incomeFreezeActive: false,
        wealthDeclared: false,
        position: 0,
        year: 1,
        turnsWithJobLoss: 0,
        hasTraded: false,
      }
    ],
    log: []
  };
}

describe("Emergency Rebalance Flow Verification", () => {
  it("Test C: Emergency -> Rebalance -> Bonds+Stocks < 5L -> Cash < amount (Deadlock prevention)", () => {
    // 3L bonds + 2L stocks = 5L total, but neither is >= 5L block.
    let state = createTestState({ cash: 7, bonds: 3, stocks: 2 });
    state.players[0].position = 5; // Emergency tile
    
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
    expect(result.state.phase).toBe("trade");
  });

  it("Case B: One legal rebalance possible. Triggers needs-rebalance.", () => {
    // 5L bonds, 0L stocks. They CAN legally rebalance.
    let state = createTestState({ cash: 4, bonds: 5, stocks: 0 });
    state.players[0].position = 5;
    
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
    expect(result.state.phase).toBe("trade");
  });

  it("Test A & B: Emergency -> Rebalance -> 3L Penalty -> Cash sufficient -> One-time deduction & no loops", () => {
    let state = createTestState({ cash: 1, bonds: 15, stocks: 10 });
    state.players[0].position = 5;
    
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

    // Verify phase transitioned correctly so Tile Action doesn't reappear
    expect(result.state.phase).toBe("trade");
  });
});

describe("Emergency Trade Initiation Tests", () => {
  it("Test 1: Click Initiate Trade maintains state and opens Trade Modal", () => {
    let state = createTestState({ cash: 0, bonds: 0, stocks: 0 });
    state.players[0].position = 5;
    
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
    state.players[0].position = 5;
    
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
    state.players[0].position = 5;
    
    let result = dispatch(state, "tile-action", { amount: 5 });
    const eventIdBefore = result.state.emergencyState?.eventId;
    
    // Simulate a page refresh calling an unhandled action or doing nothing
    let refreshResult = dispatch(result.state, "unknown-action", {});
    
    expect(refreshResult.state.emergencyState?.amount).toBe(5);
    expect(refreshResult.state.emergencyState?.eventId).toBe(eventIdBefore);
    expect(refreshResult.state.emergencyState?.status).toBe("awaiting-decision");
  });

  describe("Emergency Cleared After Trade Tests", () => {
    it("Test 1: Emergency -> Initiate Trade -> Trade Accepted -> Emergency Paid", () => {
      let state = createTestState({ cash: 0, bonds: 0, stocks: 0 });
      state.players[0].position = 5;
      
      let res = dispatch(state, "tile-action", { amount: 5 });
      expect(res.state.emergencyState?.status).toBe("awaiting-decision");
      
      res = dispatch(res.state, "emergency-decision", { decision: "trade" });
      expect(res.state.emergencyState?.status).toBe("awaiting-trade-response");
      
      res = dispatch(res.state, "trade-offer", { toPlayerId: "p2", offer: { cash: 0, bonds: 0, stocks: 0 }, request: { cash: 5, bonds: 0, stocks: 0 } });
      expect(res.state.phase).toBe("waiting-trade");
      
      // Give P1 enough cash to fulfill
      res.state.players[1].cash = 10;
      res = dispatch(res.state, "trade-response", { accept: true });
      expect(res.state.emergencyState).toBeUndefined();
      expect(res.state.phase).toBe("trade"); // resolveTrade sets phase to "trade"
    });

    it("Test 2 & 3: Normal trade is allowed next turn, emergencyState is undefined", () => {
      let state = createTestState({ cash: 0, bonds: 0, stocks: 0 });
      state.players[0].position = 5;
      
      let res = dispatch(state, "tile-action", { amount: 5 });
      res = dispatch(res.state, "emergency-decision", { decision: "trade" });
      res = dispatch(res.state, "trade-offer", { toPlayerId: "p2", offer: { cash: 0, bonds: 0, stocks: 0 }, request: { cash: 5, bonds: 0, stocks: 0 } });
      res.state.players[1].cash = 10;
      res = dispatch(res.state, "trade-response", { accept: true });
      
      // State is clear
      expect(res.state.emergencyState).toBeUndefined();

      // Next Turn (simulate page refresh just means using the same state)
      // Normal trade by the same player
      res.state.players[0].cash = 10; // Give them cash to trade
      let normalTradeRes = dispatch(res.state, "trade-offer", { toPlayerId: "p2", offer: { cash: 1 }, request: { bonds: 1 } });
      
      // Should NOT have an error
      expect(normalTradeRes.sideEffect?.type).not.toBe("error");
      expect(normalTradeRes.state.phase).toBe("waiting-trade");
    });

    it("Test 4: New emergency generates a fresh eventId", () => {
      let state = createTestState({ cash: 0, bonds: 0, stocks: 0 });
      state.players[0].position = 5;
      
      let res1 = dispatch(state, "tile-action", { amount: 5 });
      const eventId1 = res1.state.emergencyState?.eventId;
      
      res1 = dispatch(res1.state, "emergency-decision", { decision: "trade" });
      res1 = dispatch(res1.state, "trade-offer", { toPlayerId: "p2", offer: { cash: 0, bonds: 0, stocks: 0 }, request: { cash: 5, bonds: 0, stocks: 0 } });
      res1.state.players[1].cash = 10;
      res1 = dispatch(res1.state, "trade-response", { accept: true });
      
      expect(res1.state.emergencyState).toBeUndefined();

      // Later, player 0 lands on another emergency
      res1.state.players[0].cash = 0; // ensure they can't pay
      let res2 = dispatch(res1.state, "tile-action", { amount: 5 });
      
      const eventId2 = res2.state.emergencyState?.eventId;
      
      expect(eventId2).toBeDefined();
      expect(eventId2).not.toBe(eventId1);
      expect(res2.state.emergencyState?.tradeAttempted).toBe(false);
      expect(res2.state.emergencyState?.status).toBe("awaiting-decision");
    });
  });
});

describe("Environment-Specific Execution Path Verification", () => {
  it("Local Pass & Play: Emergency -> Trade Accepted -> Returns show-pass-device", () => {
    let state = createTestState({ cash: 0, bonds: 0, stocks: 0 });
    state.players[0].position = 5; // Emergency tile
    
    // 1. Emergency Triggered
    let result = dispatch(state, "tile-action", { amount: 10 });
    expect(result.state.emergencyState).toBeDefined();
    
    // 2. Proposer initiates Trade
    result = dispatch(result.state, "emergency-decision", { decision: "trade" });
    result = dispatch(result.state, "trade-offer", { toPlayerId: "p2", offer: { cash: 0, bonds: 0, stocks: 0 }, request: { cash: 10, bonds: 0, stocks: 0 } });
    expect(result.sideEffect?.type).toBe("show-pass-device");
    
    // 3. Responder accepts Trade
    let s = result.state;
    s = { ...s, players: [ s.players[0], { ...s.players[1], cash: 20 } ] };
    result = dispatch(s, "trade-response", { accept: true });
    
    // Verify emergency cleared
    expect(result.state.emergencyState).toBeUndefined();
    
    // Verify show-pass-device side effect exists to hand device back to proposer
    expect(result.sideEffect?.type).toBe("show-pass-device");
  });

  it("Online Multiplayer: Emergency -> Rebalance -> Side Effect cleanup works", () => {
    let state = createTestState({ cash: 5, bonds: 5, stocks: 0 });
    state.players[0].position = 5; // Emergency tile
    
    // 1. Emergency Triggered
    let result = dispatch(state, "tile-action", { amount: 10 });
    
    // 2. Proposer initiates Rebalance
    result = dispatch(result.state, "emergency-decision", { decision: "rebalance" });
    expect(result.sideEffect?.type).toBe("needs-rebalance");
    expect(result.state.emergencyState?.status).toBe("rebalance-required");
    
    // 3. Proposer successfully rebalances
    result = dispatch(result.state, "rebalance", { newCash: 7, newBonds: 0, newStocks: 0, penalty: 3 });
    
    // Verify emergency state cleared completely
    expect(result.state.emergencyState).toBeUndefined();
    
    // Verify rebalance action emits NO side effect for emergency rebalance, 
    // ensuring the client's `else` block runs to clear `pendingEmergencyAmount`.
    expect(result.sideEffect).toBeUndefined();
  });

  it("Defensive Validation: Server rejects partial payment if 5L blocks remain", () => {
    let state = createTestState({ cash: 7, bonds: 15, stocks: 15 });
    state.players[0].position = 5; // Emergency tile
    
    // 1. Emergency Triggered
    let result = dispatch(state, "tile-action", { amount: 10 });
    
    // 2. Proposer initiates Rebalance
    result = dispatch(result.state, "emergency-decision", { decision: "rebalance" });
    expect(result.state.emergencyState?.status).toBe("rebalance-required");
    
    // 3. Proposer maliciously submits an incomplete rebalance that leaves blocks available
    let s = result.state;
    s = {
      ...s,
      players: [
        { ...s.players[0], cash: 7, bonds: 15, stocks: 15 },
        ...s.players.slice(1)
      ]
    };
    result = dispatch(s, "rebalance", { newCash: 7, newBonds: 15, newStocks: 15, penalty: 0 }); 

    // Verify submission rejected
    expect(result.sideEffect?.type).toBe("error");
    expect(result.sideEffect?.message).toContain("liquidate all possible 5L blocks");
    
    // Verify emergency state remains active and unresolved
    expect(result.state.emergencyState).toBeDefined();
    expect(result.state.emergencyState?.status).toBe("rebalance-required");
  });
});


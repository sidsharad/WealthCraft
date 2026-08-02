import { describe, it, expect } from "vitest";
import { dispatch } from "../lib/game-engine/dispatcher";
import { getBotDecision, createInitialBotState } from "../lib/game-engine/bot";
import type { GameState, PlayerState } from "../lib/db/schema";
import { TILES } from "../lib/game-engine/tiles";

describe("Bot Dispatcher Orchestration Scenarios", () => {
  const createMockPlayer = (overrides: Partial<PlayerState>): PlayerState => ({
    id: "p1",
    name: "Test Player",
    avatar: "",
    isBot: true,
    botType: "DISCIPLINED",
    cash: 2,
    bonds: 0,
    stocks: 0,
    hasHouse: false,
    jobLossActive: false,
    incomeFreezeActive: false,
    position: 0,
    year: 1,
    turnsWithJobLoss: 0,
    hasTraded: false,
    wealthDeclared: false,
    botState: createInitialBotState("p1", "DISCIPLINED", []),
    ...overrides,
  });

  const createMockGameState = (players: PlayerState[], overrides: Partial<GameState> = {}): GameState => ({
    turn: 1,
    year: 1,
    currentPlayerIndex: 0,
    phase: "action",
    players,
    log: [],
    settings: {
      winningNetWorth: 100,
      enableHouseAuction: true,
      housePurchaseMandatoryYear: 3,
      jailEnabled: true
    },
    ...overrides,
  });

  const ipoIdx = TILES.findIndex(t => t.effect === "ipo");
  const emergencyIdx = TILES.findIndex(t => t.effect === "emergency");
  const htIdx = TILES.findIndex(t => t.effect === "hostile-takeover");

  it("Scenario 1: IPO with low cash bypasses hardCashFloor and allows a valid PASS", () => {
    const bot = createMockPlayer({ cash: 2 });
    bot.position = ipoIdx;
    const state = createMockGameState([bot]);

    const decision = getBotDecision(state, 0);
    expect(decision.type).toBe("tile-action");
    expect(decision.payload?.amount).toBe(0);

    const res = dispatch(state, decision.type, decision.payload);
    expect(res.sideEffect).toBeUndefined();
    expect(res.state.phase).toBe("trade");
  });

  it("Scenario 2: Emergency (cash sufficient) bypasses show-modal and automatically deducts", () => {
    const bot = createMockPlayer({ cash: 20 });
    bot.position = emergencyIdx;
    const state = createMockGameState([bot]);

    const decision = getBotDecision(state, 0);
    expect(decision.type).toBe("tile-action");

    const res = dispatch(state, decision.type, decision.payload);
    expect(res.sideEffect).toBeUndefined();
    expect(res.state.players[0].cash).toBeLessThan(20);
    expect(res.state.phase).toBe("trade");
  });

  it("Scenario 3: Emergency (cash insufficient) suppresses modal and enters awaiting-decision", () => {
    const bot = createMockPlayer({ cash: 0 });
    bot.position = emergencyIdx;
    const state = createMockGameState([bot]);

    const decision = getBotDecision(state, 0);
    const res = dispatch(state, decision.type, decision.payload);
    
    expect(res.sideEffect).toBeUndefined();
    expect(res.state.emergencyState?.status).toBe("awaiting-decision");
  });

  it("Scenario 4: Hostile Takeover explicitly skips if no legal targets exist", () => {
    const bot1 = createMockPlayer({ id: "bot1", cash: 10 });
    bot1.position = htIdx;
    const bot2 = createMockPlayer({ id: "bot2", cash: 0, bonds: 0, stocks: 0 }); // no assets

    const state = createMockGameState([bot1, bot2]);

    const decision = getBotDecision(state, 0);
    expect(decision.type).toBe("tile-action");
    expect(decision.payload?.skip).toBe(true);

    const res = dispatch(state, decision.type, decision.payload);
    expect(res.sideEffect).toBeUndefined();
    expect(res.state.phase).toBe("trade");
  });

  it("Scenario 5: Hostile Takeover graceful failure avoids deadlocks", () => {
    const bot1 = createMockPlayer({ id: "bot1", cash: 10 });
    bot1.position = htIdx;
    const bot2 = createMockPlayer({ id: "bot2", cash: 0, bonds: 0, stocks: 0 });

    const state = createMockGameState([bot1, bot2]);

    // Force an invalid payload through the dispatcher to prove it fails gracefully for bots
    const res = dispatch(state, "tile-action", { targetIdx: 1, demandType: "invalid" });
    
    // Should NOT throw an error side effect that blocks the UI
    expect(res.sideEffect).toBeUndefined();
    // Should advance the phase to prevent deadlocking the bot
    expect(res.state.phase).toBe("trade");
    expect(res.state.log[0].text).toContain("BOT ERROR");
  });

  it("Scenario 6: Lottery bot logic does not deadlock", () => {
    const lotteryPos = TILES.findIndex(t => t.effect === "lottery");
    const bot1 = createMockPlayer({ id: "bot1", position: lotteryPos, cash: 50 }); // Lottery, 50L cash
    const state = createMockGameState([bot1]);
    
    const tile = TILES[lotteryPos];
    console.log("Lottery Pos", lotteryPos, "Tile effect", tile?.effect);
    
    // First, bot decides to play lottery
    const res1 = dispatch(state, "tile-action", { play: true });
    
    // Bots should auto-resolve the lottery and move straight to trade
    expect(res1.sideEffect).toBeUndefined();
    expect(res1.state.phase).toBe("trade");
    
  });

  it("Scenario 7: House Purchase is automated and does not require UI", () => {
    // A bot passes start on Year 3, going to Year 4, triggering mandatory purchase
    const bot1 = createMockPlayer({ id: "bot1", position: 39, cash: 50, year: 3, hasHouse: false });
    const state = createMockGameState([bot1]);
    
    // They roll and pass start
    const res = dispatch(state, "roll", { dice: 3 });
    
    // Should auto-buy house
    expect(res.state.players[0].hasHouse).toBe(true);
    expect(res.state.players[0].cash).toBeLessThan(50);
    // Should transition to year-end without any UI block
    expect(res.sideEffect).toBeUndefined();
    expect(res.state.phase).toBe("year-end");
  });

  it("Scenario 8: House Auction transitions to auction phase for bots", () => {
    const haPos = TILES.findIndex(t => t.effect === "house-auction");
    const bot1 = createMockPlayer({ id: "bot1", position: haPos, cash: 50, hasHouse: false });
    const bot2 = createMockPlayer({ id: "bot2", position: 0, cash: 50, hasHouse: false });
    const state = createMockGameState([bot1, bot2]);
    
    const res = dispatch(state, "tile-action");
    
    // For auction, a show-auction side effect is emitted, but the hook doesn't block bot logic
    expect(res.sideEffect).toEqual({ type: "show-auction" });
    expect(res.state.phase).toBe("auction");
    expect(res.state.auctionState?.open).toBe(true);
  });

  it("Scenario 9: Trade Response transitions correctly without deadlocks", () => {
    const bot1 = createMockPlayer({ id: "bot1", position: 0, cash: 50 });
    const bot2 = createMockPlayer({ id: "bot2", position: 0, cash: 50 });
    const state = createMockGameState([bot1, bot2], {
      pendingTrade: {
        fromPlayerId: "bot1",
        toPlayerId: "bot2",
        offer: { cash: 10, bonds: 0, stocks: 0 },
        request: { cash: 0, bonds: 0, stocks: 0 },
        tradeType: "direct"
      }
    });

    const res = dispatch(state, "trade-response", { accept: true, responderId: "bot2" });
    
    // Returns show-pass-device but it's handled by the hook for bots
    expect(res.sideEffect).toEqual({ type: "show-pass-device" });
    expect(res.state.pendingTrade).toBeUndefined();
  });

  it("Scenario 10: Rebalance forced upon bot does not emit needs-rebalance side effect", () => {
    // When a bot takes an audit and must rebalance
    const bot1 = createMockPlayer({ id: "bot1", position: 0, cash: 50, stocks: 100 });
    // Make target player have way less stocks
    const bot2 = createMockPlayer({ id: "bot2", position: 0, cash: 50, stocks: 0 });
    const state = createMockGameState([bot1, bot2]);
    
    // Simulate an audit on bot1 by themselves? No, they target themselves or something that forces them to rebalance
    // Actually, dispatch audit:
    const res = dispatch(state, "tile-action", { targetIdx: 0 }); // They audit themselves, they have 100 stocks while max allowed might be lower if others have 0
    // Wait, the tile-action for audit needs to be dispatched properly. Let's just mock the emergency rebalance instead.
    
    // Emergency rebalance
    bot1.cash = 0;
    const state2 = createMockGameState([bot1], {
      emergencyState: { eventId: "e1", playerId: "bot1", amount: 10, tradeAttempted: false, status: "awaiting-decision" }
    });
    const res2 = dispatch(state2, "emergency-decision", { decision: "rebalance" });
    
    // It should not emit needs-rebalance for a bot
    expect(res2.sideEffect).toBeUndefined();
    expect(res2.state.emergencyState?.status).toBe("rebalance-required");
  });

  it("Scenario 11: Bankruptcy Risk prevents bot from taking bad trades", () => {
    const bot1 = createMockPlayer({ id: "bot1", position: 0, cash: 5 }); // 5L cash
    const state = createMockGameState([bot1], { phase: "waiting-trade" });
    
    state.pendingTrade = {
      fromPlayerId: "bot2",
      toPlayerId: "bot1",
      offer: { cash: 0, bonds: 0, stocks: 0 },
      request: { cash: 10, bonds: 0, stocks: 0 }, // Asking for 10L, but bot only has 5L
      tradeType: "direct"
    };
    
    const decision = getBotDecision(state, 0);
    expect(decision.type).toBe("trade-response");
    expect(decision.payload?.accept).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { getBestRebalance, getBotDecision } from "../lib/game-engine/bot";
import type { GameState, PlayerState } from "../lib/db/schema";

describe("WealthCraft AI Bots Strategic Personalities", () => {
  const createMockPlayer = (overrides: Partial<PlayerState>): PlayerState => ({
    id: "p1",
    name: "Test Player",
    avatar: "",
    isBot: true,
    botType: "balanced",
    cash: 10,
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
    ...overrides,
  });

  const createMockGameState = (players: PlayerState[], overrides: Partial<GameState> = {}): GameState => ({
    turn: 0,
    year: 1,
    currentPlayerIndex: 0,
    phase: "roll",
    players,
    log: [],
    ...overrides,
  });

  describe("Portfolio Rebalancing Logic (getBestRebalance)", () => {
    it("Defensive Bot: cash >= 10L, strictly invest only 5L into bonds", () => {
      const bot = createMockPlayer({ botType: "defensive", cash: 35, bonds: 0, stocks: 0 });
      const result = getBestRebalance(bot, 0, "defensive");

      // With 35L cash:
      // Since bot.cash (35) >= 15, the defensive bot strictly invests exactly 5L.
      // The 5L goes into bonds because it prefers bonds over stocks.
      // Resulting portfolio: bonds=5, stocks=0, cash=30.
      expect(result.newCash).toBeGreaterThanOrEqual(10);
      expect(result.newStocks).toBeLessThanOrEqual(25);
      expect(result.newBonds).toBe(5);
      expect(result.newStocks).toBe(0);
      expect(result.newCash).toBe(30);
    });

    it("Balanced Bot: cash >= 5L, split 50/50", () => {
      const bot = createMockPlayer({ botType: "balanced", cash: 35, bonds: 0, stocks: 0 });
      const result = getBestRebalance(bot, 0, "balanced");

      // With 35L total wealth:
      // Minimum cash buffer is 5L.
      // Remaining 30L is split 50/50 -> bonds=15, stocks=15, cash=5.
      expect(result.newCash).toBeGreaterThanOrEqual(5);
      expect(result.newBonds).toBe(15);
      expect(result.newStocks).toBe(15);
      expect(result.newCash).toBe(5);
    });

    it("Aggressive Bot: cash >= 3L, heavily prefer stocks", () => {
      const bot = createMockPlayer({ botType: "aggressive", cash: 35, bonds: 0, stocks: 0 });
      const result = getBestRebalance(bot, 0, "aggressive");

      // With 35L total wealth:
      // Minimum cash buffer is 3L.
      // Remaining 32L can be allocated. Since stock adjustments must be in complete 5L blocks:
      // Max stocks multiple <= 32L is 30L.
      // So newStocks=30L, newBonds=0L, newCash=5L.
      expect(result.newCash).toBeGreaterThanOrEqual(3);
      expect(result.newStocks).toBe(30);
      expect(result.newBonds).toBe(0);
      expect(result.newCash).toBe(5);
    });
  });

  describe("Audit Trigger Logic", () => {
    it("Defensive Bot: Audits only when highly confident (asset > 40L)", () => {
      const bot = createMockPlayer({ botType: "defensive", cash: 10 });
      const targetNormal = createMockPlayer({ id: "p2", cash: 10, bonds: 10, stocks: 20 });
      const targetAuditable = createMockPlayer({ id: "p2", cash: 10, bonds: 10, stocks: 45 }); // stocks > 40

      // Case A: normal opponent -> no audit
      let state = createMockGameState([bot, targetNormal], { phase: "trade" });
      let decision = getBotDecision(state, 0);
      expect(decision.type).toBe("end-turn");

      // Case B: auditable opponent -> audits target
      state = createMockGameState([bot, targetAuditable], { phase: "trade" });
      decision = getBotDecision(state, 0);
      expect(decision.type).toBe("audit");
      expect(decision.payload?.targetIdx).toBe(1);
    });

    it("Aggressive Bot: Audits high-stock players aggressively (stocks >= 25L)", () => {
      const bot = createMockPlayer({ botType: "aggressive", cash: 10 });
      const targetWithStocks = createMockPlayer({ id: "p2", cash: 10, bonds: 5, stocks: 25 }); // stocks >= 25

      const state = createMockGameState([bot, targetWithStocks], { phase: "trade" });
      const decision = getBotDecision(state, 0);
      expect(decision.type).toBe("audit");
      expect(decision.payload?.targetIdx).toBe(1);
    });
  });

  describe("Auction Bidding Logic", () => {
    it("Defensive Bot auction bidding keeps a 10L cash buffer", () => {
      const bot = createMockPlayer({ botType: "defensive", cash: 25 }); // has 25L cash
      const state = createMockGameState([bot], { phase: "auction" });
      const decision = getBotDecision(state, 0);

      // Max bid: cash (25) - buffer (10) = 15L.
      // Market price limit is 20L - 1 = 19L.
      // So bid should be 15L.
      expect(decision.type).toBe("house-auction-bid");
      expect(decision.payload?.amount).toBe(15);
    });

    it("Balanced Bot auction bidding keeps a 5L cash buffer", () => {
      const bot = createMockPlayer({ botType: "balanced", cash: 25 }); // has 25L cash
      const state = createMockGameState([bot], { phase: "auction" });
      const decision = getBotDecision(state, 0);

      // Max bid: cash (25) - buffer (5) = 20L.
      // Market price limit is 20L - 3 = 17L.
      // So bid should be 17L.
      expect(decision.type).toBe("house-auction-bid");
      expect(decision.payload?.amount).toBe(17);
    });
  });
});

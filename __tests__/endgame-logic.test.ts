import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameState } from "../lib/db/schema";
import { advanceTurn, checkWinCondition } from "../lib/game-engine/actions";

function createMockState(playersCount: number): GameState {
  return {
    turn: 1,
    year: 1,
    currentPlayerIndex: 0,
    phase: "action",
    players: Array.from({ length: playersCount }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      cash: 10,
      bonds: 0,
      stocks: 0,
      position: 0,
      hasHouse: false,
      isActive: true,
    })),
    log: []
  };
}

describe("Endgame Candidate Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("2-Player Game", () => {
    it("Player 1 triggers, Player 2 gets turn, then game ends", () => {
      let state = createMockState(2);
      state.players[0].cash = 100; // P1 triggers endgame

      state = advanceTurn(state);
      expect(state.endgameCandidate).toBe(true);
      expect(state.endgameTriggeredByPlayerId).toBe("p1");
      expect(state.phase).not.toBe("finished");
      expect(state.currentPlayerIndex).toBe(1);

      // P2 completes turn
      state = advanceTurn(state);
      expect(state.phase).toBe("finished");
    });

    it("Player 2 triggers, game ends immediately", () => {
      let state = createMockState(2);
      state.currentPlayerIndex = 1;
      state.players[1].cash = 100; // P2 triggers endgame

      state = advanceTurn(state);
      expect(state.endgameCandidate).toBe(true);
      expect(state.phase).toBe("finished");
    });
  });

  describe("3-Player Game", () => {
    it("Player 1 triggers, P2 and P3 get turns, then ends", () => {
      let state = createMockState(3);
      state.players[0].cash = 100; // P1 triggers endgame

      state = advanceTurn(state);
      expect(state.endgameCandidate).toBe(true);
      expect(state.currentPlayerIndex).toBe(1);
      expect(state.phase).not.toBe("finished");

      state = advanceTurn(state);
      expect(state.endgameCandidate).toBe(true);
      expect(state.currentPlayerIndex).toBe(2);
      expect(state.phase).not.toBe("finished");

      state = advanceTurn(state);
      expect(state.phase).toBe("finished");
    });

    it("Player 2 triggers, P3 gets turn, then ends", () => {
      let state = createMockState(3);
      state.currentPlayerIndex = 1;
      state.players[1].cash = 100; // P2 triggers endgame

      state = advanceTurn(state);
      expect(state.endgameCandidate).toBe(true);
      expect(state.currentPlayerIndex).toBe(2);
      expect(state.phase).not.toBe("finished");

      state = advanceTurn(state);
      expect(state.phase).toBe("finished");
    });

    it("Player 3 triggers, ends immediately", () => {
      let state = createMockState(3);
      state.currentPlayerIndex = 2;
      state.players[2].cash = 100; // P3 triggers endgame

      state = advanceTurn(state);
      expect(state.endgameCandidate).toBe(true);
      expect(state.phase).toBe("finished");
    });
  });

  describe("Endgame Candidate Cancellation", () => {
    it("Cancels endgame if no player is >= 100L at round end", () => {
      let state = createMockState(2);
      state.players[0].cash = 100; // P1 hits 100L

      state = advanceTurn(state);
      expect(state.endgameCandidate).toBe(true);
      
      // P1 drops below 100L during P2's turn (e.g. Hostile Takeover)
      state.players[0].cash = 95; 
      
      // P2 finishes
      state = advanceTurn(state);
      expect(state.endgameCandidate).toBe(false); // Cancelled
      expect(state.phase).not.toBe("finished");
      expect(state.currentPlayerIndex).toBe(0); // Next round
    });

    it("Ends if multiple players are above 100L", () => {
      let state = createMockState(2);
      state.players[0].cash = 105; 
      state = advanceTurn(state);

      state.players[1].cash = 110; 
      state = advanceTurn(state);

      expect(state.phase).toBe("finished");
    });
  });

  describe("Tie-Breaker Rules", () => {
    it("Tie-break by Stocks", () => {
      let state = createMockState(2);
      state.players[0].cash = 110;
      state.players[1].cash = 60;
      state.players[1].stocks = 50; // Total 110
      state.currentPlayerIndex = 1;

      state = advanceTurn(state);
      expect(state.phase).toBe("finished");
      expect(state.announcement).toContain("Player 2"); // P2 has 50 stocks vs 0
    });

    it("Tie-break by Bonds", () => {
      let state = createMockState(2);
      state.players[0].cash = 60;
      state.players[0].stocks = 50; // Total 110, Stocks 50
      state.players[1].cash = 20;
      state.players[1].bonds = 40;
      state.players[1].stocks = 50; // Total 110, Stocks 50, Bonds 40
      state.currentPlayerIndex = 1;

      state = advanceTurn(state);
      expect(state.phase).toBe("finished");
      expect(state.announcement).toContain("Player 2"); // P2 has more bonds
    });

    it("Tie-break by Cash", () => {
      let state = createMockState(2);
      state.players[0].cash = 10;
      state.players[0].bonds = 50;
      state.players[0].stocks = 50; // Total 110, Stocks 50, Bonds 50, Cash 10
      state.players[1].cash = 20;
      state.players[1].bonds = 40;
      state.players[1].stocks = 50; // Total 110, Stocks 50, Bonds 40, Cash 20
      state.currentPlayerIndex = 1;

      state = advanceTurn(state);
      expect(state.phase).toBe("finished");
      expect(state.announcement).toContain("Player 1"); // P1 wins on Bonds since 50 > 40
    });
  });

  describe("4-Player Game Edge Cases", () => {
    it("Exact 100L threshold triggers endgame", () => {
      let state = createMockState(4);
      state.players[0].cash = 100; // EXACTLY 100L

      state = advanceTurn(state);
      expect(state.endgameCandidate).toBe(true);

      // Advance through P2, P3, P4
      state = advanceTurn(state);
      state = advanceTurn(state);
      state = advanceTurn(state);

      expect(state.phase).toBe("finished");
    });

    it("Multiple candidates in 4-player game (Simultaneous winners)", () => {
      let state = createMockState(4);
      
      // Round Start: P1 = 98L, P2 = 96L, P3 = 90L, P4 = 80L
      state.players[0].cash = 101; // P1 crosses 100L during turn
      
      // Capture console logs for telemetry
      const consoleSpy = vi.spyOn(console, 'log');

      state = advanceTurn(state);
      expect(state.endgameCandidate).toBe(true);
      expect(state.endgameTriggeredByPlayerId).toBe("p1");

      // P2's turn
      state.players[1].cash = 104; // P2 also crosses 100L
      state = advanceTurn(state);
      expect(state.phase).not.toBe("finished"); // Game doesn't end yet!

      // P3's turn
      state = advanceTurn(state);

      // P4's turn (Final player)
      state = advanceTurn(state);
      
      expect(state.phase).toBe("finished");
      expect(state.announcement).toContain("Player 2"); // Player 2 wins (104L > 101L)

      // Collect JSON telemetry
      const telemetry = consoleSpy.mock.calls
        .map(call => {
          try {
             return JSON.parse(call[0]);
          } catch (e) {
             return null;
          }
        })
        .filter(t => t && t.event);
        
      const events = telemetry.map(t => t.event);
      expect(events).toContain("ENDGAME_TRIGGERED");
      expect(events).toContain("ENDGAME_ROUND_COMPLETE");
      expect(events).toContain("WINNER_RANKING");
      
      consoleSpy.mockRestore();
    });
  });
});

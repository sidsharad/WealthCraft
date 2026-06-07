import { describe, it, expect } from "vitest";
import { GameState } from "../lib/db/schema";
import { advanceTurn, netWorth } from "../lib/game-engine/actions";

describe("Endgame Fairness Bug Fix", () => {
  const createBaseState = (): GameState => ({
    turn: 0,
    year: 1,
    currentPlayerIndex: 0,
    phase: "trade",
    players: [
      { id: "p1", name: "P1", position: 0, cash: 10, bonds: 0, stocks: 0, hasHouse: false, hasTraded: false },
      { id: "p2", name: "P2", position: 0, cash: 10, bonds: 0, stocks: 0, hasHouse: false, hasTraded: false },
      { id: "p3", name: "P3", position: 0, cash: 10, bonds: 0, stocks: 0, hasHouse: false, hasTraded: false },
      { id: "p4", name: "P4", position: 0, cash: 10, bonds: 0, stocks: 0, hasHouse: false, hasTraded: false },
    ],
    log: [],
  });

  const runEndgameTest = (triggeringIndex: number) => {
    let state = createBaseState();
    state.currentPlayerIndex = triggeringIndex;
    
    // Simulate triggering player reaching 100L
    state.players[triggeringIndex].cash = 105;

    // Advance turn from the triggering player
    state = advanceTurn(state);

    // Verify endgame was triggered
    expect(state.endgameCandidate).toBe(true);
    expect(state.endgameTriggeredPlayerIndex).toBe(triggeringIndex);

    // Keep advancing turns until the game is finished
    let turnsTaken = 0;
    while (state.phase !== "finished" && turnsTaken < 10) {
      // Simulate next player's turn ending
      state = advanceTurn(state);
      turnsTaken++;
    }

    // Verify game finished exactly before the triggering player's next turn
    expect(state.phase).toBe("finished");
    
    // In a 4 player game, the other 3 players each take 1 final turn.
    // So `advanceTurn` should have been called exactly 3 times inside the loop.
    expect(turnsTaken).toBe(3);
  };

  it("Case A: P1 (index 0) triggers endgame", () => {
    runEndgameTest(0);
  });

  it("Case B: P2 (index 1) triggers endgame", () => {
    runEndgameTest(1);
  });

  it("Case C: P3 (index 2) triggers endgame", () => {
    runEndgameTest(2);
  });

  it("Case D: P4 (index 3) triggers endgame", () => {
    runEndgameTest(3);
  });
});

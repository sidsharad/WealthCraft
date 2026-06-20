import { expect, test, describe } from "vitest";
import { trimGameState, MAX_LOG_ENTRIES, MAX_PROCESSED_ACTIONS } from "../lib/game-engine/utils";
import { dispatch } from "../lib/game-engine/dispatcher";
import { GameState, LogEntry } from "../lib/db/schema";
import { createInitialGameState } from "../lib/game-engine/actions";

describe("Payload Truncation Controls", () => {
  test("Test A - Log Truncation", () => {
    const logs: LogEntry[] = Array.from({ length: 100 }).map((_, i) => ({
      id: `log-${i + 1}`,
      turn: 1,
      year: 1,
      type: "system",
      message: `Message ${i + 1}`,
      timestamp: new Date().toISOString()
    }));

    const mockState = { log: logs } as GameState;
    const trimmed = trimGameState(mockState);

    expect(trimmed.log.length).toBe(MAX_LOG_ENTRIES);
    expect(trimmed.log[0].id).toBe("log-51");
    expect(trimmed.log[MAX_LOG_ENTRIES - 1].id).toBe("log-100");
  });

  test("Test B - Processed Action Truncation", () => {
    const actionIds = Array.from({ length: 100 }).map((_, i) => `action-${i + 1}`);

    const mockState = { processedActionIds: actionIds } as GameState;
    const trimmed = trimGameState(mockState);

    expect(trimmed.processedActionIds.length).toBe(MAX_PROCESSED_ACTIONS);
    expect(trimmed.processedActionIds[0]).toBe("action-51");
    expect(trimmed.processedActionIds[MAX_PROCESSED_ACTIONS - 1]).toBe("action-100");
  });

  test("Test C - Dispatcher Integration", () => {
    let state = createInitialGameState([
      { id: "p1", name: "P1", avatar: "", isBot: false },
      { id: "p2", name: "P2", avatar: "", isBot: false },
    ]);

    // artificially pad state to just below threshold
    state.log = Array.from({ length: 48 }).map((_, i) => ({
      id: `log-${i + 1}`, turn: 1, year: 1, type: "system", message: "M", timestamp: ""
    }));
    state.processedActionIds = Array.from({ length: 48 }).map((_, i) => `action-${i + 1}`);

    // Cycle actions: 5 cycles should push it over 50 easily
    for (let i = 0; i < 5; i++) {
      const res1 = dispatch(state, "roll", { dice: 1 });
      state = res1.state;
      expect(state.log.length).toBeLessThanOrEqual(MAX_LOG_ENTRIES);
      expect(state.processedActionIds.length).toBeLessThanOrEqual(MAX_PROCESSED_ACTIONS);

      const res2 = dispatch(state, "tile-action");
      state = res2.state;
      expect(state.log.length).toBeLessThanOrEqual(MAX_LOG_ENTRIES);
      expect(state.processedActionIds.length).toBeLessThanOrEqual(MAX_PROCESSED_ACTIONS);

      const res3 = dispatch(state, "end-turn");
      state = res3.state;
      expect(state.log.length).toBeLessThanOrEqual(MAX_LOG_ENTRIES);
      expect(state.processedActionIds.length).toBeLessThanOrEqual(MAX_PROCESSED_ACTIONS);
    }
  });
});

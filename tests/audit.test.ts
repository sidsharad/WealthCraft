import { describe, it, expect } from "vitest";
import { processConcentrationAudit } from "../lib/game-engine/actions";
import { GameState, PlayerState } from "../lib/db/schema";
import { FALSE_AUDIT_PENALTY } from "../lib/game-engine/tiles";

function createMockGameState(year: number, players: Partial<PlayerState>[]): GameState {
  return {
    roomId: "test-room",
    phase: "trade",
    turnCount: 1,
    year,
    currentPlayerIndex: 0,
    players: players.map((p, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      cash: 10,
      bonds: 0,
      stocks: 0,
      hasHouse: false,
      year: year,
      wealthDeclared: false,
      position: 0,
      ...p
    }) as PlayerState),
    log: [],
    events: [],
    boardState: {}
  };
}

describe("Dynamic Audit Threshold", () => {
  it("Year 1 audit at 25L asset -> succeeds", () => {
    // Threshold is 20L in Year 1
    const state = createMockGameState(1, [
      { cash: 10, bonds: 0, stocks: 0 }, // p1 (auditor)
      { cash: 10, bonds: 0, stocks: 25 } // p2 (target)
    ]);
    const result = processConcentrationAudit(state, 0, 1);
    
    expect(result.valid).toBe(true);
    expect(result.auditFailed).toBeUndefined(); // success
    
    const auditor = result.state.players[0];
    const target = result.state.players[1];
    
    expect(target.stocks).toBe(20); // capped at 20L limit
    expect(auditor.stocks).toBe(5); // excess (5L) transferred to auditor
  });

  it("Year 2 audit at 30L asset -> succeeds", () => {
    // Threshold is 20L in Year 2
    const state = createMockGameState(2, [
      { cash: 10, bonds: 0, stocks: 0 }, // p1 (auditor)
      { cash: 30, bonds: 0, stocks: 0 }  // p2 (target)
    ]);
    const result = processConcentrationAudit(state, 0, 1);
    
    expect(result.valid).toBe(true);
    expect(result.auditFailed).toBeUndefined(); // success
    
    const auditor = result.state.players[0];
    const target = result.state.players[1];
    
    expect(target.cash).toBe(20); // capped at 20L limit
    expect(auditor.cash).toBe(10 + 10); // initial 10L + 10L excess
  });

  it("Year 3 audit at 30L asset -> fails", () => {
    // Threshold is 40L in Year 3
    const state = createMockGameState(3, [
      { cash: 10, bonds: 0, stocks: 0 }, // p1 (auditor)
      { cash: 10, bonds: 30, stocks: 0 } // p2 (target)
    ]);
    const result = processConcentrationAudit(state, 0, 1);
    
    expect(result.valid).toBe(true);
    expect(result.auditFailed).toBe(true); // failed
    
    const auditor = result.state.players[0];
    const target = result.state.players[1];
    
    expect(target.bonds).toBe(30); // untouched
    expect(auditor.cash).toBe(10 - FALSE_AUDIT_PENALTY); // penalty paid
  });

  it("Year 3 audit at 45L asset -> succeeds", () => {
    // Threshold is 40L in Year 3
    const state = createMockGameState(3, [
      { cash: 10, bonds: 0, stocks: 0 }, // p1 (auditor)
      { cash: 10, bonds: 0, stocks: 45 } // p2 (target)
    ]);
    const result = processConcentrationAudit(state, 0, 1);
    
    expect(result.valid).toBe(true);
    expect(result.auditFailed).toBeUndefined(); // success
    
    const auditor = result.state.players[0];
    const target = result.state.players[1];
    
    expect(target.stocks).toBe(40); // capped at 40L
    expect(auditor.stocks).toBe(5); // 5L excess transferred to auditor
  });
});

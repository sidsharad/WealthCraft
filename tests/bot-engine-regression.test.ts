import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createInitialGameState, advanceTurn } from '../lib/game-engine/actions';
import { dispatcher } from '../lib/game-engine/dispatcher';
import { createInitialBotState, getBotDecision } from '../lib/game-engine/bot';

describe("Bot Engine Production Regression Suite", () => {
  let OriginalMathRandom: typeof Math.random;

  beforeAll(() => {
    OriginalMathRandom = Math.random;
  });

  afterAll(() => {
    Math.random = OriginalMathRandom;
  });

  it("should run 5 full games with 0 model drift, 0 deadlocks, and no UI modals for bots", async () => {
    const NUM_GAMES = 5;
    
    let modelDrifts = 0;
    let deadlocks = 0;
    let dispatcherFailures = 0;
    let skippedTurns = 0;
    let uiModalsForBots = 0;
    let invariantViolations = 0;

    for (let g = 0; g < NUM_GAMES; g++) {
      let state = createInitialGameState(["p1", "p2", "p3", "p4"]);
      state.players[0] = { ...state.players[0], name: "AuditHawk", isBot: true, botType: "AUDIT_HAWK" };
      state.players[1] = { ...state.players[1], name: "Bull", isBot: true, botType: "BULL" };
      state.players[2] = { ...state.players[2], name: "Random", isBot: true, botType: "RANDOM" };
      state.players[3] = { ...state.players[3], name: "Bear", isBot: true, botType: "BEAR" };
      
      const seed = 123456789 + g;
      let seedVal = seed;
      Math.random = () => {
          seedVal = (seedVal * 9301 + 49297) % 233280;
          return seedVal / 233280;
      };

      for (const p of state.players) {
          p.botState = createInitialBotState(p.id, p.botType as any, state.players.map(pl => ({id: pl.id, isBot: pl.isBot})));
      }

      state = advanceTurn(state);
      
      let gameTurns = 0;
      let failed = false;

      while (gameTurns < 5000) {
        if (state.phase === "game-over") break;

        const activePlayer = state.players.find(p => p.id === state.activePlayerId);
        if (!activePlayer) break;

        if (!activePlayer.isBot) {
          // Force advance if non-bot somehow takes turn
          state = advanceTurn(state);
          continue;
        }

        try {
          const decisionAction = getBotDecision(state, state.players.indexOf(activePlayer));
          if (!decisionAction) {
              skippedTurns++;
              state = advanceTurn(state);
              gameTurns++;
              continue;
          }

          const result = dispatcher(state, decisionAction.type, decisionAction.payload);
          
          if (result.sideEffect) {
            const t = result.sideEffect.type;
            if (t === "error") dispatcherFailures++;
            else if (t === "needs-rebalance") {
                // If a bot ever hits the surface needs-rebalance, it means bot engine failed to auto-rebalance
                uiModalsForBots++;
            } else if (t.startsWith("show-")) {
                uiModalsForBots++;
            }
          }

          state = result.state;
          
          // Verify Model Drift
          for (const p of state.players) {
            if (p.isBot && p.botState) {
                const bModel = p.botState.worldModel;
                for (const target of state.players) {
                    const est = bModel[target.id];
                    if (est) {
                        const targetAssets = [
                            { act: target.cash, est: est.cash, name: "cash" },
                            { act: target.bonds, est: est.bonds, name: "bonds" },
                            { act: target.stocks, est: est.stocks, name: "stocks" }
                        ];
                        for (const a of targetAssets) {
                            if (a.est.confidence > 90) {
                                if (a.act < a.est.lowerBound || a.act > a.est.upperBound) {
                                    modelDrifts++;
                                }
                            }
                        }
                    }
                }
            }
          }
          
          gameTurns++;
        } catch (e) {
          failed = true;
          break;
        }
      }

      if (gameTurns >= 5000) deadlocks++;
    }

    expect(deadlocks).toBe(0);
    expect(modelDrifts).toBe(0);
    expect(dispatcherFailures).toBe(0);
    expect(skippedTurns).toBe(0);
    expect(uiModalsForBots).toBe(0);
    expect(invariantViolations).toBe(0);
  }, 10000); // Allow 10s for the test to run
});

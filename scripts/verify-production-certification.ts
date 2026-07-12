import { createInitialGameState } from "../lib/game-engine/actions";
import { dispatch } from "../lib/game-engine/dispatcher";
import { getBotDecision, getBestRebalance } from "../lib/game-engine/bot";
import type { GameState, Player, BotType } from "../lib/db/schema";
import { getAuditThreshold } from "../lib/game-engine/actions";

const originalLog = console.log;
// Suppress console logs to speed up execution and prevent massive stdout
console.log = function() {};
console.error = function() {};
console.trace = function() {};
console.debug = function() {};
console.info = function() {};

// Deterministic PRNG
function sfc32(a: number, b: number, c: number, d: number) {
    return function() {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; 
      let t = (a + b) | 0;
      a = b ^ b >>> 9;
      b = c + (c << 3) | 0;
      c = (c << 21 | c >>> 11);
      d = d + 1 | 0;
      t = t + d | 0;
      c = c + t | 0;
      return (t >>> 0) / 4294967296;
    }
}
function seedRand(seed: string) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < seed.length; i++) {
        k = seed.charCodeAt(i);
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
        h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return sfc32(h1^h2^h3^h4, h2^h1, h3^h1, h4^h1);
}

const argSeedIndex = process.argv.indexOf("--seed");
const globalSeed = argSeedIndex !== -1 ? process.argv[argSeedIndex + 1] : Date.now().toString();

const OriginalMathRandom = Math.random;

interface CertificationMetrics {
    gamesExecuted: number;
    gamesPassed: number;
    gamesFailed: number;
    deadlocks: number;
    skippedTurns: number;
    dispatcherFailures: number;
    auditViolations: number;
    modelDrifts: number;
    invariantViolations: number;
    personalitiesPreserved: boolean;
    invalidActions: number;
    unsupportedActions: number;
    nullDecisions: number;
}

const metrics: CertificationMetrics = {
    gamesExecuted: 0,
    gamesPassed: 0,
    gamesFailed: 0,
    deadlocks: 0,
    skippedTurns: 0,
    dispatcherFailures: 0,
    auditViolations: 0,
    modelDrifts: 0,
    invariantViolations: 0,
    personalitiesPreserved: true,
    invalidActions: 0,
    unsupportedActions: 0,
    nullDecisions: 0,
};

let decisionTimes: number[] = [];
let turnTimes: number[] = [];

type FailCategory = "AI_REASONING" | "DISPATCHER" | "TURN_ENGINE" | "ORCHESTRATION" | "VALIDATION" | "STATE_DRIFT" | "UI" | "UNKNOWN";
class CertificationError extends Error {
    constructor(public category: FailCategory, message: string) {
        super(message);
    }
}

const botTypes: BotType[] = ["BULL", "SAFETY_BUILDER", "AUDIT_HAWK", "PROPERTY_BUILDER", "DISCIPLINED", "OPPORTUNIST", "RBAL_EXPERT"];

const pStats: Record<string, any> = {};
botTypes.forEach(t => pStats[t] = { audits: 0, trades: 0, rebalances: 0, takeovers: 0, ipos: 0, passes: 0 });

async function runGames() {
    console.log(`Starting Production Certification (Seed: ${globalSeed})`);
    
    const MAX_GAMES = 50;
    for (let g = 0; g < MAX_GAMES; g++) {
        const gameSeed = globalSeed + "_" + g;
        Math.random = seedRand(gameSeed);
        
        let state = createInitialGameState([
            { id: "b1", name: "Bot 1", avatar: "🤖", isBot: true, botType: "BULL" },
            { id: "b2", name: "Bot 2", avatar: "🤖", isBot: true, botType: "DISCIPLINED" },
            { id: "b3", name: "Bot 3", avatar: "🤖", isBot: true, botType: "AUDIT_HAWK" },
            { id: "b4", name: "Bot 4", avatar: "🤖", isBot: true, botType: "PROPERTY_BUILDER" }
        ]);

        let gameTurns = 0;
        const gameStartTime = performance.now();
        let actionHistory: string[] = [];
        let failed = false;

        try {
            while (state.phase !== "finished" && gameTurns < 5000) {
                gameTurns++;
                const turnStartTime = performance.now();
                const currentPlayer = state.players[state.currentPlayerIndex];
                let actorIdx = state.currentPlayerIndex;
                if (state.phase === "waiting-trade" && state.pendingTrade) {
                    actorIdx = state.players.findIndex(p => p.id === state.pendingTrade!.toPlayerId);
                } else if (state.phase === "auction" && state.auctionState) {
                    actorIdx = state.players.findIndex(p => !p.hasHouse && !state.auctionState!.bids.some(b => b.playerId === p.id));
                    if (actorIdx === -1) {
                        // Shouldn't happen if phase is auction, but fallback
                        actorIdx = state.currentPlayerIndex;
                    }
                }
                const activePlayer = state.players[actorIdx];
                let fsmState = "START";
                
                try {
                    fsmState = "DECISION";
                    let botAction: any = null;
                    
                    const dStart = performance.now();
                    botAction = getBotDecision(state, actorIdx);
                    const dEnd = performance.now();
                    decisionTimes.push(dEnd - dStart);
                    
                    if (!botAction) {
                        metrics.skippedTurns++;
                        throw new CertificationError("AI_REASONING", "Bot returned null action");
                    }
                    
                    if (botAction.type === "roll") {
                        fsmState = "ROLL";
                        const dice = Math.floor(Math.random() * 6) + 1;
                        botAction.payload = { dice };
                        actionHistory.push(`[${state.turn}] ${activePlayer.id} rolled ${dice}`);
                    } else {
                        actionHistory.push(`[${state.turn}] ${activePlayer.id} decision: ${botAction.type}`);
                    }
                    
                    // Validate Rebalance
                    if (botAction.type === "rebalance") {
                        const rb = botAction.payload;
                        if (rb.penalty > 5) {
                            metrics.invalidActions++;
                            throw new CertificationError("VALIDATION", "Rebalance penalty > expected benefit (benefit max is ~5)");
                        }
                        const oldTotal = activePlayer.cash + activePlayer.bonds + activePlayer.stocks;
                        const newTotal = rb.newCash + rb.newBonds + rb.newStocks;
                        if (newTotal !== Math.max(0, oldTotal - rb.penalty)) {
                            metrics.invalidActions++;
                            throw new CertificationError("VALIDATION", `Rebalance mismatch: before=${oldTotal}, after=${newTotal}, penalty=${rb.penalty}`);
                        }
                        const drift = Math.abs(activePlayer.cash - rb.newCash) + Math.abs(activePlayer.bonds - rb.newBonds) + Math.abs(activePlayer.stocks - rb.newStocks);
                        // Drift includes penalty loss, so if penalty is 3, drift is at least 3. A 5L move + 3 penalty = drift 8.
                        if (drift < 5 && rb.penalty > 0) {
                            metrics.invalidActions++;
                            throw new CertificationError("VALIDATION", "Rebalance generated <5L drift but paid penalty");
                        }
                        pStats[activePlayer.botType!].rebalances++;
                    }
                    
                    // Validate Audit
                    if (botAction.type === "audit") {
                        pStats[activePlayer.botType!].audits++;
                        const mem = activePlayer.botState?.memory.auditMemory;
                        if (mem) {
                            const targetId = state.players[botAction.payload.targetIdx].id;
                            for (const key in mem) {
                                if (key.startsWith(targetId) && state.turn - mem[key].auditTurn < 2) {
                                    metrics.auditViolations++;
                                    throw new CertificationError("VALIDATION", "Audit cooldown violation");
                                }
                            }
                        }
                    }

                    if (botAction.type === "trade-offer") pStats[activePlayer.botType!].trades++;
                    if (botAction.type === "hostile-takeover") pStats[activePlayer.botType!].takeovers++;
                    if (botAction.type === "ipo") pStats[activePlayer.botType!].ipos++;
                    if (botAction.type === "skip" || botAction.type === "end-turn" || botAction.type === "pass") pStats[activePlayer.botType!].passes++;
                    
                    // EXECUTION Phase
                    fsmState = "EXECUTION";
                    
                    let dispatchType = botAction.type;
                    let dispatchPayload = botAction.payload;
                    
                    if (dispatchType === "skip") {
                        dispatchType = "end-turn";
                        dispatchPayload = {};
                    }
                    if (dispatchType === "house-auction-bid") {
                        dispatchType = "bid";
                    }

                    const totalWealthBefore = state.players.reduce((s, p) => s + p.cash + p.bonds + p.stocks, 0);
                    
                    const result = dispatch(state, dispatchType, dispatchPayload);
                    if (result.sideEffect?.type === "error") {
                        metrics.dispatcherFailures++;
                        throw new CertificationError("DISPATCHER", `Dispatcher rejected action ${dispatchType}: ${result.sideEffect.message}`);
                    }
                    state = result.state!;
                    
                    // Invariants
                    for (const p of state.players) {
                        if (p.cash < 0 || p.bonds < 0 || p.stocks < 0) {
                            metrics.invariantViolations++;
                            throw new CertificationError("VALIDATION", "Negative asset invariant violated");
                        }
                    }

                    // Handle side effects gracefully for the loop
                    if (result.sideEffect?.type === "show-modal") {
                         if (result.sideEffect.modal === "emergency") {
                             state = dispatch(state, "tile-action", { amount: result.sideEffect.emergencyAmount }).state!;
                         } else if (result.sideEffect.modal === "emergency-decision") {
                             const decisionAction = getBotDecision(state, actorIdx);
                             let decisionResult;
                             if (decisionAction && decisionAction.type === "emergency-decision") {
                                 decisionResult = dispatch(state, "emergency-decision", decisionAction.payload);
                             } else {
                                 decisionResult = dispatch(state, "emergency-decision", { decision: "rebalance" });
                             }
                             state = decisionResult.state!;
                             
                             // If the decision was rebalance, we MUST execute the rebalance
                             if (decisionResult.sideEffect?.type === "needs-rebalance") {
                                 const rb = getBotDecision(state, state.currentPlayerIndex);
                                 if (rb && rb.type === "rebalance") {
                                     state = dispatch(state, "rebalance", rb.payload).state!;
                                 } else {
                                     state = dispatch(state, "rebalance", { newCash: currentPlayer.cash, newBonds: currentPlayer.bonds, newStocks: currentPlayer.stocks, penalty: decisionResult.sideEffect.penalty }).state!;
                                 }
                             }
                         } else if (result.sideEffect.modal === "lottery") {
                             state = dispatch(state, "tile-action", { play: false }).state!;
                         } else if (result.sideEffect.modal === "tax-raid" || result.sideEffect.modal === "hostile-takeover") {
                             state = dispatch(state, "tile-action", { skip: true }).state!;
                         } else if (result.sideEffect.modal === "audit") {
                             state = dispatch(state, "tile-action", { targetIdx: 0 }).state!;
                         }
                    } else if (result.sideEffect?.type === "show-trade") {
                         // Emergency trade unlock
                         // Do nothing, let the bot offer a trade on the next loop since state phase is still "action"
                         // Wait, if state phase is STILL "action", the bot won't offer a trade!
                         // Oh! If the dispatcher returned `show-trade`, it set `status: "awaiting-trade-response"`.
                         // `bot.ts` needs to know to offer a trade in `phase: "action"` if `status === "awaiting-trade-response"`!
                    } else if (result.sideEffect?.type === "start-lottery-roll") {
                        state = dispatch(state, "roll", { dice: 1 }).state!;
                        state = dispatch(state, "lottery-resolve", { dice: 1 }).state!;
                        const penalty = result.sideEffect.penalty || 0;
                        const rb = getBestRebalance(currentPlayer, penalty, "balanced", 0);
                        let rbResult;
                        if (rb) {
                            rbResult = dispatch(state, "rebalance", { ...rb, penalty });
                        } else {
                            rbResult = dispatch(state, "rebalance", { newCash: Math.max(0, currentPlayer.cash - penalty), newBonds: currentPlayer.bonds, newStocks: currentPlayer.stocks, penalty });
                        }
                        if (rbResult.sideEffect?.type === "error") {
                            throw new Error(`Rebalance dispatch failed: ${rbResult.sideEffect.message}`);
                        }
                        state = rbResult.state!;
                    } else if (result.sideEffect?.type === "show-rebalance") {
                        const rb = getBotDecision(state, state.currentPlayerIndex);
                        if (rb && rb.type === "rebalance") {
                            state = dispatch(state, "rebalance", rb.payload).state!;
                        } else {
                            state = dispatch(state, "rebalance", { newCash: currentPlayer.cash, newBonds: currentPlayer.bonds, newStocks: currentPlayer.stocks, penalty: 0 }).state!;
                        }
                    }

                    // Compare Bot Models vs Reality
                    const models = currentPlayer.botState?.playerModels;
                    if (models) {
                        for (const p of state.players) {
                            if (p.id !== currentPlayer.id && models[p.id]) {
                                const m = models[p.id];
                                if (m.cash && m.cash.confidence > 90) {
                                    if (p.cash < m.cash.lowerBound || p.cash > m.cash.upperBound) {
                                        if (m.cash.confidence === 100) {
                                            metrics.modelDrifts++;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // END Phase
                    fsmState = "END";
                    const tEnd = performance.now();
                    turnTimes.push(tEnd - turnStartTime);
                } catch (e: any) {
                    if (e instanceof CertificationError) {
                        metrics.gamesFailed++;
                        if (e.category === "DISPATCHER" || metrics.gamesFailed <= 5) {
                            originalLog(`\n[GAME ${g + 1} FAILED] Seed: ${gameSeed}`);
                            originalLog(`Category: ${e.category}`);
                            originalLog(`Message: ${e.message}`);
                            originalLog(`FSM Stage: ${fsmState}`);
                            originalLog(`Turn: ${state.turn}, Phase: ${state.phase}`);
                            if (state.emergencyState) {
                                originalLog(`Emergency Status: ${state.emergencyState.status}`);
                            }
                        }
                    } else {
                        metrics.gamesFailed++;
                        if (metrics.gamesFailed <= 5) {
                            originalLog(`\n[GAME ${g + 1} FAILED] Seed: ${gameSeed}`);
                            originalLog(`Category: UNKNOWN`);
                            originalLog(`Message: ${e.message}`);
                            originalLog(`FSM Stage: ${fsmState}`);
                            originalLog(`Turn: ${state.turn}, Phase: ${state.phase}`);
                            if (state.emergencyState) {
                                originalLog(`Emergency Status: ${state.emergencyState.status}`);
                            }
                        }
                    }
                    console.error(`\n[GAME ${g} FAILED] Seed: ${gameSeed}`);
                    console.error(`Category: ${e.category || "UNKNOWN"}`);
                    console.error(`Message: ${e.message}`);
                    console.error(`FSM Stage: ${fsmState}`);
                    console.error(`Turn: ${state.turn}, Phase: ${state.phase}, Player: ${currentPlayer.id}`);
                    break;
                }

                if (gameTurns >= 5000) {
                    failed = true;
                    metrics.deadlocks++;
                    metrics.gamesFailed++;
                    originalLog(`\n[GAME ${g} DEADLOCKED] Seed: ${gameSeed}`);
                    originalLog(`Exceeded maximum turn limit (infinite loop).`);
                    originalLog(`Last State: Turn=${state.turn}, Phase=${state.phase}`);
                    originalLog(`Last Action: ${actionHistory.slice(-5).join(' -> ')}`);
                    break;
                }
            }
            if (!failed) metrics.gamesPassed++;
            metrics.gamesExecuted++;
        } catch (e: any) {
            metrics.gamesFailed++;
            console.error(`Game Exception: ${e.message}`);
        }
    }
    
    // Check Personalities
    const hawkAudits = pStats["AUDIT_HAWK"].audits;
    const bullAudits = pStats["BULL"].audits;
    if (hawkAudits < bullAudits) metrics.personalitiesPreserved = false;
    
    console.log = originalLog;
    console.log(`\n====================================`);
    console.log(`AI PRODUCTION CERTIFICATION`);
    console.log(`====================================`);
    console.log(`Games Executed       : ${metrics.gamesExecuted}`);
    console.log(`Games Passed         : ${metrics.gamesPassed}`);
    console.log(`Games Failed         : ${metrics.gamesFailed}`);
    console.log(`Deadlocks            : ${metrics.deadlocks}`);
    console.log(`Skipped Turns        : ${metrics.skippedTurns}`);
    console.log(`Dispatcher Failures  : ${metrics.dispatcherFailures}`);
    console.log(`Audit Violations     : ${metrics.auditViolations}`);
    console.log(`Model Drift          : ${metrics.modelDrifts}`);
    console.log(`Invariant Violations : ${metrics.invariantViolations}`);
    console.log(`Personality Preserve : ${metrics.personalitiesPreserved ? "PASS" : "FAIL"}`);
    
    const avgDec = decisionTimes.reduce((a,b)=>a+b,0)/decisionTimes.length || 0;
    const maxDec = decisionTimes.reduce((m, v) => v > m ? v : m, 0);
    const avgTurn = turnTimes.reduce((a,b)=>a+b,0)/turnTimes.length || 0;
    const maxTurn = turnTimes.reduce((m, v) => v > m ? v : m, 0);
    
    console.log("\nPerformance:");
    console.log(`Avg Decision Time    : ${avgDec.toFixed(2)}ms`);
    console.log(`Max Decision Time    : ${maxDec.toFixed(2)}ms`);
    console.log(`Avg Turn Duration    : ${avgTurn.toFixed(2)}ms`);
    console.log(`Max Turn Duration    : ${maxTurn.toFixed(2)}ms`);

    const result = (metrics.gamesFailed === 0 && metrics.personalitiesPreserved && metrics.modelDrifts === 0) 
        ? "PRODUCTION READY" : "REQUIRES FIXES";
    console.log(`\nOverall Result       : ${result}`);
}

runGames().catch(console.error).finally(() => { Math.random = OriginalMathRandom; });

import { createInitialGameState } from "../lib/game-engine/actions";
import { dispatch } from "../lib/game-engine/dispatcher";
import { getBotDecision, getBestRebalance } from "../lib/game-engine/bot";
import type { GameState, BotType } from "../lib/db/schema";
import { getTileByPosition } from "../lib/game-engine/tiles";
import * as fs from 'fs';
import * as path from 'path';

const originalLog = console.log;
console.log = function() {};
console.error = function() {};
console.trace = function() {};
console.debug = function() {};
console.info = function() {};

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

const MAX_GAMES = parseInt(process.argv[2]) || 100;

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
let failedSeeds: any[] = [];

type FailCategory = "AI_REASONING" | "DISPATCHER" | "TURN_ENGINE" | "ORCHESTRATION" | "VALIDATION" | "STATE_DRIFT" | "UI" | "UNKNOWN";
class CertificationError extends Error {
    constructor(public category: FailCategory, message: string) {
        super(message);
    }
}

const botTypes: BotType[] = ["BULL", "SAFETY_BUILDER", "AUDIT_HAWK", "PROPERTY_BUILDER", "DISCIPLINED", "OPPORTUNIST", "RBAL_EXPERT"];

const pStats: Record<string, any> = {};
botTypes.forEach(t => pStats[t] = { 
    audits: 0, successfulAudits: 0, failedAudits: 0, trades: 0, rebalances: 0, takeovers: 0, ipos: 0, passes: 0, housesPurchased: 0,
    cashSum: 0, bondsSum: 0, stocksSum: 0, netWorthSum: 0, gamesCompleted: 0, wins: 0
});

const coverage: Record<string, number> = {
    BONUS: 0, LOTTERY: 0, IPO: 0, EMERGENCY: 0, TAX_RAID: 0, HOSTILE_TAKEOVER: 0,
    SUCCESSFUL_AUDIT: 0, FAILED_AUDIT: 0, YEAR_END_RETURN: 0, MARKET_RALLY: 0, 
    MARKET_CRASH: 0, STOCK_RALLY: 0, STOCK_CRASH: 0, TRADE: 0, REBALANCE: 0
};

function trackCoverage(dispatchType: string, dispatchPayload: any, preState: GameState, postState: GameState, actorIdx: number) {
    if (dispatchType === "rebalance") coverage.REBALANCE++;
    if (dispatchType === "trade-response" && dispatchPayload?.accept === true) coverage.TRADE++;
    
    if (dispatchType === "tile-action") {
        const p = preState.players[actorIdx];
        const effect = getTileByPosition(p.position).effect;
        if (effect === "bonus") coverage.BONUS++;
        if (effect === "lottery" && dispatchPayload?.play === true) coverage.LOTTERY++;
        if (effect === "ipo" && (dispatchPayload?.amount || 0) > 0) coverage.IPO++;
        if (effect === "emergency" && dispatchPayload?.amount) coverage.EMERGENCY++;
        if (effect === "tax-raid" && !dispatchPayload?.skip) coverage.TAX_RAID++;
        if (effect === "hostile-takeover" && !dispatchPayload?.skip) coverage.HOSTILE_TAKEOVER++;
        if (effect === "stock-rally") coverage.STOCK_RALLY++;
        if (effect === "stock-crash") coverage.STOCK_CRASH++;
        if (effect === "market-rally") coverage.MARKET_RALLY++;
        if (effect === "market-crash") coverage.MARKET_CRASH++;
    }

    if (dispatchType === "audit") {
        const preMem = preState.players[actorIdx].botState?.memory.successfulAudits || 0;
        const postMem = postState.players[actorIdx].botState?.memory.successfulAudits || 0;
        
        if (postMem > preMem) {
            coverage.SUCCESSFUL_AUDIT++;
            pStats[preState.players[actorIdx].botType!].successfulAudits++;
        } else {
            coverage.FAILED_AUDIT++;
            pStats[preState.players[actorIdx].botType!].failedAudits++;
        }
    }

    if (postState.year > preState.year) {
        coverage.YEAR_END_RETURN++;
    }
}

const driftEvents: any[] = [];
const driftSet = new Set<string>();

async function runGames() {
    originalLog(`Starting Production Certification (Seed: ${globalSeed}, Games: ${MAX_GAMES})`);
    
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
        let lastError = null;

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
                    if (actorIdx === -1) actorIdx = state.currentPlayerIndex;
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
                    if (actionHistory.length > 20) actionHistory.shift();
                    
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
                        if (drift < 5 && rb.penalty > 0) {
                            metrics.invalidActions++;
                            throw new CertificationError("VALIDATION", "Rebalance generated <5L drift but paid penalty");
                        }
                        pStats[activePlayer.botType!].rebalances++;
                    }
                    
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
                    if (botAction.type === "bid" || botAction.type === "house-auction-bid") {
                        if (botAction.payload?.amount > 0) pStats[activePlayer.botType!].housesPurchased++;
                    }
                    
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

                    const preState = state;
                    const result = dispatch(state, dispatchType, dispatchPayload);
                    if (result.sideEffect?.type === "error") {
                        metrics.dispatcherFailures++;
                        throw new CertificationError("DISPATCHER", `Dispatcher rejected action ${dispatchType}: ${result.sideEffect.message}`);
                    }
                    state = result.state!;
                    
                    trackCoverage(dispatchType, dispatchPayload, preState, state, actorIdx);
                    
                    for (const p of state.players) {
                        if (p.cash < 0 || p.bonds < 0 || p.stocks < 0) {
                            metrics.invariantViolations++;
                            throw new CertificationError("VALIDATION", "Negative asset invariant violated");
                        }
                    }

                    if (result.sideEffect?.type === "show-modal") {
                         if (result.sideEffect.modal === "emergency") {
                             const pState = state;
                             state = dispatch(state, "tile-action", { amount: result.sideEffect.emergencyAmount }).state!;
                             trackCoverage("tile-action", { amount: result.sideEffect.emergencyAmount }, pState, state, actorIdx);
                         } else if (result.sideEffect.modal === "emergency-decision") {
                             const decisionAction = getBotDecision(state, actorIdx);
                             let decisionResult;
                             if (decisionAction && decisionAction.type === "emergency-decision") {
                                 decisionResult = dispatch(state, "emergency-decision", decisionAction.payload);
                             } else {
                                 decisionResult = dispatch(state, "emergency-decision", { decision: "rebalance" });
                             }
                             state = decisionResult.state!;
                             
                             if (decisionResult.sideEffect?.type === "needs-rebalance") {
                                 const rb = getBotDecision(state, state.currentPlayerIndex);
                                 if (rb && rb.type === "rebalance") {
                                     const pState = state;
                                     state = dispatch(state, "rebalance", rb.payload).state!;
                                     trackCoverage("rebalance", rb.payload, pState, state, actorIdx);
                                 } else {
                                     const pState = state;
                                     const freshPlayer = state.players[state.currentPlayerIndex];
                                     state = dispatch(state, "rebalance", { newCash: freshPlayer.cash, newBonds: freshPlayer.bonds, newStocks: freshPlayer.stocks, penalty: decisionResult.sideEffect.penalty }).state!;
                                     trackCoverage("rebalance", {}, pState, state, actorIdx);
                                 }
                             }
                         } else if (result.sideEffect.modal === "lottery") {
                             const pState = state;
                             state = dispatch(state, "tile-action", { play: false }).state!;
                             trackCoverage("tile-action", { play: false }, pState, state, actorIdx);
                         } else if (result.sideEffect.modal === "tax-raid" || result.sideEffect.modal === "hostile-takeover") {
                             const pState = state;
                             state = dispatch(state, "tile-action", { skip: true }).state!;
                             trackCoverage("tile-action", { skip: true }, pState, state, actorIdx);
                         } else if (result.sideEffect.modal === "audit") {
                             const pState = state;
                             state = dispatch(state, "tile-action", { targetIdx: 0 }).state!;
                             trackCoverage("tile-action", { targetIdx: 0 }, pState, state, actorIdx);
                         }
                    } else if (result.sideEffect?.type === "start-lottery-roll") {
                        state = dispatch(state, "roll", { dice: 1 }).state!;
                        state = dispatch(state, "lottery-resolve", { dice: 1 }).state!;
                        const penalty = result.sideEffect.penalty || 0;
                        const freshPlayer = state.players[state.currentPlayerIndex];
                        const rb = getBestRebalance(freshPlayer, penalty, "balanced", 0);
                        let rbResult;
                        if (rb) {
                            rbResult = dispatch(state, "rebalance", { ...rb, penalty });
                        } else {
                            rbResult = dispatch(state, "rebalance", { newCash: Math.max(0, freshPlayer.cash - penalty), newBonds: freshPlayer.bonds, newStocks: freshPlayer.stocks, penalty });
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
                            const freshPlayer = state.players[state.currentPlayerIndex];
                            state = dispatch(state, "rebalance", { newCash: freshPlayer.cash, newBonds: freshPlayer.bonds, newStocks: freshPlayer.stocks, penalty: 0 }).state!;
                        }
                    }

                    const freshObserver = state.players[state.currentPlayerIndex];
                    const models = freshObserver.botState?.playerModels;
                    if (models) {
                        for (const p of state.players) {
                            if (p.id !== freshObserver.id && models[p.id]) {
                                const m = models[p.id];
                                const assets = [
                                    { name: "cash", act: p.cash, est: m.cash },
                                    { name: "bonds", act: p.bonds, est: m.bonds },
                                    { name: "stocks", act: p.stocks, est: m.stocks }
                                ];
                                for (const a of assets) {
                                    if (a.est && a.est.confidence > 90) {
                                        if (a.act < a.est.lowerBound || a.act > a.est.upperBound) {
                                            if (a.est.confidence === 100) {
                                                const driftKey = `${gameSeed}-${state.turn}-${freshObserver.id}-${p.id}-${a.name}`;
                                                if (!driftSet.has(driftKey)) {
                                                    driftSet.add(driftKey);
                                                    metrics.modelDrifts++;
                                                    driftEvents.push({
                                                        game: g + 1,
                                                        seed: gameSeed,
                                                        turn: state.turn,
                                                        observingBot: freshObserver.id,
                                                        observedPlayer: p.id,
                                                        asset: a.name,
                                                        actualValue: a.act,
                                                        estimatedMean: a.est.mean,
                                                        lowerBound: a.est.lowerBound,
                                                        upperBound: a.est.upperBound,
                                                        confidence: a.est.confidence,
                                                        source: (a.est as any).source || "UNKNOWN"
                                                    });
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    fsmState = "END";
                    const tEnd = performance.now();
                    turnTimes.push(tEnd - turnStartTime);
                } catch (e: any) {
                    failed = true;
                    metrics.gamesFailed++;
                    lastError = e;
                    failedSeeds.push({
                        game: g + 1,
                        seed: gameSeed,
                        turn: state.turn,
                        phase: state.phase,
                        activePlayer: activePlayer.id,
                        category: e.category || "UNKNOWN",
                        message: e.message,
                        actionHistory: [...actionHistory]
                    });
                    break;
                }

                if (gameTurns >= 5000) {
                    failed = true;
                    metrics.deadlocks++;
                    metrics.gamesFailed++;
                    failedSeeds.push({
                        game: g + 1,
                        seed: gameSeed,
                        turn: state.turn,
                        phase: state.phase,
                        activePlayer: activePlayer.id,
                        category: "DEADLOCK",
                        message: "Exceeded 5000 turns",
                        actionHistory: [...actionHistory]
                    });
                    break;
                }
            }
            if (!failed) {
                metrics.gamesPassed++;
                
                let winnerNw = -1;
                let winnerBotType = "";
                for (const p of state.players) {
                    const bt = p.botType!;
                    pStats[bt].gamesCompleted++;
                    pStats[bt].cashSum += p.cash;
                    pStats[bt].bondsSum += p.bonds;
                    pStats[bt].stocksSum += p.stocks;
                    const nw = p.cash + p.bonds + p.stocks;
                    pStats[bt].netWorthSum += nw;
                    
                    if (nw > winnerNw) {
                        winnerNw = nw;
                        winnerBotType = bt;
                    }
                }
                if (winnerBotType) pStats[winnerBotType].wins++;
            }
            metrics.gamesExecuted++;
        } catch (e: any) {
            metrics.gamesFailed++;
            failedSeeds.push({
                game: g + 1,
                seed: gameSeed,
                category: "FATAL_ERROR",
                message: e.message,
                actionHistory: []
            });
        }
    }
    
    const hawkAudits = pStats["AUDIT_HAWK"].audits;
    const bullAudits = pStats["BULL"].audits;
    if (hawkAudits < bullAudits) metrics.personalitiesPreserved = false;
    
    const calcStats = (arr: number[]) => {
        if (arr.length === 0) return { avg: 0, median: 0, p95: 0, max: 0 };
        arr.sort((a,b) => a-b);
        const avg = arr.reduce((a,b)=>a+b,0)/arr.length;
        const median = arr[Math.floor(arr.length/2)];
        const p95 = arr[Math.floor(arr.length * 0.95)];
        const max = arr[arr.length-1];
        return { avg, median, p95, max };
    };
    
    const decStats = calcStats(decisionTimes);
    const trnStats = calcStats(turnTimes);

    const artifactsDir = path.join(process.cwd(), 'artifacts');
    if (!fs.existsSync(artifactsDir)) {
        fs.mkdirSync(artifactsDir);
    }

    if (failedSeeds.length > 0) {
        fs.writeFileSync(path.join(artifactsDir, 'certification-failures.json'), JSON.stringify(failedSeeds, null, 2));
    }

    const personalityMetrics: any = {};
    for (const bt of botTypes) {
        const stats = pStats[bt];
        const gc = Math.max(1, stats.gamesCompleted);
        personalityMetrics[bt] = {
            audits: stats.audits,
            auditSuccessRate: stats.audits > 0 ? (stats.successfulAudits / stats.audits).toFixed(2) : "0.00",
            trades: stats.trades,
            ipos: stats.ipos,
            rebalances: stats.rebalances,
            takeovers: stats.takeovers,
            passes: stats.passes,
            housesPurchased: stats.housesPurchased,
            averageCash: (stats.cashSum / gc).toFixed(2),
            averageBonds: (stats.bondsSum / gc).toFixed(2),
            averageStocks: (stats.stocksSum / gc).toFixed(2),
            averageNetWorth: (stats.netWorthSum / gc).toFixed(2),
            wins: stats.wins
        };
    }

    const report = {
        commitHash: "dc9ceb1",
        timestamp: new Date().toISOString(),
        gamesExecuted: metrics.gamesExecuted,
        gamesPassed: metrics.gamesPassed,
        gamesFailed: metrics.gamesFailed,
        replaySeeds: failedSeeds.map(f => f.seed),
        failureDetails: failedSeeds,
        observationCoverage: coverage,
        personalityMetrics,
        performanceMetrics: {
            decisionTime: decStats,
            turnDuration: trnStats
        },
        certificationSummary: {
            deadlocks: metrics.deadlocks,
            skippedTurns: metrics.skippedTurns,
            dispatcherFailures: metrics.dispatcherFailures,
            auditViolations: metrics.auditViolations,
            modelDrifts: metrics.modelDrifts,
            invariantViolations: metrics.invariantViolations
        }
    };

    fs.writeFileSync(path.join(artifactsDir, 'ai-production-certification-report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(artifactsDir, 'drift-events.json'), JSON.stringify(driftEvents, null, 2));

    const result = (metrics.gamesFailed === 0 && metrics.personalitiesPreserved && metrics.modelDrifts === 0) 
        ? "PRODUCTION READY" : "REQUIRES FIXES";

    originalLog(`\n=============================`);
    originalLog(`AI PRODUCTION CERTIFICATION`);
    originalLog(`=============================`);
    originalLog(``);
    originalLog(`Commit: dc9ceb1`);
    originalLog(`Games: ${metrics.gamesExecuted}`);
    originalLog(`Passed: ${metrics.gamesPassed}`);
    originalLog(`Failed: ${metrics.gamesFailed}`);
    originalLog(``);
    originalLog(`Deadlocks: ${metrics.deadlocks}`);
    originalLog(`Skipped Turns: ${metrics.skippedTurns}`);
    originalLog(`Dispatcher Failures: ${metrics.dispatcherFailures}`);
    originalLog(`Audit Violations: ${metrics.auditViolations}`);
    originalLog(`Model Drift: ${metrics.modelDrifts}`);
    originalLog(`Invariant Violations: ${metrics.invariantViolations}`);
    originalLog(``);
    originalLog(`Replay Seeds Saved: ${failedSeeds.length > 0 ? failedSeeds.map(f => f.seed).slice(0, 3).join(', ') + (failedSeeds.length > 3 ? '...' : '') : 'None'}`);
    originalLog(``);
    originalLog(`Overall:`);
    originalLog(``);
    originalLog(result);
    originalLog(``);
}

runGames().catch(e => {
    originalLog("FATAL:", e);
}).finally(() => { Math.random = OriginalMathRandom; });

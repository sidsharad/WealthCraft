// bot.ts — Bot turn decision logic (pure, side-effect free)
//
// Public interface: getBotDecision(state, botIdx) → BotAction
// All other functions are private helpers.

import type { GameState, PlayerState, BotState, BotPersonality } from "../db/schema";
import { netWorth } from "./actions";
import { getTileByPosition, HOUSE_AUCTION_MIN, HOUSE_MARKET_PRICE } from "./tiles";

export interface BotAction {
  type:
    | "roll"
    | "tile-action"
    | "house-auction-bid"
    | "rebalance"
    | "create-trade"
    | "trade-response"
    | "end-turn"
    | "skip"
    | "audit";
  payload?: any;
  debug?: any;
}

import { BotProfile, StrategyMode } from "../db/schema";

export const BOT_PROFILES: Record<string, BotProfile> = {
  BULL: {
    type: "BULL",
    hardCashFloor: 0,
    softCashTarget: 3,
    auditBudget: 2,
    riskTolerance: 95,
    aggression: 90,
    personalityVariance: 3,
    tiltSensitivity: 20,
    auditThreshold: 60,
    urgencyWeights: { property: 0, survival: 100, growth: 80, audit: 20 }
  },
  DISCIPLINED: {
    type: "DISCIPLINED",
    hardCashFloor: 5,
    softCashTarget: 10,
    auditBudget: 1,
    riskTolerance: 50,
    aggression: 50,
    personalityVariance: 0.5,
    tiltSensitivity: 10,
    auditThreshold: 80,
    urgencyWeights: { property: 0, survival: 100, growth: 50, audit: 30 }
  },
  AUDIT_HAWK: {
    type: "AUDIT_HAWK",
    hardCashFloor: 5,
    softCashTarget: 10,
    auditBudget: 3,
    riskTolerance: 60,
    aggression: 95,
    personalityVariance: 1.5,
    tiltSensitivity: 30,
    auditThreshold: 60,
    urgencyWeights: { property: 0, survival: 100, growth: 40, audit: 90 }
  },
  OPPORTUNIST: {
    type: "OPPORTUNIST",
    hardCashFloor: 5,
    softCashTarget: 10,
    auditBudget: 2,
    riskTolerance: 80,
    aggression: 70,
    personalityVariance: 1,
    tiltSensitivity: 15,
    auditThreshold: 60,
    urgencyWeights: { property: 0, survival: 100, growth: 70, audit: 50 }
  },
  SAFETY_BUILDER: {
    type: "SAFETY_BUILDER",
    hardCashFloor: 15,
    softCashTarget: 20,
    auditBudget: 1,
    riskTolerance: 10,
    aggression: 20,
    personalityVariance: 0.2,
    tiltSensitivity: 40,
    auditThreshold: 85,
    urgencyWeights: { property: 0, survival: 150, growth: 20, audit: 10 }
  },
  PROPERTY_BUILDER: {
    type: "PROPERTY_BUILDER",
    hardCashFloor: 5,
    softCashTarget: 10,
    auditBudget: 2,
    riskTolerance: 60,
    aggression: 60,
    personalityVariance: 2,
    tiltSensitivity: 40,
    auditThreshold: 75,
    urgencyWeights: { property: 100, survival: 100, growth: 60, audit: 20 }
  }
};

export interface CandidateAction {
    action: BotAction;
    category: "SURVIVAL" | "MANDATORY" | "STRATEGIC" | "PORTFOLIO" | "OPPORTUNISTIC" | "PASS";
    priority: number;
    hardValid: boolean;
    expectedValue: number;
    probability: number;
    utility: number;
    urgency: number;
    risk: number;
    explanation: string;
    reason?: string;
}


function random(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function createInitialBotState(botId: string, botType: "BULL" | "DISCIPLINED" | "AUDIT_HAWK" | "OPPORTUNIST" | "SAFETY_BUILDER" | "PROPERTY_BUILDER", allPlayers: {id: string, isBot: boolean}[]): BotState {
  let personality: BotPersonality;
  
  switch (botType) {
    case "BULL":
      personality = { 
        risk: 95, greed: 95, aggression: 40, liquidity: 10, sociability: 10, targetAllocation: { cash: 10, bonds: 10, stocks: 80 },
        dna: { aggression: random(85, 100), greed: random(80, 100), patience: random(20, 40), revenge: 50, fear: 10, confidence: 90 }
      }; 
      break;
    case "DISCIPLINED":
      personality = { 
        risk: 50, greed: 50, aggression: 50, liquidity: 50, sociability: 80, targetAllocation: { cash: 20, bonds: 20, stocks: 60 },
        dna: { aggression: random(40, 60), greed: random(40, 60), patience: random(60, 90), revenge: random(20, 50), fear: random(30, 60), confidence: 60 }
      }; 
      break;
    case "AUDIT_HAWK":
      personality = { 
        risk: 30, greed: 40, aggression: 95, liquidity: 60, sociability: 20, targetAllocation: { cash: 40, bonds: 40, stocks: 20 },
        dna: { aggression: random(60, 85), greed: random(30, 60), patience: random(40, 70), revenge: random(70, 100), fear: random(20, 40), confidence: random(60, 100) }
      }; 
      break;
    case "OPPORTUNIST":
      personality = { 
        risk: 80, greed: 80, aggression: 70, liquidity: 30, sociability: 90, targetAllocation: { cash: 15, bonds: 35, stocks: 50 },
        dna: { aggression: random(60, 80), greed: random(70, 90), patience: random(50, 80), revenge: random(40, 60), fear: random(40, 70), confidence: random(50, 80) }
      }; 
      break;
    case "SAFETY_BUILDER":
      personality = { 
        risk: 10, greed: 30, aggression: 20, liquidity: 95, sociability: 50, targetAllocation: { cash: 35, bonds: 35, stocks: 30 },
        dna: { aggression: random(10, 30), greed: random(20, 40), patience: random(70, 100), revenge: random(10, 30), fear: random(70, 100), confidence: random(20, 50) }
      }; 
      break;
    case "PROPERTY_BUILDER":
      personality = { 
        risk: 40, greed: 60, aggression: 60, liquidity: 20, sociability: 40, targetAllocation: { cash: 10, bonds: 20, stocks: 70 },
        dna: { aggression: random(40, 70), greed: random(40, 70), patience: random(50, 80), revenge: random(30, 60), fear: random(30, 60), confidence: random(40, 70) }
      }; 
      break;
    default:
      personality = { 
        risk: 50, greed: 50, aggression: 50, liquidity: 50, sociability: 50, targetAllocation: { cash: 20, bonds: 20, stocks: 60 },
        dna: { aggression: 50, greed: 50, patience: 50, revenge: 50, fear: 50, confidence: 50 }
      }; 
  }

  const playerModels: BotState["playerModels"] = {};
  for (const p of allPlayers) {
    if (p.id === botId) continue;
    playerModels[p.id] = {
      cash: { mean: 10, variance: 0, confidence: 100, lowerBound: 10, upperBound: 10, source: "INITIAL", lastUpdatedTurn: 0 },
      bonds: { mean: 5, variance: 0, confidence: 100, lowerBound: 5, upperBound: 5, source: "INITIAL", lastUpdatedTurn: 0 },
      stocks: { mean: 5, variance: 0, confidence: 100, lowerBound: 5, upperBound: 5, source: "INITIAL", lastUpdatedTurn: 0 },
      property: { ownsProperty: false, acquisitionPrice: 0, confidence: 100, lastUpdatedTurn: 0 },
      hypotheses: [],
      hiddenWealth: 0,
      visibilityScore: 100,
      suspicionScore: 0,
      lastObservedTurn: 0,
      reconciliationHistory: [],
      
      riskScore: 50,
      aggressionScore: 50,
      tradeAcceptanceScore: 50,
    };
  }

  return {
    personality,
    strategicMode: "BALANCED",
    emotions: {
      confidence: 50,
      fear: 0,
      revenge: 0,
      desperation: 0,
      frustration: 0,
    },
    tilt: 0,
    recentFailures: 0,
    regrets: [],
    motivations: {
      win: 90,
      preserveCash: 40,
      attackLeader: 30,
      revenge: 20,
      houseOwnership: 80,
    },
    memory: {
      successfulAudits: 0,
      failedAudits: 0,
      acceptedTrades: 0,
      rejectedTrades: 0,
      revengeTargets: [],
      auditMemory: {},
      auditBudget: { attempted: 0, succeeded: 0, failed: 0 },
      auditBudgetYear: 1
    },
    playerModels,
  };
}

/**
 * Returns the single next action the bot should take for its current phase.
 * Integrated with the deterministic Agentic Bot Engine.
 */

import { evaluateCandidateAction, selectActionHumanized } from "./bot-engine";

export function getBotDecision(state: GameState, botIdx: number): BotAction {
  const phase = state.phase;
  const bot = state.players[botIdx];
  const botType = bot.botType || "DISCIPLINED";
  const profile = BOT_PROFILES[botType];
  
  if (process.env.ENABLE_BOT_TELEMETRY !== "false") {
      console.log({
          TRACE:"GET_BOT_DECISION",
          playerId: bot.id,
          botType,
          phase,
          strategyMode: bot.botState?.strategicMode
      });
  }
  
  if (!bot.botState) return { type: "skip" };

  // Bull Recovery Mode
  if (botType === "BULL") {
    if (bot.cash < 5 && bot.botState.strategicMode !== "RECOVERY") {
      bot.botState.strategicMode = "RECOVERY";
    } else if (bot.cash > 15 && bot.botState.strategicMode === "RECOVERY") {
      bot.botState.strategicMode = "BALANCED";
    }
  }

  // Safe Builder Desperation
  if (botType === "SAFETY_BUILDER" && state.year >= 4) {
    const nwSorted = [...state.players].map(p => ({ id: p.id, nw: netWorth(p) })).sort((a,b) => b.nw - a.nw);
    const leaderNw = nwSorted[0]?.nw || 0;
    const myNw = netWorth(bot);
    if (leaderNw - myNw > 30 && bot.botState.strategicMode !== "DESPERATE") {
      bot.botState.strategicMode = "DESPERATE";
    } else if (leaderNw - myNw <= 30 && bot.botState.strategicMode === "DESPERATE") {
      bot.botState.strategicMode = "BALANCED";
    }
  }

  let rawActions: BotAction[] = [];

  // Step 1: Generate ALL legal actions for the current phase
  if (phase === "roll") {
    rawActions.push({ type: "roll" });
  } else if (phase === "action") {
    const tile = getTileByPosition(bot.position);
    
    if (tile.effect === "ipo") {
      for (let i = 0; i <= 5; i++) {
        rawActions.push({ type: "tile-action", payload: { amount: i } });
      }
      rawActions.push({ type: "tile-action", payload: { amount: 0 } });
    } else if (tile.effect === "lottery") {
      rawActions.push({ type: "tile-action", payload: { play: true } });
      rawActions.push({ type: "tile-action", payload: { play: false } });
    } else if (tile.effect === "emergency") {
      rawActions.push({ type: "tile-action" });
    } else if (tile.effect === "tax-raid") {
      rawActions.push({ type: "tile-action", payload: { skip: true } });
      for (let pIdx = 0; pIdx < state.players.length; pIdx++) {
        if (pIdx !== botIdx) rawActions.push({ type: "tile-action", payload: { targetIdx: pIdx } });
      }
    } else if (tile.effect === "hostile-takeover") {
      rawActions.push({ type: "tile-action", payload: { skip: true } });
      for (let pIdx = 0; pIdx < state.players.length; pIdx++) {
        if (pIdx !== botIdx) {
          rawActions.push({ type: "tile-action", payload: { targetIdx: pIdx, demandType: "cash" } });
          rawActions.push({ type: "tile-action", payload: { targetIdx: pIdx, demandType: "bonds" } });
          rawActions.push({ type: "tile-action", payload: { targetIdx: pIdx, demandType: "stocks" } });
        }
      }
    } else {
      rawActions.push({ type: "tile-action" });
    }
  } else if (phase === "year-end") {
    let requiredCash = state.emergencyState?.playerId === bot.id ? state.emergencyState.amount : 0;
    const newPort = getBestRebalance(bot, 0, "balanced", requiredCash); // Provide a baseline rebalance
    if (newPort) rawActions.push({ type: "rebalance", payload: { ...newPort, penalty: 0 } });
    else rawActions.push({ type: "rebalance", payload: { newCash: bot.cash, newBonds: bot.bonds, newStocks: bot.stocks, penalty: 0 } });
  } else if (phase === "auction") {
    rawActions.push({ type: "house-auction-bid", payload: { amount: 0, bidderId: bot.id } });
    const maxBid = Math.min(bot.cash, HOUSE_MARKET_PRICE);
    for (let bid = HOUSE_AUCTION_MIN; bid <= maxBid; bid++) {
      rawActions.push({ type: "house-auction-bid", payload: { amount: bid, bidderId: bot.id } });
    }
  } else if (phase === "trade") {
    rawActions.push({ type: "end-turn" });
    
    // Audits
    for (let pIdx = 0; pIdx < state.players.length; pIdx++) {
      if (pIdx !== botIdx && !state.players[pIdx].wealthDeclared) {
        rawActions.push({ type: "audit", payload: { targetIdx: pIdx, targetAsset: "cash" } });
        rawActions.push({ type: "audit", payload: { targetIdx: pIdx, targetAsset: "bonds" } });
        rawActions.push({ type: "audit", payload: { targetIdx: pIdx, targetAsset: "stocks" } });
      }
    }
    
    // Trades
    for (let pIdx = 0; pIdx < state.players.length; pIdx++) {
      if (pIdx !== botIdx) {
        if (bot.cash >= 2) rawActions.push({ type: "create-trade", payload: { targetId: state.players[pIdx].id, offer: { cash: 2, bonds: 0, stocks: 0 }, request: { cash: 0, bonds: 1, stocks: 0 } } });
        if (bot.cash >= 4) rawActions.push({ type: "create-trade", payload: { targetId: state.players[pIdx].id, offer: { cash: 4, bonds: 0, stocks: 0 }, request: { cash: 0, bonds: 0, stocks: 1 } } });
      }
    }
    
    // Rebalance
    const rb = getBestRebalance(bot, 0, "balanced", 0);
    if (rb) rawActions.push({ type: "rebalance", payload: { ...rb, penalty: 3 } }); 
  } else if (phase === "waiting-trade" && state.pendingTrade?.toPlayerId === bot.id) {
    rawActions.push({ type: "trade-response", payload: { accept: true } });
    rawActions.push({ type: "trade-response", payload: { accept: false } });
  }

  // Step 2 & 3: Filter Hard Rules & Calculate Utility
  const candidates: CandidateAction[] = [];
  for (const action of rawActions) {
    const cand = evaluateCandidateAction(state, bot, action, profile);
    if (cand) {
      if (cand.hardValid) {
        candidates.push(cand);
      } else {
        console.log({
          TRACE: "ACTION_REJECTED",
          action: cand.action,
          reason: cand.reason,
          utility: cand.utility,
          expectedValue: cand.expectedValue
        });
      }
    }
  }

  if (candidates.length === 0) {
    return { type: phase === "trade" ? "end-turn" : "skip" };
  }

  // Step 4: Sort by Priority then Utility
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.utility - a.utility;
  });

  console.log({
      TRACE: "CANDIDATES",
      playerId: bot.id,
      botType,
      strategyMode: bot.botState.strategicMode,
      phase,
      candidates: candidates.map(c => ({
          action: c.action,
          category: c.category,
          priority: c.priority,
          utility: c.utility,
          expectedValue: c.expectedValue,
          probability: c.probability,
          explanation: c.explanation
      }))
  });

  // Step 5: Humanization / Selection
  return selectActionHumanized(state, bot, candidates, profile);
}


function getBestRebalance(bot: PlayerState, cost: number, mode: string, requiredCash: number) {
    const target = bot.botState!.personality.targetAllocation;
    const total = bot.cash + bot.bonds + bot.stocks;
    // Just return target allocation based on bot type
    let c = Math.floor(total * target.cash / 100);
    let b = Math.floor(total * target.bonds / 100);
    // Align to 5L blocks
    b = Math.floor(b / 5) * 5;
    let s = total - c - b;
    s = Math.floor(s / 5) * 5;
    c = total - b - s;

    if (requiredCash > c) {
        c = requiredCash;
        let remaining = total - c;
        b = Math.floor((remaining * (target.bonds / (target.bonds + target.stocks))) / 5) * 5;
        s = Math.floor((remaining - b) / 5) * 5;
        c = total - b - s;
    }
    
    console.log({
        TRACE: "REBALANCE",
        playerId: bot.id,
        botType: bot.botType,
        currentPortfolio: { cash: bot.cash, bonds: bot.bonds, stocks: bot.stocks },
        targetPortfolio: { cash: c, bonds: b, stocks: s },
        portfolioDrift: Math.abs(bot.cash - c) + Math.abs(bot.bonds - b) + Math.abs(bot.stocks - s),
        expectedBenefit: 5,
        rebalancePenalty: cost,
        utility: 5 - cost,
        selected: false
    });

    return { newCash: c, newBonds: b, newStocks: s };
}

function getRichestOpponent(state: GameState, botIdx: number) {
    let max = -1;
    let target = null;
    let index = -1;
    for (let i = 0; i < state.players.length; i++) {
        if (i !== botIdx) {
            const nw = netWorth(state.players[i]);
            if (nw > max) { max = nw; target = state.players[i]; index = i; }
        }
    }
    return target ? { player: target, index } : null;
}

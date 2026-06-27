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

export function createInitialBotState(botId: string, botType: "BULL" | "DISCIPLINED" | "AUDIT_HAWK" | "OPPORTUNIST" | "SAFETY_BUILDER" | "PROPERTY_BUILDER", allPlayers: {id: string, isBot: boolean}[]): BotState {
  let personality: BotPersonality;
  
  switch (botType) {
    case "BULL":
      personality = { risk: 95, greed: 95, aggression: 40, liquidity: 10, sociability: 10, targetAllocation: { cash: 10, bonds: 10, stocks: 80 } }; 
      break;
    case "DISCIPLINED":
      personality = { risk: 50, greed: 50, aggression: 50, liquidity: 50, sociability: 80, targetAllocation: { cash: 20, bonds: 20, stocks: 60 } }; 
      break;
    case "AUDIT_HAWK":
      personality = { risk: 30, greed: 40, aggression: 95, liquidity: 60, sociability: 20, targetAllocation: { cash: 40, bonds: 40, stocks: 20 } }; 
      break;
    case "OPPORTUNIST":
      personality = { risk: 80, greed: 80, aggression: 70, liquidity: 30, sociability: 90, targetAllocation: { cash: 15, bonds: 35, stocks: 50 } }; 
      break;
    case "SAFETY_BUILDER":
      personality = { risk: 10, greed: 30, aggression: 20, liquidity: 95, sociability: 50, targetAllocation: { cash: 35, bonds: 35, stocks: 30 } }; 
      break;
    case "PROPERTY_BUILDER":
      personality = { risk: 40, greed: 60, aggression: 60, liquidity: 20, sociability: 40, targetAllocation: { cash: 10, bonds: 20, stocks: 70 } }; 
      break;
    default:
      personality = { risk: 50, greed: 50, aggression: 50, liquidity: 50, sociability: 50, targetAllocation: { cash: 20, bonds: 20, stocks: 60 } }; 
  }

  const playerModels: BotState["playerModels"] = {};
  for (const p of allPlayers) {
    if (p.id === botId) continue;
    playerModels[p.id] = {
      cash: { mean: 10, variance: 100, confidence: 20 },
      bonds: { mean: 0, variance: 100, confidence: 20 },
      stocks: { mean: 0, variance: 100, confidence: 20 },
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
    },
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
    },
    playerModels,
  };
}

import { evaluateActionUtility, selectActionDeterministically, getYearEndOptimizationTrade } from "./bot-engine";

/**
 * Returns the single next action the bot should take for its current phase.
 * Integrated with the deterministic Agentic Bot Engine.
 */
export function getBotDecision(state: GameState, botIdx: number): BotAction {
  const phase = state.phase;
  const bot = state.players[botIdx];
  const botType = bot.botType || "DISCIPLINED";

  const legacyBotType = 
    botType === "BULL" ? "aggressive" :
    (botType === "SAFETY_BUILDER" || botType === "PROPERTY_BUILDER" || botType === "AUDIT_HAWK") ? "defensive" :
    "balanced";

  const debugBase = {
    botType,
    cash: bot.cash,
    portfolio: { cash: bot.cash, bonds: bot.bonds, stocks: bot.stocks },
  };

  let candidates: { action: BotAction; score: number }[] = [];
  let context: any = {};

  // 1. ROLL PHASE
  if (phase === "roll") {
    candidates.push({
      action: { type: "roll" },
      score: 100
    });
  }

  // 2. ACTION (TILE EXECUTION) PHASE
  else if (phase === "action") {
    const tile = getTileByPosition(bot.position);
    context.tileType = tile.effect;

    if (tile.effect === "ipo") {
      // Evaluate all possible IPO amounts: 0, 1, 2, 3, 4, 5
      for (let i = 0; i <= 5; i++) {
        if (bot.cash >= i) {
          const action: BotAction = { type: "tile-action", payload: { amount: i } };
          const score = evaluateActionUtility(state, bot, action, { tileType: "ipo", cost: i });
          candidates.push({ action, score });
        }
      }
    } else if (tile.effect === "lottery") {
      let play = false;
      if (legacyBotType === "defensive") play = bot.cash > 25;
      else if (legacyBotType === "balanced") play = bot.cash > 15;
      else play = bot.cash > 10;
      
      candidates.push({
        action: { type: "tile-action", payload: { play } },
        score: 100
      });

    } else if (tile.effect === "emergency") {
      candidates.push({ action: { type: "tile-action" }, score: 100 });
    } else if (tile.effect === "tax-raid") {
      candidates.push({ action: { type: "tile-action", payload: { skip: true } }, score: 0 });
      for (let pIdx = 0; pIdx < state.players.length; pIdx++) {
        if (pIdx !== botIdx) {
          const action: BotAction = { type: "tile-action", payload: { targetIdx: pIdx } };
          candidates.push({ action, score: evaluateActionUtility(state, bot, action, { tileType: "tax-raid" }) });
        }
      }
    } else if (tile.effect === "hostile-takeover") {
      const target = getRichestOpponent(state, botIdx);
      if (target) {
        let demandType: "bonds" | "stocks" | "cash" = "cash";
        if (legacyBotType === "defensive") demandType = target.player.bonds > 0 ? "bonds" : target.player.cash > 0 ? "cash" : "stocks";
        else if (legacyBotType === "balanced") demandType = bot.stocks < bot.bonds && target.player.stocks > 0 ? "stocks" : target.player.bonds > 0 ? "bonds" : "cash";
        else demandType = target.player.stocks > 0 ? "stocks" : target.player.cash > 0 ? "cash" : "bonds";
        
        candidates.push({ action: { type: "tile-action", payload: { targetIdx: target.index, demandType } }, score: 100 });
      } else {
        candidates.push({ action: { type: "tile-action", payload: { skip: true } }, score: 100 });
      }
    } else {
      candidates.push({ action: { type: "tile-action" }, score: 100 });
    }
  }
  
  // 3. YEAR-END REBALANCE PHASE
  else if (phase === "year-end") {
    let requiredCash = 0;
    if (state.emergencyState?.playerId === bot.id) {
        requiredCash = state.emergencyState.amount;
    }
    const newPort = getBestRebalance(bot, 0, legacyBotType, requiredCash);
    if (newPort) {
      candidates.push({ action: { type: "rebalance", payload: { ...newPort, penalty: 0 } }, score: 100 });
    }
  }
  
  // 4. HOUSE AUCTION PHASE
  else if (phase === "auction") {
    let bid = 0;
    const isMandatoryYear = bot.year >= 3;
    if (bot.hasHouse) {
      bid = 0;
    } else if (legacyBotType === "defensive") {
      bid = Math.min(bot.cash - 10, HOUSE_MARKET_PRICE - 1);
      if (bid < HOUSE_AUCTION_MIN) bid = isMandatoryYear && bot.cash >= 10 ? 10 : 0;
    } else if (legacyBotType === "balanced") {
      bid = Math.min(bot.cash - 5, HOUSE_MARKET_PRICE - 3);
      if (bid < HOUSE_AUCTION_MIN) bid = isMandatoryYear && bot.cash >= 10 ? 10 : 0;
    } else {
      bid = Math.min(bot.cash - 3, HOUSE_MARKET_PRICE - 5);
      if (bid < HOUSE_AUCTION_MIN) bid = isMandatoryYear && bot.cash >= 10 ? 10 : 0;
    }
    candidates.push({ action: { type: "house-auction-bid", payload: { amount: bid, bidderId: bot.id } }, score: 100 });
  }

  // 5. TRADE PHASE (TRADING, MID-YEAR REBALANCE)
  else if (phase === "trade") {
    // Generate skip
    candidates.push({ action: { type: "end-turn" }, score: 0 });

    // Generate audits for all opponents and all assets
    // Generate audits for all opponents
    for (let pIdx = 0; pIdx < state.players.length; pIdx++) {
      const p = state.players[pIdx];
      if (p.id !== bot.id && !p.wealthDeclared) {
        const auditAction: BotAction = { type: "audit", payload: { targetIdx: pIdx } };
        candidates.push({ action: auditAction, score: evaluateActionUtility(state, bot, auditAction) });
      }
    }

    // Mid-year rebalance check
    let needsMidYear = false;
    if (legacyBotType === "defensive" && bot.stocks > 25 && bot.cash >= 3) needsMidYear = true;
    else if (legacyBotType === "balanced" && bot.stocks > 40 && bot.cash >= 3) needsMidYear = true;
    else if (legacyBotType === "aggressive" && (bot.stocks > 45 || bot.bonds > 45) && bot.cash >= 3) needsMidYear = true;

    if (needsMidYear) {
      const newPort = getBestRebalance(bot, 3, legacyBotType);
      if (newPort) {
        candidates.push({ action: { type: "rebalance", payload: { ...newPort, penalty: 3 } }, score: 150 });
      }
    }

    // Trade offer optimization
    const trade = getYearEndOptimizationTrade(state, bot);
    if (trade) {
       // A trade optimization gets a high score so it gets picked over skipping
       candidates.push({ action: { type: "create-trade", payload: trade }, score: 100 });
    }
  }

  // 6. WAITING-TRADE PHASE (RESPONSE)
  else if (phase === "waiting-trade" && state.pendingTrade?.toPlayerId === bot.id) {
    const trade = state.pendingTrade;
    const offer = trade.offer;
    const request = trade.request;

    let accept = false;
    const cashAfter = bot.cash - request.cash + offer.cash;

    if (legacyBotType === "defensive") {
      if (cashAfter >= 10) {
        const valReceived = offer.cash + offer.bonds * 1.2 + offer.stocks * 0.8;
        const valGiven = request.cash + request.bonds * 1.2 + request.stocks * 0.8;
        accept = valReceived >= valGiven;
      }
    } else if (legacyBotType === "balanced") {
      if (cashAfter >= 5) {
        const valReceived = offer.cash + offer.bonds + offer.stocks;
        const valGiven = request.cash + request.bonds + request.stocks;
        accept = valReceived >= valGiven;
      }
    } else {
      if (cashAfter >= 3) {
        const valReceived = offer.cash + offer.bonds * 0.8 + offer.stocks * 1.5;
        const valGiven = request.cash + request.bonds * 0.8 + request.stocks * 1.5;
        accept = valReceived >= valGiven;
      }
    }

    candidates.push({ action: { type: "trade-response", payload: { accept } }, score: 100 });
  }

  // Fallback
  if (candidates.length === 0) {
    candidates.push({ action: { type: "skip" }, score: 100 });
  }

  const selectedBotAction = selectActionDeterministically(state, bot, candidates);

  console.log(
    "BOT GENERATED ACTION",
    selectedBotAction
  );

  if (selectedBotAction.type === "audit") {
    const targetIdx = selectedBotAction.payload?.targetIdx;
    if (
      targetIdx == null ||
      targetIdx < 0 ||
      targetIdx >= state.players.length ||
      targetIdx === botIdx
    ) {
      return { type: "end-turn" };
    }
  }

  return selectedBotAction;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/** Find the player with the highest net worth excluding this bot */
function getRichestOpponent(
  state: GameState,
  botIdx: number
): { player: PlayerState; index: number } | null {
  let richest: PlayerState | null = null;
  let richestIdx = -1;
  let maxWorth = -1;

  state.players.forEach((p, idx) => {
    if (idx === botIdx) return;
    const worth = netWorth(p);
    if (worth > maxWorth) {
      maxWorth = worth;
      richest = p;
      richestIdx = idx;
    }
  });

  return richest ? { player: richest, index: richestIdx } : null;
}

/** Get target opponent to audit based on confidence thresholds */
function getAuditTarget(
  state: GameState,
  botIdx: number,
  botType: "defensive" | "balanced" | "aggressive"
): { player: PlayerState; index: number } | null {
  for (let idx = 0; idx < state.players.length; idx++) {
    if (idx === botIdx) continue;
    const p = state.players[idx];

    const overCash = p.cash > 40;
    const overBonds = p.bonds > 40;
    const overStocks = p.stocks > 40;
    const isAuditable = overCash || overBonds || overStocks;

    if (isAuditable && (botType === "defensive" || botType === "balanced")) {
      return { player: p, index: idx };
    }

    if (botType === "aggressive") {
      // Aggressive audits High-Stock players >= 25L, or any player over the 40L limit
      if (p.stocks >= 25 || isAuditable) {
        return { player: p, index: idx };
      }
    }
  }

  return null;
}

/** Optimize rebalancing using the 5L multiple system and strategy scoring */
export function getBestRebalance(
  bot: PlayerState,
  penalty: number,
  botType: "defensive" | "balanced" | "aggressive",
  requiredCash: number = 0
): { newCash: number; newBonds: number; newStocks: number } | null {
  const total = bot.cash + bot.bonds + bot.stocks - penalty;
  let bestComb = { newCash: total, newBonds: 0, newStocks: 0 };
  let maxScore = -999999;

  const minCash = botType === "defensive" ? 10 : botType === "balanced" ? 5 : 3;

  for (let b = 0; b <= total; b += 5) {
    for (let s = 0; s <= total - b; s += 5) {
      const c = total - b - s;
      if (c < 0) continue;

      let score = 0;

      if (c < requiredCash) {
        if (total >= requiredCash) {
          score -= 1000000;
        } else {
          score += c * 10000;
        }
      } else if (c < minCash) {
        if (total >= minCash) {
          score -= 10000;
        } else {
          score += c * 100;
        }
      }

      if (botType === "defensive") {
        if (c < 10) {
          score -= 10000;
        } else {
          const targetCash = (bot.cash - penalty) >= 15 ? (bot.cash - penalty - 5) : (bot.cash - penalty);
          score -= Math.abs(c - targetCash) * 1000;
        }
        score += b * 2 + s * 0.5;
        score -= Math.abs(b - 2 * s) * 5;
        if (s > 25) score -= 5000;
      } else if (botType === "balanced") {
        score += b * 1 + s * 1;
        score -= Math.abs(b - s) * 2;
        if (s > 40) score -= 5000;
      } else {
        score += s * 6 + b * 0.5;
        if (s > 40 || b > 40) score -= 5000;
      }

      if (score > maxScore) {
        maxScore = score;
        bestComb = { newCash: c, newBonds: b, newStocks: s };
      }
    }
  }

  const currentCash = bot.cash - penalty;
  const currentBonds = bot.bonds;
  const currentStocks = bot.stocks;

  const targetCash = bestComb.newCash;
  const targetBonds = bestComb.newBonds;
  const targetStocks = bestComb.newStocks;

  let cashDelta = targetCash - currentCash;
  let bondsDelta = targetBonds - currentBonds;
  let stocksDelta = targetStocks - currentStocks;

  console.log("BOT REBALANCE CALCULATION", {
    currentCash, currentBonds, currentStocks,
    targetCash, targetBonds, targetStocks,
    cashDelta, bondsDelta, stocksDelta,
  });

  function normalizeToBlock(value: number): number {
    return Math.trunc(value / 5) * 5;
  }

  stocksDelta = normalizeToBlock(stocksDelta);
  bondsDelta = normalizeToBlock(bondsDelta);
  cashDelta = normalizeToBlock(cashDelta);

  // Hard validate deltas
  if (bondsDelta % 5 !== 0 || stocksDelta % 5 !== 0) {
    console.error("INVALID BOT REBALANCE", { bondsDelta, stocksDelta });
    return null;
  }

  // Ensure total mass is conserved so applyYearEndRebalance does not fail.
  // Because independently truncating can lose/gain cash, we enforce cashDelta balances exactly.
  cashDelta = -(stocksDelta + bondsDelta);

  // Prevent negative cash due to rounding
  while (currentCash + cashDelta < 0) {
     if (stocksDelta > 0) stocksDelta -= 5;
     else if (bondsDelta > 0) bondsDelta -= 5;
     else break; // Should not happen if total >= 0
     cashDelta = -(stocksDelta + bondsDelta);
  }

  // If we are forced to pay an emergency, forcefully liquidate more blocks until we have enough cash
  // (unless we are completely out of blocks)
  while (currentCash + cashDelta < requiredCash) {
    let liquidated = false;
    if (currentBonds + bondsDelta >= 5) {
      bondsDelta -= 5;
      liquidated = true;
    } else if (currentStocks + stocksDelta >= 5) {
      stocksDelta -= 5;
      liquidated = true;
    }
    
    if (!liquidated) break;
    cashDelta = -(stocksDelta + bondsDelta);
  }

  const finalAction = {
    newCash: currentCash + cashDelta,
    newBonds: currentBonds + bondsDelta,
    newStocks: currentStocks + stocksDelta
  };

  console.log("BOT REBALANCE ACTION", finalAction);
  console.log("REBALANCE VALIDATION", {
    bondsAdjustment: bondsDelta,
    stocksAdjustment: stocksDelta,
    bondsModulo: bondsDelta % 5,
    stocksModulo: stocksDelta % 5,
  });

  return finalAction;
}

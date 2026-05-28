// bot.ts — Bot turn decision logic (pure, side-effect free)
//
// Public interface: getBotDecision(state, botIdx) → BotAction
// All other functions are private helpers.

import type { GameState, PlayerState } from "../db/schema";
import { netWorth } from "./actions";
import { getTileByPosition, HOUSE_AUCTION_MIN, HOUSE_MARKET_PRICE } from "./tiles";

export interface BotAction {
  type:
    | "roll"
    | "tile-action"
    | "house-auction-bid"
    | "rebalance"
    | "trade-response"
    | "end-turn"
    | "skip"
    | "audit";
  payload?: Record<string, unknown>;
  debug?: {
    botType: "defensive" | "balanced" | "aggressive";
    cash: number;
    portfolio: { cash: number; bonds: number; stocks: number };
    chosenAction: string;
    reason: string;
    targetPlayer?: string;
  };
}

/**
 * Returns the single next action the bot should take for its current phase.
 * Includes complete debugging payload for the Bot Debug Panel.
 */
export function getBotDecision(state: GameState, botIdx: number): BotAction {
  const phase = state.phase;
  const bot = state.players[botIdx];
  const botType = bot.botType || "balanced";

  const debugBase = {
    botType,
    cash: bot.cash,
    portfolio: { cash: bot.cash, bonds: bot.bonds, stocks: bot.stocks },
  };

  // 1. ROLL PHASE
  if (phase === "roll") {
    return {
      type: "roll",
      debug: {
        ...debugBase,
        chosenAction: "Roll Dice",
        reason: botType === "defensive"
          ? "Rolling to advance safely. Current cash buffer: " + bot.cash + "L."
          : botType === "balanced"
          ? "Rolling to advance portfolio. Cash: " + bot.cash + "L."
          : "Rolling for rapid wealth growth! Cash: " + bot.cash + "L.",
      },
    };
  }

  // 2. ACTION (TILE EXECUTION) PHASE
  if (phase === "action") {
    const tile = getTileByPosition(bot.position);

    if (tile.effect === "ipo") {
      let investAmount = 0;
      let reason = "";

      if (botType === "defensive") {
        investAmount = bot.cash >= 12 ? 2 : bot.cash === 11 ? 1 : 0;
        reason = investAmount > 0
          ? `Invested ${investAmount}L in IPO while keeping the strict 10L cash buffer.`
          : "Declined IPO to prioritize defensive cash reserves (10L buffer required).";
      } else if (botType === "balanced") {
        investAmount = bot.cash >= 7 ? 2 : bot.cash === 6 ? 1 : 0;
        reason = investAmount > 0
          ? `Invested ${investAmount}L in IPO while maintaining the 5L cash buffer.`
          : "Declined IPO to maintain moderate 5L cash buffer.";
      } else {
        investAmount = bot.cash >= 5 ? 2 : bot.cash === 4 ? 1 : 0;
        reason = investAmount > 0
          ? `Invested ${investAmount}L in IPO aggressively for high-return stock growth.`
          : "Declined IPO because cash reserves are below the 3L floor.";
      }

      return {
        type: "tile-action",
        payload: { amount: investAmount },
        debug: {
          ...debugBase,
          chosenAction: `IPO Investment (${investAmount}L)`,
          reason,
        },
      };
    }

    if (tile.effect === "lottery") {
      let play = false;
      let reason = "";

      if (botType === "defensive") {
        play = bot.cash > 25;
        reason = play
          ? "Playing Lottery since cash reserves exceed 25L safety threshold."
          : "Declined Lottery to avoid low-probability high-risk actions.";
      } else if (botType === "balanced") {
        play = bot.cash > 15;
        reason = play
          ? "Playing Lottery since cash reserves are above the 15L threshold."
          : "Declined Lottery to protect moderate cash reserves.";
      } else {
        play = bot.cash > 10;
        reason = play
          ? "Playing Lottery aggressively since cash is above the 10L threshold."
          : "Declined Lottery due to tight cash reserves.";
      }

      return {
        type: "tile-action",
        payload: { play },
        debug: {
          ...debugBase,
          chosenAction: play ? "Play Lottery" : "Decline Lottery",
          reason,
        },
      };
    }

    if (tile.effect === "emergency") {
      // Amount is pre-rolled by choice modal and saved in gameState/payload by dispatcher/page
      return {
        type: "tile-action",
        debug: {
          ...debugBase,
          chosenAction: "Resolve Emergency",
          reason: "Paying mandatory emergency fee to resolve the tile effect.",
        },
      };
    }

    if (tile.effect === "tax-raid") {
      const target = getRichestOpponent(state, botIdx);
      if (!target) {
        return {
          type: "tile-action",
          payload: { skip: true },
          debug: {
            ...debugBase,
            chosenAction: "Skip Tax Raid",
            reason: "No valid target opponents available to raid.",
          },
        };
      }

      const targetWorth = netWorth(target.player);
      let execute = false;
      let reason = "";

      if (botType === "defensive") {
        execute = targetWorth >= 80;
        reason = execute
          ? `Raid target ${target.player.name} (Wealth: ${targetWorth}L) exceeds safety limit of 80L.`
          : `Target ${target.player.name} wealth (${targetWorth}L) is safe; saving cash.`;
      } else if (botType === "balanced") {
        execute = targetWorth >= 60;
        reason = execute
          ? `Raid target ${target.player.name} (Wealth: ${targetWorth}L) exceeds limit of 60L.`
          : `Target ${target.player.name} wealth (${targetWorth}L) is below threshold; saving cash.`;
      } else {
        execute = bot.cash > 3;
        reason = execute
          ? `Aggressive Raid on ${target.player.name} to disrupt leadership.`
          : "Failed to raid due to severe cash constraints.";
      }

      if (execute) {
        return {
          type: "tile-action",
          payload: { targetIdx: target.index },
          debug: {
            ...debugBase,
            chosenAction: `Tax Raid on ${target.player.name}`,
            reason,
            targetPlayer: target.player.name,
          },
        };
      }

      return {
        type: "tile-action",
        payload: { skip: true },
        debug: {
          ...debugBase,
          chosenAction: "Skip Tax Raid",
          reason,
        },
      };
    }

    if (tile.effect === "hostile-takeover") {
      const target = getRichestOpponent(state, botIdx);
      if (!target) {
        return {
          type: "tile-action",
          payload: { skip: true },
          debug: {
            ...debugBase,
            chosenAction: "Skip Takeover",
            reason: "No valid opponents available for Hostile Takeover.",
          },
        };
      }

      let demandType: "bonds" | "stocks" | "cash" = "cash";
      let reason = "";

      if (botType === "defensive") {
        demandType = target.player.bonds > 0 ? "bonds" : target.player.cash > 0 ? "cash" : "stocks";
        reason = `Taking low-volatility ${demandType} from leader ${target.player.name} to secure growth.`;
      } else if (botType === "balanced") {
        demandType = bot.stocks < bot.bonds && target.player.stocks > 0 ? "stocks" : target.player.bonds > 0 ? "bonds" : "cash";
        reason = `Balancing portfolio by demanding ${demandType} from leader ${target.player.name}.`;
      } else {
        demandType = target.player.stocks > 0 ? "stocks" : target.player.cash > 0 ? "cash" : "bonds";
        reason = `Hostile takeover targeting high-growth ${demandType} from leader ${target.player.name}.`;
      }

      return {
        type: "tile-action",
        payload: { targetIdx: target.index, demandType },
        debug: {
          ...debugBase,
          chosenAction: `Hostile Takeover on ${target.player.name}`,
          reason,
          targetPlayer: target.player.name,
        },
      };
    }

    // Default tile-action (bonus, stock crash/rally, market crash/rally)
    return {
      type: "tile-action",
      debug: {
        ...debugBase,
        chosenAction: "Resolve Tile",
        reason: `Executing standard tile: ${tile.name}.`,
      },
    };
  }

  // 3. YEAR-END REBALANCE PHASE
  if (phase === "year-end") {
    const newPort = getBestRebalance(bot, 0, botType);
    return {
      type: "rebalance",
      payload: { ...newPort, penalty: 0 },
      debug: {
        ...debugBase,
        chosenAction: "Year-End Rebalance",
        reason: `Free year-end rebalance to align with ${botType} strategy (Target Cash: ${newPort.newCash}L, Bonds: ${newPort.newBonds}L, Stocks: ${newPort.newStocks}L).`,
      },
    };
  }

  // 4. HOUSE AUCTION PHASE
  if (phase === "auction") {
    let bid = 0;
    let reason = "";

    const isMandatoryYear = bot.year >= 3;

    if (botType === "defensive") {
      bid = Math.min(bot.cash - 10, HOUSE_MARKET_PRICE - 1);
      if (bid < HOUSE_AUCTION_MIN) bid = isMandatoryYear && bot.cash >= 10 ? 10 : 0;
      reason = bid > 0
        ? `Defensive Bid of ${bid}L to purchase a house while securing a 10L cash buffer.`
        : isMandatoryYear
        ? "Bidding minimum 10L as purchase is mandatory by Year 3."
        : "Skipped bid to protect critical 10L safety cash reserves.";
    } else if (botType === "balanced") {
      bid = Math.min(bot.cash - 5, HOUSE_MARKET_PRICE - 3);
      if (bid < HOUSE_AUCTION_MIN) bid = isMandatoryYear && bot.cash >= 10 ? 10 : 0;
      reason = bid > 0
        ? `Balanced Bid of ${bid}L to purchase a house and protect 5L cash reserves.`
        : "Skipped bid to maintain moderate cash buffer.";
    } else {
      bid = Math.min(bot.cash - 3, HOUSE_MARKET_PRICE - 5);
      if (bid < HOUSE_AUCTION_MIN) bid = isMandatoryYear && bot.cash >= 10 ? 10 : 0;
      reason = bid > 0
        ? `Aggressive Bid of ${bid}L to get a house cheaply and keep cash in stocks.`
        : "Skipped bid to keep cash free for higher stock growth.";
    }

    // Bid must be 0 if we already have a house
    if (bot.hasHouse) {
      bid = 0;
      reason = "Bot already owns a house. Bidding 0L.";
    }

    return {
      type: "house-auction-bid",
      payload: { amount: bid },
      debug: {
        ...debugBase,
        chosenAction: `House Auction Bid (${bid}L)`,
        reason,
      },
    };
  }

  // 5. TRADE PHASE (TRADING, AUDITS, MID-YEAR REBALANCE)
  if (phase === "trade") {
    // A. Check for audits (if opponents have asset > 40L)
    const auditTarget = getAuditTarget(state, botIdx, botType);
    if (auditTarget) {
      const targetName = auditTarget.player.name;
      const reason = botType === "defensive"
        ? `Safe audit on ${targetName}: opponent has asset over 40L, ensuring 100% success.`
        : botType === "balanced"
        ? `Strategic audit on ${targetName} for exceeding asset limits.`
        : `Aggressive audit on suspected high-asset/stock player ${targetName}.`;

      return {
        type: "audit",
        payload: { targetIdx: auditTarget.index },
        debug: {
          ...debugBase,
          chosenAction: `Audit ${targetName}`,
          reason,
          targetPlayer: targetName,
        },
      };
    }

    // B. Check for mid-year rebalance requirements
    let needsMidYear = false;
    let reason = "";

    if (botType === "defensive" && bot.stocks > 25 && bot.cash >= 3) {
      needsMidYear = true;
      reason = "Stocks exceed 25L threshold. Rebalancing aggressively mid-year to manage volatility.";
    } else if (botType === "balanced" && bot.stocks > 40 && bot.cash >= 3) {
      needsMidYear = true;
      reason = "Stocks exceed 40L concentration limit. Rebalancing mid-year to avoid audit penalties.";
    } else if (botType === "aggressive" && (bot.stocks > 45 || bot.bonds > 45) && bot.cash >= 3) {
      needsMidYear = true;
      reason = "Asset concentration dangerously high. Rebalancing mid-year to reduce audit risk.";
    }

    if (needsMidYear) {
      const newPort = getBestRebalance(bot, 3, botType);
      return {
        type: "rebalance",
        payload: { ...newPort, penalty: 3 },
        debug: {
          ...debugBase,
          chosenAction: "Mid-Year Rebalance (3L Fine)",
          reason,
        },
      };
    }

    // C. Otherwise, end turn
    return {
      type: "end-turn",
      debug: {
        ...debugBase,
        chosenAction: "End Turn",
        reason: "All actions completed for this turn. Ending turn.",
      },
    };
  }

  // 6. WAITING-TRADE PHASE (RESPONSE)
  if (phase === "waiting-trade" && state.pendingTrade?.toPlayerId === bot.id) {
    const trade = state.pendingTrade;
    const fromPlayer = state.players.find(p => p.id === trade.fromPlayerId);
    const offer = trade.offer;
    const request = trade.request;

    let accept = false;
    let reason = "";

    const cashAfter = bot.cash - request.cash + offer.cash;

    if (botType === "defensive") {
      if (cashAfter < 10) {
        accept = false;
        reason = "Rejected: Trade would drop cash below the strict 10L buffer.";
      } else {
        const valReceived = offer.cash + offer.bonds * 1.2 + offer.stocks * 0.8;
        const valGiven = request.cash + request.bonds * 1.2 + request.stocks * 0.8;
        accept = valReceived >= valGiven;
        reason = accept
          ? "Accepted: Swapping stocks for low-risk bonds or cash value."
          : "Rejected: Trade does not provide sufficient bonds or cash value.";
      }
    } else if (botType === "balanced") {
      if (cashAfter < 5) {
        accept = false;
        reason = "Rejected: Trade would drop cash below the 5L buffer.";
      } else {
        const valReceived = offer.cash + offer.bonds + offer.stocks;
        const valGiven = request.cash + request.bonds + request.stocks;
        accept = valReceived >= valGiven;
        reason = accept
          ? "Accepted: Value received is equal to or greater than value offered."
          : "Rejected: Trade value is disadvantageous.";
      }
    } else {
      if (cashAfter < 3) {
        accept = false;
        reason = "Rejected: Trade would drop cash below the 3L floor.";
      } else {
        const valReceived = offer.cash + offer.bonds * 0.8 + offer.stocks * 1.5;
        const valGiven = request.cash + request.bonds * 0.8 + request.stocks * 1.5;
        accept = valReceived >= valGiven;
        reason = accept
          ? "Accepted: Gaining high-potential stocks in exchange for lower-yield assets."
          : "Rejected: Trade does not provide enough high-growth stocks.";
      }
    }

    return {
      type: "trade-response",
      payload: { accept },
      debug: {
        ...debugBase,
        chosenAction: accept ? "Accept Trade" : "Reject Trade",
        reason,
        targetPlayer: fromPlayer?.name,
      },
    };
  }

  return { type: "skip" };
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
  botType: "defensive" | "balanced" | "aggressive"
): { newCash: number; newBonds: number; newStocks: number } {
  const total = bot.cash + bot.bonds + bot.stocks - penalty;
  let bestComb = { newCash: total, newBonds: 0, newStocks: 0 };
  let maxScore = -999999;

  const minCash = botType === "defensive" ? 10 : botType === "balanced" ? 5 : 3;

  for (let b = 0; b <= total; b += 5) {
    for (let s = 0; s <= total - b; s += 5) {
      const c = total - b - s;
      if (c < 0) continue;

      let score = 0;

      // Penalty if cash falls below strict floor
      if (c < minCash) {
        if (total >= minCash) {
          score -= 10000;
        } else {
          score += c * 100; // maximize cash if we physically cannot reach the buffer
        }
      }

      if (botType === "defensive") {
        // Maintain minimum 10L cash buffer
        if (c < 10) {
          score -= 10000;
        } else {
          // Invest exactly 5L if we have excess cash >= 5L above the 10L buffer (meaning cash >= 15L)
          const targetCash = (bot.cash - penalty) >= 15 ? (bot.cash - penalty - 5) : (bot.cash - penalty);
          score -= Math.abs(c - targetCash) * 1000;
        }
        // Prefer bonds over stocks
        score += b * 2 + s * 0.5;
        // Target 2:1 ratio for bonds to stocks
        score -= Math.abs(b - 2 * s) * 5;
        // Avoid stocks > 25L
        if (s > 25) score -= 5000;
      } else if (botType === "balanced") {
        // Balanced split
        score += b * 1 + s * 1;
        // Try to keep bonds and stocks near a 50/50 split
        score -= Math.abs(b - s) * 2;
        // Avoid stocks > 40L
        if (s > 40) score -= 5000;
      } else {
        // Aggressive: Prefer stocks heavily
        score += s * 6 + b * 0.5;
        // Avoid concentration audit triggers
        if (s > 40 || b > 40) score -= 5000;
      }

      if (score > maxScore) {
        maxScore = score;
        bestComb = { newCash: c, newBonds: b, newStocks: s };
      }
    }
  }

  return bestComb;
}

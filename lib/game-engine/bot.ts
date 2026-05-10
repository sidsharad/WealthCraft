// bot.ts — Standard Bot decision logic (pure, side-effect free)
import type { GameState, PlayerState } from "../db/schema";
import {
  applyIPO, applyHostileTakeover, rollDice,
  processWealthDeclaration, calculateYearEndReturns,
} from "./actions";
import { netWorth, countBlocks } from "./validators";
import { HOUSE_AUCTION_MIN, HOUSE_MARKET_PRICE } from "./tiles";

export interface BotAction {
  type:
    | "roll"
    | "ipo"
    | "lottery"
    | "hostile-takeover"
    | "house-auction-bid"
    | "tax-raid"
    | "emergency"
    | "rebalance"
    | "pass-trade"
    | "skip"
    | "declare";
  payload?: Record<string, unknown>;
}

/**
 * Bot turn decision for a given game state.
 * Returns a sequence of actions the bot wants to take.
 * Each action is processed one at a time with 1.5s delay in the UI.
 */
export function getBotDecision(
  state: GameState,
  botIdx: number
): BotAction {
  const bot = state.players[botIdx];
  const phase = state.phase;

  // Must declare wealth if at 70L+
  if (netWorth(bot) >= 70 && !bot.wealthDeclared) {
    return { type: "declare" };
  }

  // Roll phase
  if (phase === "roll") {
    return { type: "roll" };
  }

  // Action phase — resolve based on current tile
  if (phase === "action") {
    const tile = state.players[botIdx];
    return { type: "skip" }; // caller handles tile resolution
  }

  // Trade phase — bot never initiates (MVP)
  if (phase === "trade") {
    return { type: "pass-trade" };
  }

  // Year-end rebalance
  if (phase === "year-end") {
    return getBotRebalanceAction(state, botIdx);
  }

  // Auction phase
  if (phase === "auction") {
    return getBotAuctionBid(state, botIdx);
  }

  return { type: "skip" };
}

/** Bot rebalance logic: move cash above 5L into stocks (wealth<60L) or bonds (wealth>=60L) */
export function getBotRebalanceAction(state: GameState, botIdx: number): BotAction {
  const bot = state.players[botIdx];
  const wealth = netWorth(bot);
  const excessCash = Math.floor((bot.cash - 5) / 5) * 5; // cash above 5L, in 5L blocks

  if (excessCash <= 0) {
    return { type: "skip" };
  }

  if (wealth < 60) {
    // Move excess cash into stocks
    return {
      type: "rebalance",
      payload: {
        newCash: bot.cash - excessCash,
        newBonds: bot.bonds,
        newStocks: bot.stocks + excessCash,
      },
    };
  } else {
    // Move excess cash into bonds
    return {
      type: "rebalance",
      payload: {
        newCash: bot.cash - excessCash,
        newBonds: bot.bonds + excessCash,
        newStocks: bot.stocks,
      },
    };
  }
}

/** Bot auction: bid market price - 3L if it doesn't own a house */
export function getBotAuctionBid(state: GameState, botIdx: number): BotAction {
  const bot = state.players[botIdx];
  if (bot.hasHouse) {
    return { type: "house-auction-bid", payload: { amount: 0 } }; // no bid
  }
  const bid = Math.max(HOUSE_AUCTION_MIN, HOUSE_MARKET_PRICE - 3);
  if (bot.cash >= bid) {
    return { type: "house-auction-bid", payload: { amount: bid } };
  }
  // Can't afford, bid minimum if possible
  if (bot.cash >= HOUSE_AUCTION_MIN) {
    return { type: "house-auction-bid", payload: { amount: HOUSE_AUCTION_MIN } };
  }
  return { type: "house-auction-bid", payload: { amount: 0 } };
}

/** Bot IPO: always invest maximum (2L) if it has cash */
export function getBotIPOAction(bot: PlayerState): BotAction {
  const maxInvest = Math.min(2, bot.cash);
  return { type: "ipo", payload: { amount: maxInvest } };
}

/** Bot lottery: always pays 2L entry if it has cash */
export function getBotLotteryAction(bot: PlayerState): BotAction {
  if (bot.cash >= 2) {
    return { type: "lottery" };
  }
  return { type: "skip" };
}

/** Bot hostile takeover: target the wealthiest human, demand stocks/bonds */
export function getBotHostileTakeoverAction(
  state: GameState,
  botIdx: number
): BotAction {
  const bot = state.players[botIdx];
  const humans = state.players.filter((p, i) => !p.isBot && i !== botIdx);
  if (humans.length === 0 || bot.cash < 5) {
    return { type: "skip" };
  }

  const richestHuman = humans.reduce((max, p) =>
    netWorth(p) > netWorth(max) ? p : max
  );

  // Spend 5L cash → demand stocks or bonds (whichever they have more of)
  const spendAmount = Math.min(bot.cash - (bot.cash % 5), 10); // spend up to 10L in 5L blocks
  if (spendAmount < 5) return { type: "skip" };

  const targetIdx = state.players.findIndex((p) => p.id === richestHuman.id);
  const demandType = richestHuman.stocks >= richestHuman.bonds ? "stocks" : "bonds";

  const targetHas = demandType === "stocks" ? richestHuman.stocks : richestHuman.bonds;
  const actualSpend = Math.min(spendAmount, targetHas);
  if (actualSpend < 5) return { type: "skip" };

  return {
    type: "hostile-takeover",
    payload: { targetIdx, spendAmount: actualSpend, demandType },
  };
}

/** Bot government raid: target player closest to 70L who hasn't declared */
export function getBotGovernmentRaidAction(
  state: GameState,
  botIdx: number
): BotAction {
  const bot = state.players[botIdx];
  if (bot.cash < 2) return { type: "skip" };

  const candidates = state.players
    .filter((p, i) => !p.wealthDeclared && i !== botIdx)
    .map((p) => ({ ...p, wealth: netWorth(p) }))
    .sort((a, b) => Math.abs(70 - a.wealth) - Math.abs(70 - b.wealth));

  if (candidates.length === 0) return { type: "skip" };
  const target = candidates[0];
  const targetIdx = state.players.findIndex((p) => p.id === target.id);

  return { type: "tax-raid", payload: { targetIdx } };
}

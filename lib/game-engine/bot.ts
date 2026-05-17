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
    | "pass-trade"
    | "end-turn"
    | "skip";
  payload?: Record<string, unknown>;
}

/**
 * Returns the single next action the bot should take for its current phase.
 * The caller is responsible for sequencing multiple calls (e.g. roll → action → end-turn).
 */
export function getBotDecision(state: GameState, botIdx: number): BotAction {
  const phase = state.phase;

  if (phase === "roll") return { type: "roll" };

  if (phase === "action") {
    // Resolve the tile effect — caller dispatches "tile-action" with the payload
    const bot = state.players[botIdx];
    const tile = getTileByPosition(bot.position);

    if (tile.effect === "ipo") return { type: "tile-action", payload: { amount: Math.min(2, bot.cash) } };
    if (tile.effect === "lottery") return { type: "tile-action", payload: { play: bot.cash >= 2 } };
    if (tile.effect === "emergency") return { type: "tile-action" }; // amount resolved by ChoiceModal
    // All other tile effects (bonus, crash, rally, etc.) need no payload
    return { type: "tile-action" };
  }

  if (phase === "trade") return { type: "end-turn" };

  if (phase === "year-end") return rebalanceAction(state, botIdx);

  if (phase === "auction") return auctionBidAction(state, botIdx);

  return { type: "skip" };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/** Move excess cash into stocks (wealth < 60L) or bonds (wealth >= 60L) */
function rebalanceAction(state: GameState, botIdx: number): BotAction {
  const bot = state.players[botIdx];
  const wealth = netWorth(bot);
  const excessCash = Math.floor((bot.cash - 5) / 5) * 5; // cash above 5L floor, in 5L blocks

  if (excessCash <= 0) return { type: "skip" };

  if (wealth < 60) {
    return { type: "rebalance", payload: { newCash: bot.cash - excessCash, newBonds: bot.bonds, newStocks: bot.stocks + excessCash } };
  }
  return { type: "rebalance", payload: { newCash: bot.cash - excessCash, newBonds: bot.bonds + excessCash, newStocks: bot.stocks } };
}

/** Bid market price - 3L; fall back to minimum if short on cash */
function auctionBidAction(state: GameState, botIdx: number): BotAction {
  const bot = state.players[botIdx];
  if (bot.hasHouse) return { type: "house-auction-bid", payload: { amount: 0 } };

  const preferred = HOUSE_MARKET_PRICE - 3;
  const bid = bot.cash >= preferred ? preferred
    : bot.cash >= HOUSE_AUCTION_MIN ? HOUSE_AUCTION_MIN
    : 0;

  return { type: "house-auction-bid", payload: { amount: bid } };
}

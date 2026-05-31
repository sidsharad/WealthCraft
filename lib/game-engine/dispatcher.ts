// dispatcher.ts — pure local-mode turn dispatcher
//
// dispatch(state, action, payload) → DispatchResult
//
// This module owns all turn-state computation for local pass-and-play mode.
// It is completely free of React, routing, and UI concerns. The page calls it
// and acts on the returned `sideEffect` to trigger modals and UI transitions.
//
// Interface:
//   dispatch(state, action, payload) → DispatchResult
//
// The page pattern:
//   const result = dispatch(gameState, action, payload);
//   if (result.sideEffect) handleSideEffect(result.sideEffect);
//   else setGameState(result.state);

import type { GameState } from "../db/schema";
import {
  rollDice,
  processDiceRoll,
  collectIncome,
  applyIncomeFreezeToPlayer,
  calculateYearEndReturns,
  applyBonus,
  applyStockRally,
  applyStockCrash,
  applyMarketCrash,
  applyMarketRally,
  applyIPO,
  applyEmergency,
  deductLotteryFee,
  applyLotteryReward,
  applyTaxRaid,
  applyHostileTakeover,
  resolveHouseAuction,
  applyYearEndRebalance,
  resolveTrade,
  processConcentrationAudit,
  advanceTurn,
  checkWinCondition,
  addLog,
} from "./actions";
import { getTileByPosition } from "./tiles";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A UI side-effect the page must handle.
 * The dispatcher cannot call React setters, so it signals what the page should do.
 */
export type SideEffect =
  | { type: "show-modal"; modal: "ipo" | "lottery" }
  | { type: "show-modal"; modal: "emergency"; emergencyAmount: number }
  | { type: "show-modal"; modal: "tax-raid" | "hostile-takeover" | "audit" }
  | { type: "show-auction" }
  | { type: "show-pass-device" }
  | { type: "start-lottery-roll" }
  | { type: "needs-rebalance"; penalty: number }
  | { type: "error"; message: string };

export interface DispatchResult {
  state: GameState;
  /** Last dice value rolled, if a roll occurred. */
  dice?: number;
  /** UI action the page must take instead of (or after) updating state. */
  sideEffect?: SideEffect;
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export function dispatch(
  state: GameState,
  action: string,
  payload?: Record<string, unknown>
): DispatchResult {
  const playerIdx = state.currentPlayerIndex;
  const player = state.players[playerIdx];

  switch (action) {
    case "roll": {
      const diceValue = (payload?.dice as number) ?? rollDice();
      const result = processDiceRoll(state, playerIdx, diceValue);
      let s = result.state;

      const tile = getTileByPosition(result.newPosition);
      s = tile.effect === "income-freeze"
        ? applyIncomeFreezeToPlayer(s, playerIdx)
        : collectIncome(s, playerIdx);

      if (result.passedStart) {
        s = calculateYearEndReturns(s, playerIdx);
        s = { ...s, phase: "year-end" };
      } else {
        s = { ...s, phase: "action" };
      }
      return { state: s, dice: result.dice };
    }

    case "lottery-resolve": {
      const diceVal = (payload?.dice as number) ?? (Math.floor(Math.random() * 6) + 1);
      let s = applyLotteryReward(state, playerIdx, diceVal);
      s = { ...s, phase: "trade" };
      return { state: s };
    }

    case "tile-action": {
      const tile = getTileByPosition(player.position);

      // Tiles that need a modal first — signal the page if payload is absent
      if (!payload) {
        if (tile.effect === "ipo") return { state, sideEffect: { type: "show-modal", modal: "ipo" } };
        if (tile.effect === "emergency") {
          const rand = Math.random();
          const emergencyAmount = rand < 0.5 ? 3 : rand < 0.8 ? 5 : 10;
          return { state, sideEffect: { type: "show-modal", modal: "emergency", emergencyAmount } };
        }
        if (tile.effect === "lottery") return { state, sideEffect: { type: "show-modal", modal: "lottery" } };
        if (tile.effect === "tax-raid") return { state, sideEffect: { type: "show-modal", modal: "tax-raid" } };
        if (tile.effect === "hostile-takeover") return { state, sideEffect: { type: "show-modal", modal: "hostile-takeover" } };
      }

      let s = state;

      switch (tile.effect) {
        case "bonus": s = applyBonus(s, playerIdx); break;
        case "stock-rally": s = applyStockRally(s, playerIdx); break;
        case "stock-crash": s = applyStockCrash(s, playerIdx); break;
        case "market-crash": s = applyMarketCrash(s, playerIdx); break;
        case "market-rally": s = applyMarketRally(s, playerIdx); break;

        case "ipo": {
          const amount = payload?.amount as number ?? 0;
          if (player.cash < amount) return { state, sideEffect: { type: "needs-rebalance", penalty: 3 } };
          s = applyIPO(s, playerIdx, amount);
          break;
        }
        case "emergency": {
          const amount = payload?.amount as number;
          if (!amount) {
            // payload exists but no amount — treat as cancel, re-show modal with same pre-rolled amount
            const stored = payload?.storedAmount as number;
            if (stored) {
              return { state, sideEffect: { type: "show-modal", modal: "emergency", emergencyAmount: stored } };
            }
            const rand = Math.random();
            const emergencyAmount = rand < 0.5 ? 3 : rand < 0.8 ? 5 : 10;
            return { state, sideEffect: { type: "show-modal", modal: "emergency", emergencyAmount } };
          }
          
          if (player.cash < amount) {
            // If they can't afford it, check if they can physically rebalance in legal 5L blocks
            const canRebalance = player.bonds >= 5 || player.stocks >= 5;
            if (canRebalance) {
              return { state, sideEffect: { type: "needs-rebalance", penalty: 3 } };
            } else {
              // They can't even afford to rebalance. Take whatever cash they have and move on.
              console.log(JSON.stringify({
                event: "EMERGENCY_PARTIAL_PAYMENT",
                playerId: player.id,
                emergencyAmount: amount,
                cashAvailable: player.cash,
                amountPaid: player.cash,
                remainingUnpaid: amount - player.cash
              }));
              s = applyEmergency(s, playerIdx, player.cash);
              break;
            }
          }
          
          s = applyEmergency(s, playerIdx, amount);
          break;
        }
        case "lottery": {
          if (payload?.play) {
            s = deductLotteryFee(s, playerIdx);
            return { state: s, sideEffect: { type: "start-lottery-roll" } };
          }
          return { state: advanceTurn(s) };
          break;
        }
        case "tax-raid": {
          if (payload?.skip) {
            s = addLog(s, `${player.name} chose to take no action.`);
          } else {
            const targetIdx = toInt(payload?.targetIdx);
            const result = applyTaxRaid(s, playerIdx, targetIdx);
            if (!result.valid) return { state, sideEffect: { type: "error", message: result.error! } };
            s = result.state;
          }
          break;
        }
        case "hostile-takeover": {
          if (payload?.skip) {
            s = addLog(s, `${player.name} chose to take no action.`);
          } else {
            const targetIdx = toInt(payload?.targetIdx);
            const result = applyHostileTakeover(s, playerIdx, targetIdx, payload?.demandType as any);
            if (!result.valid) return { state, sideEffect: { type: "error", message: result.error! } };
            s = result.state;
          }
          break;
        }
        case "house-auction": {
          const eligible = s.players.filter(p => !p.hasHouse).length;
          if (eligible > 0) {
            s = { ...s, phase: "auction", auctionState: { bids: [], open: true, timerStart: Date.now() } };
            return { state: s, sideEffect: { type: "show-auction" } };
          }
          s = { ...s, phase: "trade", announcement: "🏠 NO AUCTION: All players already own houses." };
          return { state: s };
        }
      }

      if (s.phase !== "auction") s = { ...s, phase: "trade" };
      return { state: s };
    }

    case "bid": {
      if (!state.auctionState?.open) return { state };
      const bidderId = (payload?.bidderId as string) ?? player.id;
      const existingBids = state.auctionState.bids.filter(b => b.playerId !== bidderId);
      let s: GameState = {
        ...state,
        auctionState: {
          ...state.auctionState,
          bids: [...existingBids, { playerId: bidderId, amount: payload?.amount as number }],
        },
      };
      const eligibleCount = state.players.filter(p => !p.hasHouse).length;
      if (s.auctionState!.bids.length >= eligibleCount) {
        s = resolveHouseAuction(s).state;
      } else {
        return { state: s, sideEffect: { type: "show-pass-device" } };
      }
      return { state: s };
    }

    case "rebalance": {
      const { newCash, newBonds, newStocks, penalty = 0 } = payload as any;
      const result = applyYearEndRebalance(state, playerIdx, newCash, newBonds, newStocks, penalty);
      if (!result.valid) return { state, sideEffect: { type: "error", message: result.error! } };
      
      const isInitialSetup = state.year === 1 && state.phase === "year-end" && state.turn < state.players.length;
      if (isInitialSetup) {
        return { state: advanceTurn(result.state) };
      }
      
      return { state: { ...result.state, phase: "action" } };
    }

    case "trade-offer": {
      const offer = payload?.offer as any;
      const request = payload?.request as any;

      const hasCashSwap = (offer?.cash || 0) > 0 && (request?.cash || 0) > 0;
      const hasBondSwap = (offer?.bonds || 0) > 0 && (request?.bonds || 0) > 0;
      const hasStockSwap = (offer?.stocks || 0) > 0 && (request?.stocks || 0) > 0;

      if (hasCashSwap || hasBondSwap || hasStockSwap) {
        let sameAssets: string[] = [];
        if (hasCashSwap) sameAssets.push("Cash");
        if (hasBondSwap) sameAssets.push("Bonds");
        if (hasStockSwap) sameAssets.push("Stocks");
        return {
          state,
          sideEffect: {
            type: "error",
            message: `Invalid Trade: You cannot trade same asset types (${sameAssets.join(", ")}). Trade must happen in different types of assets.`
          }
        };
      }

      const s: GameState = {
        ...state,
        phase: "waiting-trade",
        pendingTrade: {
          fromPlayerId: player.id,
          toPlayerId: payload?.toPlayerId as string,
          offer: offer as any,
          request: request as any,
        },
      };
      return { state: s, sideEffect: { type: "show-pass-device" } };
    }

    case "trade-response":
      return { state: resolveTrade(state, payload?.accept as boolean) };

    case "end-turn":
      return { state: advanceTurn(state) };

    case "audit": {
      const targetIdx = toInt(payload?.targetIdx);
      const result = processConcentrationAudit(state, playerIdx, targetIdx);
      if (!result.valid) return { state, sideEffect: { type: "error", message: result.error! } };
      if (result.needsRebalance) {
        return {
          state: result.state,
          sideEffect: { type: "needs-rebalance", penalty: 5 + (state.phase !== "year-end" ? 3 : 0) },
        };
      }
      return { state: result.state };
    }

    default:
      return { state };
  }
}

// ─── Timeout Resolution ───────────────────────────────────────────────────────

/**
 * Context from the UI layer needed to resolve a timeout.
 * The dispatcher is pure — it cannot read React state — so the page passes
 * whatever modal/auction context is currently active.
 */
export interface TimeoutContext {
  activeModal?: "emergency" | "ipo" | "lottery" | null;
  activeTargetedAction?: "tax-raid" | "hostile-takeover" | "audit" | null;
  auctionOpen?: boolean;
  pendingEmergencyAmount?: number | null;
  bidderId?: string;
}

/**
 * Determines the correct action + payload to auto-dispatch when the turn
 * timer expires.  Returns `null` when the timeout cannot be resolved
 * automatically (e.g. year-end rebalance with a penalty).
 */
export function resolveTimeout(
  state: GameState,
  ctx: TimeoutContext
): { action: string; payload?: Record<string, unknown> } | null {
  // 1. A modal is open — resolve it directly
  if (ctx.activeModal === "emergency") {
    return { action: "tile-action", payload: { amount: ctx.pendingEmergencyAmount ?? 3 } };
  }
  if (ctx.activeModal === "ipo") {
    return { action: "tile-action", payload: { amount: 0 } };
  }
  if (ctx.activeModal === "lottery") {
    return { action: "tile-action", payload: { play: false } };
  }

  // 2. A targeted-action modal is open — skip it
  if (ctx.activeTargetedAction === "tax-raid" || ctx.activeTargetedAction === "hostile-takeover") {
    return { action: "tile-action", payload: { skip: true } };
  }

  // 3. Auction phase — submit a zero bid
  if (ctx.auctionOpen && state.phase === "auction") {
    return { action: "bid", payload: { amount: 0, bidderId: ctx.bidderId } };
  }

  // 4. Action phase — player hasn't opened any modal, resolve the tile directly
  if (state.phase === "action") {
    const player = state.players[state.currentPlayerIndex];
    const tile = getTileByPosition(player.position);
    if (tile.effect === "emergency") {
      return { action: "tile-action", payload: { amount: ctx.pendingEmergencyAmount ?? 3 } };
    }
    if (tile.effect === "ipo") {
      return { action: "tile-action", payload: { amount: 0 } };
    }
    if (tile.effect === "lottery") {
      return { action: "tile-action", payload: { play: false } };
    }
    if (tile.effect === "tax-raid" || tile.effect === "hostile-takeover") {
      return { action: "tile-action", payload: { skip: true } };
    }
    // All other tiles (bonus, crash, rally, etc.) — just execute
    return { action: "tile-action" };
  }

  // 5. Year-end — the RebalanceModal handles its own auto-submit
  if (state.phase === "year-end") {
    return null;
  }

  // 6. Default — end turn
  return { action: "end-turn" };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Apply win-condition check and return updated state with endgame flag if triggered. */
export function applyWinCheck(state: GameState): GameState {
  const win = checkWinCondition(state);
  if (win.triggered && !state.endgame) {
    const msg = "🚨 FINAL ROUND! A player has reached 100L. Everyone gets one last turn!";
    
    console.log(JSON.stringify({
      event: "ENDGAME_STATE",
      endgame: true,
      phase: state.phase,
      currentPlayerIndex: state.currentPlayerIndex,
      turn: state.turn,
      year: state.year
    }, null, 2));

    return addLog({ ...state, endgame: true, announcement: msg }, msg);
  }
  return state;
}

function toInt(val: unknown): number {
  return typeof val === "string" ? parseInt(val, 10) : (val as number);
}

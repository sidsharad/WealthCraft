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
import { trimGameState } from "./utils";

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
  const result = internalDispatch(state, action, payload);
  if (result.state) {
    result.state = trimGameState(result.state);
  }
  return result;
}

function internalDispatch(
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
      const effect = getTileByPosition(player.position).effect;

      // Tiles that need a modal first — signal the page if payload is absent
      if (!payload) {
        if (effect === "ipo") return { state, sideEffect: { type: "show-modal", modal: "ipo" } };
        if (effect === "emergency") {
          const rand = Math.random();
          const emergencyAmount = rand < 0.5 ? 5 : 10;
          return { state, sideEffect: { type: "show-modal", modal: "emergency", emergencyAmount } };
        }
        if (effect === "lottery" && !payload) return { state, sideEffect: { type: "show-modal", modal: "lottery" } };
        if (effect === "tax-raid" && !payload) return { state, sideEffect: { type: "show-modal", modal: "tax-raid" } };
        if (effect === "hostile-takeover" && !payload) return { state, sideEffect: { type: "show-modal", modal: "hostile-takeover" } };
      }

      let s = state;

      switch (effect) {
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
            const emergencyAmount = rand < 0.5 ? 5 : 10;
            return { state, sideEffect: { type: "show-modal", modal: "emergency", emergencyAmount } };
          }
          
          if (player.cash < amount) {
            // If they can't afford it, give them one trade attempt before forcing a rebalance
            const eventId = `EMC_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            
            s = {
              ...s,
              emergencyState: {
                eventId,
                playerId: player.id,
                amount,
                tradeAttempted: false,
                status: "awaiting-decision"
              }
            };
            
            return { state: s, sideEffect: { type: "show-modal", modal: "emergency-decision" } as any };
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
            const assetType = payload?.asset || payload?.demandType;
            if (assetType !== "cash" && assetType !== "bonds" && assetType !== "stocks") {
              return { state, sideEffect: { type: "error", message: `Invalid asset type requested for takeover: ${assetType}` } };
            }
            const result = applyHostileTakeover(s, playerIdx, targetIdx, assetType as "cash" | "bonds" | "stocks");
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
      
      let s = result.state;
      if (s.emergencyState && s.emergencyState.playerId === player.id) {
         const amount = s.emergencyState.amount;
         const p = s.players[playerIdx];
         
         if (p.cash >= amount) {
           // Full emergency payment
           s = applyEmergency(s, playerIdx, amount);
         } else {
           // Player exhausted all legal liquidation options
           // Server-side defensive check
           const blocks = Math.floor(p.bonds / 5) + Math.floor(p.stocks / 5);
           if (blocks > 0) {
             return { state, sideEffect: { type: "error", message: "Invalid rebalance: You must liquidate all possible 5L blocks to cover the emergency." } };
           }
           
           s.players[playerIdx].cash = 0;
           s = addLog(s, `${player.name} could not fully pay the emergency and lost all remaining cash.`);
         }
         
         // Fully clear emergency state
         s.emergencyState = undefined;
         
         // The emergency tile is fully resolved, advance to trade
         return { state: { ...s, phase: "trade" } };
      }

      const isInitialSetup = s.year === 1 && s.phase === "year-end" && s.turn < s.players.length;
      if (isInitialSetup) {
        return { state: advanceTurn(s) };
      }
      
      return { state: { ...s, phase: "action" } };
    }

    case "acknowledge-endgame-trigger": {
      return { state: { ...state, endgameTriggerAcknowledged: true } };
    }

    case "acknowledge-endgame-cancellation": {
      return { state: { ...state, endgameCancelledAcknowledged: true } };
    }

    case "emergency-decision": {
      const decision = payload?.decision; // "trade" or "rebalance"
      if (!state.emergencyState || state.emergencyState.playerId !== player.id) return { state };
      
      if (decision === "rebalance") {
        let s = { ...state };
        s.emergencyState = {
          ...s.emergencyState!,
          status: "rebalance-required",
          resolution: "Mandatory Rebalance"
        };
        // Rebalance penalty is fixed at 3 for forced emergency rebalance
        return { state: s, sideEffect: { type: "needs-rebalance", penalty: 3 } };
      } else if (decision === "trade") {
        // Just unlock the trade modal and mark attempted
        let s = { ...state };
        s.emergencyState = {
          ...s.emergencyState!,
          tradeAttempted: true,
          status: "awaiting-trade-response"
        };
        return { state: s, sideEffect: { type: "show-trade" } as any };
      }
      return { state };
    }

    case "trade-offer": {
      if (state.emergencyState && state.emergencyState.playerId === player.id) {
        if (state.emergencyState.status !== "awaiting-trade-response") {
          return { state, sideEffect: { type: "error", message: "Trade already attempted or not allowed for this emergency." } };
        }
      }

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

      if (payload?.toPlayerId === player.id) {
        return {
          state,
          sideEffect: {
            type: "error",
            message: "Invalid Trade: You cannot trade with yourself."
          }
        };
      }

      console.log(JSON.stringify({
        event: "TRADE_CREATED",
        fromPlayerId: player.id,
        toPlayerId: payload?.toPlayerId as string,
        proposerName: player.name,
        receiverName: state.players.find(p => p.id === payload?.toPlayerId)?.name
      }));

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

    case "trade-response": {
      let s = resolveTrade(state, payload?.accept as boolean);
      
      // Intercept if there's an active emergency
      if (s.emergencyState && state.pendingTrade && s.emergencyState.playerId === state.pendingTrade.fromPlayerId) {
        if (!payload?.accept) {
           s.emergencyState = {
             ...s.emergencyState!,
             status: "rebalance-required",
             resolution: "Mandatory Rebalance"
           };
        } else {
           // Trade accepted, check cash
           const proposerIdx = s.players.findIndex(p => p.id === s.emergencyState!.playerId);
           const proposer = s.players[proposerIdx];
           if (proposer.cash >= s.emergencyState.amount) {
              s = applyEmergency(s, proposerIdx, s.emergencyState.amount);
              s.emergencyState = undefined;
           } else {
              s.emergencyState = {
                ...s.emergencyState!,
                status: "rebalance-required",
                resolution: "Mandatory Rebalance"
              };
           }
        }
      }
      return { state: s, sideEffect: { type: "show-pass-device" } };
    }

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
  activeModal?: "emergency" | "ipo" | "lottery" | "emergency-decision" | null;
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
  if (ctx.activeModal === "emergency-decision") {
    return { action: "emergency-decision", payload: { decision: "rebalance" } };
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

/** Apply win-condition check is now handled exclusively inside advanceTurn to follow Endgame Candidate rules. */
export function applyWinCheck(state: GameState): GameState {
  return state;
}

function toInt(val: unknown): number {
  return typeof val === "string" ? parseInt(val, 10) : (val as number);
}

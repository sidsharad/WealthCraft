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
  validateTradeOffer,
  checkAndResolveExpiredTrades,
  handleOpenTradeResponse,
  executeTradeTransfer,
  processOpenTradeResolution
} from "./actions";
import { getTileByPosition } from "./tiles";
import { trimGameState } from "./utils";
import { notifyBotsOfEvent } from "./bot-engine";

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
  // Always check for expired open trades before processing any action
  state = checkAndResolveExpiredTrades(state);

  // ----- Server-authoritative 30‑second turn timeout -----
  // If a human player's turn has exceeded 30 s, automatically end the turn.
  // This runs on every dispatch, ensuring that even if the serverless instance
  // recycles the in‑memory timer, the persisted `turnStartTimestamp` is the source
  // of truth. Bots are unaffected because they typically act instantly; the
  // timeout check applies universally but only triggers when the timestamp is
  // present and the elapsed time is >= 30 000 ms.
  if (state.turnStartTimestamp && Date.now() - state.turnStartTimestamp >= 30000) {
    // Advance the turn using the existing logic (same as manual end-turn).
    const timeoutState = advanceTurn(state);
    return { state: timeoutState };
  }

  // Pause turn flow while a trade is pending
  if (state.phase === "waiting-trade" && !["trade-response", "open-trade-select", "acknowledge-endgame-trigger", "acknowledge-endgame-cancellation"].includes(action)) {
    return { state, sideEffect: { type: "error", message: "Cannot perform action while a trade is pending." } };
  }

  const playerIdx = state.currentPlayerIndex;
  const player = state.players[playerIdx];

  if (player.isBot) {
      console.log({
          TRACE: "BOT_DISPATCH",
          playerId: player.id,
          botType: player.botType,
          phase: state.phase,
          turn: state.turn,
          gameVersion: state.version
      });
  }

  switch (action) {
    case "roll": {
      const diceValue = (payload?.dice as number) ?? rollDice();
      const result = processDiceRoll(state, playerIdx, diceValue);
      let s = result.state;

      const tile = getTileByPosition(result.newPosition);
      const preIncomeS = s;
      s = tile.effect === "income-freeze"
        ? applyIncomeFreezeToPlayer(s, playerIdx)
        : collectIncome(s, playerIdx);
      if (tile.effect === "income-freeze") {
        s = notifyBotsOfEvent(preIncomeS, s, { type: "INCOME_FREEZE", playerId: player.id });
      } else {
        const postIncomePlayer = s.players[playerIdx];
        const incomeDiff = postIncomePlayer.cash - preIncomeS.players[playerIdx].cash;
        if (incomeDiff > 0) {
            s = notifyBotsOfEvent(preIncomeS, s, { type: "INCOME", playerId: player.id, amount: incomeDiff });
        }
      }

      if (result.passedStart) {
        const preYearEndS = s;
        s = calculateYearEndReturns(s, playerIdx);
        
        const prePlayer = preYearEndS.players[playerIdx];
        const postPlayer = s.players[playerIdx];
        const bondReturn = postPlayer.bonds - prePlayer.bonds;
        const stockReturn = postPlayer.stocks - prePlayer.stocks;
        s = notifyBotsOfEvent(preYearEndS, s, { type: "YEAR_END_RETURN", playerId: player.id, bondReturn, stockReturn });
        
        // If a mandatory house purchase happened during year-end returns, notify bots
        if (postPlayer.hasHouse && !prePlayer.hasHouse) {
            const cost = prePlayer.cash - postPlayer.cash;
            if (cost > 0) s = notifyBotsOfEvent(preYearEndS, s, { type: "HOUSE_PURCHASE", playerId: player.id, amount: cost });
        }
        
        s = { ...s, phase: "year-end" };
      } else {
        s = { ...s, phase: "action" };
      }
      return { state: s, dice: result.dice };
    }

    case "lottery-resolve": {
      const diceVal = (payload?.dice as number) ?? (Math.floor(Math.random() * 6) + 1);
      const preLotteryS = state;
      let s = applyLotteryReward(state, playerIdx, diceVal);
      const rewardDiff = s.players[playerIdx].cash - preLotteryS.players[playerIdx].cash;
      s = notifyBotsOfEvent(preLotteryS, s, { type: "LOTTERY", playerId: player.id, amount: rewardDiff });
      s = { ...s, phase: "trade" };
      return { state: s };
    }

    case "tile-action": {
      const effect = getTileByPosition(player.position).effect;

      // Tiles that need a modal first — signal the page if payload is absent
      if (!payload && !player.isBot) {
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
        case "bonus": { const pre = s; s = applyBonus(s, playerIdx); s = notifyBotsOfEvent(pre, s, { type: "BONUS", playerId: player.id, amount: s.players[playerIdx].cash - pre.players[playerIdx].cash }); break; }
        case "stock-rally": { const pre = s; s = applyStockRally(s, playerIdx); s = notifyBotsOfEvent(pre, s, { type: "STOCK_RALLY", playerId: player.id, gain: s.players[playerIdx].stocks - pre.players[playerIdx].stocks }); break; }
        case "stock-crash": { const pre = s; s = applyStockCrash(s, playerIdx); s = notifyBotsOfEvent(pre, s, { type: "STOCK_CRASH", playerId: player.id, loss: pre.players[playerIdx].stocks - s.players[playerIdx].stocks }); break; }
        case "market-crash": { 
          const preMarketS = s;
          s = applyMarketCrash(s, playerIdx); 
          for (let i = 0; i < s.players.length; i++) {
            const p = s.players[i];
            const prePlayer = preMarketS.players[i];
            s = notifyBotsOfEvent(preMarketS, s, { 
               type: "MARKET_CRASH", 
               playerId: p.id, 
               loss: prePlayer.stocks - p.stocks,
               cashLoss: prePlayer.cash - p.cash,
               bondLoss: prePlayer.bonds - p.bonds,
               stockLoss: prePlayer.stocks - p.stocks
            });
          }
          break; 
        }
        case "market-rally": { 
          const preMarketS = s;
          s = applyMarketRally(s, playerIdx); 
          for (let i = 0; i < s.players.length; i++) {
            const p = s.players[i];
            const prePlayer = preMarketS.players[i];
            s = notifyBotsOfEvent(preMarketS, s, { 
               type: "MARKET_RALLY", 
               playerId: p.id, 
               gain: p.stocks - prePlayer.stocks,
               cashGain: p.cash - prePlayer.cash,
               bondGain: p.bonds - prePlayer.bonds,
               stockGain: p.stocks - prePlayer.stocks
            });
          }
          break; 
        }

        case "ipo": {
          const amount = payload?.amount as number ?? 0;
          if (player.cash < amount) {
            if (player.isBot) return { state };
            return { state, sideEffect: { type: "needs-rebalance", penalty: 3 } };
          }
          const pre = s; s = applyIPO(s, playerIdx, amount); s = notifyBotsOfEvent(pre, s, { type: "IPO", playerId: player.id, amount });
          break;
        }
        case "emergency": {
          let amount = payload?.amount as number;
          if (!amount) {
            if (player.isBot) {
              const rand = Math.random();
              amount = rand < 0.5 ? 5 : 10;
            } else {
              // payload exists but no amount — treat as cancel, re-show modal with same pre-rolled amount
              const stored = payload?.storedAmount as number;
              if (stored) {
                return { state, sideEffect: { type: "show-modal", modal: "emergency", emergencyAmount: stored } };
              }
              const rand = Math.random();
              const emergencyAmount = rand < 0.5 ? 5 : 10;
              return { state, sideEffect: { type: "show-modal", modal: "emergency", emergencyAmount } };
            }
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
            
            if (player.isBot) return { state: s };
            return { state: s, sideEffect: { type: "show-modal", modal: "emergency-decision" } as any };
          }
          
          const pre = s; s = applyEmergency(s, playerIdx, amount); s = notifyBotsOfEvent(pre, s, { type: "EMERGENCY", playerId: player.id, amount });
          s.emergencyState = undefined;
          break;
        }
        case "lottery": {
          if (payload?.play) {
            const pre = s;
            s = deductLotteryFee(s, playerIdx);
            const fee = pre.players[playerIdx].cash - s.players[playerIdx].cash;
            if (fee > 0) s = notifyBotsOfEvent(pre, s, { type: "LOTTERY_PURCHASE", playerId: player.id, amount: fee });
            if (player.isBot) {
              return internalDispatch(s, "lottery-resolve");
            }
            return { state: s, sideEffect: { type: "start-lottery-roll" } };
          }
          return { state: advanceTurn(s) };
        }  break;
        case "tax-raid": {
          if (payload?.skip) {
            s = addLog(s, `${player.name} chose to skip Tax Raid.`);
            break;
          }
          const targetIdx = toInt(payload?.targetIdx);
          const pre = s; 
          const result = applyTaxRaid(s, playerIdx, targetIdx);
          if (!result.valid) {
            if (player.isBot) {
              s = addLog(s, `[BOT ERROR] ${player.name} attempted invalid Tax Raid. Skipped.`);
              return { state: { ...s, phase: "trade" } };
            }
            return { state, sideEffect: { type: "error", message: result.error! } };
          }
          s = result.state;
          const targetPlayer = s.players[targetIdx];
          const attackerDiff = s.players[playerIdx].cash - pre.players[playerIdx].cash;
          const targetDiff = s.players[targetIdx].cash - pre.players[targetIdx].cash;
          s = notifyBotsOfEvent(pre, s, { type: "TAX_RAID", attackerId: player.id, targetId: targetPlayer.id, attackerDiff, targetDiff });
          break;
        }
        case "hostile-takeover": {
          if (payload?.skip) {
            s = addLog(s, `${player.name} chose to take no action.`);
          } else {
            const targetIdx = toInt(payload?.targetIdx);
            const assetType = payload?.asset || payload?.demandType;
            if (assetType !== "cash" && assetType !== "bonds" && assetType !== "stocks") {
              if (player.isBot) {
                s = addLog(s, `[BOT ERROR] ${player.name} requested invalid asset type. Skipped.`);
                return { state: { ...s, phase: "trade" } };
              }
              return { state, sideEffect: { type: "error", message: `Invalid asset type requested for takeover: ${assetType}` } };
            }
            const pre = s; const result = applyHostileTakeover(s, playerIdx, targetIdx, assetType as "cash" | "bonds" | "stocks");
            if (!result.valid) {
              if (player.isBot) {
                s = addLog(s, `[BOT ERROR] ${player.name} attempted invalid Hostile Takeover. Skipped.`);
                return { state: { ...s, phase: "trade" } };
              }
              return { state, sideEffect: { type: "error", message: result.error! } };
            }
            s = result.state;
            const targetPlayer = pre.players[targetIdx];
            const assetKey = assetType as "cash" | "bonds" | "stocks";
            const actualStolen = Math.min(targetPlayer[assetKey], 5);
            s = notifyBotsOfEvent(pre, s, {
              type: "HOSTILE_TAKEOVER",
              attackerId: player.id,
              targetId: targetPlayer.id,
              assetType: assetKey,
              cost: 0,
              amount: actualStolen
            });
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
        const pre = s;
        const res = resolveHouseAuction(s);
        s = res.state;
        if (res.winnerId && res.winnerBid) {
            s = notifyBotsOfEvent(pre, s, { type: "HOUSE_AUCTION_WIN", playerId: res.winnerId, amount: res.winnerBid });
        }
      } else {
        return { state: s, sideEffect: { type: "show-pass-device" } };
      }
      return { state: s };
    }

    case "rebalance": {
      const { newCash, newBonds, newStocks, penalty = 0 } = payload as any;
      const pre = state;
      const result = applyYearEndRebalance(state, playerIdx, newCash, newBonds, newStocks, penalty);
      if (!result.valid) return { state, sideEffect: { type: "error", message: result.error! } };
      
      let s = result.state;
      const cashDiff = s.players[playerIdx].cash - pre.players[playerIdx].cash;
      const bondDiff = s.players[playerIdx].bonds - pre.players[playerIdx].bonds;
      const stockDiff = s.players[playerIdx].stocks - pre.players[playerIdx].stocks;
      s = notifyBotsOfEvent(pre, s, { type: "PUBLIC_REBALANCE", playerId: player.id, cashDiff, bondDiff, stockDiff });
      s = notifyBotsOfEvent(pre, s, { type: "REBALANCE_COMPLETED", playerId: player.id });
      if (s.emergencyState && s.emergencyState.playerId === player.id) {
         const amount = s.emergencyState.amount;
         const p = s.players[playerIdx];
         
         if (p.cash >= amount) {
           // Full emergency payment
           const pre = s; s = applyEmergency(s, playerIdx, amount); s = notifyBotsOfEvent(pre, s, { type: "EMERGENCY", playerId: player.id, amount: pre.players[playerIdx].cash - s.players[playerIdx].cash });
         } else {
           // Player exhausted all legal liquidation options
           // Server-side defensive check
           const blocks = Math.floor(p.bonds / 5) + Math.floor(p.stocks / 5);
           if (blocks > 0) {
             return { state, sideEffect: { type: "error", message: "Invalid rebalance: You must liquidate all possible 5L blocks to cover the emergency." } };
           }
           
           const lostCash = p.cash;
           s.players[playerIdx].cash = 0;
           s = notifyBotsOfEvent(pre, s, { type: "EMERGENCY", playerId: player.id, amount: lostCash });
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
      
      if (s.phase === "action" || s.phase === "year-end") {
        return { state: { ...s, phase: "action" } };
      }
      return { state: s };
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
        if (player.isBot) return { state: s };
        return { state: s, sideEffect: { type: "needs-rebalance", penalty: 3 } };
      } else if (decision === "trade") {
        // Just unlock the trade modal and mark attempted
        let s = { ...state };
        s.emergencyState = {
          ...s.emergencyState!,
          tradeAttempted: true,
          status: "awaiting-trade-response"
        };
        if (player.isBot) return { state: s };
        return { state: s, sideEffect: { type: "show-trade" } as any };
      }
      return { state };
    }

    case "trade-offer": {
      if (state.pendingTrade) {
        return { state, sideEffect: { type: "error", message: "A trade is already pending." } };
      }

      if (state.emergencyState && state.emergencyState.playerId === player.id) {
        if (state.emergencyState.status !== "awaiting-trade-response") {
          return { state, sideEffect: { type: "error", message: "Trade already attempted or not allowed for this emergency." } };
        }
      }

      const offer = payload?.offer as any;
      const request = payload?.request as any;
      const tradeType = (payload?.tradeType as "direct" | "open") || "direct";

      const validation = validateTradeOffer(player, offer, request);
      if (!validation.valid) {
        return { state, sideEffect: { type: "error", message: `Invalid Trade: ${validation.error}` } };
      }

      if (tradeType === "direct" && payload?.toPlayerId === player.id) {
        return {
          state,
          sideEffect: {
            type: "error",
            message: "Invalid Trade: You cannot trade with yourself."
          }
        };
      }

      let eligiblePlayerIds: string[] | undefined;
      if (tradeType === "open") {
        eligiblePlayerIds = state.players
          .filter(p => p.id !== player.id && p.cash >= request.cash && p.bonds >= request.bonds && p.stocks >= request.stocks)
          .map(p => p.id);
        
        console.log(JSON.stringify({
          event: "OPEN_TRADE_CREATED",
          fromPlayerId: player.id,
          proposerName: player.name,
          eligibleCount: eligiblePlayerIds.length
        }));
      } else {
        console.log(JSON.stringify({
          event: "TRADE_CREATED",
          fromPlayerId: player.id,
          toPlayerId: payload?.toPlayerId as string,
          proposerName: player.name,
          receiverName: state.players.find(p => p.id === payload?.toPlayerId)?.name
        }));
      }

      const s: GameState = {
        ...state,
        phase: "waiting-trade",
        pendingTrade: {
          fromPlayerId: player.id,
          toPlayerId: tradeType === "direct" ? (payload?.toPlayerId as string) : undefined,
          offer: offer as any,
          request: request as any,
          tradeType,
          status: tradeType === "open" ? "pending" : undefined,
          responses: tradeType === "open" ? [] : undefined,
          createdAt: tradeType === "open" ? Date.now() : undefined,
          expiresAt: tradeType === "open" ? Date.now() + 15000 : undefined,
          eligiblePlayerIds,
        },
      };
      return { state: s, sideEffect: { type: "show-pass-device" } };
    }

    case "trade-response": {
      const isAccept = payload?.accept as boolean;
      const responderId = payload?.responderId as string || state.pendingTrade?.toPlayerId;
      
      let s = state;

      if (state.pendingTrade?.tradeType === "open") {
        s = handleOpenTradeResponse(s, responderId!, isAccept);
      } else {
        s = resolveTrade(state, isAccept);
      }
      
      if (isAccept) {
        const proposerId = state.pendingTrade?.fromPlayerId;
        for (const p of s.players) {
          const prePlayer = state.players.find(x => x.id === p.id);
          if (prePlayer && (prePlayer.cash !== p.cash || prePlayer.bonds !== p.bonds || prePlayer.stocks !== p.stocks)) {
            const isProposer = p.id === proposerId;
            const isResponder = p.id === responderId;
            const cashDiff = p.cash - prePlayer.cash;
            const bondDiff = p.bonds - prePlayer.bonds;
            const stockDiff = p.stocks - prePlayer.stocks;
            s = notifyBotsOfEvent(state, s, {
               type: "PUBLIC_TRADE",
               playerId: p.id,
               cashDiff,
               bondDiff,
               stockDiff,
               proposerId: proposerId,
               responderId: responderId,
               proposerDiff: isProposer ? { cash: cashDiff, bonds: bondDiff, stocks: stockDiff } : undefined,
               responderDiff: isResponder ? { cash: cashDiff, bonds: bondDiff, stocks: stockDiff } : undefined
            });
          }
        }
      }
      
      // Intercept if there's an active emergency and the trade resolved
      if (s.emergencyState && state.pendingTrade && s.emergencyState.playerId === state.pendingTrade.fromPlayerId && !s.pendingTrade) {
        if (!isAccept && state.pendingTrade.tradeType === "direct") {
           // For open trades, the final resolution handles the trade state.
           s.emergencyState = {
             ...s.emergencyState!,
             status: "rebalance-required",
             resolution: "Mandatory Rebalance"
           };
           s.phase = "action";
        } else {
           // If it was accepted or an open trade completed, check cash
           const proposer = s.players.find(p => p.id === s.emergencyState!.playerId)!;
           const proposerIdx = s.players.findIndex(p => p.id === s.emergencyState!.playerId);
           
           if (proposer.cash >= s.emergencyState.amount) {
              const preEmergencyS = s;
              s = applyEmergency(s, proposerIdx, s.emergencyState.amount);
              s = notifyBotsOfEvent(preEmergencyS, s, { type: "EMERGENCY", playerId: proposer.id, amount: preEmergencyS.emergencyState!.amount });
              s.emergencyState = undefined;
           } else {
              s.emergencyState = {
                ...s.emergencyState!,
                status: "rebalance-required",
                resolution: "Mandatory Rebalance"
              };
              s.phase = "action";
           }
        }
      }
      return { state: s, sideEffect: { type: "show-pass-device" } };
    }

    case "open-trade-select": {
      const winnerId = payload?.winnerId as string;
      if (!state.pendingTrade || state.pendingTrade.tradeType !== "open" || state.pendingTrade.status !== "selection_required") return { state };
      
      // Revalidate the selected winner
      const winner = state.players.find(p => p.id === winnerId);
      if (!winner || winner.cash < state.pendingTrade.request.cash || winner.bonds < state.pendingTrade.request.bonds || winner.stocks < state.pendingTrade.request.stocks) {
        // Invalid winner! Force their response to false and re-evaluate
        let s = {
          ...state,
          pendingTrade: {
            ...state.pendingTrade,
            responses: state.pendingTrade.responses?.map(r => 
              r.playerId === winnerId ? { ...r, accept: false } : r
            )
          }
        };
        return { state: processOpenTradeResolution(s), sideEffect: { type: "error", message: "That player no longer has the required assets. Selection re-evaluated." } };
      }
      
      console.log(JSON.stringify({ event: "OPEN_TRADE_COMPLETED", fromPlayerId: state.pendingTrade.fromPlayerId, toPlayerId: winnerId, type: "manual_selection" }));
      
      const s = executeTradeTransfer(state, state.pendingTrade.fromPlayerId, winnerId, state.pendingTrade.offer, state.pendingTrade.request);
      return { state: s };
    }

    case "end-turn": {
      const pre = state;
      let s = advanceTurn(state);
      const prePlayer = pre.players[playerIdx];
      const nextPlayer = s.players[playerIdx];
      if (nextPlayer.hasHouse && !prePlayer.hasHouse) {
          const cost = prePlayer.cash - nextPlayer.cash;
          if (cost > 0) s = notifyBotsOfEvent(pre, s, { type: "HOUSE_PURCHASE", playerId: player.id, amount: cost });
      }
      return { state: s };
    }

    case "audit": {
      const targetIdx = toInt(payload?.targetIdx);
      const result = processConcentrationAudit(state, playerIdx, targetIdx);
      if (!result.valid) {
        if (player.isBot) {
          let s = addLog(state, `[BOT ERROR] ${player.name} attempted invalid Audit. Skipped.`);
          return { state: { ...s, phase: "trade" } };
        }
        return { state, sideEffect: { type: "error", message: result.error! } };
      }
      
      let s = result.state;
      const targetPlayer = state.players[targetIdx];
      if (result.auditSuccess) {
        // Find which assets were confiscated to emit the right events (simplification: emit one event for the largest confiscation, or just cash if we don't track all. Actually, let's emit SUCCESSFUL_AUDIT for all non-zero confiscated assets)
        if (result.confiscated) {
          if (result.confiscated.cash > 0) s = notifyBotsOfEvent(state, s, { type: "SUCCESSFUL_AUDIT", targetId: s.players[targetIdx].id, auditorId: player.id, assetConfiscated: "cash", amount: result.confiscated.cash });
          if (result.confiscated.bonds > 0) s = notifyBotsOfEvent(state, s, { type: "SUCCESSFUL_AUDIT", targetId: s.players[targetIdx].id, auditorId: player.id, assetConfiscated: "bonds", amount: result.confiscated.bonds });
          if (result.confiscated.stocks > 0) s = notifyBotsOfEvent(state, s, { type: "SUCCESSFUL_AUDIT", targetId: s.players[targetIdx].id, auditorId: player.id, assetConfiscated: "stocks", amount: result.confiscated.stocks });
        }
      } else if (result.auditFailed) {
        const auditorDiff = s.players[playerIdx].cash - state.players[playerIdx].cash;
        s = notifyBotsOfEvent(state, s, { type: "FAILED_AUDIT", auditorId: player.id, targetId: targetPlayer.id, auditorDiff });
      }

      if (result.needsRebalance) {
        if (player.isBot) return { state: s };
        return {
          state: s,
          sideEffect: { type: "needs-rebalance", penalty: 5 + (state.phase !== "year-end" ? 3 : 0) },
        };
      }
      return { state: s };
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

  // 6. Trade phase — auto-reject AFK direct trades, or pause for open trades
  if (state.phase === "waiting-trade" && state.pendingTrade) {
    if (state.pendingTrade.tradeType === "direct") {
      return { action: "trade-response", payload: { accept: false, responderId: state.pendingTrade.toPlayerId } };
    }
    if (state.pendingTrade.tradeType === "open" && state.pendingTrade.status === "selection_required") {
      return null;
    }
  }

  // 7. Default — end turn
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

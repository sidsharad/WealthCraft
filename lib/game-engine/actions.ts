import type { GameState, PlayerState, LogEntry } from "../db/schema";
import {
  TILE_COUNT, INCOME_PER_TURN, WIN_CONDITION,
  BOND_RETURN_PER_5L, STOCK_RETURN_PER_5L,
  MARKET_CRASH_PER_5L, MARKET_RALLY_PER_5L,
  STOCK_CRASH_PER_5L, STOCK_RALLY_PER_5L,
  BONUS_AMOUNT,
  LOTTERY_COST, TAX_RAID_COST, TAX_RAID_PENALTY,
  HOUSE_MARKET_PRICE, HOUSE_AUCTION_MIN, HOUSE_MANDATORY_YEAR,
  IPO_MAX_INVEST,
  getAuditThreshold, ASSET_CONCENTRATION_LIMIT, FALSE_AUDIT_PENALTY,
  getTileByPosition,
} from "./tiles";
import { createInitialBotState } from "./bot";
/** Floor to nearest 5L block (for return calculations) */
function floorTo5L(amount: number): number {
  return Math.floor(amount / 5) * 5;
}

/** Number of complete 5L blocks */
export function countBlocks(amount: number): number {
  return Math.floor(amount / 5);
}

/** Calculate net worth for a player */
export function netWorth(player: PlayerState): number {
  return player.cash + player.bonds + player.stocks;
}

/** Get audit penalty tier for a player's net worth */
function getAuditPenalty(wealth: number): number {
  if (wealth >= 90) return 20;
  if (wealth >= 80) return 15;
  if (wealth >= 70) return 10;
  return 0;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

export function addLog(state: GameState, text: string): GameState {
  const entry: LogEntry = { turn: state.turn, text, timestamp: Date.now() };
  return { ...state, log: [...state.log, entry] };
}

function updatePlayer(state: GameState, idx: number, update: Partial<PlayerState>): GameState {
  const players = state.players.map((p, i) => {
    if (i === idx) {
      const newPlayer = { ...p, ...update };
      if (update.cash !== undefined) newPlayer.cash = clampValue(newPlayer.cash);
      if (update.bonds !== undefined) newPlayer.bonds = clampValue(newPlayer.bonds);
      if (update.stocks !== undefined) newPlayer.stocks = clampValue(newPlayer.stocks);
      return newPlayer;
    }
    return p;
  });
  return { ...state, players };
}

function clampValue(val: number): number {
  return Math.max(0, val);
}

// ─── INITIAL STATE ────────────────────────────────────────────────────────────

export function createInitialGameState(
  players: Array<{ id: string; name: string; avatar: string; isBot: boolean; botType?: "BULL" | "DISCIPLINED" | "AUDIT_HAWK" | "OPPORTUNIST" | "SAFETY_BUILDER" | "PROPERTY_BUILDER" }>
): GameState {
  return {
    version: 1,
    turn: 0,
    year: 1,
    currentPlayerIndex: 0,
    phase: "year-end",
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isBot: p.isBot,
      botType: p.botType,
      botState: p.isBot ? createInitialBotState(p.id, p.botType || "DISCIPLINED", players) : undefined,
      cash: 10,       // 10L starting cash
      bonds: 0,
      stocks: 0,
      hasHouse: false,
      jobLossActive: false,
      incomeFreezeActive: false,
      position: 0,    // Start tile (index 0)
      year: 1,
      turnsWithJobLoss: 0,
      hasTraded: false,
      wealthDeclared: false,
    })),
    log: [{ turn: 0, text: "Game started! Each player begins with 10L cash.", timestamp: Date.now() }],
  };
}

// ─── DICE ─────────────────────────────────────────────────────────────────────

export function rollDice(): number {
  return Math.floor(Math.random() * 6) + 1;
}

// ─── MOVEMENT ─────────────────────────────────────────────────────────────────

export interface MoveResult {
  state: GameState;
  newPosition: number;
  passedStart: boolean;
  dice: number;
}

export function processDiceRoll(
  state: GameState,
  playerIdx: number,
  dice: number
): MoveResult {
  const player = state.players[playerIdx];
  const steps = dice;
  const oldPosition = player.position;
  const newPosition = (oldPosition + steps) % TILE_COUNT;
  const passedStart = newPosition < oldPosition || steps >= TILE_COUNT;

  // If job loss active, check if rolled a 6
  let jobLossActive = player.jobLossActive;
  let turnsWithJobLoss = player.turnsWithJobLoss;
  let jobLossMessage = "";
  if (jobLossActive) {
    if (dice === 6) {
      jobLossActive = false;
      turnsWithJobLoss = 0;
      jobLossMessage = ` Job Loss ended (rolled a 6)!`;
    } else {
      turnsWithJobLoss = turnsWithJobLoss + 1;
    }
  }

  let s = updatePlayer(state, playerIdx, {
    position: newPosition,
    jobLossActive,
    turnsWithJobLoss,
    incomeFreezeActive: false, // reset each turn
  });

  const tile = getTileByPosition(newPosition);
  s = addLog(s, `${player.name} rolled ${steps} → landed on Tile ${tile.id}: ${tile.name}.${jobLossMessage}`);

  return { state: s, newPosition, passedStart, dice };
}

// ─── INCOME ──────────────────────────────────────────────────────────────────

export function collectIncome(state: GameState, playerIdx: number): GameState {
  const player = state.players[playerIdx];

  // Income Freeze: already handled by tile — skip
  if (player.incomeFreezeActive) {
    return addLog(state, `${player.name} collected no income (Income Freeze active).`);
  }
  // Job Loss: no income
  if (player.jobLossActive) {
    return addLog(state, `${player.name} collected no income (Job Loss active).`);
  }

  // Calculate salary (5L)
  let s = updatePlayer(state, playerIdx, { cash: player.cash + INCOME_PER_TURN });
  return addLog(s, `${player.name} collected ${INCOME_PER_TURN}L income.`);
}

// ─── TILE EFFECTS ─────────────────────────────────────────────────────────────

export function applyBonus(state: GameState, playerIdx: number): GameState {
  const player = state.players[playerIdx];
  const announcement = `🎁 BONUS!`;
  const privateMessage = `➕ Cash: ${BONUS_AMOUNT}L`;
  let s = updatePlayer(state, playerIdx, { cash: player.cash + BONUS_AMOUNT });
  s = addLog(s, `${player.name} received +${BONUS_AMOUNT}L cash bonus from bank.`);
  return { ...s, announcement, privateMessage };
}

export function applyStockRally(state: GameState, playerIdx: number): GameState {
  const player = state.players[playerIdx];
  const blocks = countBlocks(player.stocks);
  const gain = blocks * STOCK_RALLY_PER_5L;
  const announcement = `📈 STOCK RALLY!`;
  const privateMessage = `📈 STOCK RALLY!\n+${gain}L Stocks`;
  let s = updatePlayer(state, playerIdx, { stocks: player.stocks + gain });
  s = addLog(s, `📈 STOCK RALLY: ${player.name} received stocks from market rally.`);
  return { ...s, announcement, privateMessage };
}

export function applyStockCrash(state: GameState, playerIdx: number): GameState {
  const player = state.players[playerIdx];
  const blocks = countBlocks(player.stocks);
  const loss = blocks * STOCK_CRASH_PER_5L;
  const announcement = `📉 STOCK CRASH!`;
  const privateMessage = `📉 STOCK CRASH!\n-${loss}L Stocks`;
  const newStocks = Math.max(0, player.stocks - loss);
  let s = updatePlayer(state, playerIdx, { stocks: newStocks });
  s = addLog(s, `📉 STOCK CRASH: ${player.name}'s stocks were hit by a crash.`);
  return { ...s, announcement, privateMessage };
}

export function applyMarketCrash(state: GameState, playerIdx: number): GameState {
  let s = state;
  let messages: string[] = [];
  let currentPlayerLoss = 0;
  
  s.players.forEach((player, idx) => {
    const blocks = countBlocks(player.stocks);
    const loss = blocks * MARKET_CRASH_PER_5L;
    if (loss > 0) {
      s = updatePlayer(s, idx, { 
        stocks: Math.max(0, player.stocks - loss),
        privateMessage: `📉 MARKET CRASH!\nYour Impact: -${loss}L Stocks`
      });
      messages.push(`${player.name}`);
      if (idx === playerIdx) currentPlayerLoss = loss;
    } else {
      s = updatePlayer(s, idx, { privateMessage: `📉 MARKET CRASH!\nNo impact on your portfolio.` });
    }
  });

  const announcement = `📉 MARKET CRASH!`;
  s = addLog(s, `📉 MARKET CRASH! IMPACTED PLAYERS: ${messages.length > 0 ? messages.join(", ") : "none"}.`);
  const privateMessage = `📉 MARKET CRASH!\nYour Impact: -${currentPlayerLoss}L Stocks`;
  return { ...s, announcement, privateMessage };
}

export function applyMarketRally(state: GameState, playerIdx: number): GameState {
  let s = state;
  let messages: string[] = [];
  let currentPlayerGain = 0;

  s.players.forEach((player, idx) => {
    const blocks = countBlocks(player.stocks);
    const gain = blocks * MARKET_RALLY_PER_5L;
    if (gain > 0) {
      s = updatePlayer(s, idx, { 
        stocks: player.stocks + gain,
        privateMessage: `🚀 MARKET RALLY!\nYour Impact: +${gain}L Stocks`
      });
      messages.push(`${player.name}`);
      if (idx === playerIdx) currentPlayerGain = gain;
    } else {
      s = updatePlayer(s, idx, { privateMessage: `🚀 MARKET RALLY!\nNo impact on your portfolio.` });
    }
  });

  const announcement = `🚀 MARKET RALLY!`;
  s = addLog(s, `🚀 MARKET RALLY! IMPACTED PLAYERS: ${messages.length > 0 ? messages.join(", ") : "none"}.`);
  const privateMessage = `🚀 MARKET RALLY!\nYour Impact: +${currentPlayerGain}L Stocks`;
  return { ...s, announcement, privateMessage };
}

export function applyIPO(state: GameState, playerIdx: number, investAmount: number): GameState {
  const player = state.players[playerIdx];
  if (investAmount < 0 || investAmount > IPO_MAX_INVEST) {
    return addLog(state, `${player.name} IPO: invalid investment amount ${investAmount}L.`);
  }
  if (investAmount === 0) {
    return addLog(state, `${player.name} declined to invest in IPO.`);
  }
  if (player.cash < investAmount) {
    return addLog(state, `${player.name} IPO: insufficient cash to invest ${investAmount}L.`);
  }
  const stocksGained = investAmount * 2;
  const announcement = `🚀 IPO INVESTMENT`;
  const privateMessage = `➕ Stocks: ${stocksGained}L`;
  let s = updatePlayer(state, playerIdx, {
    cash: player.cash - investAmount,
    stocks: player.stocks + stocksGained,
  });
  s = addLog(s, `${player.name} invested ${investAmount}L in IPO → received ${stocksGained}L in stocks.`);
  s = { ...s, announcement, privateMessage };
  return s;
}

export function applyIncomeFreezeToPlayer(state: GameState, playerIdx: number): GameState {
  // Income freeze applies to THIS turn only — mark it, income collection skips
  let s = updatePlayer(state, playerIdx, { incomeFreezeActive: true });
  const player = state.players[playerIdx];
  return addLog(s, `${player.name} Income Freeze — no income this turn.`);
}

/** Returns emergency amount for this draw (random 3L or 5L) */
export function applyEmergency(state: GameState, playerIdx: number, amount: number): GameState {
  const player = state.players[playerIdx];
  const announcement = `🚨 EMERGENCY!`;
  const privateMessage = `🚨 EMERGENCY!\n➖ Cash: ${amount}L (Emergency Fee)`;
  let s = updatePlayer(state, playerIdx, { cash: player.cash - amount });
  s = addLog(s, `${player.name} paid an emergency fee to the bank.`);
  s = { ...s, announcement, privateMessage };
  return s;
}

/** Lottery Part 1: Deduct fee immediately */
export function deductLotteryFee(state: GameState, playerIdx: number): GameState {
  const player = state.players[playerIdx];
  let s = updatePlayer(state, playerIdx, { cash: player.cash - LOTTERY_COST });
  return addLog(s, `${player.name} paid ${LOTTERY_COST}L to enter the Lottery.`);
}

/** Pay 2L to roll: 1-2=No reward | 3-4=+2L cash | 5-6=+5L cash. */
export function applyLotteryReward(state: GameState, playerIdx: number, dieResult: number): GameState {
  const player = state.players[playerIdx];
  let reward = 0;
  if (dieResult <= 2) reward = 0;
  else if (dieResult <= 4) reward = 2;
  else reward = 5;

  const announcement = `🎰 LOTTERY RESULT`;
  const privateMessage = reward > 0 ? `➕ Cash: ${reward}L` : "No prize won.";
  
  let s = updatePlayer(state, playerIdx, { cash: player.cash + reward });
  s = addLog(s, `🎰 LOTTERY: ${player.name} rolled ${dieResult} → received ${reward}L.`);
  return { ...s, announcement, privateMessage };
}

/** Tax Raid (Government Raid): attacker pays 2L, target pays 5L to bank */
export function applyTaxRaid(
  state: GameState,
  attackerIdx: number,
  targetIdx: number
): { state: GameState; valid: boolean; error?: string } {
  const attacker = state.players[attackerIdx];
  const target = state.players[targetIdx];

  if (!target) {
    return { state, valid: false, error: "No target player selected." };
  }

  if (attacker.cash < TAX_RAID_COST) {
    return {
      state,
      valid: false,
      error: `${attacker.name} cannot afford Tax Raid (needs ${TAX_RAID_COST}L).`,
    };
  }

  let s = updatePlayer(state, attackerIdx, { cash: attacker.cash - TAX_RAID_COST });
  s = updatePlayer(s, targetIdx, { cash: target.cash - TAX_RAID_PENALTY });
  const announcement = `👮 TAX RAID!`;
  const privateMessage = `➖ Cash: ${TAX_RAID_COST}L (Cost)`;
  s = addLog(s, `${attacker.name} Tax Raid on ${target.name}: ${attacker.name} paid ${TAX_RAID_COST}L, ${target.name} paid ${TAX_RAID_PENALTY}L to bank.`);

  return { state: { ...s, announcement, privateMessage }, valid: true };
}

/** Hostile Takeover: attacker takes up to 5L in assets from target. No cash cost. */
export function applyHostileTakeover(
  state: GameState,
  attackerIdx: number,
  targetIdx: number,
  targetGiveType: "bonds" | "stocks" | "cash"
): { state: GameState; valid: boolean; error?: string } {
  const attacker = state.players[attackerIdx];
  const target = state.players[targetIdx];
  const TAKE_AMOUNT = 5;

  let actualTake = 0;
  if (targetGiveType === "cash") actualTake = Math.min(target.cash, TAKE_AMOUNT);
  else if (targetGiveType === "bonds") actualTake = Math.min(target.bonds, TAKE_AMOUNT);
  else actualTake = Math.min(target.stocks, TAKE_AMOUNT);

  // We allow the action to proceed even if actualTake is 0. 
  // This prevents the attacker from "probing" for zero assets without spending their action.
  
  let s = state;
  if (targetGiveType === "cash") {
    s = updatePlayer(s, targetIdx, { cash: target.cash - actualTake });
    s = updatePlayer(s, attackerIdx, { cash: attacker.cash + actualTake });
  } else if (targetGiveType === "bonds") {
    s = updatePlayer(s, targetIdx, { bonds: target.bonds - actualTake });
    s = updatePlayer(s, attackerIdx, { bonds: attacker.bonds + actualTake });
  } else {
    s = updatePlayer(s, targetIdx, { stocks: target.stocks - actualTake });
    s = updatePlayer(s, attackerIdx, { stocks: attacker.stocks + actualTake });
  }

  const announcement = `🤝 TAKEOVER!`;
  const privateMessage = actualTake > 0 
    ? `➕ ${targetGiveType.charAt(0).toUpperCase() + targetGiveType.slice(1)}: ${actualTake}L`
    : `No ${targetGiveType} was taken.`;

  s = addLog(s, `🤝 TAKEOVER: ${attacker.name} targeted ${target.name}'s ${targetGiveType}. ${actualTake > 0 ? `Took ${actualTake}L!` : "Target had none to take."}`);

  return { state: { ...s, announcement, privateMessage }, valid: true };
}

// ─── YEAR-END ─────────────────────────────────────────────────────────────────

export function calculateYearEndReturns(state: GameState, playerIdx: number): GameState {
  const player = state.players[playerIdx];
  const bondBlocks = countBlocks(player.bonds);
  const stockBlocks = countBlocks(player.stocks);
  const bondReturn = bondBlocks * BOND_RETURN_PER_5L;
  const stockReturn = stockBlocks * STOCK_RETURN_PER_5L;

  const newPlayerYear = player.year + 1;
  const announcement = `🎊 YEAR ${player.year} END`;
  const privateMessage = `🎊 YEAR-END RETURNS\n+${bondReturn}L added to Bonds\n+${stockReturn}L added to Stocks`;

  let s = updatePlayer(state, playerIdx, {
    bonds: player.bonds + bondReturn,
    stocks: player.stocks + stockReturn,
    year: newPlayerYear,
    privateMessage, // also store per-player for online sync
  });

  // Also update global state year if it's the highest
  if (newPlayerYear > s.year) {
    s = { ...s, year: newPlayerYear };
  }

  s = addLog(s, `🎊 YEAR-END: ${player.name} received portfolio returns (+${bondReturn}L Bonds, +${stockReturn}L Stocks).`);
  
  // Check mandatory expenses at year-end
  s = enforceMandatoryExpenses(s, playerIdx);

  return { ...s, announcement, privateMessage };
}

function enforceMandatoryExpenses(state: GameState, playerIdx: number): GameState {
  const player = state.players[playerIdx];
  let s = state;

  // House mandatory by Year 3 (must own by end of Year 3, so checked when year becomes 4)
  if (player.year >= HOUSE_MANDATORY_YEAR && !player.hasHouse) {
    const msg = `🏠 MANDATORY PURCHASE: ${player.name} has bought a house for ${HOUSE_MARKET_PRICE}L!`;
    s = updatePlayer(s, playerIdx, {
      cash: player.cash - HOUSE_MARKET_PRICE,
      hasHouse: true,
    });
    s = addLog(s, `${player.name}: House auto-purchased at market price ${HOUSE_MARKET_PRICE}L (mandatory by Year ${HOUSE_MANDATORY_YEAR}).`);
    s = { ...s, announcement: msg };
  }

  return s;
}


export function applyYearEndRebalance(
  state: GameState,
  playerIdx: number,
  newCash: number,
  newBonds: number,
  newStocks: number,
  penalty: number = 0
): { state: GameState; valid: boolean; error?: string } {
  const player = state.players[playerIdx];
  const totalBefore = Math.max(0, player.cash + player.bonds + player.stocks - penalty);
  const totalAfter = newCash + newBonds + newStocks;

  if (totalAfter !== totalBefore) {
    return {
      state,
      valid: false,
      error: `Rebalance total mismatch: before (after ${penalty}L penalty)=${totalBefore}L, after=${totalAfter}L.`,
    };
  }
  if (Math.abs(newBonds - player.bonds) % 5 !== 0 || Math.abs(newStocks - player.stocks) % 5 !== 0) {
    return {
      state,
      valid: false,
      error: "Bonds and Stocks adjustments must be in complete 5L blocks.",
    };
  }
  if (newCash < 0 || newBonds < 0 || newStocks < 0) {
    return { state: state, valid: false, error: "Amounts cannot be negative." };
  }

  let s = updatePlayer(state, playerIdx, {
    cash: newCash,
    bonds: newBonds,
    stocks: newStocks,
  });
  s = addLog(s, `${player.name} rebalanced their portfolio.`);
  return { state: s, valid: true };
}

// ─── HOUSE AUCTION ────────────────────────────────────────────────────────────

export function resolveHouseAuction(
  state: GameState
): { state: GameState; winnerId?: string; winnerBid?: number; tie?: boolean } {
  const auctionState = state.auctionState;
  if (!auctionState || auctionState.bids.length === 0) {
    let s = addLog(state, "House Auction ended with no valid bids.");
    s = { ...s, auctionState: undefined, phase: "trade", announcement: "🏠 AUCTION ENDED: No valid bids." };
    return { state: s };
  }

  const validBids = auctionState.bids.filter((b) => b.amount >= HOUSE_AUCTION_MIN);
  if (validBids.length === 0) {
    let s = addLog(state, "House Auction: no bids met minimum (10L). No house sold.");
    s = { ...s, auctionState: undefined, phase: "trade", announcement: "🏠 AUCTION ENDED: No bids met minimum." };
    return { state: s };
  }

  const maxBid = Math.max(...validBids.map((b) => b.amount));
  const winners = validBids.filter((b) => b.amount === maxBid);

  if (winners.length > 1) {
    const tieMsg = `🤝 AUCTION TIE! Multiple players bid ${maxBid}L. No one wins the house.`;
    let s = addLog(state, tieMsg);
    s = { ...s, auctionState: undefined, phase: "trade", announcement: tieMsg };
    return { state: s, tie: true };
  }

  const winner = winners[0];
  const winnerPlayerIdx = state.players.findIndex((p) => p.id === winner.playerId);
  if (winnerPlayerIdx === -1) {
    let s = addLog(state, "House Auction: winner not found.");
    return { state: s };
  }

  const winnerPlayer = state.players[winnerPlayerIdx];
  const winMsg = `🏠 HOUSE SOLD! ${winnerPlayer.name} won with ${winner.amount}L!`;
  let s = updatePlayer(state, winnerPlayerIdx, {
    cash: winnerPlayer.cash - winner.amount,
    hasHouse: true,
  });
  s = addLog(s, winMsg);
  s = { ...s, auctionState: undefined, phase: "trade", announcement: winMsg };
  return { state: s, winnerId: winner.playerId, winnerBid: winner.amount };
}



/** 
 * Asset Concentration Audit:
 * Successful if any asset > 40L (confiscate excess)
 * Failed if all assets <= 40L (auditor pays 5L)
 */
export function processConcentrationAudit(
  state: GameState,
  auditorIdx: number,
  targetIdx: number
): { state: GameState; valid: boolean; error?: string; auditFailed?: boolean; auditSuccess?: boolean; needsRebalance?: boolean; confiscated?: { cash: number; bonds: number; stocks: number } } {
  const auditor = state.players[auditorIdx];
  const target = state.players[targetIdx];

  console.log(
    "AUDIT EXECUTION",
    {
      targetPlayerId: targetIdx,
      playerCount: state.players.length,
      players: state.players.map((p, i) => ({
        index: i,
        id: p.id,
        name: p.name,
        isBot: p.isBot
      }))
    }
  );

  if (!target) return { state, valid: false, error: "Invalid target player." };
  if (auditorIdx === targetIdx) return { state, valid: false, error: "You cannot audit yourself." };

  const limit = getAuditThreshold(state.year);

  const overCash = target.cash > limit;
  const overBonds = target.bonds > limit;
  const overStocks = target.stocks > limit;

  console.log(JSON.stringify({
    event: "AUDIT_ATTEMPT",
    auditorId: auditor.id,
    targetId: target.id,
    auditYear: state.year,
    threshold: limit
  }));

    if (overCash || overBonds || overStocks) {
      // Successful Audit
      console.log(JSON.stringify({
        event: "AUDIT_SUCCESS",
        auditorId: auditor.id,
        targetId: target.id,
        auditYear: state.year
      }));

      let s = state;
      let confiscatedMsg = "";
      const targetUpdates: Partial<PlayerState> = { wealthDeclared: true };
      const auditorUpdates: Partial<PlayerState> = {};
      let auditorCashGain = 0;
      let auditorBondsGain = 0;
      let auditorStocksGain = 0;

      if (overCash) {
        const excess = target.cash - limit;
        targetUpdates.cash = limit;
        auditorCashGain += excess;
        confiscatedMsg += `Cash (${excess}L) `;
      }
      if (overBonds) {
        const excess = target.bonds - limit;
        targetUpdates.bonds = limit;
        auditorBondsGain += excess;
        confiscatedMsg += `Bonds (${excess}L) `;
      }
      if (overStocks) {
        const excess = target.stocks - limit;
        targetUpdates.stocks = limit;
        auditorStocksGain += excess;
        confiscatedMsg += `Stocks (${excess}L) `;
      }

      s = updatePlayer(s, targetIdx, targetUpdates);
      
      if (auditorCashGain > 0 || auditorBondsGain > 0 || auditorStocksGain > 0) {
          s = updatePlayer(s, auditorIdx, {
              cash: auditor.cash + auditorCashGain,
              bonds: auditor.bonds + auditorBondsGain,
              stocks: auditor.stocks + auditorStocksGain
          });
      }

      const msg = `Audit Successful — Excess wealth transferred to auditor.`;
      s = addLog(s, `Successful Audit by ${auditor.name} on ${target.name}: Transferred ${confiscatedMsg.trim()} to auditor.`);
      return { 
        state: { ...s, announcement: msg }, 
        valid: true, 
        auditSuccess: true, 
        confiscated: { cash: auditorCashGain, bonds: auditorBondsGain, stocks: auditorStocksGain } 
      };
  } else {
    // Failed Audit
    console.log(JSON.stringify({
      event: "AUDIT_FAILURE",
      auditorId: auditor.id,
      targetId: target.id,
      auditYear: state.year
    }));
    const needsRebalance = auditor.cash < FALSE_AUDIT_PENALTY;
    
    if (needsRebalance) {
      const msg = `Audit Failed — ${auditor.name} cannot afford ${FALSE_AUDIT_PENALTY}L penalty. Mandatory rebalance required!`;
      let s = addLog(state, `Failed Audit by ${auditor.name} on ${target.name}: ${auditor.name} has insufficient cash and must rebalance.`);
      s = updatePlayer(s, targetIdx, { wealthDeclared: true });
      return { state: { ...s, announcement: msg }, valid: true, auditFailed: true, needsRebalance: true };
    } else {
      const msg = `Audit Failed — Auditor pays ${FALSE_AUDIT_PENALTY}L penalty.`;
      let s = updatePlayer(state, auditorIdx, { cash: auditor.cash - FALSE_AUDIT_PENALTY });
      s = updatePlayer(s, targetIdx, { wealthDeclared: true });
      s = addLog(s, `Failed Audit by ${auditor.name} on ${target.name}: ${auditor.name} paid ${FALSE_AUDIT_PENALTY}L penalty.`);
      return { state: { ...s, announcement: msg }, valid: true, auditFailed: true, needsRebalance: false };
    }
  }
}

// ─── TRADING ─────────────────────────────────────────────────────────────────

/**
 * Validates a trade offer before it is dispatched to the other player.
 * Supports free-amount trading (1L increments) instead of 5L blocks.
 * Designed to allow portfolio optimization trades (e.g. 2L Stocks for 2L Bonds).
 */
export function validateTradeOffer(
  fromPlayer: PlayerState,
  offer: { cash: number; bonds: number; stocks: number },
  request: { cash: number; bonds: number; stocks: number }
): { valid: boolean; error?: string } {
  const oCash = offer?.cash || 0;
  const oBonds = offer?.bonds || 0;
  const oStocks = offer?.stocks || 0;
  const rCash = request?.cash || 0;
  const rBonds = request?.bonds || 0;
  const rStocks = request?.stocks || 0;

  const offerTotal = oCash + oBonds + oStocks;
  const requestTotal = rCash + rBonds + rStocks;

  if (offerTotal === 0 && requestTotal === 0) {
    return { valid: false, error: "Trade cannot be empty (all zeros)." };
  }

  // Ensure all values are non-negative whole numbers (1L increments)
  const vals = [oCash, oBonds, oStocks, rCash, rBonds, rStocks];
  for (const val of vals) {
    if (val < 0) return { valid: false, error: "Trade amounts cannot be negative." };
    if (!Number.isInteger(val)) return { valid: false, error: "Trade amounts must be whole numbers (1L increments)." };
  }

  // Prevent same-asset swaps
  if ((oCash > 0 && rCash > 0) ||
      (oBonds > 0 && rBonds > 0) ||
      (oStocks > 0 && rStocks > 0)) {
    return { valid: false, error: "You cannot trade the same asset type for itself." };
  }

  // Validate the proposer actually has the assets they are offering
  if (fromPlayer.cash < oCash || fromPlayer.bonds < oBonds || fromPlayer.stocks < oStocks) {
    return { valid: false, error: "Insufficient assets to make this offer." };
  }

  return { valid: true };
}

export function checkAndResolveExpiredTrades(state: GameState): GameState {
  if (!state.pendingTrade || state.pendingTrade.tradeType !== "open") return state;
  const trade = state.pendingTrade;

  // Only resolve if it's pending and expired
  if (trade.status !== "pending") return state;
  if (!trade.expiresAt || Date.now() < trade.expiresAt) return state;

  return processOpenTradeResolution(state);
}

export function processOpenTradeResolution(state: GameState): GameState {
  if (!state.pendingTrade || state.pendingTrade.tradeType !== "open") return state;
  let trade = state.pendingTrade;

  const creator = state.players.find(p => p.id === trade.fromPlayerId);
  if (!creator) return state;

  const creatorCanAfford = 
    creator.cash >= trade.offer.cash &&
    creator.bonds >= trade.offer.bonds &&
    creator.stocks >= trade.offer.stocks;

  if (!creatorCanAfford) {
    return { ...state, pendingTrade: undefined, phase: "trade", announcement: "⏱️ OPEN TRADE FAILED: Creator no longer has the offered assets." };
  }

  // Revalidate acceptors: filter out players who can no longer afford the requested assets
  const originalAccepts = trade.responses?.filter((r) => r.accept) || [];
  const validAccepts = originalAccepts.filter(r => {
    const p = state.players.find(player => player.id === r.playerId);
    if (!p) return false;
    return p.cash >= trade.request.cash && p.bonds >= trade.request.bonds && p.stocks >= trade.request.stocks;
  });

  // If some responses were invalidated due to lack of assets, update the trade responses in state
  if (validAccepts.length !== originalAccepts.length) {
    trade = {
      ...trade,
      responses: trade.responses?.map(r => {
        if (r.accept && !validAccepts.some(va => va.playerId === r.playerId)) {
          return { ...r, accept: false }; // Flip invalid accepts to rejects
        }
        return r;
      })
    };
    state = { ...state, pendingTrade: trade };
  }

  if (validAccepts.length === 0) {
    console.log(JSON.stringify({ event: "OPEN_TRADE_EXPIRED", fromPlayerId: trade.fromPlayerId }));
    return { ...state, pendingTrade: undefined, phase: "trade", announcement: "⏱️ OPEN TRADE EXPIRED: No valid players accepted." };
  } else if (validAccepts.length === 1) {
    const winnerId = validAccepts[0].playerId;
    console.log(JSON.stringify({ event: "OPEN_TRADE_COMPLETED", fromPlayerId: trade.fromPlayerId, toPlayerId: winnerId, type: "auto" }));
    return executeTradeTransfer(state, trade.fromPlayerId, winnerId, trade.offer, trade.request);
  } else {
    console.log(JSON.stringify({ event: "OPEN_TRADE_SELECTION_REQUIRED", fromPlayerId: trade.fromPlayerId, accepts: validAccepts.length }));
    return {
      ...state,
      pendingTrade: {
        ...trade,
        status: "selection_required",
      },
    };
  }
}

export function handleOpenTradeResponse(state: GameState, playerId: string, accept: boolean): GameState {
  if (!state.pendingTrade || state.pendingTrade.tradeType !== "open" || state.pendingTrade.status !== "pending") return state;
  const trade = state.pendingTrade;

  // Verify eligible
  if (!trade.eligiblePlayerIds?.includes(playerId)) return state;

  // Prevent duplicate response
  if (trade.responses?.find((r) => r.playerId === playerId)) return state;

  const newResponses = [...(trade.responses || []), { playerId, accept }];
  let s: GameState = {
    ...state,
    pendingTrade: {
      ...trade,
      responses: newResponses,
    },
  };

  console.log(JSON.stringify({ event: "OPEN_TRADE_RESPONSE", fromPlayerId: trade.fromPlayerId, responderId: playerId, accept }));

  // Check if mathematically resolved early
  const eligibleCount = trade.eligiblePlayerIds.length;
  if (newResponses.length === eligibleCount) {
    // All eligible responded, resolve immediately
    s = processOpenTradeResolution(s);
  } else {
    // Check if early abort possible (all remaining eligible have rejected so far, and no accepts exist)
    const accepts = newResponses.filter((r) => r.accept);
    const rejects = newResponses.filter((r) => !r.accept);
    if (accepts.length === 0 && rejects.length === eligibleCount) {
       // All rejected
       s = processOpenTradeResolution(s);
    }
  }

  return s;
}

export function executeTradeTransfer(
  state: GameState,
  fromPlayerId: string,
  toPlayerId: string,
  offer: { cash: number; bonds: number; stocks: number },
  request: { cash: number; bonds: number; stocks: number }
): GameState {
  const fromIdx = state.players.findIndex(p => p.id === fromPlayerId);
  const toIdx = state.players.findIndex(p => p.id === toPlayerId);
  const from = state.players[fromIdx];
  const to = state.players[toIdx];

  // Verify both players can afford the trade at the exact moment of execution
  const fromCanAfford = 
    from.cash >= offer.cash &&
    from.bonds >= offer.bonds &&
    from.stocks >= offer.stocks;

  const toCanAfford = 
    to.cash >= request.cash &&
    to.bonds >= request.bonds &&
    to.stocks >= request.stocks;

  if (!fromCanAfford || !toCanAfford) {
    return { 
      ...state, 
      pendingTrade: undefined, 
      phase: "trade", 
      announcement: "🤝 TRADE FAILED: Insufficient assets to complete the trade." 
    };
  }

  // Execute trade
  let s = state;

  const toNum = (val: any) => Number(val) || 0;

  const offerCash = toNum(offer?.cash);
  const offerBonds = toNum(offer?.bonds);
  const offerStocks = toNum(offer?.stocks);

  const requestCash = toNum(request?.cash);
  const requestBonds = toNum(request?.bonds);
  const requestStocks = toNum(request?.stocks);

  // Check if the proposing player (from) is located on a Free Trade Zone tile
  const fromTile = getTileByPosition(toNum(from.position));
  const isFreeTradeZone = fromTile.effect === "free-trade-zone";

  // Calculate trade volume (total assets swapped)
  const offerVal = offerCash + offerBonds + offerStocks;
  const requestVal = requestCash + requestBonds + requestStocks;
  const totalWorth = offerVal + requestVal;

  const hasFreeTradeBonus = isFreeTradeZone && totalWorth >= 25;
  const bonusAmount = hasFreeTradeBonus ? 5 : 0;

  s = updatePlayer(s, fromIdx, {
    cash: toNum(from.cash) - offerCash + requestCash + bonusAmount,
    bonds: toNum(from.bonds) - offerBonds + requestBonds,
    stocks: toNum(from.stocks) - offerStocks + requestStocks,
    hasTraded: true, // Only set to true on successful trade
  });
  s = updatePlayer(s, toIdx, {
    cash: toNum(to.cash) - requestCash + offerCash + bonusAmount,
    bonds: toNum(to.bonds) - requestBonds + offerBonds,
    stocks: toNum(to.stocks) - requestStocks + offerStocks,
  });

  let announcement = "🤝 TRADE COMPLETED!";
  let logMessage = `🤝 Trade successful between ${from.name} and ${to.name}.`;

  if (hasFreeTradeBonus) {
    announcement = "🤝 FREE TRADE ZONE BONUS! Both players receive +5L Cash!";
    logMessage = `🤝 Free Trade Zone: Proposer ${from.name} completed trade worth ${totalWorth}L. Both players received +5L cash bonus!`;
  }

  s = { ...s, pendingTrade: undefined, phase: "trade", announcement };
  return addLog(s, logMessage);
}

export function resolveTrade(
  state: GameState,
  accept: boolean
): GameState {
  if (!state.pendingTrade) return state;
  const trade = state.pendingTrade;

  if (!accept) {
    return { ...state, pendingTrade: undefined, phase: "trade", announcement: "🤝 TRADE REJECTED." };
  }

  if (!trade.toPlayerId) return state; // Safety check

  return executeTradeTransfer(state, trade.fromPlayerId, trade.toPlayerId, trade.offer, trade.request);
}

// ─── WIN CONDITION ────────────────────────────────────────────────────────────

export function checkWinCondition(state: GameState): { triggered: boolean; triggeringPlayerId?: string } {
  for (const player of state.players) {
    const nw = netWorth(player);
    if (nw >= WIN_CONDITION) {
      console.log(JSON.stringify({
        event: "WIN_CONDITION_CHECK",
        playerId: player.id,
        netWorth: nw,
        triggered: true
      }));
      return { triggered: true, triggeringPlayerId: player.id };
    }
  }
  return { triggered: false };
}

export function getLeaderboard(state: GameState): Array<PlayerState & { rank: number; total: number }> {
  return state.players
    .map((p) => ({ ...p, rank: 0, total: netWorth(p) }))
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      if (b.stocks !== a.stocks) return b.stocks - a.stocks;
      if (b.bonds !== a.bonds) return b.bonds - a.bonds;
      return b.cash - a.cash;
    })
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

// ─── TURN MANAGEMENT ─────────────────────────────────────────────────────────

export function advanceTurn(state: GameState): GameState {
  let s: GameState = { ...state };

  // Step 1 - Check Endgame Candidate Trigger
  const win = checkWinCondition(s);
  if (win.triggered && !s.endgameCandidate) {
    s.endgameCandidate = true;
    s.endgameTriggeredByPlayerId = win.triggeringPlayerId;
    s.endgameTriggeredPlayerIndex = s.currentPlayerIndex;
    s.endgameTriggeredTurn = s.turn;
    s.endgameTriggerAcknowledged = false;
    
    const triggerPlayer = s.players.find(p => p.id === win.triggeringPlayerId);
    console.log(JSON.stringify({
      event: "ENDGAME_TRIGGERED",
      playerId: win.triggeringPlayerId,
      playerIndex: s.currentPlayerIndex,
      netWorth: triggerPlayer ? netWorth(triggerPlayer) : 0,
      turn: s.turn,
      year: s.year
    }));
  }

  // Step 3 - End-of-Round Validation
  const isEndOfRound = s.currentPlayerIndex === s.players.length - 1;
  
  if (isEndOfRound && s.endgameCandidate) {
    const playersAbove100L = s.players.filter(p => netWorth(p) >= WIN_CONDITION).length;
    
    console.log(JSON.stringify({
      event: "ENDGAME_ROUND_COMPLETE",
      playersAbove100L
    }));
    
    if (playersAbove100L === 0) {
      s.endgameCandidate = false;
      s.endgameTriggeredByPlayerId = undefined;
      s.endgameTriggeredPlayerIndex = undefined;
      s.endgameTriggeredTurn = undefined;
      s.endgameTriggerAcknowledged = undefined;
      s.endgameCancelledAcknowledged = false;
      console.log(JSON.stringify({ event: "ENDGAME_CANCELLED" }));
      s = addLog(s, `📉 Market conditions dropped all players below 100L. The game continues!`);
    } else {
      // Game Ends
      s.phase = "finished";
      const leaderboard = getLeaderboard(s);
      const winner = leaderboard[0];
      const msg = `🏆 WINNER: ${winner.name} won the game with ${winner.total}L Wealth!`;
      s = addLog(s, msg);
      
      console.log(JSON.stringify({
        event: "WINNER_RANKING",
        playerId: winner.id,
        netWorth: winner.total,
        stocks: winner.stocks,
        bonds: winner.bonds,
        cash: winner.cash,
        rank: 1
      }));
      
      console.log(JSON.stringify({
        event: "GAME_FINISHED_TRIGGER"
      }));

      return { ...s, announcement: msg };
    }
  }

  // Advance Turn Normally
  const nextIdx = (s.currentPlayerIndex + 1) % s.players.length;
  const nextTurn = s.turn + 1;
  
  s = {
    ...s,
    currentPlayerIndex: nextIdx,
    turn: nextTurn,
    phase: nextTurn < s.players.length ? "year-end" : "roll",
    announcement: undefined,
    privateMessage: undefined,
  };

  // Reset per-player private messages and hasTraded for the new round/turn
  s.players = s.players.map((p, i) => ({
    ...p,
    privateMessage: undefined,
    hasTraded: nextIdx === 0 ? false : p.hasTraded
  }));

  return addLog(s, `--- Turn ${s.turn}: ${s.players[nextIdx].name}'s turn ---`);
}

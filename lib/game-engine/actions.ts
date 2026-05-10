// actions.ts — pure functions for all tile effects and game state mutations
// All functions are side-effect free: take state, return new state
import type { GameState, PlayerState, LogEntry } from "../db/schema";
import {
  TILE_COUNT, INCOME_PER_TURN, WIN_CONDITION,
  BOND_RETURN_PER_5L, STOCK_RETURN_PER_5L,
  MARKET_CRASH_PER_5L, MARKET_RALLY_PER_5L,
  STOCK_CRASH_PER_5L, STOCK_RALLY_PER_5L,
  BONUS_AMOUNT, EMERGENCY_3L, EMERGENCY_5L, EMERGENCY_10L,
  LOTTERY_COST, TAX_RAID_COST, TAX_RAID_PENALTY,
  HOUSE_MARKET_PRICE, HOUSE_AUCTION_MIN, HOUSE_MANDATORY_YEAR,
  DECLARATION_THRESHOLD, IPO_MAX_INVEST,
  ASSET_CONCENTRATION_LIMIT, FALSE_AUDIT_PENALTY,
  getTileByPosition,
} from "./tiles";
import { netWorth, floorTo5L, countBlocks, getAuditPenalty } from "./validators";

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
  players: Array<{ id: string; name: string; avatar: string; isBot: boolean }>
): GameState {
  return {
    turn: 0,
    year: 1,
    currentPlayerIndex: 0,
    phase: "year-end",
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isBot: p.isBot,
      cash: 10,       // 10L starting cash
      bonds: 0,
      stocks: 0,
      hasHouse: false,
      jobLossActive: false,
      incomeFreezeActive: false,
      wealthDeclared: false,
      position: 0,    // Start tile (index 0)
      year: 1,
      turnsWithJobLoss: 0,
      hasTraded: false,
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
  if (gain === 0) {
    return addLog(state, `${player.name} landed on Stock Rally but holds no stocks.`);
  }
  const announcement = `📈 STOCK RALLY!`;
  let s = updatePlayer(state, playerIdx, { stocks: player.stocks + gain });
  s = addLog(s, `${player.name} Stock Rally: +${gain}L stocks (${blocks} blocks × ${STOCK_RALLY_PER_5L}L).`);
  return { ...s, announcement };
}

export function applyStockCrash(state: GameState, playerIdx: number): GameState {
  const player = state.players[playerIdx];
  const blocks = countBlocks(player.stocks);
  const loss = blocks * STOCK_CRASH_PER_5L;
  if (loss === 0) {
    return addLog(state, `${player.name} landed on Stock Crash but holds no stocks.`);
  }
  const announcement = `📉 STOCK CRASH!`;
  const newStocks = Math.max(0, player.stocks - loss);
  let s = updatePlayer(state, playerIdx, { stocks: newStocks });
  s = addLog(s, `${player.name} Stock Crash: -${loss}L stocks (${blocks} blocks × ${STOCK_CRASH_PER_5L}L).`);
  return { ...s, announcement };
}

export function applyMarketCrash(state: GameState, playerIdx: number): GameState {
  let s = state;
  let messages: string[] = [];
  let currentPlayerLoss = 0;
  
  s.players.forEach((player, idx) => {
    const blocks = countBlocks(player.stocks);
    const loss = blocks * MARKET_CRASH_PER_5L;
    if (loss > 0) {
      s = updatePlayer(s, idx, { stocks: Math.max(0, player.stocks - loss) });
      messages.push(`${player.name} -${loss}L stocks`);
      if (idx === playerIdx) currentPlayerLoss = loss;
    }
  });

  const announcement = `📉 MARKET CRASH!`;
  s = addLog(s, `MARKET CRASH! ALL players: ${messages.length > 0 ? messages.join(", ") : "no effect"}.`);
  return { ...s, announcement };
}

export function applyMarketRally(state: GameState, playerIdx: number): GameState {
  let s = state;
  let messages: string[] = [];
  let currentPlayerGain = 0;

  s.players.forEach((player, idx) => {
    const blocks = countBlocks(player.stocks);
    const gain = blocks * MARKET_RALLY_PER_5L;
    if (gain > 0) {
      s = updatePlayer(s, idx, { stocks: player.stocks + gain });
      messages.push(`${player.name} +${gain}L stocks`);
      if (idx === playerIdx) currentPlayerGain = gain;
    }
  });

  const announcement = `🚀 MARKET RALLY!`;
  s = addLog(s, `MARKET RALLY! ALL players: ${messages.length > 0 ? messages.join(", ") : "no effect"}.`);
  return { ...s, announcement };
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
    return addLog(state, `${player.name} IPO: insufficient cash (${player.cash}L < ${investAmount}L).`);
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
export function applyEmergency(state: GameState, playerIdx: number, amount: 3 | 5): GameState {
  const player = state.players[playerIdx];
  const announcement = `🚨 EMERGENCY!`;
  const privateMessage = `➖ Cash: ${amount}L`;
  let s = updatePlayer(state, playerIdx, { cash: player.cash - amount });
  s = addLog(s, `${player.name} Emergency card: paid ${amount}L to bank. Cash: ${player.cash - amount}L.`);
  s = { ...s, announcement, privateMessage };
  return s;
}

/** Lottery Part 1: Deduct fee immediately */
export function deductLotteryFee(state: GameState, playerIdx: number): GameState {
  const player = state.players[playerIdx];
  let s = updatePlayer(state, playerIdx, { cash: player.cash - LOTTERY_COST });
  return addLog(s, `${player.name} paid ${LOTTERY_COST}L to enter the Lottery.`);
}

/** Lottery Part 2: Apply reward based on die result */
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

  if (actualTake <= 0) {
    return { state, valid: false, error: `${target.name} has no ${targetGiveType} to take!` };
  }

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
  const privateMessage = `➕ ${targetGiveType.charAt(0).toUpperCase() + targetGiveType.slice(1)}: ${actualTake}L`;
  s = addLog(s, `🤝 TAKEOVER: ${attacker.name} took ${actualTake}L in ${targetGiveType} from ${target.name}!`);

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
  const privateMessage = (bondReturn > 0 || stockReturn > 0) 
    ? `➕ Bonds: ${bondReturn}L\n➕ Stocks: ${stockReturn}L`
    : "No returns this year.";

  let s = updatePlayer(state, playerIdx, {
    bonds: player.bonds + bondReturn,
    stocks: player.stocks + stockReturn,
    year: newPlayerYear,
  });

  // Also update global state year if it's the highest
  if (newPlayerYear > s.year) {
    s = { ...s, year: newPlayerYear };
  }

  s = addLog(s, `🎊 YEAR-END RETURNS: ${player.name} received +${bondReturn}L into Bonds and +${stockReturn}L into Stocks.`);
  
  // Check mandatory expenses at year-end
  s = enforceMandatoryExpenses(s, playerIdx);

  return { ...s, announcement, privateMessage };
}

function enforceMandatoryExpenses(state: GameState, playerIdx: number): GameState {
  const player = state.players[playerIdx];
  let s = state;

  // House mandatory by Year 3
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
  const totalBefore = player.cash + player.bonds + player.stocks - penalty;
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
    return { state, valid: false, error: "Amounts cannot be negative." };
  }

  let s = updatePlayer(state, playerIdx, {
    cash: newCash,
    bonds: newBonds,
    stocks: newStocks,
  });
  s = addLog(s, `${player.name} year-end rebalanced: ${newCash}L cash, ${newBonds}L bonds, ${newStocks}L stocks.`);
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

// ─── LEADER'S DILEMMA ─────────────────────────────────────────────────────────

export function processWealthDeclaration(
  state: GameState,
  playerIdx: number
): GameState {
  const player = state.players[playerIdx];
  let s = updatePlayer(state, playerIdx, { wealthDeclared: true });
  return addLog(s, `${player.name} declared wealth of ${netWorth(player)}L.`);
}

export function processAudit(
  state: GameState,
  auditorIdx: number,
  targetIdx: number
): { state: GameState; valid: boolean; error?: string } {
  const auditor = state.players[auditorIdx];
  const target = state.players[targetIdx];

  if (target.wealthDeclared) {
    return { state, valid: false, error: `${target.name} has already declared wealth and cannot be audited.` };
  }

  const targetWealth = netWorth(target);

  if (targetWealth < DECLARATION_THRESHOLD) {
    // False audit — auditor pays 5L
    const msg = `🔍 TAX AUDIT: False alarm! ${auditor.name} paid 5L penalty.`;
    let s = updatePlayer(state, auditorIdx, { cash: auditor.cash - 5 });
    s = addLog(s, `${auditor.name} audited ${target.name} (wealth: ${targetWealth}L < 70L) — FALSE AUDIT! ${auditor.name} pays 5L.`);
    return { state: { ...s, announcement: msg }, valid: true };
  }

  // Target has 70L+ and hasn't declared — penalty
  const penalty = getAuditPenalty(targetWealth);
  const msg = `🔍 TAX AUDIT: ${target.name} caught! Paid ${penalty}L penalty.`;
  let s = updatePlayer(state, targetIdx, { cash: target.cash - penalty, wealthDeclared: true });
  s = addLog(s, `${auditor.name} audited ${target.name} (wealth: ${targetWealth}L) — CAUGHT! ${target.name} pays ${penalty}L penalty.`);
  return { state: { ...s, announcement: msg }, valid: true };
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
): { state: GameState; valid: boolean; error?: string; auditFailed?: boolean; needsRebalance?: boolean } {
  const auditor = state.players[auditorIdx];
  const target = state.players[targetIdx];

  const overCash = target.cash > ASSET_CONCENTRATION_LIMIT;
  const overBonds = target.bonds > ASSET_CONCENTRATION_LIMIT;
  const overStocks = target.stocks > ASSET_CONCENTRATION_LIMIT;

  if (overCash || overBonds || overStocks) {
    // Successful Audit
    let s = state;
    let confiscatedMsg = "";
    const updates: Partial<PlayerState> = {};

    if (overCash) {
      const excess = target.cash - ASSET_CONCENTRATION_LIMIT;
      updates.cash = ASSET_CONCENTRATION_LIMIT;
      confiscatedMsg += `Cash (${excess}L) `;
    }
    if (overBonds) {
      const excess = target.bonds - ASSET_CONCENTRATION_LIMIT;
      updates.bonds = ASSET_CONCENTRATION_LIMIT;
      confiscatedMsg += `Bonds (${excess}L) `;
    }
    if (overStocks) {
      const excess = target.stocks - ASSET_CONCENTRATION_LIMIT;
      updates.stocks = ASSET_CONCENTRATION_LIMIT;
      confiscatedMsg += `Stocks (${excess}L) `;
    }

    s = updatePlayer(s, targetIdx, updates);
    const msg = `Audit Successful — Excess wealth confiscated by bank.`;
    s = addLog(s, `Successful Audit by ${auditor.name} on ${target.name}: Confiscated ${confiscatedMsg.trim()}.`);
    return { state: { ...s, announcement: msg }, valid: true };
  } else {
    // Failed Audit
    const needsRebalance = auditor.cash < FALSE_AUDIT_PENALTY;
    
    if (needsRebalance) {
      const msg = `Audit Failed — ${auditor.name} cannot afford ${FALSE_AUDIT_PENALTY}L penalty. Mandatory rebalance required!`;
      let s = addLog(state, `Failed Audit by ${auditor.name} on ${target.name}: ${auditor.name} has insufficient cash and must rebalance.`);
      return { state: { ...s, announcement: msg }, valid: true, auditFailed: true, needsRebalance: true };
    } else {
      const msg = `Audit Failed — Auditor pays ${FALSE_AUDIT_PENALTY}L penalty.`;
      let s = updatePlayer(state, auditorIdx, { cash: auditor.cash - FALSE_AUDIT_PENALTY });
      s = addLog(s, `Failed Audit by ${auditor.name} on ${target.name}: ${auditor.name} paid ${FALSE_AUDIT_PENALTY}L penalty.`);
      return { state: { ...s, announcement: msg }, valid: true, auditFailed: true, needsRebalance: false };
    }
  }
}

// ─── TRADING ─────────────────────────────────────────────────────────────────

export function resolveTrade(
  state: GameState,
  accept: boolean
): GameState {
  if (!state.pendingTrade) return state;
  const trade = state.pendingTrade;

  if (!accept) {
    return { ...state, pendingTrade: undefined, phase: "trade", announcement: "🤝 TRADE REJECTED." };
  }

  const fromIdx = state.players.findIndex(p => p.id === trade.fromPlayerId);
  const toIdx = state.players.findIndex(p => p.id === trade.toPlayerId);
  const from = state.players[fromIdx];
  const to = state.players[toIdx];

  // Execute trade
  let s = state;
  s = updatePlayer(s, fromIdx, {
    cash: from.cash - trade.offer.cash + trade.request.cash,
    bonds: from.bonds - trade.offer.bonds + trade.request.bonds,
    stocks: from.stocks - trade.offer.stocks + trade.request.stocks,
    hasTraded: true, // Only set to true on successful trade
  });
  s = updatePlayer(s, toIdx, {
    cash: to.cash - trade.request.cash + trade.offer.cash,
    bonds: to.bonds - trade.request.bonds + trade.offer.bonds,
    stocks: to.stocks - trade.request.stocks + trade.offer.stocks,
  });

  s = { ...s, pendingTrade: undefined, phase: "trade", announcement: "🤝 TRADE COMPLETED!" };
  return addLog(s, `🤝 Trade successful between ${from.name} and ${to.name}.`);
}

// ─── WIN CONDITION ────────────────────────────────────────────────────────────

export function checkWinCondition(state: GameState): { triggered: boolean; triggeringPlayerId?: string } {
  for (const player of state.players) {
    if (netWorth(player) >= WIN_CONDITION) {
      return { triggered: true, triggeringPlayerId: player.id };
    }
  }
  return { triggered: false };
}

export function getLeaderboard(state: GameState): Array<PlayerState & { rank: number; total: number }> {
  return state.players
    .map((p) => ({ ...p, rank: 0, total: netWorth(p) }))
    .sort((a, b) => b.total - a.total)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

// ─── TURN MANAGEMENT ─────────────────────────────────────────────────────────

export function advanceTurn(state: GameState): GameState {
  const nextIdx = (state.currentPlayerIndex + 1) % state.players.length;
  const nextTurn = state.turn + 1;
  let s: GameState = {
    ...state,
    currentPlayerIndex: nextIdx,
    turn: nextTurn,
    phase: nextTurn < state.players.length ? "year-end" : "roll",
    announcement: undefined,
    privateMessage: undefined,
  };

  // If a round is completed
  if (nextIdx === 0) {
    const win = checkWinCondition(state);
    if (win.triggered) {
      s = { ...s, endgame: true, phase: "finished" };
      // Find the actual winner
      const leaderboard = getLeaderboard(s);
      const winner = leaderboard[0];
      const msg = `🏆 WINNER: ${winner.name} won the game with ${winner.total}L Wealth!`;
      s = addLog(s, msg);
      return { ...s, announcement: msg };
    } else if (state.endgame) {
      // If we were in endgame but now no one is > 100L (e.g. market crash)
      s = { ...s, endgame: false };
      s = addLog(s, `📉 Market conditions have changed. The game continues!`);
    }
  }

  // Reset hasTraded for the new current player
  s = updatePlayer(s, nextIdx, { hasTraded: false });

  // Process Year-End Returns if entering year-end phase (but skip first turn of game)
  if (s.phase === "year-end" && s.turn >= s.players.length) {
    s = calculateYearEndReturns(s, nextIdx);
  }

  return addLog(s, `--- Turn ${s.turn}: ${s.players[nextIdx].name}'s turn ---`);
}

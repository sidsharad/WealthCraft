// validators.ts — enforce 5L block rules and all monetary constraints
import type { PlayerState } from "../db/schema";

/** All monetary amounts must be in complete 5L blocks */
export function isValidBlock(amount: number): boolean {
  return amount >= 0 && Number.isInteger(amount) && amount % 5 === 0;
}

/** Floor to nearest 5L block (for return calculations) */
export function floorTo5L(amount: number): number {
  return Math.floor(amount / 5) * 5;
}

/** Number of complete 5L blocks */
export function countBlocks(amount: number): number {
  return Math.floor(amount / 5);
}

/** Validate a portfolio transfer — amounts must be valid blocks */
export function validateTransfer(
  from: PlayerState,
  cash: number,
  bonds: number,
  stocks: number
): { valid: boolean; error?: string } {
  if (!isValidBlock(cash) || !isValidBlock(bonds) || !isValidBlock(stocks)) {
    return { valid: false, error: "All amounts must be in complete 5L blocks." };
  }
  if (cash < 0 || bonds < 0 || stocks < 0) {
    return { valid: false, error: "Amounts cannot be negative." };
  }
  if (from.cash < cash) {
    return { valid: false, error: `Insufficient cash. Have ${from.cash}L, need ${cash}L.` };
  }
  if (from.bonds < bonds) {
    return { valid: false, error: `Insufficient bonds. Have ${from.bonds}L, need ${bonds}L.` };
  }
  if (from.stocks < stocks) {
    return { valid: false, error: `Insufficient stocks. Have ${from.stocks}L, need ${stocks}L.` };
  }
  return { valid: true };
}

/** Calculate net worth for a player */
export function netWorth(player: PlayerState): number {
  return player.cash + player.bonds + player.stocks;
}

/** Validate rebalance operation */
export function validateRebalance(
  player: PlayerState,
  newCash: number,
  newBonds: number,
  newStocks: number
): { valid: boolean; error?: string } {
  // Total must stay the same
  const oldTotal = netWorth(player);
  const newTotal = newCash + newBonds + newStocks;

  if (newTotal !== oldTotal) {
    return {
      valid: false,
      error: `Rebalance total mismatch. Before: ${oldTotal}L, After: ${newTotal}L.`,
    };
  }
  if (Math.abs(newBonds - player.bonds) % 5 !== 0 || Math.abs(newStocks - player.stocks) % 5 !== 0) {
    return { valid: false, error: "Bonds and Stocks adjustments must be in complete 5L blocks." };
  }
  if (newCash < 0 || newBonds < 0 || newStocks < 0) {
    return { valid: false, error: "Amounts cannot be negative after rebalance." };
  }
  return { valid: true };
}

/** Get audit penalty for a player's net worth */
export function getAuditPenalty(wealth: number): number {
  if (wealth >= 90) return 20;
  if (wealth >= 80) return 15;
  if (wealth >= 70) return 10;
  return 0; // below 70 — no penalty, auditor pays
}

/** Check if a player needs to declare (hit 70L+) */
export function requiresDeclaration(player: PlayerState): boolean {
  return netWorth(player) >= 70 && !player.wealthDeclared;
}

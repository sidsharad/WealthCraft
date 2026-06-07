// ─── TILE DEFINITIONS (Ground truth from PDF board)
// 16 tiles arranged in a rectangle (loop)

export type TileType = "year-end" | "gain-you" | "gain-all" | "loss-you" | "loss-all" | "neutral" | "auction" | "chance";
export type TileEffect =
  | "start"
  | "bonus"
  | "stock-rally"
  | "market-crash"
  | "house-auction"
  | "ipo"
  | "income-freeze"
  | "emergency"
  | "market-rally"
  | "lottery"
  | "stock-crash"
  | "hostile-takeover"
  | "tax-raid"
  | "free-trade-zone";

export interface TileDef {
  id: number;       // 1-16
  name: string;
  subtitle?: string;
  type: TileType;
  effect: TileEffect;
  description: string;
  colorClass: string;    // Tailwind border colour
  bgClass: string;       // Tailwind background
  headerBg: string;      // header background
  icon: string;          // emoji / symbol
}

export const TILES: TileDef[] = [
  {
    id: 1,
    name: "START",
    subtitle: "YEAR-END",
    type: "year-end",
    effect: "start",
    description: "Collect bond & stock returns. Rebalance portfolio (1 min). Collect 3L income each turn.",
    colorClass: "border-blue-500",
    bgClass: "bg-blue-50",
    headerBg: "bg-blue-600",
    icon: "🏦",
  },
  {
    id: 2,
    name: "BONUS",
    type: "gain-you",
    effect: "bonus",
    description: "Receive +2L cash from bank.",
    colorClass: "border-green-500",
    bgClass: "bg-green-50",
    headerBg: "bg-green-600",
    icon: "💰",
  },
  {
    id: 3,
    name: "STOCK RALLY",
    type: "gain-you",
    effect: "stock-rally",
    description: "+2L stocks per complete 5L held. You only.",
    colorClass: "border-green-500",
    bgClass: "bg-green-50",
    headerBg: "bg-green-600",
    icon: "📈",
  },
  {
    id: 4,
    name: "MARKET CRASH",
    type: "loss-all",
    effect: "market-crash",
    description: "-3L stocks per complete 5L held. ALL players.",
    colorClass: "border-red-600",
    bgClass: "bg-red-50",
    headerBg: "bg-red-700",
    icon: "📉",
  },
  {
    id: 5,
    name: "HOUSE AUCTION",
    type: "auction",
    effect: "house-auction",
    description: "All players submit sealed bids. Minimum bid: 10L. Market price: 20L. Highest bid wins.",
    colorClass: "border-yellow-500",
    bgClass: "bg-yellow-50",
    headerBg: "bg-yellow-600",
    icon: "🏠",
  },
  {
    id: 6,
    name: "IPO",
    type: "gain-you",
    effect: "ipo",
    description: "Invest up to 5L cash → receive 2× in stocks. You only.",
    colorClass: "border-green-500",
    bgClass: "bg-green-50",
    headerBg: "bg-green-600",
    icon: "🚀",
  },
  {
    id: 7,
    name: "INCOME FREEZE",
    type: "neutral",
    effect: "income-freeze",
    description: "No 3L income this turn only.",
    colorClass: "border-gray-400",
    bgClass: "bg-gray-50",
    headerBg: "bg-gray-500",
    icon: "🧊",
  },
  {
    id: 8,
    name: "EMERGENCY",
    type: "loss-you",
    effect: "emergency",
    description: "Draw card — pay 3L or 5L cash to bank.",
    colorClass: "border-red-500",
    bgClass: "bg-red-50",
    headerBg: "bg-red-600",
    icon: "🚨",
  },
  {
    id: 9,
    name: "FREE TRADE ZONE",
    type: "neutral",
    effect: "free-trade-zone",
    description: "If you propose a trade worth ≥25L from here, both get +5L cash.",
    colorClass: "border-blue-400",
    bgClass: "bg-blue-50/50",
    headerBg: "bg-blue-500",
    icon: "🤝",
  },
  {
    id: 10,
    name: "LOTTERY",
    type: "chance",
    effect: "lottery",
    description: "Pay 2L to roll: 1-2=No reward | 3-4=+2L cash | 5-6=+5L cash.",
    colorClass: "border-yellow-500",
    bgClass: "bg-yellow-50",
    headerBg: "bg-yellow-600",
    icon: "🎲",
  },
  {
    id: 11,
    name: "STOCK CRASH",
    type: "loss-you",
    effect: "stock-crash",
    description: "-2L stocks per complete 5L held. You only.",
    colorClass: "border-red-500",
    bgClass: "bg-red-50",
    headerBg: "bg-red-600",
    icon: "💔",
  },
  {
    id: 12,
    name: "MARKET RALLY",
    type: "gain-all",
    effect: "market-rally",
    description: "+3L stocks per complete 5L held. ALL players.",
    colorClass: "border-green-600",
    bgClass: "bg-green-50",
    headerBg: "bg-green-700",
    icon: "🌟",
  },
  {
    id: 13,
    name: "HOSTILE TAKEOVER",
    type: "loss-you",
    effect: "hostile-takeover",
    description: "Take up to 5L of one asset from any player. Cannot split across two asset types.",
    colorClass: "border-red-500",
    bgClass: "bg-red-50",
    headerBg: "bg-red-600",
    icon: "⚔️",
  },
  {
    id: 14,
    name: "FREE TRADE ZONE",
    type: "neutral",
    effect: "free-trade-zone",
    description: "If you propose a trade worth ≥25L from here, both get +5L cash.",
    colorClass: "border-blue-400",
    bgClass: "bg-blue-50/50",
    headerBg: "bg-blue-500",
    icon: "🤝",
  },
  {
    id: 15,
    name: "TAX RAID",
    type: "neutral",
    effect: "tax-raid",
    description: "Pay 2L to enforce audit on any other player. Target pays 5L to bank.",
    colorClass: "border-gray-400",
    bgClass: "bg-gray-50",
    headerBg: "bg-gray-500",
    icon: "🔍",
  },
  {
    id: 16,
    name: "EMERGENCY",
    type: "loss-you",
    effect: "emergency",
    description: "Draw card — pay 3L or 5L cash to bank.",
    colorClass: "border-red-500",
    bgClass: "bg-red-50",
    headerBg: "bg-red-600",
    icon: "🚨",
  },
];

export const TILE_COUNT = 16;

// Board layout: 4×4 rectangle with 16 tiles on perimeter
// Tile indices (0-based positions in the visual grid):
// Top row L→R: tiles 0(Start=1), 1(2), 2(3), 3(4)  positions: (0,0)(0,1)(0,2)(0,3)
// Right col T→B: tiles 4(5), 5(6), 6(7), 7(8)       positions: (1,3)(2,3)(3,3) ...actually 4 sides of 6x6 grid
// We'll place 16 tiles around a 6x6 grid perimeter

// Board tile ordering for CSS grid (clockwise starting top-left):
// Top row: 0,1,2,3,4,5  (6 tiles)
// Right col (excluding corners): 6,7,8  (3 tiles)  = bottom-right + going down
// Bottom row R→L: 9,10,11,12,13,14  (6 tiles)
// Left col (excluding corners): 15  (1 tile)
// Total: 16 tiles

export function getTileByPosition(position: number): TileDef {
  // position is 0-indexed, wraps around 16
  const idx = ((position % TILE_COUNT) + TILE_COUNT) % TILE_COUNT;
  return TILES[idx];
}

// Constants from rulebook/PDF
export const STARTING_CASH = 10;           // 10L
export const INCOME_PER_TURN = 3;          // 3L
export const WIN_CONDITION = 100;          // 100L
export const BOND_RETURN_PER_5L = 1;       // +1L per 5L bonds
export const STOCK_RETURN_PER_5L = 2;      // +2L per 5L stocks
export const MARKET_CRASH_PER_5L = 3;      // -3L per 5L stocks
export const MARKET_RALLY_PER_5L = 3;      // +3L per 5L stocks
export const STOCK_CRASH_PER_5L = 2;       // -2L per 5L stocks
export const STOCK_RALLY_PER_5L = 2;       // +2L per 5L stocks
export const HOUSE_MARKET_PRICE = 20;      // 20L (from PDF)
export const HOUSE_AUCTION_MIN = 10;       // 10L min bid (from PDF)
export const HOUSE_MANDATORY_YEAR = 4;     // Must buy by end of Year 3 (auto-bought when entering Year 4)
export const REBALANCE_PENALTY = 3;        // 3L mid-year
export const IPO_MAX_INVEST = 5;           // 5L max
export const LOTTERY_COST = 2;             // 2L
export const TAX_RAID_COST = 2;            // 2L (attacker pays)
export const TAX_RAID_PENALTY = 5;         // 5L (target pays)
export const FALSE_AUDIT_PENALTY = 5;      // 5L (auditor pays)
export const BONUS_AMOUNT = 2;             // 2L cash
export const EMERGENCY_3L = 3;             // 3L (50% probability)
export const EMERGENCY_5L = 5;             // 5L (30% probability)
export const EMERGENCY_10L = 10;           // 10L (20% probability)

// Leader's Dilemma thresholds
export const DECLARATION_THRESHOLD = 70;   // Must declare at 70L
export const PENALTY_TIER_1 = { min: 70, max: 79, amount: 10 };
export const PENALTY_TIER_2 = { min: 80, max: 89, amount: 15 };
export const PENALTY_TIER_3 = { min: 90, max: 99, amount: 20 };

// Asset Concentration Rules
export const ASSET_CONCENTRATION_LIMIT = 40; // 40L

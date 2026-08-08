import { pgTable, text, integer, jsonb, timestamp, uuid, index } from "drizzle-orm/pg-core";

// ─── USERS ───────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  avatarUrl: text("avatar_url"),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── SESSIONS (NextAuth) ──────────────────────────────────────────────────────
export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires").notNull(),
});

export const accounts = pgTable("accounts", {
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
});

export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires").notNull(),
});

// ─── ROOMS ────────────────────────────────────────────────────────────────────
export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  mode: text("mode", { enum: ["online", "local"] }).notNull().default("online"),
  status: text("status", { enum: ["lobby", "active", "finished", "abandoned"] }).notNull().default("lobby"),
  hostId: uuid("host_id").references(() => users.id),
  playerIds: jsonb("player_ids").$type<string[]>().notNull().default([]),
  gameState: jsonb("game_state").$type<GameState>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  gameVersion: integer("game_version").notNull().default(1),
});

// ─── GAME STATE TYPES ─────────────────────────────────────────────────────────

export interface BotProfile {
  type:
    | "BULL"
    | "DISCIPLINED"
    | "AUDIT_HAWK"
    | "OPPORTUNIST"
    | "SAFETY_BUILDER"
    | "PROPERTY_BUILDER";
  hardCashFloor: number;
  softCashTarget: number;
  auditBudget: number;
  riskTolerance: number;
  aggression: number;
  personalityVariance: number;
  tiltSensitivity: number;
  auditThreshold: number;
  urgencyWeights: {
    property: number;
    survival: number;
    growth: number;
    audit: number;
  };
}

export interface RegretMemory {
  action: string;
  penalty: number;
  turn: number;
}

export interface BotDNA {
  aggression: number;
  greed: number;
  patience: number;
  revenge: number;
  fear: number;
  confidence: number;
}

export interface BotPersonality {
  risk: number;
  greed: number;
  aggression: number;
  liquidity: number;
  sociability: number;
  targetAllocation: {
    cash: number;
    bonds: number;
    stocks: number;
  };
  dna: BotDNA;
}

export interface RegretMemory {
  action: string;
  loss: number;
  turn: number;
  emotionalImpact: number;
}

export type StrategyMode =
  | "NORMAL"
  | "AGGRESSIVE"
  | "DEFENSIVE"
  | "RECOVERY"
  | "ENDGAME"
  | "HOME_OWNER"
  | "DESPERATE"
  | "EXPANSION"
  | "BALANCED"
  | "SABOTAGE"
  | "KINGMAKER";

export interface BotEmotions {
  confidence: number;
  fear: number;
  revenge: number;
  desperation: number;
  frustration: number;
}

export interface BotMotivations {
  win: number;
  preserveCash: number;
  attackLeader: number;
  revenge: number;
  houseOwnership: number;
}

// ─── V5.1 PORTFOLIO ESTIMATION ENGINE TYPES ──────────────────────────────────

export interface AssetEstimate {
  mean: number;
  variance: number;
  confidence: number;
  lowerBound: number;
  upperBound: number;
  source:
    | "INITIAL"
    | "INCOME"
    | "YEAR_END"
    | "IPO"
    | "TRADE"
    | "AUDIT"
    | "RALLY"
    | "CRASH"
    | "TAKEOVER"
    | "RECONCILIATION";
  lastUpdatedTurn: number;
}

export interface PropertyEstimate {
  ownsProperty: boolean;
  acquisitionPrice: number;
  confidence: number;
  lastUpdatedTurn: number;
}

export interface PortfolioHypothesis {
  cashRange?: [number, number];
  bondRange?: [number, number];
  stockRange?: [number, number];
  probability: number;
  confidence: number;
  source: string;
  createdTurn: number;
}

export interface ReconciliationRecord {
  turn: number;
  estimated: number;
  actual: number;
  hidden: number;
  strategy: string;
}

export type AuditKnowledgeState = "CERTAIN" | "BOUNDED" | "UNCERTAIN";

export interface AuditEligibility {
  eligible: boolean;
  probability: number;
  expectedValue: number;
  reason: "KNOWN_FAIL" | "KNOWN_SUCCESS" | "LOCKED" | "LOW_CONFIDENCE" | "NEGATIVE_EV" | "SUCCESS";
}

export interface AuditHistoryEvent {
  turn: number;
  eventType: string;
  delta?: number;
  previous: {
    lower: number;
    upper: number;
  };
  next: {
    lower: number;
    upper: number;
  };
  reason: string;
}

export interface AuditMemory {
  targetPlayerId: string;
  asset: "cash" | "stocks" | "bonds";
  auditTurn: number;
  outcome: "SUCCESS" | "FAIL";
  thresholdUsed: number;
  state: AuditKnowledgeState;
  lockedEstimate: {
    lowerBound: number;
    upperBound: number;
    confidence: number;
    certainty: boolean;
  };
  estimateLastChangedTurn: number;
  auditKnowledgeStrength: number;
  suspicionSinceAudit: number;
  failedAuditCount: number;
  contradictionCount: number;
  sourceHistory: AuditHistoryEvent[];
}

export interface PlayerModel {
  cash: AssetEstimate;
  bonds: AssetEstimate;
  stocks: AssetEstimate;
  property: PropertyEstimate;
  hypotheses: PortfolioHypothesis[];
  hiddenWealth: number;
  visibilityScore: number;
  suspicionScore: number;
  lastObservedTurn: number;
  reconciliationHistory: ReconciliationRecord[];
  riskScore: number;
  aggressionScore: number;
  tradeAcceptanceScore: number;
}

export interface BotState {
  personality: BotPersonality;
  strategicMode: StrategyMode;
  emotions: BotEmotions;
  motivations: BotMotivations;
  recentFailures: number;
  tilt: number;
  regrets: RegretMemory[];
  memory: {
    successfulAudits: number;
    failedAudits: number;
    acceptedTrades: number;
    rejectedTrades: number;
    lastTradeRejectionTurn?: number;
    revengeTargets: string[];
    auditMemory: Record<string, AuditMemory>;
    auditBudgetYear: number;
    auditBudget: {
      attempted: number;
      succeeded: number;
      failed: number;
    };
  };
  playerModels: {
    [playerId: string]: PlayerModel;
  };
}

export interface PlayerState {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
  botType?: "BULL" | "DISCIPLINED" | "AUDIT_HAWK" | "OPPORTUNIST" | "SAFETY_BUILDER" | "PROPERTY_BUILDER";
  cash: number;      // in Lakhs, integers only
  bonds: number;     // in Lakhs, integers only
  stocks: number;    // in Lakhs, integers only
  hasHouse: boolean;
  jobLossActive: boolean;
  incomeFreezeActive: boolean;
  wealthDeclared: boolean;
  position: number;  // 0-15, tile index
  year: number;      // current year for this player
  turnsWithJobLoss: number;
  hasTraded: boolean;
  privateMessage?: string;
  botState?: BotState;
}

export interface AuctionBid {
  playerId: string;
  amount: number;
}

export interface AuctionState {
  bids: AuctionBid[];
  open: boolean;
  timerStart?: number;
}

export interface TradeOffer {
  fromPlayerId: string;
  toPlayerId?: string; // Optional for open trades
  offer: { cash: number; bonds: number; stocks: number };
  request: { cash: number; bonds: number; stocks: number };
  
  // Open Trade fields
  tradeType?: "direct" | "open";
  status?: "pending" | "selection_required" | "completed" | "expired";
  responses?: { playerId: string; accept: boolean }[];
  selectedPlayerId?: string;
  createdAt?: number;
  expiresAt?: number;
  eligiblePlayerIds?: string[];
}

export interface LogEntry {
  turn: number;
  text: string;
  timestamp: number;
}

export interface EmergencyState {
  eventId: string;
  playerId: string;
  amount: number;

  tradeAttempted: boolean;

  status:
    | "awaiting-decision"
    | "awaiting-trade-response"
    | "rebalance-required"
    | "resolved";

  resolution?:
    | "Paid From Cash"
    | "Paid After Trade"
    | "Mandatory Rebalance";
}

export interface GameState {
  version: number;
  turn: number;
  year: number;
  currentPlayerIndex: number;
  phase: "roll" | "action" | "trade" | "year-end" | "auction" | "finished" | "waiting-trade";
  players: PlayerState[];
  log: LogEntry[];
  auctionState?: AuctionState;
  pendingTrade?: TradeOffer;
  announcement?: string;
  privateMessage?: string;
  emergencyState?: EmergencyState;
  processedActionIds?: string[];
  
  // Endgame Rules
  endgameCandidate?: boolean;
  endgameTriggeredByPlayerId?: string;
  endgameTriggeredPlayerIndex?: number;
  endgameTriggeredTurn?: number;
  endgameTriggerAcknowledged?: boolean;
  endgameCancelledAcknowledged?: boolean;
}

// ─── GAME RESULTS (Analytics) ─────────────────────────────────────────────────
export const gameResults = pgTable("game_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id").notNull().unique(),
  roomCode: text("room_code").notNull(),
  winnerId: text("winner_id").notNull(),
  winnerName: text("winner_name").notNull(),
  winnerNetWorth: integer("winner_net_worth").notNull(),
  playerIds: jsonb("player_ids").$type<string[]>().notNull(),
  playerNames: jsonb("player_names").$type<string[]>().notNull(),
  playerCount: integer("player_count").notNull(),
  turnCount: integer("turn_count").notNull(),
  yearCount: integer("year_count").notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at").defaultNow().notNull(),
}, (table) => ({
  winnerIdx: index("idx_game_results_winner").on(table.winnerId),
  completedIdx: index("idx_game_results_completed").on(table.completedAt),
}));
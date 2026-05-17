import { pgTable, text, integer, jsonb, timestamp, uuid } from "drizzle-orm/pg-core";

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
  status: text("status", { enum: ["lobby", "active", "finished"] }).notNull().default("lobby"),
  hostId: uuid("host_id").references(() => users.id),
  playerIds: jsonb("player_ids").$type<string[]>().notNull().default([]),
  gameState: jsonb("game_state").$type<GameState>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── GAME STATE TYPES ─────────────────────────────────────────────────────────
export interface PlayerState {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
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
  toPlayerId: string;
  offer: { cash: number; bonds: number; stocks: number };
  request: { cash: number; bonds: number; stocks: number };
}

export interface LogEntry {
  turn: number;
  text: string;
  timestamp: number;
}

export interface GameState {
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
  winTriggeredByPlayerId?: string;
  endgame?: boolean;  // true when win condition hit, everyone finishes turn
}

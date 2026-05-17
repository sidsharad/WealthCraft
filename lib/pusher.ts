// lib/pusher.ts — Pusher transport layer (server + client)
//
// Exports a typed `pusherServer` that is safe to call whether or not Pusher
// credentials are configured. When unconfigured, it falls back to a no-op
// Broadcaster so online mode silently skips rather than crashing.

import PusherClient from "pusher-js";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Minimal interface the rest of the app depends on. */
export interface Broadcaster {
  trigger(channel: string, event: string, data: object): Promise<unknown>;
  authorizeChannel(socketId: string, channel: string, presenceData?: any): { auth: string };
}

// ─── Credential detection ─────────────────────────────────────────────────────

function isReal(val: string | undefined): boolean {
  const v = (val ?? "").trim();
  return !!v && !v.includes("your-");
}

const hasPusherServer =
  isReal(process.env.PUSHER_APP_ID) &&
  isReal(process.env.PUSHER_KEY) &&
  isReal(process.env.PUSHER_SECRET);

const hasPusherClient =
  isReal(process.env.NEXT_PUBLIC_PUSHER_KEY) &&
  isReal(process.env.NEXT_PUBLIC_PUSHER_CLUSTER);

// ─── Server-side singleton ────────────────────────────────────────────────────

const noOpBroadcaster: Broadcaster = {
  trigger: async () => {
    console.warn("[Pusher] Not configured — skipping trigger.");
    return {};
  },
  authorizeChannel: () => ({ auth: "dummy" }),
};

export const pusherServer: Broadcaster = hasPusherServer
  ? (() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Pusher = require("pusher");
      return new Pusher({
        appId: process.env.PUSHER_APP_ID!.trim(),
        key: process.env.PUSHER_KEY!.trim(),
        secret: process.env.PUSHER_SECRET!.trim(),
        cluster: process.env.PUSHER_CLUSTER!.trim(),
        useTLS: true,
      }) as Broadcaster;
    })()
  : noOpBroadcaster;

// ─── Client-side singleton ────────────────────────────────────────────────────

let pusherClientInstance: PusherClient | null = null;

export function getPusherClient(): PusherClient | null {
  if (!hasPusherClient) return null;
  if (!pusherClientInstance) {
    pusherClientInstance = new PusherClient(
      process.env.NEXT_PUBLIC_PUSHER_KEY!.trim(),
      {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!.trim(),
        authEndpoint: "/api/pusher/auth",
      }
    );
  }
  return pusherClientInstance;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getRoomChannel(roomCode: string): string {
  return `presence-room-${roomCode}`;
}

export const PUSHER_EVENTS = {
  GAME_STATE_UPDATE: "game-state-update",
  TRADE_OFFER: "trade-offer",
  AUCTION_BID_RECEIVED: "auction-bid-received",
  GAME_FINISHED: "game-finished",
  PLAYER_JOINED: "player-joined",
  GAME_STARTED: "game-started",
} as const;

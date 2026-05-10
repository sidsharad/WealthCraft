// lib/pusher.ts — server + client Pusher instances
import PusherClient from "pusher-js";

function isRealPusherKey(val: string | undefined): boolean {
  return !!val && !val.includes("your-");
}

const hasPusherServer =
  isRealPusherKey(process.env.PUSHER_APP_ID) &&
  isRealPusherKey(process.env.PUSHER_KEY) &&
  isRealPusherKey(process.env.PUSHER_SECRET);

const hasPusherClient =
  isRealPusherKey(process.env.NEXT_PUBLIC_PUSHER_KEY) &&
  isRealPusherKey(process.env.NEXT_PUBLIC_PUSHER_CLUSTER);

// Server-side Pusher — lazy singleton, only created when credentials exist
let _pusherServer: import("pusher") | null = null;

export function getPusherServer() {
  if (!hasPusherServer) return null;
  if (!_pusherServer) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Pusher = require("pusher");
    _pusherServer = new Pusher({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.PUSHER_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster: process.env.PUSHER_CLUSTER!,
      useTLS: true,
    });
  }
  return _pusherServer;
}

// Server-side Pusher — singleton
export const pusherServer = hasPusherServer
  ? (() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Pusher = require("pusher");
      return new Pusher({
        appId: process.env.PUSHER_APP_ID!,
        key: process.env.PUSHER_KEY!,
        secret: process.env.PUSHER_SECRET!,
        cluster: process.env.PUSHER_CLUSTER!,
        useTLS: true,
      });
    })()
  : {
      trigger: async () => { console.warn("Pusher not configured. Skipping trigger."); return {}; },
      authorizeChannel: () => ({ auth: "dummy" }),
    } as any;

// Client-side Pusher (singleton for browser)
let pusherClientInstance: PusherClient | null = null;

export function getPusherClient(): PusherClient | null {
  if (!hasPusherClient) return null;
  if (!pusherClientInstance) {
    pusherClientInstance = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      authEndpoint: "/api/pusher/auth",
    });
  }
  return pusherClientInstance;
}

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


// components/mobile/PlayerStrip.tsx
"use client";

import React from "react";
import type { Turn } from "@/hooks/useGameTurn"; // assuming Turn type export, otherwise any
import { PLAYER_COLORS } from "../game/GameRoomContent"; // re‑use color array

interface PlayerStripProps {
  turn: any; // use any to avoid importing internal types
  stableUserId?: string;
}

export default function PlayerStrip({ turn, stableUserId }: PlayerStripProps) {
  const { gameState, room, isLocal, connectionStatus } = turn;
  const players = gameState?.players || [];

  return (
    <div className="w-full md:w-80 bg-white/50 backdrop-blur-md border-r border-gray-200 p-3 flex flex-col gap-3 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xl">💰</span>
          <span className="font-black text-sm tracking-tight">WealthCraft</span>
        </div>
      </div>

      {/* Connection Status */}
      {!isLocal && (
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-colors ${
            connectionStatus === "connected"
              ? "bg-green-50 text-green-700 border-green-100"
              : connectionStatus === "connecting"
              ? "bg-amber-50 text-amber-700 border-amber-100 animate-pulse"
              : "bg-red-50 text-red-700 border-red-100 animate-pulse"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              connectionStatus === "connected"
                ? "bg-green-500"
                : connectionStatus === "connecting"
                ? "bg-amber-500 animate-ping"
                : "bg-red-500"
            }`}
          />
          {connectionStatus === "connected"
            ? "Online Sync Active"
            : connectionStatus === "connecting"
            ? "Reconnecting..."
            : "Offline (Polling Fallback)"}
        </div>
      )}

      {/* Player list */}
      <div className="space-y-3">
        {players.map((p: any, i: number) => (
          <div
            key={p.id}
            className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100"
          >
            <div
              className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs"
            >
              {p.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <span className="font-bold text-sm text-[var(--navy)]">{p.name}</span>
            {room?.hostId && p.id === room.hostId && (
              <span className="ml-auto text-[8px] font-black uppercase bg-yellow-100 text-yellow-700 px-2 py-1 rounded-md">
                Host
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

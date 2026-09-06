// components/mobile/PlayerStrip.tsx
import React from "react";
import type { PlayerState } from "@/lib/db/schema";
import { netWorth } from "@/lib/game-engine/actions";

const PLAYER_COLORS = ["#4361ee", "#f77f00", "#7b2d8b", "#d62828"];

interface PlayerStripProps {
  turn: ReturnType<typeof import("@/hooks/useGameTurn").useGameTurn>;
}

export default function PlayerStrip({ turn }: PlayerStripProps) {
  const { gameState, myPlayer } = turn ?? {};
  const players: PlayerState[] = gameState?.players ?? [];
  const currentIdx = gameState?.currentPlayerIndex ?? 0;
  const year = gameState?.year ?? 1;

  return (
    <div
      id="player-strip"
      className="w-[23vw] max-w-[130px] min-w-[100px] bg-white border-r border-[#e8e0d0] flex flex-col flex-shrink-0 overflow-hidden select-none"
    >
      {players.map((player, idx) => {
        const isCurrent = idx === currentIdx;
        const isMe = myPlayer ? player.id === myPlayer.id : isCurrent;
        const nw = netWorth(player);
        const avatarColor = PLAYER_COLORS[idx % PLAYER_COLORS.length];
        const isBot = player.isBot || player.name.toLowerCase().includes("bot") || player.name.toLowerCase().includes("inv.");

        return (
          <div
            key={player.id}
            className={`player-card flex-1 p-[clamp(4px,1vh,8px)] border-b border-[#f0e8d8] flex flex-col justify-center overflow-hidden transition-colors ${
              isCurrent
                ? "bg-gradient-to-b from-[#fff8ed] to-[#fef2dc] border-l-[3px] border-l-[#e6a817] shadow-[inset_0_0_0_1px_rgba(230,168,23,0.3)] relative"
                : "border-l-[3px] border-l-transparent"
            }`}
          >
            <div className="flex items-center gap-[clamp(3px,0.6vw,6px)]">
              <div
                className="w-[clamp(16px,2.8vw,22px)] h-[clamp(16px,2.8vw,22px)] rounded-full flex items-center justify-center text-[clamp(7px,1.2vw,10px)] font-bold text-white flex-shrink-0"
                style={{ backgroundColor: avatarColor }}
              >
                {player.name ? player.name.charAt(0).toUpperCase() : "P"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[clamp(8px,1.3vw,11px)] font-semibold text-[#1a1a1a] truncate leading-tight">
                  {player.name}
                </div>
                {isBot && (
                  <div className="text-[clamp(6px,1vw,8px)] font-bold text-[#e6a817] leading-none">
                    BOT
                  </div>
                )}
              </div>
            </div>

            {/* If it's the current player, show active details */}
            {isCurrent ? (
              <div className="mt-1 flex flex-col">
                {isMe && (
                  <div className="inline-flex items-center gap-1 bg-[#e6a817] text-white text-[clamp(6px,0.9vw,8px)] font-extrabold px-1.5 py-0.5 rounded-full shadow-sm w-fit animate-pulse mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-white flex-shrink-0" />
                    YOUR TURN
                  </div>
                )}
                <div className="text-[clamp(6px,0.85vw,8px)] text-[#999] uppercase tracking-wider leading-none">
                  Net Worth
                </div>
                <div className="text-[clamp(11px,1.8vw,15px)] font-bold text-[#1a1a1a] leading-tight">
                  {nw}L
                </div>
                <div className="text-[clamp(7px,1vw,9px)] text-[#666] leading-tight mt-0.5 font-medium">
                  Cash {player.cash}L · B {player.bonds}L · S {player.stocks}L
                </div>
                <div className="text-[clamp(6px,0.9vw,8px)] text-[#888] mt-0.5 truncate">
                  {player.hasHouse ? "🏡 House" : "No house"} · Yr {year}
                </div>
              </div>
            ) : (
              /* Inactive players: compact net worth display */
              <div className="text-[clamp(11px,1.8vw,15px)] font-bold text-[#1a1a1a] mt-1">
                {nw}L
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

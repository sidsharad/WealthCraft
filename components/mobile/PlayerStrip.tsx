// components/mobile/PlayerStrip.tsx
import React from "react";

import type { PlayerState } from "@/lib/db/schema";


interface PlayerStripProps {
  turn: ReturnType<typeof import("@/hooks/useGameTurn").useGameTurn>;
}

export default function PlayerStrip({ turn }: PlayerStripProps) {
  const { gameState } = turn ?? {};
  const players: PlayerState[] = gameState?.players ?? [];
  const currentIdx = gameState?.currentPlayerIndex;

  return (
    <div className="player-strip">
      {players.map((player, idx) => {
        const isCurrent = idx === currentIdx;
        return (
          <div key={player.id} className={`player-item ${isCurrent ? "current-player" : ""}`}>
            <div className="player-avatar">
              {/* Simple avatar placeholder */}
              <span>{player.name?.charAt(0) ?? "?"}</span>
            </div>
            <div className="player-info">
              <div className="player-name">{player.name}</div>
              <div className="player-resources">
                <span className="resource cash">💰 {player.cash}</span>
                <span className="resource bonds">📄 {player.bonds}</span>
                <span className="resource stocks">📈 {player.stocks}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

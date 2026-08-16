// components/mobile/PanelOverlay.tsx
import React from "react";

interface PanelOverlayProps {
  activePanel: string | null; // "log" | "rules" | null
  turn: ReturnType<typeof import("@/hooks/useGameTurn").useGameTurn>;
  onClose: () => void;
}

export default function PanelOverlay({ activePanel, turn, onClose }: PanelOverlayProps) {
  const title = activePanel === "log" ? "Game Log" : activePanel === "rules" ? "Game Rules" : "";

  return (
    <div id="panel-overlay" className={activePanel ? "open" : ""}>
      <div id="panel-header">
        <span id="panel-title">{title}</span>
        <button id="panel-close" onClick={onClose}>✕</button>
      </div>
      <div id="panel-body">
        {/* Placeholder content */}
        {activePanel === "log" && (
            <div>
              {turn.gameState?.log && Array.isArray(turn.gameState.log) ? (
              turn.gameState.log.map((entry: unknown, idx: number) => (
                <div key={idx} className="log-entry">
                  {(() => {
                    if (typeof entry === "object" && entry !== null && "turn" in entry && "text" in entry) {
                      const e = entry as { turn: number; text: string };
                      return `${e.turn}: ${e.text}`;
                    }
                    return String(entry);
                  })()}
                </div>
              ))
            ) : (
              <p>No log available.</p>
            )}
            </div>
          )}
        {activePanel === "rules" && (
          <div>
            <p>Game rules will be displayed here.</p>
          </div>
        )}
      </div>
    </div>
  );
}

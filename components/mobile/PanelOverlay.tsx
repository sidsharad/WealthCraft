import React, { useRef, useEffect, useMemo } from "react";
import { format } from "date-fns";

interface PanelOverlayProps {
  activePanel: string | null; // "log" | "rules" | null
  turn: ReturnType<typeof import("@/hooks/useGameTurn").useGameTurn>;
  onClose: () => void;
}

export default function PanelOverlay({ activePanel, turn, onClose }: PanelOverlayProps) {
  const title = activePanel === "log" ? "Game Log" : activePanel === "rules" ? "Game Rules" : "";
  const log = useMemo(() => turn.gameState?.log || [], [turn.gameState?.log]);
  const logScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activePanel === "log" && logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [activePanel, log]);

  const getLogTypeColor = (text: string) => {
    if (text.includes("+") || text.includes("bonus") || text.includes("won")) return "text-[#1a7a3a]";
    if (text.includes("-") || text.includes("Emergency") || text.includes("Crash") || text.includes("penalty")) return "text-[#c0392b]";
    return "text-[#444]";
  };

  return (
    <div
      id="panel-overlay"
      className={`fixed top-0 bottom-0 right-[clamp(36px,5.5vw,48px)] w-[min(280px,45vw)] bg-white border-l border-[#e8e0d0] flex flex-col z-[100] shadow-[-4px_0_20px_rgba(0,0,0,0.12)] transition-transform duration-200 ease-out ${
        activePanel ? "translate-x-0" : "translate-x-[110%] pointer-events-none"
      }`}
    >
      <div
        id="panel-header"
        className="h-[clamp(34px,6vh,44px)] flex items-center justify-between px-3.5 border-b border-[#f0e8d8] bg-[#fff8ed] flex-shrink-0"
      >
        <span id="panel-title" className="text-[clamp(11px,1.6vw,14px)] font-bold text-[#1a1a1a]">
          {title}
        </span>
        <button
          id="panel-close"
          type="button"
          onClick={onClose}
          className="w-6 h-6 rounded-full bg-[#f0e8d8] border-none cursor-pointer flex items-center justify-center text-xs text-[#666] active:bg-[#e0d4c0]"
        >
          ✕
        </button>
      </div>

      <div
        id="panel-body"
        ref={logScrollRef}
        className="flex-1 overflow-y-auto p-3 text-[clamp(10px,1.4vw,12px)] leading-normal"
      >
        {activePanel === "log" && (
          <div>
            {log.length === 0 ? (
              <p className="text-[#999] text-center py-4">No events logged yet.</p>
            ) : (
              log.map((entry, idx) => (
                <div key={idx} className="border-b border-[#f5f0e8] py-1.5 last:border-b-0">
                  <div className="text-[clamp(8px,1vw,10px)] text-[#aaa] font-semibold mb-0.5 flex justify-between">
                    <span>Turn {entry.turn}</span>
                    {entry.timestamp && (
                      <span>{format(new Date(entry.timestamp), "HH:mm:ss")}</span>
                    )}
                  </div>
                  <div className={`font-medium ${getLogTypeColor(entry.text)}`}>
                    {entry.text}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activePanel === "rules" && (
          <div className="space-y-3.5">
            {/* Market Returns */}
            <div className="rules-section">
              <div className="text-[clamp(8px,1.1vw,10px)] font-bold text-[#e6a817] uppercase tracking-wider mb-1.5">
                Market Returns (Year-End)
              </div>
              <div className="space-y-1">
                <div className="flex justify-between py-0.5">
                  <span className="text-[#444]">Bonds Return</span>
                  <span className="font-bold text-[#27ae60]">+1L / 5L held</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-[#444]">Stocks Return</span>
                  <span className="font-bold text-[#27ae60]">+2L / 5L held</span>
                </div>
              </div>
            </div>

            {/* Market Events */}
            <div className="rules-section">
              <div className="text-[clamp(8px,1.1vw,10px)] font-bold text-[#e6a817] uppercase tracking-wider mb-1.5">
                Market Events (Per 5L Stocks)
              </div>
              <div className="space-y-1">
                <div className="flex justify-between py-0.5">
                  <span className="text-[#444]">Stock Rally (You)</span>
                  <span className="font-bold text-[#27ae60]">+2L Stocks</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-[#444]">Stock Crash (You)</span>
                  <span className="font-bold text-[#c0392b]">-2L Stocks</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-[#444]">Market Rally (All)</span>
                  <span className="font-bold text-[#27ae60]">+3L Stocks</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-[#444]">Market Crash (All)</span>
                  <span className="font-bold text-[#c0392b]">-3L Stocks</span>
                </div>
              </div>
            </div>

            {/* Core Objectives */}
            <div className="rules-section">
              <div className="text-[clamp(8px,1.1vw,10px)] font-bold text-[#e6a817] uppercase tracking-wider mb-1.5">
                Core Objectives
              </div>
              <ul className="space-y-1 text-[#444]">
                <li className="relative pl-3 before:content-['•'] before:absolute before:left-0 before:text-[#e6a817]">
                  <strong>100L Net Worth:</strong> Reach 100L assets to win the game.
                </li>
                <li className="relative pl-3 before:content-['•'] before:absolute before:left-0 before:text-[#e6a817]">
                  <strong>House Deadline:</strong> Must buy by end of Year 3 or auto-bought at 20L on Year 4.
                </li>
                <li className="relative pl-3 before:content-['•'] before:absolute before:left-0 before:text-[#e6a817]">
                  <strong>Asset Limit:</strong> Max 40L in any one asset type to avoid tax audits.
                </li>
              </ul>
            </div>

            {/* Costs & Actions */}
            <div className="rules-section">
              <div className="text-[clamp(8px,1.1vw,10px)] font-bold text-[#e6a817] uppercase tracking-wider mb-1.5">
                Costs & Actions
              </div>
              <ul className="space-y-1 text-[#444]">
                <li className="relative pl-3 before:content-['•'] before:absolute before:left-0 before:text-[#e6a817]">
                  <strong>Mid-Year Rebalance:</strong> Costs 3L fine (Free at Year End).
                </li>
                <li className="relative pl-3 before:content-['•'] before:absolute before:left-0 before:text-[#e6a817]">
                  <strong>Tax Raid:</strong> Proposer pays 2L to audit. Target pays 5L if over limit.
                </li>
                <li className="relative pl-3 before:content-['•'] before:absolute before:left-0 before:text-[#e6a817]">
                  <strong>Hostile Takeover:</strong> Take up to 5L of one asset from another player.
                </li>
                <li className="relative pl-3 before:content-['•'] before:absolute before:left-0 before:text-[#e6a817]">
                  <strong>Emergency:</strong> Costs 5L or 10L paid in Cash.
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

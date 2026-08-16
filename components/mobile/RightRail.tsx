// components/mobile/RightRail.tsx
import React from "react";

interface RightRailProps {
  activePanel: string | null;
  setActivePanel: (panel: string | null) => void;
  turn: ReturnType<typeof import("@/hooks/useGameTurn").useGameTurn>;
}

export default function RightRail({ activePanel, setActivePanel }: RightRailProps) {
  return (
    <div id="right-rail" className="w-[clamp(36px,5.5vw,48px)] bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
      {/* Log Tab */}
      <button
        className="rail-tab flex-1 flex flex-col items-center justify-center gap-1"
        onClick={() => setActivePanel(activePanel === "log" ? null : "log")}
      >
        <span className="tab-icon">📝</span>
        <span className="tab-label text-xs text-gray-500">Log</span>
      </button>
      {/* Divider */}
      <div className="rail-divider h-px bg-gray-200" />
      {/* Rules Tab */}
      <button
        className="rail-tab flex-1 flex flex-col items-center justify-center gap-1"
        onClick={() => setActivePanel(activePanel === "rules" ? null : "rules")}
      >
        <span className="tab-icon">📜</span>
        <span className="tab-label text-xs text-gray-500">Rules</span>
      </button>
    </div>
  );
}

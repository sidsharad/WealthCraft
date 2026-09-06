// components/mobile/RightRail.tsx
import React from "react";

interface RightRailProps {
  activePanel: string | null;
  setActivePanel: (panel: string | null) => void;
  turn: ReturnType<typeof import("@/hooks/useGameTurn").useGameTurn>;
}

export default function RightRail({ activePanel, setActivePanel }: RightRailProps) {
  return (
    <div
      id="right-rail"
      className="w-[clamp(36px,5.5vw,48px)] bg-white border-l border-[#e8e0d0] flex flex-col flex-shrink-0 select-none z-10"
    >
      {/* Log Tab */}
      <button
        type="button"
        className={`rail-tab flex-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer border-none bg-transparent active:bg-[#f5f0e8] transition-colors ${
          activePanel === "log" ? "bg-[#fff8ed] text-[#e6a817]" : ""
        }`}
        onClick={() => setActivePanel(activePanel === "log" ? null : "log")}
      >
        <span className="tab-icon text-[clamp(14px,2.2vw,18px)]">📋</span>
        <span className="tab-label text-[clamp(7px,1vw,9px)] text-[#888] font-medium">Log</span>
      </button>

      {/* Divider */}
      <div className="rail-divider h-px bg-[#e8e0d0] flex-shrink-0" />

      {/* Rules Tab */}
      <button
        type="button"
        className={`rail-tab flex-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer border-none bg-transparent active:bg-[#f5f0e8] transition-colors ${
          activePanel === "rules" ? "bg-[#fff8ed] text-[#e6a817]" : ""
        }`}
        onClick={() => setActivePanel(activePanel === "rules" ? null : "rules")}
      >
        <span className="tab-icon text-[clamp(14px,2.2vw,18px)]">📖</span>
        <span className="tab-label text-[clamp(7px,1vw,9px)] text-[#888] font-medium">Rules</span>
      </button>
    </div>
  );
}

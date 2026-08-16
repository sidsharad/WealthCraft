"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useGameTurn } from "@/hooks/useGameTurn";
import Board from "@/components/board/Board";
import PlayerStrip from "@/components/mobile/PlayerStrip";
import ActionBar from "@/components/mobile/ActionBar";
import PortraitLockOverlay from "@/components/mobile/PortraitLockOverlay";
import RightRail from "@/components/mobile/RightRail";
import PanelOverlay from "@/components/mobile/PanelOverlay";
import { TILES } from "@/lib/game-engine/tiles";

export default function MobileGameRoom() {
  const { code } = useParams() as { code: string };
  const isLocal = code === "play-local";
  const turn = useGameTurn({ code, isLocal });

  const [isPortrait, setIsPortrait] = useState(false);
  const [activePanel, setActivePanel] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setIsPortrait(window.innerHeight > window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  if (isPortrait) return <PortraitLockOverlay />;

  if (turn.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--cream)]">
        <div className="animate-spin text-4xl">💰</div>
      </div>
    );
  }

  if (turn.error && !turn.gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-6">
        <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-sm">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Error</h2>
          <p className="text-gray-500 text-sm mb-6">{turn.error}</p>
        </div>
      </div>
    );
  }

  if (!turn.gameState) return null;

  return (
    <div id="app" className="flex h-screen bg-[var(--cream)]">
      <PlayerStrip turn={turn} />
      <div id="center" className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="flex-1 overflow-y-auto">
          <Board
            tiles={TILES}
            players={turn.gameState.players}
            rolling={turn.rolling}
            dice={turn.lastDice}
            overlayMessage={turn.overlayMessage}
            announcement={turn.gameState.announcement}
            privateMessage={turn.myPrivateMessage}
            disabled={turn.isInitialSetup}
          />
        </div>
        <ActionBar turn={turn} />
        <div id="bottom-spacer" style={{ height: 'var(--actionbar-h)' }} />
      </div>
      <RightRail activePanel={activePanel} setActivePanel={setActivePanel} turn={turn} />
      {activePanel && (
        <PanelOverlay activePanel={activePanel} turn={turn} onClose={() => setActivePanel(null)} />
      )}
    </div>
  );
}

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
import TargetedActionModal from "@/components/game/TargetedActionModal";
import ChoiceModal from "@/components/game/ChoiceModal";
import PassDeviceScreen from "@/components/game/PassDeviceScreen";
import TradeResponseModal from "@/components/game/TradeResponseModal";
import OpenTradeModal from "@/components/game/OpenTradeModal";
import EndgameNotifyModal from "@/components/game/EndgameNotifyModal";

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

      {/* Modals from Desktop page.tsx ported to Mobile */}
      {turn.showTargetedAction && (
        <TargetedActionModal
          isOpen={true}
          type={turn.showTargetedAction}
          currentPlayer={turn.currentPlayer!}
          otherPlayers={turn.gameState.players.map((p, i) => ({ player: p, originalIndex: i })).filter(x => x.player.id !== turn.currentPlayer?.id)}
          onConfirm={(payload) => {
            const currentAction = turn.showTargetedAction;
            turn.setShowTargetedAction(null);
            if (currentAction === "audit") {
              turn.performAction("audit", payload);
            } else {
              turn.performAction("tile-action", payload);
            }
          }}
          onClose={() => turn.setShowTargetedAction(null)}
        />
      )}

      {turn.showChoiceModal && (
        <ChoiceModal
          isOpen={!!turn.showChoiceModal && !turn.showPassDevice && !turn.initialPreview}
          type={turn.showChoiceModal}
          playerCash={turn.currentPlayer?.cash || 0}
          emergencyAmount={turn.pendingEmergencyAmount ?? undefined}
          onConfirm={(payload) => {
            const currentModal = turn.showChoiceModal;
            turn.setShowChoiceModal(null);
            if (currentModal === "emergency-decision") {
              turn.performAction("emergency-decision", payload);
            } else {
              turn.performAction("tile-action", payload);
            }
          }}
          onClose={() => turn.setShowChoiceModal(null)}
        />
      )}

      {turn.showPassDevice && (
        <PassDeviceScreen
          nextPlayerName={(turn.gameState?.phase === "auction" ? turn.currentBiddingPlayer?.name : (turn.gameState?.phase === "waiting-trade" ? turn.gameState.players.find(p => p.id === turn.gameState!.pendingTrade?.toPlayerId)?.name : turn.currentPlayer?.name)) || "Next Player"}
          onContinue={() => turn.setShowPassDevice(false)}
        />
      )}

      {turn.gameState.pendingTrade?.tradeType !== "open" ? (
        <TradeResponseModal
          isOpen={
            turn.gameState.phase === "waiting-trade" &&
            (isLocal || turn.gameState.pendingTrade?.toPlayerId === turn.stableUserId)
          }
          offer={turn.gameState!.pendingTrade!}
          fromPlayer={turn.gameState!.players.find(p => p.id === turn.gameState!.pendingTrade?.fromPlayerId)!}
          toPlayer={turn.gameState!.players.find(p => p.id === turn.gameState!.pendingTrade?.toPlayerId)!}
          onResponse={(accept) => turn.performAction("trade-response", { accept })}
        />
      ) : (
        <OpenTradeModal
          isOpen={turn.gameState.phase === "waiting-trade"}
          offer={turn.gameState!.pendingTrade!}
          currentPlayer={(isLocal ? turn.currentPlayer : turn.gameState!.players.find(p => p.id === turn.stableUserId)) || turn.currentPlayer!}
          players={turn.gameState!.players}
          onResponse={(accept) => turn.performAction("trade-response", { accept, responderId: turn.stableUserId })}
          onSelectWinner={(winnerId) => turn.performAction("open-trade-select", { winnerId })}
        />
      )}

      <EndgameNotifyModal
        isOpen={turn.gameState.endgameCandidate === true && turn.gameState.endgameTriggerAcknowledged === false}
        type="trigger"
        triggerPlayer={turn.gameState.players.find(p => p.id === turn.gameState!.endgameTriggeredByPlayerId)}
        onContinue={() => turn.performAction("acknowledge-endgame-trigger")}
      />

      <EndgameNotifyModal
        isOpen={turn.gameState.endgameCandidate === false && turn.gameState.endgameCancelledAcknowledged === false}
        type="cancelled"
        onContinue={() => turn.performAction("acknowledge-endgame-cancellation")}
      />

    </div>
  );
}

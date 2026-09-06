"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useGameTurn } from "@/hooks/useGameTurn";
import Board from "@/components/board/Board";
import PlayerStrip from "@/components/mobile/PlayerStrip";
import ActionBar from "@/components/mobile/ActionBar";
import PortraitLockOverlay from "@/components/mobile/PortraitLockOverlay";
import RightRail from "@/components/mobile/RightRail";
import PanelOverlay from "@/components/mobile/PanelOverlay";
import { TILES, HOUSE_MARKET_PRICE, HOUSE_AUCTION_MIN } from "@/lib/game-engine/tiles";
import { netWorth } from "@/lib/game-engine/actions";
import { ArrowRight, User } from "lucide-react";

// Shared game modals
import TradeModal from "@/components/game/TradeModal";
import AuctionModal from "@/components/game/AuctionModal";
import RebalanceModal from "@/components/game/RebalanceModal";
import LeadersDilemmaModal from "@/components/game/LeadersDilemmaModal";
import TargetedActionModal from "@/components/game/TargetedActionModal";
import ChoiceModal from "@/components/game/ChoiceModal";
import TradeResponseModal from "@/components/game/TradeResponseModal";
import OpenTradeModal from "@/components/game/OpenTradeModal";
import EndgameNotifyModal from "@/components/game/EndgameNotifyModal";
import { GameOverScreen } from "@/components/game/GameOverScreen";

export default function MobileGameRoom() {
  const { code } = useParams() as { code: string };
  const { data: session } = useSession();
  const router = useRouter();
  const isLocal = code === "play-local";
  const userId = (session?.user as { id?: string })?.id;

  const stableUserId = userId || (typeof window !== "undefined" ? localStorage.getItem("wc_user_id") || undefined : undefined);

  useEffect(() => {
    if (userId && typeof window !== "undefined") {
      localStorage.setItem("wc_user_id", userId);
    }
  }, [userId]);

  const turn = useGameTurn({ code, isLocal, userId: stableUserId });

  const [isPortrait, setIsPortrait] = useState(false);
  const [activePanel, setActivePanel] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      if (typeof window !== "undefined") {
        setIsPortrait(window.innerHeight > window.innerWidth);
      }
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
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
          <button
            onClick={() => router.push("/lobby")}
            className="btn-primary w-full"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  if (!turn.gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--cream)] p-6">
        <div className="bg-white p-8 rounded-3xl shadow-xl text-center max-w-md border-4 border-[var(--gold)]">
          <h2 className="text-2xl font-black text-[var(--navy)] mb-2">Waiting for Host...</h2>
          <p className="text-gray-500 text-sm mb-4">Share the code with your friends to join.</p>
          <div className="bg-gray-100 p-4 rounded-xl mb-4">
            <span className="text-3xl font-black tracking-widest text-[var(--navy)]">{code}</span>
          </div>
          {(isLocal || stableUserId === turn.room?.hostId) ? (
            <button onClick={() => turn.performAction("start")} className="btn-primary w-full py-3 text-base">
              Start Game
            </button>
          ) : (
            <div className="bg-blue-50 text-blue-700 p-3 rounded-xl text-sm font-bold animate-pulse">
              Waiting for host to start the game...
            </div>
          )}
        </div>
      </div>
    );
  }

  const nextPlayerDisplayName =
    (turn.gameState?.phase === "auction"
      ? turn.currentBiddingPlayer?.name
      : turn.gameState?.phase === "waiting-trade"
      ? turn.gameState.players.find(p => p.id === turn.gameState!.pendingTrade?.toPlayerId)?.name
      : turn.currentPlayer?.name) || "Next Player";

  return (
    <div
      id="app"
      className="fixed inset-0 flex flex-row overflow-hidden bg-[#fef5e4] select-none"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingRight: "env(safe-area-inset-right)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
      }}
    >
      {/* Game Over Screen */}
      {turn.gameState?.phase === "finished" && (
        <GameOverScreen
          gameState={turn.gameState}
          onExit={() => router.push("/lobby")}
        />
      )}

      {/* LEFT: Player Strip */}
      <PlayerStrip turn={turn} />

      {/* CENTER: Board + Live Centerpiece + Action Bar */}
      <div id="center" className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#fef5e4]">
        {/* Board Container */}
        <div className="flex-1 flex items-center justify-center p-[clamp(2px,0.8vw,6px)] min-h-0 overflow-hidden">
          <Board
            tiles={TILES}
            players={turn.gameState.players}
            onTileClick={() => {}}
            rolling={turn.rolling}
            dice={turn.lastDice}
            overlayMessage={turn.botThinkingMessage || turn.overlayMessage}
            announcement={turn.gameState.announcement}
            privateMessage={turn.myPrivateMessage}
            disabled={turn.isInitialSetup}
          />
        </div>

        {/* Action Bar */}
        <ActionBar turn={turn} />
      </div>

      {/* RIGHT: Tab Rail */}
      <RightRail
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        turn={turn}
      />

      {/* Side Slide-in Panel (Log / Rules) */}
      <PanelOverlay
        activePanel={activePanel}
        turn={turn}
        onClose={() => setActivePanel(null)}
      />

      {/* ─── FULL MODAL SUITE FOR MOBILE ─── */}

      {/* Trade Proposal Modal */}
      <TradeModal
        isOpen={turn.showTrade && !turn.showPassDevice && !turn.initialPreview}
        onClose={() => turn.setShowTrade(false)}
        currentPlayer={turn.currentPlayer!}
        otherPlayers={turn.gameState.players.filter(p => p.id !== turn.currentPlayer?.id)}
        onPropose={(targetId, offer, request, tradeType) => {
          turn.performAction("trade-offer", { toPlayerId: targetId, offer, request, tradeType });
          turn.setShowTrade(false);
        }}
      />

      {/* Auction Modal */}
      <AuctionModal
        isOpen={turn.showAuction && turn.gameState.phase === "auction" && !turn.showPassDevice && !turn.initialPreview}
        currentPlayer={isLocal ? (turn.currentBiddingPlayer || turn.currentPlayer!) : turn.gameState.players.find(p => p.id === stableUserId)!}
        hasBid={isLocal ? !turn.currentBiddingPlayer : !!turn.gameState.auctionState?.bids.find(b => b.playerId === stableUserId)}
        onBid={(amount) => {
          const bidderId = isLocal ? turn.currentBiddingPlayer?.id : stableUserId;
          turn.performAction("bid", { amount, bidderId });
          turn.setShowAuction(false);
        }}
        minBid={HOUSE_AUCTION_MIN}
        marketPrice={HOUSE_MARKET_PRICE}
        onClose={() => turn.setShowAuction(false)}
      />

      {/* Full Interactive Rebalance Modal */}
      <RebalanceModal
        isOpen={(turn.gameState.phase === "year-end" || turn.showRebalance) && turn.isMyTurn && !turn.showPassDevice && !turn.initialPreview}
        player={turn.currentPlayer!}
        penalty={turn.rebalancePenaltyOverride !== null ? turn.rebalancePenaltyOverride : (turn.gameState.phase !== "year-end" ? 3 : 0)}
        emergencyAmount={turn.pendingEmergencyAmount ?? undefined}
        onRebalance={(c, b, s) => {
          turn.handleRebalance(c, b, s);
        }}
        onClose={turn.rebalancePenaltyOverride !== null ? undefined : () => turn.setShowRebalance(false)}
        externalTimeLeft={turn.timeLeft}
        skipReturnsDelay={turn.gameState.phase !== "year-end"}
      />

      {/* Leader's Dilemma Modal */}
      {turn.showLeadersDilemma && (
        <LeadersDilemmaModal
          isOpen={true}
          player={turn.currentPlayer!}
          onDeclare={() => turn.performAction("declare")}
          onAudit={(idx) => turn.performAction("audit", { targetIdx: idx })}
          otherPlayers={turn.gameState.players.filter(p => p.id !== turn.currentPlayer?.id)}
          isCurrentTurn={turn.isMyTurn}
          needsToDeclare={netWorth(turn.currentPlayer!) >= 70 && !turn.currentPlayer?.wealthDeclared}
        />
      )}

      {/* Targeted Action Modal (Audit / Takeover) */}
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

      {/* Choice Modal (Emergency Decision / Lottery / IPO) */}
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

      {/* Compact Landscape Pass-Device Screen for Mobile */}
      {turn.showPassDevice && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--navy)]/95 backdrop-blur-sm p-4">
          <div className="text-center max-w-sm bg-white/10 p-5 rounded-2xl border border-white/20 shadow-2xl flex flex-col items-center">
            <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mb-2">
              <User size={24} className="text-[var(--gold)]" />
            </div>
            <h2 className="text-xl font-black text-white uppercase tracking-tight mb-1">
              Pass the Device
            </h2>
            <p className="text-sm text-white/80 mb-3">
              It&apos;s <span className="text-[var(--gold)] font-black">{nextPlayerDisplayName}&apos;s</span> turn.
            </p>
            <button
              onClick={() => turn.setShowPassDevice(false)}
              className="btn-primary flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold w-full"
            >
              I am {nextPlayerDisplayName} <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Trade Response Modal */}
      {turn.gameState.pendingTrade?.tradeType !== "open" ? (
        <TradeResponseModal
          isOpen={
            turn.gameState.phase === "waiting-trade" &&
            (isLocal || turn.gameState.pendingTrade?.toPlayerId === turn.myPlayer?.id)
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
          currentPlayer={(isLocal ? turn.currentPlayer : turn.gameState!.players.find(p => p.id === turn.myPlayer?.id)) || turn.currentPlayer!}
          players={turn.gameState!.players}
          onResponse={(accept) => turn.performAction("trade-response", { accept, responderId: turn.myPlayer?.id })}
          onSelectWinner={(winnerId) => turn.performAction("open-trade-select", { winnerId })}
        />
      )}

      {/* Endgame Notifications */}
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

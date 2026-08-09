// components/mobile/MobileGameRoom.tsx
"use client";

import React from "react";
import { useGameTurn } from "@/hooks/useGameTurn";
import { TILES, HOUSE_MARKET_PRICE, HOUSE_AUCTION_MIN } from "@/lib/game-engine/tiles";
import Board from "@/components/board/Board";
import GameLog from "@/components/game/GameLog";
import TradeModal from "@/components/game/TradeModal";
import AuctionModal from "@/components/game/AuctionModal";
import RebalanceModal from "@/components/game/RebalanceModal";
import LeadersDilemmaModal from "@/components/game/LeadersDilemmaModal";
import TargetedActionModal from "@/components/game/TargetedActionModal";
import ChoiceModal from "@/components/game/ChoiceModal";
import PassDeviceScreen from "@/components/game/PassDeviceScreen";
import TradeResponseModal from "@/components/game/TradeResponseModal";
import OpenTradeModal from "@/components/game/OpenTradeModal";
import { GameOverScreen } from "@/components/game/GameOverScreen";
import EndgameNotifyModal from "@/components/game/EndgameNotifyModal";
import MobileLayout from "./MobileLayout";
import PlayerStrip from "./PlayerStrip";
import ActionBar from "./ActionBar";
import RightRail from "./RightRail";
import PortraitLockOverlay from "./PortraitLockOverlay";
import useIsMobileLandscape from "@/hooks/useIsMobileLandscape";

/**
 * Mobile version of the game room. It reuses the same turn logic and UI
 * components as the desktop version but arranges them for a landscape
 * mobile layout: left player strip, centre board (with commentary), bottom
 * action bar, and a right rail that slides in for Log/Rules.
 */
export default function MobileGameRoom() {
  const isMobileLandscape = useIsMobileLandscape();
  // Extract room code from URL for display
  const code = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("code") ?? "" : "";
  const turn = useGameTurn({
    code,
    isLocal: false,
    userId: undefined,
  });

  // If not landscape, show lock overlay.
  if (!isMobileLandscape) return <PortraitLockOverlay />;

  // Loading / error handling mirrors GameRoomContent.
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
          <button onClick={() => window.location.href = "/lobby"} className="btn-primary w-full">
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  if (!turn.gameState) {
    // Waiting for host – same as desktop.
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--cream)] p-6">
        <div className="bg-white p-10 rounded-3xl shadow-xl text-center max-w-md border-4 border-[var(--gold)]">
          <h2 className="text-2xl font-black text-[var(--navy)] mb-4">Waiting for Host...</h2>
          <p className="text-gray-500 mb-8">Share the code with your friends to join the game.</p>
          <div className="bg-gray-100 p-6 rounded-2xl mb-6">
            <span className="text-4xl font-black tracking-widest text-[var(--navy)]">{code}</span>
          </div>
          {/* Reuse the player strip for the host view */}
          <PlayerStrip turn={turn} />
          <button onClick={() => turn.performAction("start")} className="btn-primary w-full py-4 text-lg">
            Start Game
          </button>
        </div>
      </div>
    );
  }

  return (
    <MobileLayout>
      <div className="flex flex-1 overflow-hidden">
        {/* Left – Player strip */}
        <PlayerStrip turn={turn} />

        {/* Center – Board and game messages */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* Board */}
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

        {/* Right – Right rail */}
        <RightRail turn={turn} />
      </div>

      {/* Bottom action bar */}
      <ActionBar turn={turn} />

      {/* Modals – identical to desktop */}
      <TradeModal
        isOpen={turn.showTrade && !turn.showPassDevice && !turn.initialPreview}
        onClose={() => turn.setShowTrade(false)}
        currentPlayer={turn.currentPlayer!}
        otherPlayers={turn.gameState.players.filter((p: any) => p.id !== turn.currentPlayer?.id)}
        onPropose={(targetId, offer, request, tradeType) => {
          turn.performAction("trade-offer", { toPlayerId: targetId, offer, request, tradeType });
          turn.setShowTrade(false);
        }}
      />
      <AuctionModal
        isOpen={turn.showAuction && turn.gameState.phase === "auction" && !turn.showPassDevice && !turn.initialPreview}
        currentPlayer={turn.isLocal ? (turn.currentBiddingPlayer || turn.currentPlayer!) : turn.gameState.players.find((p: any) => p.id === turn.currentPlayer?.id)!}
        hasBid={turn.isLocal ? !turn.currentBiddingPlayer : !!turn.gameState.auctionState?.bids.find((b: any) => b.playerId === turn.currentPlayer?.id)}
        onBid={(amount) => {
          const bidderId = turn.isLocal ? turn.currentBiddingPlayer?.id : turn.currentPlayer?.id;
          turn.performAction("bid", { amount, bidderId });
          turn.setShowAuction(false);
        }}
        minBid={HOUSE_AUCTION_MIN}
        marketPrice={HOUSE_MARKET_PRICE}
        onClose={() => turn.setShowAuction(false)}
      />
      <RebalanceModal
        isOpen={(turn.gameState.phase === "year-end" || turn.showRebalance) && turn.isMyTurn && !turn.showPassDevice && !turn.initialPreview}
        player={turn.currentPlayer!}
        penalty={turn.rebalancePenaltyOverride !== null ? turn.rebalancePenaltyOverride : (turn.gameState.phase !== "year-end" ? 3 : 0)}
        emergencyAmount={turn.pendingEmergencyAmount ?? undefined}
        onRebalance={(c, b, s) => turn.handleRebalance(c, b, s)}
        onClose={turn.rebalancePenaltyOverride !== null ? undefined : () => turn.setShowRebalance(false)}
        externalTimeLeft={turn.timeLeft}
        skipReturnsDelay={turn.gameState.phase !== "year-end"}
      />
      <LeadersDilemmaModal
        isOpen={turn.showLeadersDilemma}
        player={turn.currentPlayer!}
        onDeclare={() => turn.performAction("declare")}
        onAudit={(idx) => turn.performAction("audit", { targetIdx: idx })}
        otherPlayers={turn.gameState.players.filter((p: any) => p.id !== turn.currentPlayer?.id)}
        isCurrentTurn={turn.isMyTurn}
        needsToDeclare={turn.netWorth(turn.currentPlayer!) >= 70 && !turn.currentPlayer?.wealthDeclared}
      />
      <TargetedActionModal
        isOpen={turn.showTargetedAction}
        type={turn.showTargetedAction}
        currentPlayer={turn.currentPlayer!}
        otherPlayers={turn.gameState.players.map((p: any, i: number) => ({ player: p, originalIndex: i })).filter((x: any) => x.player.id !== turn.currentPlayer?.id)}
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
      <PassDeviceScreen
        nextPlayerName={
          turn.gameState?.phase === "auction"
            ? turn.currentBiddingPlayer?.name
            : turn.gameState?.phase === "waiting-trade"
            ? turn.gameState!.pendingTrade?.toPlayerId
            : turn.currentPlayer?.name
        }
        onContinue={() => turn.setShowPassDevice(false)}
      />
      {turn.gameState.pendingTrade?.tradeType !== "open" ? (
        <TradeResponseModal
          isOpen={
            turn.gameState.phase === "waiting-trade" && (turn.isLocal || turn.gameState.pendingTrade?.toPlayerId === turn.currentPlayer?.id)
          }
          offer={turn.gameState!.pendingTrade!}
          fromPlayer={turn.gameState!.players.find((p: any) => p.id === turn.gameState!.pendingTrade?.fromPlayerId)!}
          toPlayer={turn.gameState!.players.find((p: any) => p.id === turn.gameState!.pendingTrade?.toPlayerId)!}
          onResponse={(accept) => turn.performAction("trade-response", { accept })}
        />
      ) : (
        <OpenTradeModal
          isOpen={turn.gameState.phase === "waiting-trade"}
          offer={turn.gameState!.pendingTrade!}
          currentPlayer={turn.isLocal ? turn.currentPlayer : turn.gameState!.players.find((p: any) => p.id === turn.currentPlayer?.id) || turn.currentPlayer!}
          players={turn.gameState!.players}
          onResponse={(accept) => turn.performAction("trade-response", { accept, responderId: turn.currentPlayer?.id })}
          onSelectWinner={(winnerId) => turn.performAction("open-trade-select", { winnerId })}
        />
      )}
      <EndgameNotifyModal
        isOpen={turn.gameState.endgameCandidate === true && !turn.gameState.endgameTriggerAcknowledged}
        type="trigger"
        triggerPlayer={turn.gameState.players.find((p: any) => p.id === turn.gameState!.endgameTriggeredByPlayerId)}
        onContinue={() => turn.performAction("acknowledge-endgame-trigger")}
      />
      <EndgameNotifyModal
        isOpen={turn.gameState.endgameCandidate === false && !turn.gameState.endgameCancelledAcknowledged}
        type="cancelled"
        onContinue={() => turn.performAction("acknowledge-endgame-cancellation")}
      />
      {turn.gameState?.phase === "finished" && (
        <GameOverScreen gameState={turn.gameState} onExit={() => window.location.href = "/lobby"} />
      )}
    </MobileLayout>
  );
}

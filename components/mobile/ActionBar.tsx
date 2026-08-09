// components/mobile/ActionBar.tsx
"use client";

import React from "react";
import TouchButton from "./TouchButton";
import { MessageSquare, ShieldAlert } from "lucide-react";

/**
 * ActionBar for mobile layout. Reuses the same turn handlers as desktop.
 * It receives the `turn` object returned by useGameTurn.
 */
export default function ActionBar({ turn }: any) {
  const isMyTurn = turn.isMyTurn;
  const isSetupPhase = turn.isSetupPhase;
  const diceMode = turn.diceMode;
  const rolling = turn.rolling;
  const lastDice = turn.lastDice;
  const disabledCommon =
    turn.isSubmitting || turn.isRecovering || turn.isPendingVersion;

  return (
    <div className="flex flex-col items-center p-2 bg-white/90 backdrop-blur-md rounded-3xl shadow-xl border border-white/50 md:hidden">
      {/* Dice Roller */}
      {!turn.isInitialSetup && (
        <TouchButton
          onClick={() => turn.handleRoll()}
          disabled={!turn.isMyTurn || (turn.gameState.phase !== "roll" && turn.diceMode !== "lottery") || disabledCommon}
          className="w-full mb-2"
        >
          {diceMode === "lottery" ? "Roll" : "Roll Dice"}
        </TouchButton>
      )}

      {/* Action Buttons */}
      {turn.isMyTurn && turn.diceMode !== "lottery" && (turn.gameState.phase === "action" || (turn.gameState.phase === "auction" && !turn.showAuction)) && (
        <TouchButton
          onClick={() => {
            if (turn.gameState.phase === "auction") turn.setShowAuction(true);
            else turn.handleTileAction();
          }}
          disabled={disabledCommon}
          className="w-full mb-2"
        >
          {turn.gameState.phase === "auction" ? "Join Auction" : "Execute Tile"}
        </TouchButton>
      )}

      {/* Trade */}
      {(turn.gameState.phase === "trade" || turn.gameState.phase === "year-end") && isMyTurn && (
        <TouchButton
          onClick={() => turn.setShowTrade(true)}
          disabled={turn.currentPlayer?.hasTraded || turn.gameState.phase === "year-end" || disabledCommon}
          className="w-full mb-2 flex items-center justify-center gap-2"
        >
          <MessageSquare size={16} /> Trade
        </TouchButton>
      )}

      {/* Rebalance */}
      {turn.gameState.phase === "year-end" && (
        <TouchButton
          onClick={() => turn.setShowRebalance(true)}
          disabled={disabledCommon}
          className="w-full mb-2"
        >
          Rebalance
        </TouchButton>
      )}

      {/* Audit */}
      {turn.gameState.phase === "audit" && (
        <TouchButton
          onClick={() => turn.setShowTargetedAction("audit")}
          disabled={disabledCommon}
          className="w-full mb-2 flex items-center justify-center gap-2"
        >
          <ShieldAlert size={16} /> Audit
        </TouchButton>
      )}

      {/* End Turn */}
      {turn.gameState.phase === "trade" && (
        <TouchButton
          onClick={turn.handleEndTurn}
          disabled={turn.isEndingTurn || disabledCommon}
          className="w-full mb-2"
        >
          {turn.isEndingTurn ? "..." : "Next Turn"}
        </TouchButton>
      )}
    </div>
  );
}

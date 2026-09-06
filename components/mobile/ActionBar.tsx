// components/mobile/ActionBar.tsx
import React from "react";
import TouchButton from "@/components/mobile/TouchButton";

type TurnHook = ReturnType<typeof import("@/hooks/useGameTurn").useGameTurn>;

interface ActionBarProps {
  turn: TurnHook;
}

export default function ActionBar({ turn }: ActionBarProps) {
  const {
    rolling,
    isEndingTurn,
    isSubmitting,
    isRecovering,
    isPendingVersion,
    isMyTurn,
    gameState,
    diceMode,
    currentPlayer,
    handleRoll,
    handleEndTurn,
    setShowTrade,
    setShowRebalance,
    setShowTargetedAction,
  } = turn;

  const phase = gameState?.phase;
  const isBusy = rolling || isEndingTurn || isSubmitting || isRecovering || isPendingVersion;

  // 1. Roll Dice is enabled when it's our turn, not busy, and in roll phase (or lottery mode)
  const canRoll =
    isMyTurn && !isBusy && (phase === "roll" || diceMode === "lottery");

  // 2. Trade is enabled when in trade phase and player hasn't traded yet
  const canTrade =
    isMyTurn && !isBusy && phase === "trade" && !currentPlayer?.hasTraded;

  // 3. Rebalance is enabled during trade phase or year-end phase
  const canRebalance =
    isMyTurn && !isBusy && (phase === "trade" || phase === "year-end");

  // 4. Audit is enabled during trade phase
  const canAudit =
    isMyTurn && !isBusy && phase === "trade";

  // 5. Next Turn is enabled during trade phase
  const canNextTurn =
    isMyTurn && !isBusy && phase === "trade";

  return (
    <div
      id="action-bar"
      className="h-[clamp(52px,11vh,64px)] bg-white border-t border-[#e8e0d0] flex items-center justify-center gap-[clamp(5px,1vw,10px)] px-[clamp(6px,1vw,12px)] flex-shrink-0 z-10"
    >
      {/* 1. ROLL DICE */}
      <TouchButton
        id="btn-roll"
        onClick={handleRoll}
        disabled={!canRoll}
        primary={canRoll}
      >
        🎲 {rolling ? "Rolling..." : diceMode === "lottery" ? "Roll" : "Roll Dice"}
      </TouchButton>

      {/* 2. TRADE */}
      <TouchButton
        id="btn-trade"
        onClick={() => setShowTrade(true)}
        disabled={!canTrade}
      >
        ⇄ Trade
      </TouchButton>

      {/* 3. REBALANCE */}
      <TouchButton
        id="btn-rebalance"
        onClick={() => setShowRebalance(true)}
        disabled={!canRebalance}
        primary={phase === "year-end" && isMyTurn}
      >
        ⚖ Rebalance
      </TouchButton>

      {/* 4. AUDIT */}
      <TouchButton
        id="btn-audit"
        onClick={() => setShowTargetedAction("audit")}
        disabled={!canAudit}
      >
        🔍 Audit
      </TouchButton>

      {/* 5. NEXT TURN */}
      <TouchButton
        id="btn-next"
        onClick={handleEndTurn}
        disabled={!canNextTurn}
        primary={canNextTurn}
      >
        {isEndingTurn ? "Ending..." : "Next Turn ▶"}
      </TouchButton>
    </div>
  );
}

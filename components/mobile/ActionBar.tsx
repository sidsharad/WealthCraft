// components/mobile/ActionBar.tsx
import React, { useState } from "react";
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
    handleRoll,
    handleEndTurn,
    handleRebalance,
    myPlayer,

  } = turn;

  // Modal visibility state
  const [showRebalance, setShowRebalance] = useState(false);
  const [cash, setCash] = useState(myPlayer?.cash ?? 0);
  const [bonds, setBonds] = useState(myPlayer?.bonds ?? 0);
  const [stocks, setStocks] = useState(myPlayer?.stocks ?? 0);

  const disabled = rolling || isEndingTurn || isSubmitting;

  const openRebalance = () => {
    // Initialise fields with current player values each time modal opens
    setCash(myPlayer?.cash ?? 0);
    setBonds(myPlayer?.bonds ?? 0);
    setStocks(myPlayer?.stocks ?? 0);
    setShowRebalance(true);
  };

  const confirmRebalance = () => {
    const newCash = Number(cash);
    const newBonds = Number(bonds);
    const newStocks = Number(stocks);
    if (isNaN(newCash) || isNaN(newBonds) || isNaN(newStocks)) return;
    if (newCash < 0 || newBonds < 0 || newStocks < 0) return;
    handleRebalance(newCash, newBonds, newStocks);
    setShowRebalance(false);
  };

  return (
    <>
      <div className="flex justify-around bg-[var(--cream)] p-2 border-t border-gray-200">
        <TouchButton onClick={handleRoll} disabled={disabled}>Roll Dice</TouchButton>
        <TouchButton onClick={handleEndTurn} disabled={disabled}>End Turn</TouchButton>
        <TouchButton onClick={openRebalance} disabled={disabled}>Rebalance</TouchButton>
      </div>

      {showRebalance && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-50">
          <div className="bg-white p-4 rounded-lg shadow-lg w-80">
            <h2 className="text-lg font-bold mb-3 text-center">Rebalance Assets</h2>
            <div className="grid gap-2 mb-4">
              <label className="flex items-center justify-between">
                <span>Cash</span>
                <input
                  type="number"
                  min="0"
                  value={cash}
                  onChange={e => setCash(Number(e.target.value))}
                  className="w-20 border rounded px-1"
                />
              </label>
              <label className="flex items-center justify-between">
                <span>Bonds</span>
                <input
                  type="number"
                  min="0"
                  value={bonds}
                  onChange={e => setBonds(Number(e.target.value))}
                  className="w-20 border rounded px-1"
                />
              </label>
              <label className="flex items-center justify-between">
                <span>Stocks</span>
                <input
                  type="number"
                  min="0"
                  value={stocks}
                  onChange={e => setStocks(Number(e.target.value))}
                  className="w-20 border rounded px-1"
                />
              </label>
            </div>
            <div className="flex gap-2 justify-end">
              <TouchButton onClick={() => setShowRebalance(false)}>Cancel</TouchButton>
              <TouchButton onClick={confirmRebalance}>Confirm</TouchButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

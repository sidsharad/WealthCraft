import React, { useState, useEffect } from "react";
import { PlayerState } from "@/lib/db/schema";
import { netWorth } from "@/lib/game-engine/actions";
import { REBALANCE_PENALTY } from "@/lib/game-engine/tiles";
import { RefreshCw, AlertTriangle, Timer, X } from "lucide-react";

interface RebalanceModalProps {
  isOpen: boolean;
  player: PlayerState;
  onRebalance: (newCash: number, newBonds: number, newStocks: number) => void;
  onClose?: () => void;
  penalty?: number;
  externalTimeLeft?: number | null;
  skipReturnsDelay?: boolean;
  emergencyAmount?: number;
}

export default function RebalanceModal({ isOpen, player, onRebalance, onClose, penalty = 0, externalTimeLeft, skipReturnsDelay, emergencyAmount }: RebalanceModalProps) {
  const totalWealth = netWorth(player) - penalty;
  
  // We only let the user adjust Bonds and Stocks. Cash is the remainder.
  const [bonds, setBonds] = useState(player.bonds);
  const [stocks, setStocks] = useState(player.stocks);
  const [internalTimeLeft, setInternalTimeLeft] = useState(30);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isInitialDelay, setIsInitialDelay] = useState(true);

  const timeLeft = externalTimeLeft !== undefined && externalTimeLeft !== null ? externalTimeLeft : internalTimeLeft;

  const cash = totalWealth - bonds - stocks;

  useEffect(() => {
    if (isOpen) {
      setBonds(player.bonds);
      setStocks(player.stocks);
      setInternalTimeLeft(30);
      setHasSubmitted(false);
      
      if (skipReturnsDelay) {
        setIsInitialDelay(false);
      } else {
        setIsInitialDelay(true);
        const timer = setTimeout(() => setIsInitialDelay(false), 10);
        return () => clearTimeout(timer);
      }
    }
  }, [isOpen, player.id, skipReturnsDelay, player.bonds, player.stocks, player.cash]); // use id/assets to reset when player state actually changes from server

  // Timer logic
  useEffect(() => {
    if (!isOpen || hasSubmitted || isInitialDelay) return;
    
    if (timeLeft === 0) {
      // Auto-skip: submit original values ONLY if no penalty (else it would be invalid)
      if (penalty === 0 && emergencyAmount === undefined) {
        setHasSubmitted(true);
        onRebalance(player.cash, player.bonds, player.stocks);
      }
      return;
    }

    const timer = setTimeout(() => setInternalTimeLeft(internalTimeLeft - 1), 1000);
    return () => clearTimeout(timer);
  }, [isOpen, internalTimeLeft, onRebalance, player, hasSubmitted, externalTimeLeft, isInitialDelay, penalty, emergencyAmount]);

  if (!isOpen) return null;

  let isInvalid = cash < 0 || bonds < 0 || stocks < 0;
  
  if (emergencyAmount !== undefined && !isInvalid) {
    if (cash < emergencyAmount) {
      const hasLegalLiquidations = bonds >= 5 || stocks >= 5;
      if (hasLegalLiquidations) {
        isInvalid = true; // Disable confirm: player must liquidate more blocks
      }
    }
  }

  const handleConfirm = () => {
    if (isInvalid) return;
    console.log("RebalanceModal: Confirming with values:", { cash, bonds, stocks, totalWealth });
    setHasSubmitted(true);
    onRebalance(cash, bonds, stocks);
  };

  const adjustBonds = (delta: number) => {
    const newVal = Math.max(0, bonds + delta);
    // Always allow reducing (delta < 0), or increasing if within wealth limit
    if (delta < 0 || newVal + stocks <= totalWealth) {
      setBonds(newVal);
    }
  };

  const adjustStocks = (delta: number) => {
    const newVal = Math.max(0, stocks + delta);
    // Always allow reducing (delta < 0), or increasing if within wealth limit
    if (delta < 0 || newVal + bonds <= totalWealth) {
      setStocks(newVal);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card max-w-md animate-in fade-in zoom-in duration-300">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-black text-[var(--navy)] flex items-center gap-2">
              <RefreshCw className={`text-blue-500 ${isInitialDelay ? 'animate-spin' : ''}`} /> 
              {isInitialDelay ? "Year-End Returns" : "Rebalance Portfolio"}
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {isInitialDelay ? "Calculating your investment growth..." : "Adjust your portfolio strategy"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className={`flex items-center gap-1 font-black text-lg ${timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-gray-400'}`}>
              <Timer size={20} /> {timeLeft}s
            </div>
          </div>
        </div>

        {isInitialDelay ? (
          <div className="space-y-4 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-blue-50 p-6 rounded-2xl border-2 border-blue-100 flex justify-between items-center">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1">Bond Returns</p>
                <p className="text-2xl font-black text-blue-900">+{Math.floor(player.bonds / 5)}L</p>
              </div>
              <div className="text-4xl opacity-20">📈</div>
            </div>
            <div className="bg-purple-50 p-6 rounded-2xl border-2 border-purple-100 flex justify-between items-center">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-purple-600 mb-1">Stock Returns</p>
                <p className="text-2xl font-black text-purple-900">+{Math.floor(player.stocks / 5) * 2}L</p>
              </div>
              <div className="text-4xl opacity-20">📊</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <p className="text-xs font-bold text-gray-500 animate-pulse">Updating portfolio in a few seconds...</p>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4 mb-8">
              {/* Bonds & Stocks: Adjustable in 5L blocks */}
              {[
                { label: 'Bonds', val: bonds, adj: adjustBonds, color: 'text-blue-600', bg: 'bg-blue-50', icon: '📈' },
                { label: 'Stocks', val: stocks, adj: adjustStocks, color: 'text-purple-600', bg: 'bg-purple-50', icon: '📊' },
              ].map((item) => (
                <div key={item.label} className={`${item.bg} p-4 rounded-2xl border border-white relative overflow-hidden group`}>
                   <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="text-4xl font-black">{item.icon}</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <label className={`text-xs font-black uppercase tracking-widest ${item.color}`}>{item.label}</label>
                    <span className="text-[10px] font-bold text-gray-400">5L Blocks</span>
                  </div>
                  <div className="flex items-center gap-4 relative z-10">
                    <button 
                      onClick={() => item.adj(-5)}
                      disabled={item.val < 5}
                      className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center font-bold text-lg hover:shadow-md active:scale-95 transition-all text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
                    >-</button>
                    <div className="flex-1 text-center text-2xl font-black text-[var(--navy)]">
                      {item.val}L
                    </div>
                    <button 
                      onClick={() => item.adj(5)}
                      disabled={(item.val + 5 + (item.label === 'Bonds' ? stocks : bonds)) > totalWealth}
                      className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center font-bold text-lg hover:shadow-md active:scale-95 transition-all text-gray-600 disabled:opacity-30"
                    >+</button>
                  </div>
                </div>
              ))}

              {/* Cash: Automatically calculated */}
              <div className={`${cash < 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'} p-4 rounded-2xl border-2 border-dashed`}>
                <div className="flex justify-between items-center mb-1">
                  <label className={`text-xs font-black uppercase tracking-widest ${cash < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {cash < 0 ? 'Cash Shortfall' : 'Remaining Cash'}
                  </label>
                </div>
                <div className={`text-center text-3xl font-black ${cash < 0 ? 'text-red-700' : 'text-green-700'}`}>
                  {cash}L
                </div>
              </div>
            </div>

            <div className="bg-[var(--navy)] p-4 rounded-2xl mb-6 shadow-inner">
              <div className="flex justify-between items-center">
                <span className="text-2xl font-black text-white">{totalWealth}L</span>
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Available Funds</span>
              </div>
            </div>

            <div className="flex gap-3">
              {onClose && (
                <button onClick={onClose} className="btn-secondary flex-1 py-4 text-lg">Cancel</button>
              )}
              <button
                disabled={isInvalid}
                onClick={handleConfirm}
                className="btn-primary flex-[2] py-4 text-lg disabled:opacity-50"
              >
                Confirm Strategy
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

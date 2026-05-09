import React, { useState, useEffect } from "react";
import { PlayerState } from "@/lib/db/schema";
import { netWorth } from "@/lib/game-engine/validators";
import { REBALANCE_PENALTY } from "@/lib/game-engine/tiles";
import { RefreshCw, AlertTriangle, Timer, X } from "lucide-react";

interface RebalanceModalProps {
  isOpen: boolean;
  player: PlayerState;
  onRebalance: (newCash: number, newBonds: number, newStocks: number) => void;
  onClose?: () => void;
  penalty?: number;
}

export default function RebalanceModal({ isOpen, player, onRebalance, onClose, penalty = 0 }: RebalanceModalProps) {
  const totalWealth = netWorth(player) - penalty;
  
  // We only let the user adjust Bonds and Stocks. Cash is the remainder.
  const [bonds, setBonds] = useState(player.bonds);
  const [stocks, setStocks] = useState(player.stocks);
  const [timeLeft, setTimeLeft] = useState(30);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const cash = totalWealth - bonds - stocks;

  useEffect(() => {
    if (isOpen) {
      setBonds(player.bonds);
      setStocks(player.stocks);
      setTimeLeft(30);
      setHasSubmitted(false);
    }
  }, [isOpen, player]);

  // Timer logic
  useEffect(() => {
    if (!isOpen || hasSubmitted) return;
    
    if (timeLeft === 0) {
      // Auto-skip: submit original values ONLY if no penalty (else it would be invalid)
      if (penalty === 0) {
        setHasSubmitted(true);
        onRebalance(player.cash, player.bonds, player.stocks);
      }
      return;
    }

    const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    return () => clearTimeout(timer);
  }, [isOpen, timeLeft, onRebalance, player, hasSubmitted]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    console.log("RebalanceModal: Confirming with values:", { cash, bonds, stocks, totalWealth });
    if (cash < 0) {
      console.error("RebalanceModal: Invalid cash amount:", cash);
      return;
    }
    setHasSubmitted(true);
    onRebalance(cash, bonds, stocks);
  };

  const isInvalid = cash < 0 || bonds < 0 || stocks < 0;

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
              <RefreshCw className="text-blue-500" /> Rebalance
            </h2>
            {penalty > 0 && (
              <p className="text-red-500 text-xs font-bold mt-1 bg-red-50 px-2 py-1 rounded inline-block">
                ⚠️ Mid-year penalty: -{penalty}L Applied
              </p>
            )}
            <p className="text-gray-500 text-sm mt-1">
              Adjust your portfolio strategy
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {onClose && (
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            )}
            <div className={`flex items-center gap-1 font-black text-lg ${timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-gray-400'}`}>
              <Timer size={20} /> {timeLeft}s
            </div>
            {penalty === 0 && (
              <span className="text-[9px] font-bold text-gray-300 uppercase tracking-widest">Auto-skip at 0s</span>
            )}
          </div>
        </div>

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
                  className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center font-bold text-lg hover:shadow-md active:scale-95 transition-all text-gray-600"
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
              <span className={`text-[9px] font-bold ${cash < 0 ? 'text-red-400' : 'text-green-400'} uppercase`}>
                {cash < 0 ? 'Must reduce assets' : 'Auto-calculated'}
              </span>
            </div>
            <div className={`text-center text-3xl font-black ${cash < 0 ? 'text-red-700' : 'text-green-700'}`}>
              {cash}L
            </div>
          </div>
        </div>

        <div className="bg-[var(--navy)] p-4 rounded-2xl mb-6 shadow-inner">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Total Wealth</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-2xl font-black text-white">
              {cash + bonds + stocks}L
            </span>
            <div className="flex items-center gap-2">
               <span className="text-white/20 text-xs">TARGET</span>
               <span className="text-2xl font-black text-[var(--gold)]">
                {totalWealth}L
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          {onClose && (
            <button onClick={onClose} className="btn-secondary flex-1 py-4 text-lg">
              Cancel
            </button>
          )}
          <button
            disabled={isInvalid}
            onClick={handleConfirm}
            className="btn-primary flex-[2] py-4 text-lg disabled:opacity-50 disabled:grayscale transform active:scale-[0.98] transition-transform"
          >
            Confirm Strategy
          </button>
        </div>
      </div>
    </div>
  );
}

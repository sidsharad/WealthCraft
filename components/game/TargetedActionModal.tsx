import React, { useState } from "react";
import { PlayerState } from "@/lib/db/schema";
import { Sword, Search, Users, AlertCircle, ShieldAlert } from "lucide-react";

interface TargetedActionModalProps {
  isOpen: boolean;
  type: "tax-raid" | "hostile-takeover" | "concentration-audit";
  currentPlayer: PlayerState;
  otherPlayers: { player: PlayerState; originalIndex: number }[];
  onConfirm: (payload: any) => void;
  onClose: () => void;
}

export default function TargetedActionModal({
  isOpen,
  type,
  currentPlayer,
  otherPlayers,
  onConfirm,
  onClose,
}: TargetedActionModalProps) {
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null);
  const [amount, setAmount] = useState(5);
  const [demandType, setDemandType] = useState<"stocks" | "bonds" | "cash">("stocks");

  if (!isOpen) return null;

  const isHostile = type === "hostile-takeover";
  const isAudit = type === "concentration-audit";

  const handleConfirm = () => {
    if (selectedTarget === null) return;
    
    if (isHostile) {
      onConfirm({
        targetIdx: selectedTarget,
        demandType: demandType,
      });
    } else {
      onConfirm({
        targetIdx: selectedTarget,
      });
    }
  };

  const handleSkip = () => {
    onConfirm({ skip: true });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card max-w-md">
        <div className="text-center mb-6">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
            isHostile ? 'bg-red-100 text-red-600' : 
            isAudit ? 'bg-blue-100 text-blue-600' : 
            'bg-orange-100 text-orange-600'
          }`}>
            {isHostile ? <Sword size={32} /> : isAudit ? <ShieldAlert size={32} /> : <Search size={32} />}
          </div>
          <h2 className="text-2xl font-black text-[var(--navy)]">
            {isHostile ? "Hostile Takeover" : isAudit ? "Asset Audit" : "Tax Raid"}
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            {isHostile 
              ? "Take up to 5L in assets from another player." 
              : isAudit 
                ? "Check if a player has > 40L in any asset category."
                : "Pay 2L to enforce a penalty on another player."}
          </p>
        </div>

        <div className="space-y-6">
          {/* Target Selection */}
          <div>
            <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2 block px-1">Select Target Player</label>
            <div className="grid gap-2">
              {otherPlayers.map(({ player, originalIndex }) => (
                <button
                  key={player.id}
                  onClick={() => setSelectedTarget(originalIndex)}
                  className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                    selectedTarget === originalIndex 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center font-bold text-xs">
                      {player.name[0].toUpperCase()}
                    </div>
                    <span className="font-bold text-sm text-gray-700">{player.name}</span>
                  </div>
                  {selectedTarget === originalIndex && <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white"><Users size={12} /></div>}
                </button>
              ))}
            </div>
          </div>

          {isHostile && (
            <>
              <div className="bg-red-50 p-4 rounded-2xl flex items-start gap-3 border border-red-100">
                <AlertCircle className="text-red-500 flex-shrink-0" size={18} />
                <p className="text-[11px] font-bold text-red-800 leading-tight">
                  This will take up to 5L in assets from the target and add them to your portfolio. No cash cost to you.
                </p>
              </div>

              {/* Type Selection */}
              <div>
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2 block px-1">Asset to Demand</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setDemandType("cash")}
                    className={`py-3 rounded-xl font-bold text-xs border-2 transition-all ${demandType === "cash" ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-100 text-gray-400'}`}
                  >Cash</button>
                  <button
                    onClick={() => setDemandType("bonds")}
                    className={`py-3 rounded-xl font-bold text-xs border-2 transition-all ${demandType === "bonds" ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-400'}`}
                  >Bonds</button>
                  <button
                    onClick={() => setDemandType("stocks")}
                    className={`py-3 rounded-xl font-bold text-xs border-2 transition-all ${demandType === "stocks" ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-100 text-gray-400'}`}
                  >Stocks</button>
                </div>
              </div>
            </>
          )}

          {!isHostile && !isAudit && (
            <div className="bg-orange-50 p-4 rounded-2xl flex items-start gap-3 border border-orange-100">
              <AlertCircle className="text-orange-500 flex-shrink-0" size={18} />
              <p className="text-[11px] font-bold text-orange-800 leading-tight">
                This will cost you 2L cash. The target will lose 5L cash.
              </p>
            </div>
          )}

          {isAudit && (
            <div className="bg-blue-50 p-4 rounded-2xl flex items-start gap-3 border border-blue-100">
              <ShieldAlert className="text-blue-500 flex-shrink-0" size={18} />
              <p className="text-[11px] font-bold text-blue-800 leading-tight">
                If successful (any asset &gt; 40L), excess is confiscated. If failed, you pay 5L penalty.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <button onClick={onClose} className="btn-secondary flex-1 py-4 text-sm">Cancel</button>
              <button 
                disabled={
                  selectedTarget === null || 
                  (type === "tax-raid" && currentPlayer.cash < 2)
                }
                onClick={handleConfirm} 
                className="btn-primary flex-[2] py-4"
              >
                Confirm {isHostile ? "Takeover" : isAudit ? "Audit" : "Raid"}
              </button>
            </div>
            {!isHostile && (
              <button 
                onClick={handleSkip}
                className="btn-primary w-full py-4 mt-2"
              >
                Skip / No Action
              </button>
            )}
          </div>
          

        </div>
      </div>
    </div>
  );
}

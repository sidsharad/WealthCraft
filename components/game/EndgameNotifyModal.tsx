import React from "react";
import { Trophy, AlertTriangle } from "lucide-react";
import { PlayerState } from "@/lib/db/schema";
import { netWorth } from "@/lib/game-engine/actions";

interface EndgameNotifyModalProps {
  isOpen: boolean;
  type: "trigger" | "cancelled";
  triggerPlayer?: PlayerState;
  onContinue: () => void;
}

export default function EndgameNotifyModal({
  isOpen,
  type,
  triggerPlayer,
  onContinue,
}: EndgameNotifyModalProps) {
  if (!isOpen) return null;

  const isTrigger = type === "trigger";

  return (
    <div className="modal-overlay">
      <div className="modal-card max-w-sm text-center">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
          isTrigger ? 'bg-amber-100 border border-amber-200' : 'bg-red-100 border border-red-200'
        }`}>
          {isTrigger ? (
            <Trophy size={32} className="text-amber-500 animate-bounce" />
          ) : (
            <AlertTriangle size={32} className="text-red-500" />
          )}
        </div>
        
        <h2 className="text-2xl font-black mb-3">
          {isTrigger ? (
            <span className="text-amber-600">FINAL ROUND</span>
          ) : (
            <span className="text-red-600">FINAL ROUND CANCELLED</span>
          )}
        </h2>

        {isTrigger && triggerPlayer && (
          <div className="bg-amber-50 rounded-xl p-4 mb-6 border border-amber-100">
            <p className="text-sm font-bold text-[var(--navy)] mb-1">
              <span className="text-amber-700">{triggerPlayer.name}</span> has reached <span className="font-black">{netWorth(triggerPlayer)}L</span> Net Worth.
            </p>
            <p className="text-[11px] font-bold text-gray-500 mt-3 leading-snug">
              The current round will continue until all players complete their turns.
              Highest Net Worth at round end wins.
            </p>
          </div>
        )}

        {!isTrigger && (
          <div className="bg-red-50 rounded-xl p-4 mb-6 border border-red-100">
            <p className="text-sm font-bold text-[var(--navy)] mb-1">
              No player currently has 100L Net Worth.
            </p>
            <p className="text-[11px] font-bold text-gray-500 mt-3 leading-snug">
              The game will continue normally.
            </p>
          </div>
        )}

        <button 
          onClick={onContinue} 
          className="btn-primary w-full py-4 text-sm uppercase tracking-widest font-black"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

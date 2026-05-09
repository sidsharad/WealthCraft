import React from "react";
import { PlayerState } from "@/lib/db/schema";
import { ShieldCheck, Search, AlertTriangle, ShieldAlert } from "lucide-react";

interface LeadersDilemmaModalProps {
  isOpen: boolean;
  player: PlayerState;
  onDeclare: () => void;
  onAudit: (targetIdx: number) => void;
  otherPlayers: PlayerState[];
  isCurrentTurn: boolean;
  needsToDeclare: boolean;
}

export default function LeadersDilemmaModal({ 
  isOpen, 
  player, 
  onDeclare, 
  onAudit, 
  otherPlayers, 
  isCurrentTurn,
  needsToDeclare 
}: LeadersDilemmaModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="text-center mb-6">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${needsToDeclare ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
            {needsToDeclare ? <ShieldAlert size={32} /> : <ShieldCheck size={32} />}
          </div>
          <h2 className="text-2xl font-black text-[var(--navy)]">Leader's Dilemma</h2>
          <p className="text-gray-500 text-sm mt-1">Wealth Declaration & Audits</p>
        </div>

        {needsToDeclare && (
          <div className="bg-red-50 border-2 border-red-100 rounded-2xl p-5 mb-8">
            <h3 className="font-black text-red-800 flex items-center gap-2 mb-2">
              <AlertTriangle size={18} /> WEALTH DECLARATION REQUIRED
            </h3>
            <p className="text-xs text-red-700 leading-relaxed mb-4">
              Your net worth has reached <strong>70L</strong>. You must declare your wealth now to avoid heavy penalties if audited.
            </p>
            <button onClick={onDeclare} className="btn-danger w-full py-3 shadow-lg">
              Declare Wealth Now
            </button>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wider px-1">Audit Other Players</h3>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight px-1 mb-2">
            Audit any undeclared player. If they have 70L+, they pay a penalty. If less, YOU pay 5L.
          </p>
          
          <div className="grid gap-3">
            {otherPlayers.map((p, idx) => {
              const targetIdx = otherPlayers.findIndex(op => op.id === p.id); // this is simplified, need proper mapping
              return (
                <div key={p.id} className="bg-white border-2 border-gray-100 p-4 rounded-2xl flex justify-between items-center group hover:border-blue-200 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black bg-gray-200 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                      {p.name[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-sm">{p.name}</div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                        {p.wealthDeclared ? '✅ Declared' : '❓ Undeclared'}
                      </div>
                    </div>
                  </div>
                  <button
                    disabled={p.wealthDeclared || !isCurrentTurn}
                    onClick={() => {
                      // We need the index in the original players array
                      onAudit(idx); // Placeholder, logic needs care in parent
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-50 text-gray-500 font-bold text-xs hover:bg-blue-600 hover:text-white disabled:opacity-30 disabled:grayscale transition-all"
                  >
                    <Search size={14} /> Audit
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 leading-relaxed text-center italic">
            "A declared player cannot be re-audited. Strategy is as important as wealth."
          </p>
        </div>
      </div>
    </div>
  );
}

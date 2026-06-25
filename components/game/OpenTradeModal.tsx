import React, { useState, useEffect } from "react";
import { PlayerState, TradeOffer } from "@/lib/db/schema";
import { ArrowRightLeft, DollarSign, Briefcase, TrendingUp, Check, X, Clock, Users } from "lucide-react";

interface OpenTradeModalProps {
  isOpen: boolean;
  offer: TradeOffer;
  currentPlayer: PlayerState;
  players: PlayerState[];
  onResponse: (accept: boolean) => void;
  onSelectWinner: (winnerId: string) => void;
}

export default function OpenTradeModal({ isOpen, offer, currentPlayer, players, onResponse, onSelectWinner }: OpenTradeModalProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    if (!isOpen || !offer.expiresAt) return;

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((offer.expiresAt! - Date.now()) / 1000));
      setTimeLeft(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isOpen, offer.expiresAt]);

  if (!isOpen) return null;

  const isCreator = currentPlayer.id === offer.fromPlayerId;
  const creator = players.find(p => p.id === offer.fromPlayerId);
  const myResponse = offer.responses?.find(r => r.playerId === currentPlayer.id);
  const hasResponded = !!myResponse;
  
  // Calculate eligible logic (handled on server, but we can double check UI logic)
  const isEligible = offer.eligiblePlayerIds?.includes(currentPlayer.id);

  const accepts = offer.responses?.filter(r => r.accept) || [];
  const rejects = offer.responses?.filter(r => !r.accept) || [];

  return (
    <div className="modal-overlay">
      <div className="modal-card max-w-xl w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
            <Users size={32} />
          </div>
          <h2 className="text-2xl font-black text-[var(--navy)]">Open Trade</h2>
          <p className="text-gray-500 text-sm mt-1">
            <span className="font-bold text-[var(--navy)]">{creator?.name}</span> broadcasted a trade to everyone.
          </p>
          
          <div className="mt-4 inline-flex items-center gap-2 bg-gray-100 px-4 py-2 rounded-full font-bold text-gray-700">
            <Clock size={16} className={timeLeft <= 5 && offer.status === "pending" ? "text-red-500 animate-pulse" : "text-gray-500"} />
            <span className={timeLeft <= 5 && offer.status === "pending" ? "text-red-600" : ""}>
              {offer.status === "pending" ? `${timeLeft}s Remaining` : offer.status === "selection_required" ? "Awaiting Selection" : "Resolving..."}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8">
          {/* What they offer */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase text-blue-600 tracking-widest border-b border-blue-100 pb-2">
              THEY OFFER
            </h3>
            <div className="space-y-2">
              {offer.offer.cash > 0 && (
                <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <DollarSign size={16} className="text-green-500" /> {offer.offer.cash}L Cash
                </div>
              )}
              {offer.offer.bonds > 0 && (
                <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <Briefcase size={16} className="text-blue-500" /> {offer.offer.bonds}L Bonds
                </div>
              )}
              {offer.offer.stocks > 0 && (
                <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <TrendingUp size={16} className="text-purple-500" /> {offer.offer.stocks}L Stocks
                </div>
              )}
              {offer.offer.cash === 0 && offer.offer.bonds === 0 && offer.offer.stocks === 0 && (
                <p className="text-xs text-gray-400 italic">Nothing offered</p>
              )}
            </div>
          </div>

          {/* What they want */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase text-red-600 tracking-widest border-b border-red-100 pb-2">
              THEY REQUEST
            </h3>
            <div className="space-y-2">
              {offer.request.cash > 0 && (
                <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <DollarSign size={16} className="text-green-500" /> {offer.request.cash}L Cash
                </div>
              )}
              {offer.request.bonds > 0 && (
                <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <Briefcase size={16} className="text-blue-500" /> {offer.request.bonds}L Bonds
                </div>
              )}
              {offer.request.stocks > 0 && (
                <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <TrendingUp size={16} className="text-purple-500" /> {offer.request.stocks}L Stocks
                </div>
              )}
              {offer.request.cash === 0 && offer.request.bonds === 0 && offer.request.stocks === 0 && (
                <p className="text-xs text-gray-400 italic">Nothing requested</p>
              )}
            </div>
          </div>
        </div>

        {isCreator ? (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
            <h3 className="text-xs font-black uppercase text-gray-500 mb-3 text-center">Trade Status</h3>
            
            <div className="flex justify-center gap-6 mb-4 text-sm font-bold">
              <div className="text-green-600 flex items-center gap-1"><Check size={16} /> {accepts.length} Accepts</div>
              <div className="text-red-600 flex items-center gap-1"><X size={16} /> {rejects.length} Rejects</div>
            </div>

            {offer.status === "selection_required" ? (
              <div className="mt-4">
                <p className="text-sm font-bold text-[var(--navy)] mb-3 text-center">Multiple players accepted! Choose your trade partner:</p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {accepts.map(r => {
                    const p = players.find(player => player.id === r.playerId);
                    return (
                      <div key={r.playerId} className="flex justify-between items-center bg-white border border-gray-200 p-2 rounded-lg shadow-sm">
                        <span className="font-bold text-gray-700">{p?.name}</span>
                        <button onClick={() => onSelectWinner(r.playerId)} className="btn-primary text-xs py-1 px-3">
                          Select
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-center text-gray-400 text-xs italic">
                {offer.status === "pending" ? "Awaiting responses..." : "Trade resolving..."}
              </p>
            )}
          </div>
        ) : (
          <div>
            {!hasResponded && offer.status === "pending" ? (
              <>
                <div className="flex gap-4">
                  <button 
                    onClick={() => onResponse(false)}
                    className="flex-1 py-4 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-black uppercase tracking-widest text-sm transition-all flex items-center justify-center gap-2"
                  >
                    <X size={18} /> Reject
                  </button>
                  {isEligible ? (
                    <button 
                      onClick={() => onResponse(true)}
                      className="flex-1 py-4 rounded-2xl font-black uppercase tracking-widest text-sm transition-all flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-200"
                    >
                      <Check size={18} /> Accept
                    </button>
                  ) : (
                    <div className="flex-1 py-4 rounded-2xl bg-gray-200 text-gray-400 font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 cursor-not-allowed" title="You do not have enough assets">
                      <Check size={18} /> Accept
                    </div>
                  )}
                </div>
                {!isEligible && (
                  <p className="text-center text-red-500 text-xs font-bold mt-4">
                    You do not have sufficient assets to fulfill this trade.
                  </p>
                )}
              </>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center">
                {myResponse?.accept ? (
                  <div className="text-green-600 font-bold mb-2 flex items-center justify-center gap-2"><Check size={20} /> You accepted</div>
                ) : myResponse?.accept === false ? (
                  <div className="text-red-500 font-bold mb-2 flex items-center justify-center gap-2"><X size={20} /> You rejected</div>
                ) : null}
                <p className="text-gray-500 text-sm italic">
                  {offer.status === "selection_required" ? "Creator is choosing a partner..." : "Waiting for trade resolution..."}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import React from "react";
import { PlayerState, TradeOffer } from "@/lib/db/schema";
import { ArrowRightLeft, DollarSign, Briefcase, TrendingUp, Check, X } from "lucide-react";

interface TradeResponseModalProps {
  isOpen: boolean;
  offer: TradeOffer;
  fromPlayer: PlayerState;
  toPlayer: PlayerState;
  onResponse: (accept: boolean) => void;
}

export default function TradeResponseModal({ isOpen, offer, fromPlayer, toPlayer, onResponse }: TradeResponseModalProps) {
  if (!isOpen) return null;

  const canAfford = 
    toPlayer.cash >= offer.request.cash && 
    toPlayer.bonds >= offer.request.bonds && 
    toPlayer.stocks >= offer.request.stocks;

  return (
    <div className="modal-overlay">
      <div className="modal-card max-w-xl w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4 text-yellow-600">
            <ArrowRightLeft size={32} />
          </div>
          <h2 className="text-2xl font-black text-[var(--navy)]">Trade Proposal</h2>
          <p className="text-gray-500 text-sm mt-1">
            <span className="font-bold text-[var(--navy)]">{fromPlayer.name}</span> has proposed a trade with you.
          </p>
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

        <div className="flex gap-4">
          <button 
            onClick={() => onResponse(false)}
            className="flex-1 py-4 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-black uppercase tracking-widest text-sm transition-all flex items-center justify-center gap-2"
          >
            <X size={18} /> Reject
          </button>
          <button 
            onClick={() => onResponse(true)}
            disabled={!canAfford}
            className={`flex-1 py-4 rounded-2xl font-black uppercase tracking-widest text-sm transition-all flex items-center justify-center gap-2 ${
              canAfford 
                ? "bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-200" 
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
          >
            <Check size={18} /> Accept
          </button>
        </div>
        {!canAfford && (
          <p className="text-center text-red-500 text-xs font-bold mt-4">
            You do not have sufficient assets to fulfil this trade.
          </p>
        )}
      </div>
    </div>
  );
}

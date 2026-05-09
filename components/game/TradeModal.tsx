import React, { useState } from "react";
import { PlayerState } from "@/lib/db/schema";
import { X, ArrowRightLeft, DollarSign, Briefcase, TrendingUp } from "lucide-react";

interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlayer: PlayerState;
  otherPlayers: PlayerState[];
  onPropose: (targetId: string, offer: any, request: any) => void;
}

export default function TradeModal({ isOpen, onClose, currentPlayer, otherPlayers, onPropose }: TradeModalProps) {
  const [targetId, setTargetId] = useState(otherPlayers[0]?.id || "");
  const [offer, setOffer] = useState({ cash: 0, bonds: 0, stocks: 0 });
  const [request, setRequest] = useState({ cash: 0, bonds: 0, stocks: 0 });

  if (!isOpen) return null;

  const target = otherPlayers.find(p => p.id === targetId);

  const handlePropose = () => {
    if (!targetId) return;
    onPropose(targetId, offer, request);
  };

  const updateOffer = (key: string, val: number) => {
    const v = Math.max(0, Math.floor(val / 5) * 5);
    setOffer({ ...offer, [key]: v });
  };

  const updateRequest = (key: string, val: number) => {
    const v = Math.max(0, Math.floor(val / 5) * 5);
    setRequest({ ...request, [key]: v });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card max-w-2xl w-full">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-black text-[var(--navy)] flex items-center gap-2">
            <ArrowRightLeft className="text-yellow-500" /> Propose Trade
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-11 gap-6 items-center">
          {/* Your Offer */}
          <div className="md:col-span-5 space-y-4">
            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 mb-4">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1">Your Offer</p>
              <p className="text-sm font-bold text-blue-900">{currentPlayer.name}</p>
            </div>
            
            <div className="space-y-3">
              {[
                { label: 'Cash', icon: <DollarSign size={14} />, key: 'cash', max: currentPlayer.cash, color: 'text-green-600' },
                { label: 'Bonds', icon: <Briefcase size={14} />, key: 'bonds', max: currentPlayer.bonds, color: 'text-blue-600' },
                { label: 'Stocks', icon: <TrendingUp size={14} />, key: 'stocks', max: currentPlayer.stocks, color: 'text-purple-600' },
              ].map((asset) => (
                <div key={asset.key}>
                  <div className="flex justify-between text-[11px] font-bold mb-1">
                    <span className="flex items-center gap-1 text-gray-500">{asset.icon} {asset.label}</span>
                    <span className="text-gray-400">Max: {asset.max}L</span>
                  </div>
                  <input
                    type="number"
                    step={5}
                    value={(offer as any)[asset.key]}
                    onChange={(e) => updateOffer(asset.key, Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-bold focus:ring-2 focus:ring-yellow-400 outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-1 flex justify-center">
            <div className="w-10 h-10 rounded-full bg-yellow-400 flex items-center justify-center text-white">
              <ArrowRightLeft size={20} />
            </div>
          </div>

          {/* Their Assets (Request) */}
          <div className="md:col-span-5 space-y-4">
            <div className="mb-4">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Trade With</label>
              <select 
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-bold outline-none bg-white"
              >
                {otherPlayers.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              {[
                { label: 'Cash', icon: <DollarSign size={14} />, key: 'cash', max: target?.cash || 0 },
                { label: 'Bonds', icon: <Briefcase size={14} />, key: 'bonds', max: target?.bonds || 0 },
                { label: 'Stocks', icon: <TrendingUp size={14} />, key: 'stocks', max: target?.stocks || 0 },
              ].map((asset) => (
                <div key={asset.key}>
                  <div className="flex justify-between text-[11px] font-bold mb-1">
                    <span className="flex items-center gap-1 text-gray-500">{asset.icon} {asset.label}</span>
                  </div>
                  <input
                    type="number"
                    step={5}
                    value={(request as any)[asset.key]}
                    onChange={(e) => updateRequest(asset.key, Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-bold focus:ring-2 focus:ring-yellow-400 outline-none"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button 
            onClick={handlePropose}
            className="btn-primary flex-1"
            disabled={offer.cash === 0 && offer.bonds === 0 && offer.stocks === 0 && request.cash === 0 && request.bonds === 0 && request.stocks === 0}
          >
            Send Offer
          </button>
        </div>
      </div>
    </div>
  );
}

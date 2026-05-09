import React, { useState } from "react";
import { PlayerState } from "@/lib/db/schema";
import { Gavel, Info, AlertCircle } from "lucide-react";

interface AuctionModalProps {
  isOpen: boolean;
  currentPlayer: PlayerState;
  onBid: (amount: number) => void;
  hasBid: boolean;
  minBid: number;
  marketPrice: number;
  onClose: () => void;
}

export default function AuctionModal({ isOpen, currentPlayer, onBid, hasBid, minBid, marketPrice, onClose }: AuctionModalProps) {
  const [bidAmount, setBidAmount] = useState(minBid);
  
  // Reset bid amount when player changes
  React.useEffect(() => {
    setBidAmount(minBid);
  }, [currentPlayer?.id, minBid]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4 text-yellow-600">
            <Gavel size={32} />
          </div>
          <h2 className="text-2xl font-black text-[var(--navy)]">House Auction</h2>
          <p className="text-gray-500 text-sm mt-1">Submit your secret sealed bid</p>
        </div>

        <div className="bg-blue-50 rounded-xl p-4 mb-6 border border-blue-100">
          <div className="flex items-start gap-3">
            <Info className="text-blue-500 flex-shrink-0 mt-0.5" size={16} />
            <div className="text-xs leading-relaxed text-blue-900">
              <p className="font-bold mb-1">Auction Rules:</p>
              <ul className="list-disc ml-4 space-y-1">
                <li>Minimum bid: <strong>{minBid}L</strong></li>
                <li>Market price: <strong>{marketPrice}L</strong></li>
                <li>Bids are sealed (secret) until everyone submits.</li>
                <li>Highest bidder wins and pays their bid amount.</li>
                <li>Ties result in no one winning the house.</li>
              </ul>
            </div>
          </div>
        </div>

        {hasBid ? (
          <div className="text-center py-8">
            <div className="animate-bounce mb-4 text-4xl">⏳</div>
            <p className="font-bold text-[var(--navy)]">Bid Submitted!</p>
            <p className="text-sm text-gray-500">Waiting for other players to finish...</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-end mb-2">
                <label className="text-sm font-bold text-gray-700">Your Bid Amount</label>
                <span className="text-xs text-gray-400 font-bold uppercase">Lakhs (L)</span>
              </div>
              <input
                type="number"
                min={minBid}
                step={1}
                value={bidAmount}
                onChange={(e) => setBidAmount(Number(e.target.value))}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-yellow-400 focus:ring-0 outline-none text-2xl font-black text-center"
              />
              <div className="flex justify-between mt-2 px-1">
                <span className="text-[10px] text-gray-400 font-bold uppercase">Min: {minBid}L</span>
                <span className="text-[10px] text-gray-400 font-bold uppercase">Balance: {currentPlayer.cash}L</span>
              </div>
            </div>

            {bidAmount > currentPlayer.cash && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded-lg text-[11px] font-bold">
                <AlertCircle size={14} /> Warning: Bid exceeds current cash. You may go into debt.
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                disabled={bidAmount > currentPlayer.cash}
                onClick={() => onBid(bidAmount)}
                className="btn-primary w-full py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Sealed Bid
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => onBid(0)}
                  className="btn-primary py-4 text-xs"
                >
                  Skip
                </button>
                <button 
                  onClick={onClose}
                  className="btn-secondary py-4 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

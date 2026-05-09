import React from "react";
import { PlayerState } from "@/lib/db/schema";
import { netWorth } from "@/lib/game-engine/validators";
import { Home, User, Briefcase, TrendingUp, DollarSign } from "lucide-react";

interface PortfolioPanelProps {
  player: PlayerState;
  isActive: boolean;
  color: string;
  isPrivate?: boolean;
}

export default function PortfolioPanel({ player, isActive, color, isPrivate }: PortfolioPanelProps) {
  const total = netWorth(player);

  return (
    <div className={`portfolio-card ${isActive ? 'active' : ''} border-l-4`} style={{ borderLeftColor: color }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: color }}>
            {player.name[0].toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-sm text-[var(--navy)] flex items-center gap-1">
              {player.name}
              {player.isBot && <span className="text-[10px] bg-gray-100 px-1 rounded text-gray-500">BOT</span>}
            </div>
            <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Year {player.year}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 font-bold uppercase tracking-tighter">Net Worth</div>
          <div className="text-xl font-black text-[var(--navy)]">{total}L</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-gray-50 p-2 rounded-lg text-center border border-gray-100">
          <div className="flex justify-center text-green-600 mb-1"><DollarSign size={14} /></div>
          <div className="text-[10px] text-gray-500 font-bold uppercase">Cash</div>
          <div className="text-sm font-black text-[var(--navy)]">{isPrivate ? "?" : `${player.cash}L`}</div>
        </div>
        <div className="bg-gray-50 p-2 rounded-lg text-center border border-gray-100">
          <div className="flex justify-center text-blue-600 mb-1"><Briefcase size={14} /></div>
          <div className="text-[10px] text-gray-500 font-bold uppercase">Bonds</div>
          <div className="text-sm font-black text-[var(--navy)]">{isPrivate ? "?" : `${player.bonds}L`}</div>
        </div>
        <div className="bg-gray-50 p-2 rounded-lg text-center border border-gray-100">
          <div className="flex justify-center text-purple-600 mb-1"><TrendingUp size={14} /></div>
          <div className="text-[10px] text-gray-500 font-bold uppercase">Stocks</div>
          <div className="text-sm font-black text-[var(--navy)]">{isPrivate ? "?" : `${player.stocks}L`}</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight ${player.hasHouse ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
          <Home size={12} /> {player.hasHouse ? 'House Owned' : 'No House'}
        </div>
        {player.wealthDeclared && (
          <div className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight">
            Declared
          </div>
        )}
        {player.jobLossActive && (
          <div className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight">
            Job Loss
          </div>
        )}
      </div>
    </div>
  );
}

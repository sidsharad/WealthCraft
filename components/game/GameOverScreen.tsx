import React, { useEffect, useMemo, useState } from 'react';
import { GameState } from '@/lib/db/schema';
import { getLeaderboard } from '@/lib/game-engine/actions';
import { Trophy, ChevronDown, ChevronUp } from 'lucide-react';

interface GameOverScreenProps {
  gameState: GameState;
  onExit?: () => void;
}

export function GameOverScreen({ gameState, onExit }: GameOverScreenProps) {
  const [show, setShow] = useState(false);
  const [showRankings, setShowRankings] = useState(false);
  
  const leaderboard = useMemo(() => getLeaderboard(gameState), [gameState]);
  const winner = leaderboard[0];

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (winner) {
      console.log(JSON.stringify({
        event: "GAME_OVER_SCREEN_RENDERED",
        winner: winner.name,
        phase: gameState.phase,
        turn: gameState.turn,
        year: gameState.year
      }, null, 2));
    }
  }, [winner, gameState.phase, gameState.turn, gameState.year]);

  if (!winner || !show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none p-4">
      <div className="modal-card w-full shadow-2xl flex flex-col items-center p-6 border-2 border-amber-400 pointer-events-auto">
        <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mb-3 border border-amber-200">
          <Trophy size={32} className="text-amber-500 animate-bounce" />
        </div>
        
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600 mb-1">
          Game Complete
        </h2>
        
        <h1 className="text-3xl font-black text-[var(--navy)] text-center mb-4">
          {winner.name} Wins!
        </h1>

        <div className="bg-amber-50 border border-amber-200 rounded-xl w-full p-3 mb-4 text-center">
          <span className="text-xs font-bold text-amber-700 uppercase tracking-widest block mb-1">Net Worth</span>
          <span className="font-black text-3xl text-amber-600">{winner.total}L</span>
        </div>

        <div className="grid grid-cols-3 gap-2 w-full mb-6">
          <div className="bg-gray-50 border border-gray-100 rounded-lg p-2 text-center">
            <span className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Cash</span>
            <span className="font-black text-sm text-emerald-600">{winner.cash}L</span>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-lg p-2 text-center">
            <span className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Bonds</span>
            <span className="font-black text-sm text-blue-600">{winner.bonds}L</span>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-lg p-2 text-center">
            <span className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Stocks</span>
            <span className="font-black text-sm text-indigo-600">{winner.stocks}L</span>
          </div>
        </div>

        <div className="w-full space-y-2">
          <button 
            onClick={() => setShowRankings(!showRankings)}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm font-bold text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {showRankings ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            View Final Rankings
          </button>

          {showRankings && (
            <div className="w-full flex flex-col gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 mb-2 animate-slide-in">
              {leaderboard.map((player, idx) => (
                <div key={player.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`font-black ${idx === 0 ? 'text-amber-500' : 'text-gray-400'}`}>
                      #{idx + 1}
                    </span>
                    <span className="font-bold text-[var(--navy)]">{player.name}</span>
                  </div>
                  <span className="font-black text-[var(--navy)]">{player.total}L</span>
                </div>
              ))}
            </div>
          )}

          {onExit && (
            <button 
              onClick={onExit}
              className="btn-primary w-full py-3 text-sm font-black uppercase tracking-widest mt-2"
            >
              Return to Dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo } from 'react';
import { GameState } from '@/lib/db/schema';
import { getLeaderboard } from '@/lib/game-engine/actions';

interface GameOverScreenProps {
  gameState: GameState;
  onExit?: () => void;
}

export function GameOverScreen({ gameState, onExit }: GameOverScreenProps) {
  const leaderboard = useMemo(() => getLeaderboard(gameState), [gameState]);
  const winner = leaderboard[0];

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

  if (!winner) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-700">
      <div className="max-w-2xl w-full bg-slate-900 border border-amber-500/30 rounded-3xl p-8 shadow-2xl relative overflow-hidden flex flex-col items-center">
        {/* Glow effect */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/20 blur-[100px] rounded-full pointer-events-none" />
        
        <h2 className="text-sm font-black uppercase tracking-[0.3em] text-amber-500 mb-2 relative z-10">
          Game Complete
        </h2>
        
        <div className="text-6xl mb-6 relative z-10 animate-bounce">🏆</div>
        
        <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-600 mb-2 relative z-10 text-center">
          {winner.name} Wins!
        </h1>
        
        <p className="text-xl text-amber-100/80 font-medium mb-10 relative z-10">
          Final Wealth: <span className="text-amber-400 font-bold">{winner.total}L</span>
        </p>
        
        <div className="w-full max-w-md relative z-10">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Final Leaderboard</h3>
          <div className="flex flex-col gap-3">
            {leaderboard.map((player, idx) => (
              <div 
                key={player.id}
                className={`flex items-center justify-between p-4 rounded-2xl transition-all duration-500 ${
                  idx === 0 
                    ? 'bg-amber-500/20 border border-amber-500/50 scale-[1.02]' 
                    : 'bg-slate-800/50 border border-slate-700/50'
                }`}
                style={{ animationDelay: `${idx * 150}ms`, animationFillMode: 'both' }}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-inner ${
                    idx === 0 ? 'bg-amber-500 text-amber-950 shadow-amber-400/50' : 'bg-slate-700 text-slate-300'
                  }`}>
                    #{idx + 1}
                  </div>
                  <span className={`font-bold text-lg ${idx === 0 ? 'text-amber-100' : 'text-slate-200'}`}>
                    {player.name}
                  </span>
                </div>
                <div className="text-right flex flex-col">
                  <span className={`font-black text-xl tracking-tight ${idx === 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                    {player.total}L
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {onExit && (
          <button 
            onClick={onExit}
            className="mt-10 relative z-10 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-amber-950 font-black px-8 py-3 rounded-full uppercase tracking-wider transition-all transform hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(245,158,11,0.4)]"
          >
            Return to Dashboard
          </button>
        )}
      </div>
    </div>
  );
}

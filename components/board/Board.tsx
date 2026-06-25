import React from "react";
import { TileDef, TILE_COUNT } from "@/lib/game-engine/tiles";
import { PlayerState } from "@/lib/db/schema";
import Tile from "./Tile";
import PlayerToken from "./PlayerToken";

interface BoardProps {
  tiles: TileDef[];
  players: PlayerState[];
  onTileClick?: (tile: TileDef) => void;
  rolling?: boolean;
  dice?: number | null;
  overlayMessage?: string | null;
  announcement?: string | null;
  privateMessage?: string | null;
  disabled?: boolean;
}

const PLAYER_COLORS = ["#3B82F6", "#F97316", "#A855F7", "#EC4899"];
const DIE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export default function Board({ tiles, players, onTileClick, rolling, dice, overlayMessage, announcement, privateMessage, disabled }: BoardProps) {
  const [displayDie, setDisplayDie] = React.useState<number>(dice || 1);
  const [showDice, setShowDice] = React.useState(false);

  React.useEffect(() => {
    let interval: any;
    if (rolling) {
      setShowDice(true);
      interval = setInterval(() => {
        setDisplayDie(Math.floor(Math.random() * 6) + 1);
      }, 50);
    } else if (dice) {
      setDisplayDie(dice);
      setShowDice(true);
      const timer = setTimeout(() => setShowDice(false), 2000);
      return () => {
        clearInterval(interval);
        clearTimeout(timer);
      };
    } else {
      setShowDice(false);
    }
    return () => clearInterval(interval);
  }, [rolling, dice]);
  
  const getGridPosition = (index: number) => {
    if (index >= 0 && index <= 5) return { col: index + 1, row: 1 };
    if (index === 6) return { col: 6, row: 2 };
    if (index === 7) return { col: 6, row: 3 };
    if (index >= 8 && index <= 13) return { col: 6 - (index - 8), row: 4 };
    if (index === 14) return { col: 1, row: 3 };
    if (index === 15) return { col: 1, row: 2 };
    return { col: 1, row: 1 };
  };

  return (
    <div className="relative w-full max-w-5xl mx-auto p-4">
      <div 
        className={`board-grid bg-white p-2 rounded-xl shadow-2xl border-4 border-[var(--gold)] transition-all duration-700 ${disabled ? 'grayscale opacity-60 pointer-events-none scale-[0.98]' : ''}`}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
          gridTemplateRows: "repeat(4, minmax(0, 1fr))",
          gap: "8px",
          aspectRatio: "1.5",
        }}
      >
        {/* Render Tiles */}
        {tiles.map((tile, i) => {
          const pos = getGridPosition(i);
          return (
            <div
              key={tile.id}
              style={{
                gridColumn: pos.col,
                gridRow: pos.row,
              }}
              className="relative w-full h-full"
            >
              <Tile tile={tile} onClick={() => onTileClick?.(tile)} />
              
              {/* Render Players on this tile */}
              <div className="absolute inset-0 flex flex-wrap items-start justify-center gap-1 pt-5 px-1 pointer-events-none">
                {players
                  .filter((p) => p.position === i)
                  .map((p, playerIdx) => {
                    // Find actual index in global player array to assign consistent color
                    const globalIdx = players.findIndex((gp) => gp.id === p.id);
                    return (
                      <PlayerToken
                        key={p.id}
                        initials={(p.name || "P")[0].toUpperCase()}
                        color={PLAYER_COLORS[globalIdx % PLAYER_COLORS.length]}
                      />
                    );
                  })}
              </div>
            </div>
          );
        })}

        {/* Center Area (Logo / Info) */}
        <div 
          className="flex flex-col items-center justify-center text-center p-4 bg-[var(--cream)] rounded-lg shadow-inner relative overflow-hidden"
          style={{ gridColumn: "2 / 6", gridRow: "2 / 4", margin: "4px" }}
        >
          {/* Unified Notification Overlay */}
          {(announcement || privateMessage || overlayMessage) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 z-[60] pointer-events-none">
              <div className="bg-[var(--navy)] text-white px-8 py-4 rounded-3xl shadow-2xl border-2 border-[var(--gold)] animate-slide-up max-w-[85%]">
                {announcement && (
                  <p className="text-lg font-black whitespace-pre-line text-center tracking-tight text-[var(--gold)] mb-1">
                    {announcement}
                  </p>
                )}
                {(announcement && (privateMessage || overlayMessage)) && (
                  <div className="w-full h-px bg-[var(--gold)] opacity-20 my-3"></div>
                )}
                {(privateMessage || overlayMessage) && (
                  <p className="text-lg font-black whitespace-pre-line text-center leading-tight">
                    {privateMessage || overlayMessage}
                  </p>
                )}
              </div>
            </div>
          )}

          {showDice && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/40 backdrop-blur-[2px] z-10 rounded-lg animate-scale-in">
              <div className="dice-scene mb-4">
                <div className={`dice-cube ${rolling ? 'rolling' : `show-${displayDie}`}`}>
                  <div className="dice-face face-front">⚀</div>
                  <div className="dice-face face-back">⚅</div>
                  <div className="dice-face face-right">⚂</div>
                  <div className="dice-face face-left">⚃</div>
                  <div className="dice-face face-top">⚁</div>
                  <div className="dice-face face-bottom">⚄</div>
                </div>
              </div>
            </div>
          )}
          <div className="text-6xl mb-2 animate-float">💰</div>
          <h1 className="text-4xl font-black text-[var(--navy)] tracking-tight">
            Wealth<span style={{ color: "var(--gold)" }}>Craft</span>
          </h1>
          <div className="mt-4 flex gap-4 text-sm font-bold text-gray-600">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500"></span> Gain</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500"></span> Loss</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-400"></span> Action</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500"></span> Year End</span>
          </div>
        </div>
      </div>
    </div>
  );
}

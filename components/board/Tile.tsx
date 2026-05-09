import React from "react";
import { TileDef } from "@/lib/game-engine/tiles";

interface TileProps {
  tile: TileDef;
  onClick: () => void;
}

export default function Tile({ tile, onClick }: TileProps) {
  return (
    <div
      onClick={onClick}
      className={`tile-card w-full h-full flex flex-col bg-white shadow-md ${tile.colorClass} hover:shadow-xl`}
      title={tile.description}
    >
      <div className={`${tile.headerBg} tile-header flex justify-between items-center px-2 py-1`}>
        <span>{tile.id}</span>
        {tile.subtitle && <span className="text-[10px] opacity-90">{tile.subtitle}</span>}
      </div>
      
      <div className={`flex-1 flex flex-col items-center justify-center text-center p-1 ${tile.bgClass}`}>
        <div className="text-2xl sm:text-3xl mb-1">{tile.icon}</div>
        <div className="font-bold text-xs sm:text-sm text-[var(--navy)] leading-tight px-1">
          {tile.name}
        </div>
      </div>
    </div>
  );
}

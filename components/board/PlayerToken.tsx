import React from "react";

interface PlayerTokenProps {
  initials: string;
  color: string;
  className?: string;
}

export default function PlayerToken({ initials, color, className = "" }: PlayerTokenProps) {
  return (
    <div
      className={`player-token animate-token-move ${className}`}
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  );
}

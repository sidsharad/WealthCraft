import React, { useState } from "react";

interface DiceRollerProps {
  onRoll: () => void;
  rolling: boolean;
  dice: number | null;
  disabled: boolean;
  label?: string;
}

const DIE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export default function DiceRoller({ onRoll, rolling, dice, disabled, label }: DiceRollerProps) {
  const [displayDie, setDisplayDie] = React.useState<number>(1);

  React.useEffect(() => {
    let interval: any;
    if (rolling) {
      interval = setInterval(() => {
        setDisplayDie(Math.floor(Math.random() * 6) + 1);
      }, 50);
    } else if (dice) {
      setDisplayDie(dice);
    }
    return () => clearInterval(interval);
  }, [rolling, dice]);

  return (
    <div className="flex flex-row items-center gap-6">
      <div className={`dice ${rolling ? 'animate-dice-roll' : ''} text-5xl`}>
        {DIE_FACES[displayDie]}
      </div>

      <button
        onClick={onRoll}
        disabled={disabled || rolling}
        className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:transform-none py-3"
      >
        {rolling ? "Rolling..." : (label || "Roll Dice")}
      </button>
    </div>
  );
}

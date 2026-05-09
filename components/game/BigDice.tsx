import React, { useState, useEffect } from "react";

interface BigDiceProps {
  rolling: boolean;
  dice: number | null;
}

const DIE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export default function BigDice({ rolling, dice }: BigDiceProps) {
  const [displayDie, setDisplayDie] = useState<number>(dice || 1);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let interval: any;
    if (rolling) {
      setVisible(true);
      interval = setInterval(() => {
        setDisplayDie(Math.floor(Math.random() * 6) + 1);
      }, 50);
    } else if (dice) {
      setDisplayDie(dice);
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 2000); // Hide after 2 seconds
      return () => {
        clearInterval(interval);
        clearTimeout(timer);
      };
    } else {
      setVisible(false);
    }
    return () => clearInterval(interval);
  }, [rolling, dice]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center pointer-events-none animate-scale-in">
      <div className={`text-9xl md:text-[12rem] text-[var(--navy)] bg-white/90 backdrop-blur-xl p-12 rounded-[3rem] shadow-[0_20px_50px_rgba(0,0,0,0.2)] border-4 border-[var(--gold)] transform transition-all duration-300 ${rolling ? 'animate-dice-roll' : 'scale-105 shadow-[0_0_40px_rgba(212,175,55,0.4)]'}`}>
        <span className="drop-shadow-xl">{DIE_FACES[displayDie]}</span>
      </div>
    </div>
  );
}

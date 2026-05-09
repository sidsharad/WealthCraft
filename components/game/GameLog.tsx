import React, { useEffect, useRef } from "react";
import { LogEntry } from "@/lib/db/schema";
import { format } from "date-fns";

interface GameLogProps {
  log: LogEntry[];
}

export default function GameLog({ log }: GameLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [log]);

  const getLogType = (text: string) => {
    if (text.includes("rolled") || text.includes("Turn")) return "neutral";
    if (text.includes("+") || text.includes("bonus") || text.includes("won")) return "gain";
    if (text.includes("-") || text.includes("Emergency") || text.includes("Crash") || text.includes("penalty")) return "loss";
    return "system";
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 flex flex-col h-full overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex justify-between items-center">
        <h3 className="font-bold text-[var(--navy)] text-sm uppercase tracking-wider flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-yellow-400"></span> Game Log
        </h3>
        <span className="text-[10px] text-gray-400 font-bold">{log.length} Events</span>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-1 scroll-smooth"
        style={{ maxHeight: '400px' }}
      >
        {log.map((entry, i) => {
          const type = getLogType(entry.text);
          return (
            <div key={i} className={`log-entry ${type}`}>
              <div className="flex justify-between items-start gap-2">
                <p className="flex-1 text-[11px] leading-relaxed text-gray-700">
                  <span className="font-bold text-gray-400 mr-1">T{entry.turn}</span>
                  {entry.text}
                </p>
                <span className="text-[9px] text-gray-300 font-medium whitespace-nowrap">
                  {format(entry.timestamp, "HH:mm")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

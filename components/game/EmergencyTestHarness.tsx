"use client";

import React from "react";
import { PlayerState } from "@/lib/db/schema";

interface EmergencyTestHarnessProps {
  player: PlayerState;
  roomId: string;
  emergencyState?: any;
  onPerformAction: (action: string, payload?: any) => Promise<any>;
}

export function EmergencyTestHarness({ player, roomId, emergencyState, onPerformAction }: EmergencyTestHarnessProps) {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const handleUpdate = async (updates: any) => {
    try {
      await fetch("/api/dev/harness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          playerId: player.id,
          ...updates
        })
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed top-4 left-4 z-50 bg-black/80 text-white p-4 rounded-xl shadow-2xl border border-gray-700 max-h-screen overflow-y-auto text-xs w-80 font-mono">
      <h3 className="font-bold text-red-500 mb-2 border-b border-gray-700 pb-1 text-sm">DEV: Emergency Harness</h3>
      
      <div className="mb-4">
        <div className="font-bold mb-1 text-gray-300">Set Cash:</div>
        <div className="flex gap-2 flex-wrap">
          {[0, 2, 5, 10].map(v => (
            <button key={`c-${v}`} onClick={() => handleUpdate({ cash: v })} className="bg-green-800 hover:bg-green-700 px-2 py-1 rounded">C={v}L</button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="font-bold mb-1 text-gray-300">Set Bonds:</div>
        <div className="flex gap-2 flex-wrap">
          {[0, 3, 5, 10, 15].map(v => (
            <button key={`b-${v}`} onClick={() => handleUpdate({ bonds: v })} className="bg-blue-800 hover:bg-blue-700 px-2 py-1 rounded">B={v}L</button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="font-bold mb-1 text-gray-300">Set Stocks:</div>
        <div className="flex gap-2 flex-wrap">
          {[0, 2, 5, 10, 15].map(v => (
            <button key={`s-${v}`} onClick={() => handleUpdate({ stocks: v })} className="bg-purple-800 hover:bg-purple-700 px-2 py-1 rounded">S={v}L</button>
          ))}
        </div>
      </div>

      <div className="mb-4 border-t border-gray-700 pt-2">
        <div className="font-bold mb-1 text-red-400">Trigger Emergency:</div>
        <div className="flex gap-2 flex-wrap">
          {[3, 5, 10].map(v => (
            <button key={`e-${v}`} onClick={() => onPerformAction("tile-action", { amount: v })} className="bg-red-800 hover:bg-red-700 px-2 py-1 rounded">E={v}L</button>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-700 pt-2 bg-gray-900 p-2 rounded">
        <div className="text-gray-400 mb-1">State Verification:</div>
        <div>Cash: <span className="text-white">{player.cash}L</span></div>
        <div>Bonds: <span className="text-white">{player.bonds}L</span></div>
        <div>Stocks: <span className="text-white">{player.stocks}L</span></div>
        <div className="mt-1 border-t border-gray-700 pt-1">
          Emg Amount: <span className="text-white">{emergencyState?.amount ?? 'None'}</span>
        </div>
        <div>Status: <span className="text-white">{emergencyState?.status ?? 'N/A'}</span></div>
        <div>EventID: <span className="text-gray-400 text-[10px] break-all">{emergencyState?.eventId ?? 'N/A'}</span></div>
      </div>
    </div>
  );
}

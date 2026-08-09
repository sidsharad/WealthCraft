// components/mobile/RightRail.tsx
"use client";

import React, { useState } from "react";
import GameLog from "@/components/game/GameLog";

/**
 * RightRail provides Log and Rules panels with slide‑in animation.
 * The panel state is
 *   activePanel: 'log' | 'rules' | null (closed)
 * which satisfies the required behavior.
 */
export default function RightRail({ turn }: any) {
  const [activePanel, setActivePanel] = useState<'log' | 'rules' | null>(null);

  const togglePanel = (panel: 'log' | 'rules') => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  const closePanel = () => setActivePanel(null);

  return (
    <div className="relative">
      {/* Buttons */}
      <div className="flex space-x-2 mb-2">
        <button
          onClick={() => togglePanel('log')}
          className={`px-3 py-1 rounded-md transition-colors ${activePanel === 'log' ? 'bg-[var(--navy)] text-white' : 'bg-gray-200 text-gray-800'}`}
        >
          Log
        </button>
        <button
          onClick={() => togglePanel('rules')}
          className={`px-3 py-1 rounded-md transition-colors ${activePanel === 'rules' ? 'bg-[var(--navy)] text-white' : 'bg-gray-200 text-gray-800'}`}
        >
          Rules
        </button>
      </div>

      {/* Sliding panel */}
      <div
        className={`fixed inset-y-0 right-0 w-72 bg-white/90 backdrop-blur-md shadow-lg border-l border-gray-200 transition-transform duration-200 ease-in-out ${
          activePanel ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex justify-between items-center p-2 border-b border-gray-100">
          <h3 className="font-semibold text-[var(--navy)]">
            {activePanel === 'log' ? 'Game Log' : 'Rules & Returns'}
          </h3>
          <button onClick={closePanel} className="text-gray-500 hover:text-gray-800">
            ✕
          </button>
        </div>
        <div className="p-3 overflow-y-auto h-[calc(100%-2rem)]">
          {activePanel === 'log' && <GameLog log={turn.gameState?.log || []} />}
          {activePanel === 'rules' && (
            <div className="space-y-4 max-h-[620px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200">
              {/* Reuse the rules markup from the desktop sidebar */}
              <section>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
                  Market Returns (Paid in Asset)
                </h3>
                <div className="grid grid-cols-1 gap-1.5">
                  <div className="bg-blue-50/75 p-2 rounded-xl border border-blue-100/60 flex justify-between items-center">
                    <div className="text-[10px] font-bold text-blue-800 uppercase">Bonds Return</div>
                    <div className="text-xs font-black text-blue-900">+1L Bond <span className="text-[8px] font-normal opacity-70">/ 5L held</span></div>
                  </div>
                  <div className="bg-purple-50/75 p-2 rounded-xl border border-purple-100/60 flex justify-between items-center">
                    <div className="text-[10px] font-bold text-purple-800 uppercase">Stocks Return</div>
                    <div className="text-xs font-black text-purple-900">+2L Stock <span className="text-[8px] font-normal opacity-70">/ 5L held</span></div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
                  Market Events (Per 5L Stocks Held)
                </h3>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="bg-green-50 p-2 rounded-xl border border-green-100/80 flex flex-col gap-0.5">
                    <div className="text-[8px] font-black text-green-800 uppercase flex items-center gap-1">📈 Stock Rally</div>
                    <span className="text-[9px] font-bold text-green-900">+2L Stocks <span className="text-[7px] font-normal opacity-75">(You Only)</span></span>
                  </div>
                  <div className="bg-red-50 p-2 rounded-xl border border-red-100/80 flex flex-col gap-0.5">
                    <div className="text-[8px] font-black text-red-800 uppercase flex items-center gap-1">📉 Stock Crash</div>
                    <span className="text-[9px] font-bold text-red-900">-2L Stocks <span className="text-[7px] font-normal opacity-75">(You Only)</span></span>
                  </div>
                  <div className="bg-emerald-50 p-2 rounded-xl border border-emerald-100/80 flex flex-col gap-0.5">
                    <div className="text-[8px] font-black text-emerald-800 uppercase flex items-center gap-1">🌟 Market Rally</div>
                    <span className="text-[9px] font-bold text-emerald-900">+3L Stocks <span className="text-[7px] font-normal opacity-75">(ALL Players)</span></span>
                  </div>
                  <div className="bg-rose-50 p-2 rounded-xl border border-rose-100/80 flex flex-col gap-0.5">
                    <div className="text-[8px] font-black text-rose-800 uppercase flex items-center gap-1">💥 Market Crash</div>
                    <span className="text-[9px] font-bold text-rose-900">-3L Stocks <span className="text-[7px] font-normal opacity-75">(ALL Players)</span></span>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Core Objectives</h3>
                <ul className="space-y-1 text-[10px] font-bold text-gray-600">
                  <li className="flex gap-2 items-start"><span className="text-[var(--gold)] mt-0.5">●</span> <strong>100L Net Worth:</strong> Reach 100L assets to win the game.</li>
                  <li className="flex gap-2 items-start"><span className="text-[var(--gold)] mt-0.5">●</span> <strong>House Deadline:</strong> Must buy by end of Year 3. Auto-bought at 20L on entering Year 4.</li>
                  <li className="flex gap-2 items-start"><span className="text-[var(--gold)] mt-0.5">●</span> <strong>Asset Limit:</strong> Max 40L in one asset type. Audit target if exceeded.</li>
                </ul>
              </section>

              <section>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Costs & Actions</h3>
                <ul className="space-y-1 text-[10px] font-bold text-gray-600">
                  <li className="flex gap-2 items-start"><span className="text-[var(--gold)] mt-0.5">●</span> <strong>Mid-Year Rebalance:</strong> Costs a 3L fine outside of Year‑End START.</li>
                  <li className="flex gap-2 items-start"><span className="text-[var(--gold)] mt-0.5">●</span> <strong>Tax Raid:</strong> Proposer pays 2L to enforce audit. Target player pays 5L.</li>
                  <li className="flex gap-2 items-start"><span className="text-[var(--gold)] mt-0.5">●</span> <strong>Hostile Takeover:</strong> Take up to 5L of one asset from another player (no splitting).</li>
                  <li className="flex gap-2 items-start"><span className="text-[var(--gold)] mt-0.5">●</span> <strong>Emergency:</strong> Costs 5L or 10L paid in Cash.</li>
                </ul>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";

interface QAPassAndPlayPanelProps {
  isLocal: boolean;
  onPerformAction: (action: string, payload?: any) => Promise<any>;
}

export function QAPassAndPlayPanel({ isLocal, onPerformAction }: QAPassAndPlayPanelProps) {
  const [qaEnabled, setQaEnabled] = useState(false);

  useEffect(() => {
    // Check URL parameters or local storage for the QA override flag
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("qa") === "1" || localStorage.getItem("QA_ENABLED") === "1") {
      setQaEnabled(true);
      localStorage.setItem("QA_ENABLED", "1");
    }
  }, []);

  if (!isLocal && !qaEnabled) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 bg-red-600 text-white p-3 rounded-xl shadow-2xl font-mono text-xs border-2 border-red-800 backdrop-blur-md bg-opacity-90">
      <div className="font-black mb-2 uppercase tracking-wider flex justify-between items-center border-b border-red-500 pb-1">
        <span>QA: Trigger Emergency</span>
        {qaEnabled && (
          <button 
            onClick={() => {
              localStorage.removeItem("QA_ENABLED");
              window.location.reload();
            }}
            className="text-white hover:text-red-200 ml-4 underline text-[10px]"
          >
            [Disable QA]
          </button>
        )}
      </div>
      <div className="flex gap-2 mt-2">
        <button 
          onClick={() => onPerformAction("qa-force-emergency", { amount: 3 })}
          className="bg-black bg-opacity-40 hover:bg-opacity-60 px-3 py-2 rounded font-bold transition-all"
        >
          Force 3L
        </button>
        <button 
          onClick={() => onPerformAction("qa-force-emergency", { amount: 5 })}
          className="bg-black bg-opacity-40 hover:bg-opacity-60 px-3 py-2 rounded font-bold transition-all"
        >
          Force 5L
        </button>
        <button 
          onClick={() => onPerformAction("qa-force-emergency", { amount: 10 })}
          className="bg-black bg-opacity-40 hover:bg-opacity-60 px-3 py-2 rounded font-bold transition-all"
        >
          Force 10L
        </button>
      </div>
    </div>
  );
}

// components/mobile/PortraitLockOverlay.tsx
"use client";
import React from "react";

export default function PortraitLockOverlay() {
  return (
    <div
      id="portrait-lock"
      className="fixed inset-0 flex flex-col items-center justify-center bg-[#1a1a2e] text-white z-[9999] text-center p-8 gap-3 select-none"
    >
      <div className="text-5xl animate-[spin_2s_ease-in-out_infinite] mb-2">📱</div>
      <p className="text-sm leading-relaxed opacity-90 max-w-xs">
        Rotate your phone to <strong className="text-[#e6a817] font-bold">landscape</strong> to play WealthCraft
      </p>
    </div>
  );
}

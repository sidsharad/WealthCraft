// components/mobile/PortraitLockOverlay.tsx
"use client";
import React from "react";

export default function PortraitLockOverlay() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50">
      <div className="bg-white p-6 rounded shadow-md text-center">
        <p className="text-lg font-semibold mb-2">Please rotate your device</p>
        <p className="text-sm text-gray-600">For the best experience, use landscape orientation.</p>
      </div>
    </div>
  );
}

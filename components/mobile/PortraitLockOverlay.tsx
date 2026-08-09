// components/mobile/PortraitLockOverlay.tsx
"use client";

import React from "react";

/**
 * Full‑screen overlay shown when a mobile device is in portrait orientation.
 * It instructs the user to rotate to landscape for the mobile UI.
 */
export default function PortraitLockOverlay() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[var(--cream)] bg-opacity-90 backdrop-blur-md z-50">
      <div className="text-center p-6 bg-white rounded-xl shadow-lg">
        <h2 className="text-2xl font-bold mb-2 text-[var(--navy)]">Rotate Device</h2>
        <p className="text-gray-600 mb-4">For the best experience, please turn your device to landscape orientation.</p>
        <svg
          className="mx-auto animate-bounce"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 2v20M5 15l7 7 7-7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

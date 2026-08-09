// components/mobile/TouchButton.tsx
"use client";

import React from "react";
import type { ReactNode } from "react";

interface TouchButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

export default function TouchButton({ onClick, disabled = false, className = "", children }: TouchButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-3 rounded-xl bg-white/80 backdrop-blur-md shadow-md hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

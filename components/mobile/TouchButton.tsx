// components/mobile/TouchButton.tsx
"use client";
import React from "react";

type TouchButtonProps = {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
};

export default function TouchButton({ onClick, disabled, children }: TouchButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-w-[44px] min-h-[44px] px-3 py-2 bg-[var(--cream)] text-sm font-medium rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

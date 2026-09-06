// components/mobile/TouchButton.tsx
"use client";
import React from "react";

type TouchButtonProps = {
  id?: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  primary?: boolean;
};

export default function TouchButton({
  id,
  onClick,
  disabled,
  children,
  className = "",
  primary = false,
}: TouchButtonProps) {
  const baseClasses =
    "min-h-[44px] h-[clamp(44px,9vh,52px)] rounded-lg font-semibold text-[clamp(9px,1.4vw,12px)] px-[clamp(9px,1.4vw,15px)] flex items-center justify-center gap-1 whitespace-nowrap transition-all select-none active:scale-[0.97] disabled:opacity-35 disabled:pointer-events-none cursor-pointer";

  const themeClasses = primary
    ? "bg-[#e6a817] border border-[#d49000] text-white font-bold shadow-sm active:bg-[#c8920e]"
    : "bg-white border-[1.5px] border-[#ccc] text-[#333] active:bg-[#f5f5f5]";

  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${themeClasses} ${className}`}
    >
      {children}
    </button>
  );
}

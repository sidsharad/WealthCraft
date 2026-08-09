// components/mobile/MobileLayout.tsx
"use client";

import React, { ReactNode } from "react";

interface MobileLayoutProps {
  children: ReactNode;
}

export default function MobileLayout({ children }: MobileLayoutProps) {
  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--cream)] overflow-hidden relative">
      {children}
    </div>
  );
}

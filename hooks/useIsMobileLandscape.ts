// hooks/useIsMobileLandscape.ts
"use client";

import { useState, useEffect } from "react";

export default function useIsMobileLandscape(): boolean {
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);

  useEffect(() => {
    const check = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isLandscape = width > height;
      // Consider mobile when width is below the Tailwind lg breakpoint (1024px)
      const isPotentialMobile = width < 1024;
      setIsMobileLandscape(isLandscape && isPotentialMobile);
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  return isMobileLandscape;
}

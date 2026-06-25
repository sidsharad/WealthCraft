"use client";

import { useEffect, useState } from "react";
import { checkVersion } from "@/hooks/useVersion";

export default function VersionDetector() {
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // 1. Listen for global mismatch events fired by API interactions (zero overhead gameplay checks)
    const handleMismatch = () => {
      setHasNewVersion(true);
    };
    window.addEventListener("version-mismatch", handleMismatch);

    // 2. Lightweight background polling for non-gameplay screens
    // Only check every 10 minutes when the tab is visible.
    const pollVersion = async () => {
      if (document.visibilityState !== "visible") return;
      
      try {
        const res = await fetch("/api/version");
        if (!res.ok) return;
        const data = await res.json();
        if (data.appVersion) {
          checkVersion(data.appVersion);
        }
      } catch (err) {
        // Silently ignore network errors during background check
      }
    };

    const intervalId = setInterval(pollVersion, 10 * 60 * 1000); // 10 minutes

    return () => {
      window.removeEventListener("version-mismatch", handleMismatch);
      clearInterval(intervalId);
    };
  }, []);

  if (!hasNewVersion || dismissed) {
    return null;
  }

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="fixed top-0 left-0 w-full bg-blue-600 text-white p-3 z-[100] flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 shadow-md animate-slide-down">
      <p className="font-semibold text-sm text-center">A new version of WealthCraft is available.</p>
      <div className="flex gap-2">
        <button 
          onClick={handleRefresh}
          className="bg-white text-blue-600 px-4 py-1 rounded-full font-bold text-sm hover:bg-blue-50 transition shrink-0"
        >
          Refresh Now
        </button>
        <button 
          onClick={() => setDismissed(true)}
          className="text-white border border-white px-4 py-1 rounded-full font-bold text-sm hover:bg-white/20 transition shrink-0"
        >
          Later
        </button>
      </div>
    </div>
  );
}

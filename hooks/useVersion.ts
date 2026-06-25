"use client";

import { useEffect } from "react";

export const CLIENT_VERSION = process.env.NEXT_PUBLIC_APP_VERSION;

/**
 * Compares a version string (usually from an API response) with the
 * hardcoded client bundle version. If a mismatch is detected, it fires
 * a global event that the VersionDetector UI component listens for.
 */
export function checkVersion(serverVersion?: string | null) {
  if (!serverVersion || !CLIENT_VERSION) return false;
  if (serverVersion !== CLIENT_VERSION) {
    window.dispatchEvent(new CustomEvent("version-mismatch", { 
      detail: { serverVersion, clientVersion: CLIENT_VERSION } 
    }));
    return true;
  }
  return false;
}

/**
 * Internal hook used by the global VersionDetector component
 * to manage the event listener state.
 */
export function useVersionDetector() {
  // We don't maintain state here to avoid re-rendering the whole tree.
  // This is just a utility structure for the detector component.
}

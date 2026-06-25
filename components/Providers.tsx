"use client";
import { SessionProvider } from "next-auth/react";

export default function Providers({ children }: { children: React.ReactNode }) {
  // refetchInterval=0: disable periodic background session re-validation (was causing burst traffic).
  // refetchOnWindowFocus=false: disable aggressive re-validation on tab focus (observed as 9 req/sec bursts).
  // Session is still validated correctly on initial page load and on explicit user actions (sign-in/out).
  return (
    <SessionProvider refetchInterval={0} refetchOnWindowFocus={false}>
      {children}
    </SessionProvider>
  );
}

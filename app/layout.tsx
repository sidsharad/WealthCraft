import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WealthCraft Online",
  description: "The multiplayer financial strategy board game. Invest, trade, and race to 1 Crore!",
  keywords: ["board game", "multiplayer", "finance", "strategy", "WealthCraft"],
};

import Providers from "@/components/Providers";
import VersionDetector from "@/components/VersionDetector";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen" style={{ background: "var(--cream)" }} suppressHydrationWarning>
        <Providers>
          <VersionDetector />
          {children}
        </Providers>
      </body>
    </html>
  );
}

"use client";

export const dynamic = "force-dynamic";

import { useRouter } from "next/navigation";

// Consistent deterministic pseudo-random generator to avoid hydration mismatches
function getDeterministicValue(seed: number, min: number, max: number): number {
  const x = Math.sin(seed) * 10000;
  const rand = x - Math.floor(x);
  return min + rand * (max - min);
}

export default function HomePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(135deg, #1A2744 0%, #0f172a 50%, #1A6B3C 100%)" }}>
      {/* Stars/particles effect */}
      <div className="absolute inset-0 overflow-hidden" style={{ pointerEvents: "none" }}>
        {Array.from({ length: 30 }).map((_, i) => {
          const size = getDeterministicValue(i * 12.34, 2, 6);
          const top = getDeterministicValue(i * 23.45, 0, 100);
          const left = getDeterministicValue(i * 34.56, 0, 100);
          const duration = getDeterministicValue(i * 45.67, 3, 7);
          const delay = getDeterministicValue(i * 56.78, 0, 3);
          return (
            <div
              key={i}
              className="absolute rounded-full bg-white opacity-10"
              style={{
                width: `${size}px`,
                height: `${size}px`,
                top: `${top}%`,
                left: `${left}%`,
                animation: `float ${duration}s ease-in-out infinite`,
                animationDelay: `${delay}s`,
              }}
            />
          );
        })}
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex justify-between items-center px-8 py-5">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💰</span>
          <span className="text-white font-black text-xl tracking-tight">WealthCraft</span>
        </div>
        <div className="flex items-center gap-3">
          <a href="/login" className="text-white/80 hover:text-white font-medium px-4 py-2 rounded-lg hover:bg-white/10 transition-all">
            Login
          </a>
          <a href="/register" className="btn-primary text-sm">
            Play Now
          </a>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 py-16">
        <div className="animate-float mb-6">
          <div className="text-8xl mb-2">🎲</div>
        </div>

        <h1 className="text-5xl md:text-7xl font-black text-white mb-4 leading-tight">
          Wealth<span style={{ color: "var(--gold)" }}>Craft</span>
          <span className="block text-3xl md:text-4xl font-bold text-white/60 mt-1">Online</span>
        </h1>

        <p className="text-xl text-white/70 max-w-xl mb-10 leading-relaxed">
          The multiplayer financial strategy board game. Invest in bonds and stocks,
          survive market crashes, and be the first to build <span style={{ color: "var(--gold)" }}>₹1 Crore</span> in wealth.
        </p>

        <div className="flex flex-wrap gap-4 justify-center mb-14">
          <a href="/register" className="btn-primary text-base px-8 py-3">
            🚀 Start Playing Free
          </a>
          <a href="/lobby" className="btn-secondary text-base px-8 py-3">
            Join a Room
          </a>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full">
          {[
            { icon: "🌐", title: "Online Multiplayer", desc: "Play online with friends. Supports human players and optional AI bots.", link: "/lobby?mode=online" },
            { icon: "🤖", title: "Play vs Bots", desc: "Challenge AI opponents in a solo game.", link: "/lobby?mode=solo" },
            { icon: "🤝", title: "Local Pass-and-Play", desc: "Play locally with friends and optional AI bots.", link: "/lobby?mode=local" },
            { icon: "📚", title: "Complete Rulebook", desc: "Learn rules, strategies, assets, trading and audits.", link: "/rules", download: false },
          ].map((f) => {
            const cardClasses = `bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-left border border-white/20 h-full transition-all block no-underline hover:bg-white/15 cursor-pointer`;

            const handleClick = (e: React.MouseEvent) => {
              if (f.download) return;
              e.preventDefault();
              router.push(f.link);
            };

            if (f.link) {
              return f.download ? (
                <a key={f.title} href={f.link} download className={cardClasses}>
                  <div className="text-3xl mb-3">{f.icon}</div>
                  <h3 className="text-white font-bold text-lg mb-1">{f.title}</h3>
                  <p className="text-white/60 text-sm leading-relaxed">{f.desc}</p>
                </a>
              ) : (
                <a key={f.title} href={f.link} onClick={handleClick} className={cardClasses}>
                  <div className="text-3xl mb-3">{f.icon}</div>
                  <h3 className="text-white font-bold text-lg mb-1">{f.title}</h3>
                  <p className="text-white/60 text-sm leading-relaxed">{f.desc}</p>
                </a>
              );
            }

            return (
              <div key={f.title} className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-left border border-white/20 h-full">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="text-white font-bold text-lg mb-1">{f.title}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </main>

      {/* Stats bar */}
      <div className="relative z-10 border-t border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-8 py-5 flex flex-wrap justify-center gap-10 text-center">
          {[
            { value: "16", label: "Board Tiles" },
            { value: "4", label: "Max Players" },
            { value: "₹1Cr", label: "Win Target" },
            { value: "100%", label: "Rule Faithful" },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-2xl font-black" style={{ color: "var(--gold)" }}>{s.value}</div>
              <div className="text-white/50 text-xs">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

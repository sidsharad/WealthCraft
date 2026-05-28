import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(135deg, #1A2744 0%, #0f172a 50%, #1A6B3C 100%)" }}>
      {/* Stars/particles effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white opacity-10"
            style={{
              width: Math.random() * 4 + 2 + "px",
              height: Math.random() * 4 + 2 + "px",
              top: Math.random() * 100 + "%",
              left: Math.random() * 100 + "%",
              animation: `float ${3 + Math.random() * 4}s ease-in-out infinite`,
              animationDelay: Math.random() * 3 + "s",
            }}
          />
        ))}
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex justify-between items-center px-8 py-5">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💰</span>
          <span className="text-white font-black text-xl tracking-tight">WealthCraft</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-white/80 hover:text-white font-medium px-4 py-2 rounded-lg hover:bg-white/10 transition-all">
            Login
          </Link>
          <Link href="/register" className="btn-primary text-sm">
            Play Now
          </Link>
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
          <Link href="/register" className="btn-primary text-base px-8 py-3">
            🚀 Start Playing Free
          </Link>
          <Link href="/lobby" className="btn-secondary text-base px-8 py-3">
            Join a Room
          </Link>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl w-full">
          {[
            { icon: "🌐", title: "Online Multiplayer", desc: "Play with 2–4 friends with a 6-char room code. Real-time updates via live sync.", link: "/lobby" },
            { icon: "🤝", title: "Pass-and-Play", desc: "No sign-in needed for friends on one device. Includes AI bot players.", link: "/lobby?mode=local" },
            { icon: "📊", title: "The Complete Rulebook", desc: "Bonds, stocks, cash, audit, auctions, hostile takeovers and trade. Click here to read the entire rulebook", link: "/rules", download: false },
          ].map((f) => {
            const CardContent = (
              <div className={`bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-left border border-white/20 h-full transition-all ${f.link ? 'hover:bg-white/15 cursor-pointer' : ''}`}>
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="text-white font-bold text-lg mb-1">{f.title}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{f.desc}</p>
              </div>
            );

            if (f.link) {
              return f.download ? (
                <a key={f.title} href={f.link} download className="block no-underline h-full">
                  {CardContent}
                </a>
              ) : (
                <Link key={f.title} href={f.link} className="block no-underline h-full">
                  {CardContent}
                </Link>
              );
            }

            return <div key={f.title} className="h-full">{CardContent}</div>;
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

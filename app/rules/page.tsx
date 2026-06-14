import Link from "next/link";
import { ArrowLeft, BookOpen, Coins, ShieldCheck, Scale, Home, Users, HelpCircle, AlertTriangle, RefreshCw } from "lucide-react";

// Consistent deterministic pseudo-random generator to avoid hydration mismatches
function getDeterministicValue(seed: number, min: number, max: number): number {
  const x = Math.sin(seed) * 10000;
  const rand = x - Math.floor(x);
  return min + rand * (max - min);
}

export default function RulesPage() {
  return (
    <div className="min-h-screen flex flex-col relative" style={{ background: "linear-gradient(135deg, #1A2744 0%, #0f172a 50%, #1A6B3C 100%)" }}>
      {/* Background Star floating animation */}
      <div className="absolute inset-0 overflow-hidden" style={{ pointerEvents: "none" }}>
        {Array.from({ length: 25 }).map((_, i) => {
          const size = getDeterministicValue(i * 98.76, 2, 6);
          const top = getDeterministicValue(i * 87.65, 0, 100);
          const left = getDeterministicValue(i * 76.54, 0, 100);
          return (
            <div
              key={i}
              className="absolute rounded-full bg-white opacity-5"
              style={{
                width: `${size}px`,
                height: `${size}px`,
                top: `${top}%`,
                left: `${left}%`,
              }}
            />
          );
        })}
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex justify-between items-center px-8 py-5 border-b border-white/10 bg-black/10 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2 text-white/80 hover:text-white transition-all font-medium">
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Home</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-2xl">💰</span>
          <span className="text-white font-black text-xl tracking-tight">WealthCraft</span>
        </div>
      </nav>

      {/* Main Container */}
      <main className="relative z-10 flex-1 max-w-5xl w-full mx-auto px-6 py-12">
        
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-white/5 border border-white/10 mb-4 animate-float">
            <BookOpen className="w-12 h-12" style={{ color: "var(--gold, #E2B240)" }} />
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-3">
            The Complete <span style={{ color: "var(--gold, #E2B240)" }}>Rulebook</span>
          </h1>
          <p className="text-white/60 text-lg max-w-xl mx-auto">
            WealthCraft | 2 - 4 Players | Ages 14+
          </p>
        </div>

        {/* 1. Overview Section */}
        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-8 border border-white/10 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Coins className="w-6 h-6 text-yellow-400" />
            <h2 className="text-2xl font-bold text-white">Overview & Goal</h2>
          </div>
          <p className="text-white/80 leading-relaxed mb-4">
            Welcome to <strong className="text-white font-semibold">WealthCraft</strong>, the ultimate financial strategy simulation board game. 
            Your goal is simple but challenging: <strong className="text-yellow-400">Be the first player to build a net worth of 1 Crore (100L)</strong> in Cash, Bonds, and Stocks combined. 
            Navigate fluctuating market cycles, manage volatile stock rallies and crashes, participate in sealed house auctions, audit your rivals, and strategically trade to outplay the market.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div className="bg-black/20 p-4 rounded-xl border border-white/5">
              <h3 className="text-white font-bold mb-1">🎮 Initial Setup</h3>
              <ul className="text-white/60 text-sm list-disc pl-5 space-y-1">
                <li>Each player receives <strong className="text-white">10L Cash</strong> to start.</li>
                <li>All players begin on the <strong className="text-white">Start Tile</strong>.</li>
                <li>Initial Stocks and Bonds start at 0L.</li>
                <li>Before the first roll, each player may rebalance their 10L freely into bonds or stocks in <strong className="text-white">5L blocks</strong>.</li>
              </ul>
            </div>
            <div className="bg-black/20 p-4 rounded-xl border border-white/5">
              <h3 className="text-white font-bold mb-1">⚙️ Win Conditions</h3>
              <ul className="text-white/60 text-sm list-disc pl-5 space-y-1">
                <li>When any player's net worth reaches <strong className="text-white">100L</strong>, the endgame triggers.</li>
                <li>All players complete the current round so everyone has had <strong className="text-white">equal turns</strong>.</li>
                <li>The player with the highest net worth wins.</li>
                <li><strong className="text-white">Tiebreaker</strong>: Player with more holdings in Stocks wins.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 2. Turn Structure Section */}
        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-8 border border-white/10 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <RefreshCw className="w-6 h-6 text-green-400" />
            <h2 className="text-2xl font-bold text-white">Your Turn Sequence</h2>
          </div>
          <p className="text-white/80 leading-relaxed mb-6">
            During your turn, actions must be performed in the following strict order:
          </p>
          <div className="space-y-4">
            {[
              { num: "1", title: "Roll & Move", desc: "Roll the dice and move your token forward by the exact number rolled." },
              { num: "2", title: "Collect Income", desc: "Add 5L cash to your balance (blocked if currently on an Income Freeze tile)." },
              { num: "3", title: "Tile Action", desc: "Execute the effect of your landing tile. All tile actions are mandatory." },
              { num: "4", title: "Trade Offer (Optional)", desc: "Propose a deal (mix of Cash, Bonds, Stocks) to any player. Both players must agree." },
              { num: "5", title: "Audit Portfolio (Optional)", desc: "Inspect a rival's portfolio for holdings above the 40L threshold. False alarms cost 5L." },
              { num: "6", title: "Asset Rebalance (Optional)", desc: "Convert assets mid-year in 5L blocks. Each mid-year transaction incurs a 3L penalty." }
            ].map((step) => (
              <div key={step.num} className="flex gap-4 bg-black/20 p-4 rounded-xl border border-white/5 hover:border-white/10 transition-all">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white font-bold border border-white/20">
                  {step.num}
                </div>
                <div>
                  <h3 className="text-white font-bold text-base mb-1">{step.title}</h3>
                  <p className="text-white/60 text-sm leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Assets & Returns Table */}
        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-8 border border-white/10 mb-8 overflow-hidden">
          <div className="flex items-center gap-3 mb-4">
            <Coins className="w-6 h-6 text-yellow-400" />
            <h2 className="text-2xl font-bold text-white">Assets & Year-End Returns</h2>
          </div>
          <p className="text-white/80 leading-relaxed mb-6">
            All asset investments, purchases, and rebalancing transactions must be in multiples of <strong className="text-white">5L blocks</strong>. 
            Returns are calculated and paid <strong className="text-yellow-400">at Year-End only</strong> (when landing on or passing the Start tile). 
            Only complete 5L blocks earn returns; partial blocks do not qualify. All returns are paid directly in Cash.
          </p>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/20">
            <table className="min-w-full divide-y divide-white/10">
              <thead>
                <tr className="bg-white/5">
                  <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Asset Class</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Return Rate</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">5L</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">10L</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">15L</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">20L</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">25L+</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-white/80">
                <tr>
                  <td className="px-6 py-4 font-bold text-white">💰 Cash</td>
                  <td className="px-6 py-4 text-sm text-white/50">No return</td>
                  <td className="px-6 py-4 text-center text-sm font-semibold">₹0L</td>
                  <td className="px-6 py-4 text-center text-sm font-semibold">₹0L</td>
                  <td className="px-6 py-4 text-center text-sm font-semibold">₹0L</td>
                  <td className="px-6 py-4 text-center text-sm font-semibold">₹0L</td>
                  <td className="px-6 py-4 text-center text-sm font-semibold">₹0L</td>
                </tr>
                <tr className="bg-white/5">
                  <td className="px-6 py-4 font-bold text-blue-300">🛡️ Bonds</td>
                  <td className="px-6 py-4 text-sm text-blue-200/80">+1L return / 5L block</td>
                  <td className="px-6 py-4 text-center text-sm font-bold text-yellow-400">+₹1L</td>
                  <td className="px-6 py-4 text-center text-sm font-bold text-yellow-400">+₹2L</td>
                  <td className="px-6 py-4 text-center text-sm font-bold text-yellow-400">+₹3L</td>
                  <td className="px-6 py-4 text-center text-sm font-bold text-yellow-400">+₹4L</td>
                  <td className="px-6 py-4 text-center text-sm font-bold text-yellow-400">+₹5L</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-bold text-green-300">📈 Stocks</td>
                  <td className="px-6 py-4 text-sm text-green-200/80">+2L return / 5L block</td>
                  <td className="px-6 py-4 text-center text-sm font-bold text-yellow-400">+₹2L</td>
                  <td className="px-6 py-4 text-center text-sm font-bold text-yellow-400">+₹4L</td>
                  <td className="px-6 py-4 text-center text-sm font-bold text-yellow-400">+₹6L</td>
                  <td className="px-6 py-4 text-center text-sm font-bold text-yellow-400">+₹8L</td>
                  <td className="px-6 py-4 text-center text-sm font-bold text-yellow-400">+₹10L</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. Strategic Rules (House, Audits, Trade) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10 flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              <Home className="w-6 h-6 text-amber-400" />
              <h3 className="text-lg font-bold text-white">House Purchases</h3>
            </div>
            <p className="text-white/60 text-sm leading-relaxed flex-1">
              You must own a house by the end of <strong className="text-white font-semibold">Year 3</strong>. 
              Bid in sealed auctions (min 10L) when landing on the House Auction tile. If missed, buy at market price (<strong className="text-white">20L cash</strong>). 
              If unowned at Year 3 Year-End, pay 20L automatically (can go negative).
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10 flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              <Scale className="w-6 h-6 text-red-400" />
              <h3 className="text-lg font-bold text-white">Portfolio Audits</h3>
            </div>
            <div className="text-white/60 text-sm leading-relaxed flex-1 space-y-2">
              <p><strong className="text-white">Years 1–2:</strong> Players become auditable if they hold more than 20L in any single asset class.</p>
              <p><strong className="text-white">Year 3 onwards:</strong> Players become auditable if they hold more than 40L in any single asset class.</p>
              <p>On a successful audit, all excess above the applicable threshold is confiscated and transferred to the auditing player.</p>
              <p>False audits cost <strong className="text-white">5L</strong>.</p>
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10 flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              <Users className="w-6 h-6 text-blue-400" />
              <h3 className="text-lg font-bold text-white">Trading & Free Trade</h3>
            </div>
            <p className="text-white/60 text-sm leading-relaxed flex-1">
              Offer a trade once per turn to any active player. Deals can combine Cash, Bonds, and Stocks. 
              Both players must mutually agree. 
              <br /><br />
              <strong className="text-white font-semibold">Free Trade Zone</strong>: If a trade is executed inside this zone and represents 25L+ in assets, both players receive a <strong className="text-white">5L incentive</strong>.
            </p>
          </div>
        </div>

        {/* 5. Tile Reference */}
        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-8 border border-white/10 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <AlertTriangle className="w-6 h-6 text-red-400" />
            <h2 className="text-2xl font-bold text-white">Tile Reference Directory</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { name: "📉 Market Crash", desc: "Global asset crash. All players lose 3L stocks per complete 5L stocks held." },
              { name: "📈 Market Rally", desc: "Global asset boom. All players gain 3L stocks per complete 5L stocks held." },
              { name: "🎁 Bonus Tile", desc: "Reward. Collect 2L cash immediately from the bank." },
              { name: "🚀 Stock Rally", desc: "Your stocks boom. Receive +2L stocks per 5L stocks held (only you)." },
              { name: "💥 Stock Crash", desc: "Your stocks drop. Deduct -2L stocks per 5L stocks held (only you)." },
              { name: "📊 IPO", desc: "Early investment opportunity. Invest up to 5L cash, receive 2x that amount in stocks." },
              { name: "❄️ Income Freeze", desc: "Temporary block. You do not collect the 5L income during Step 2 of this turn." },
              { name: "🚨 Emergency", desc: "Unforeseen expenses. Draw a fee randomly and pay 5L or 10L cash to the bank." },
              { name: "🎟️ Lottery", desc: "Option to pay 2L to roll: 1-2 = nothing, 3-4 = receive +2L cash, 5-6 = receive +5L cash." },
              { name: "🏠 House Auction", desc: "Sealed-bid auction. All players submit a secret bid (min 10L). Highest bid wins." },
              { name: "🕵️ Tax Raid", desc: "Targeted tax inspection. Pay 2L to bank to target any rival; they must pay 5L to the bank." },
              { name: "⚔️ Hostile Takeover", desc: "Takeover action. Confiscate up to 5L of any asset type from any rival. Cannot split assets." },
              { name: "🤝 Free Trade Zone", desc: "Special zone effect. Gives an additional 5L cash to both players if the executed trade transaction is worth 25L or more." }
            ].map((tile) => (
              <div key={tile.name} className="bg-black/20 p-4 rounded-xl border border-white/5">
                <strong className="text-white text-base block mb-1">{tile.name}</strong>
                <p className="text-white/60 text-sm leading-relaxed">{tile.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 6. Tips Section */}
        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-8 border border-white/10">
          <div className="flex items-center gap-3 mb-6">
            <HelpCircle className="w-6 h-6 text-purple-400" />
            <h2 className="text-2xl font-bold text-white">Beginner Tips & Strategy</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div className="space-y-4">
              <div>
                <strong className="text-white text-base block mb-1">🌅 Early Game Strategy</strong>
                <p className="text-white/60 leading-relaxed">
                  Avoid hoarding idle cash early in the game because it yields zero returns. Rebalance into Stocks early to accelerate your wealth building. Keep a small buffer (5L cash) for unexpected emergency tiles and begin saving 10-15L cash specifically for the first House Auction.
                </p>
              </div>
              <div>
                <strong className="text-white text-base block mb-1">🛡️ Balanced Asset Allocation</strong>
                <p className="text-white/60 leading-relaxed">
                  Diversify your holdings. While Stocks can skyrocket, they are extremely vulnerable to market and individual crashes. Bonds offer lower yield (+1L / 5L) but are completely crash-proof—ideal for locking in stability as you approach the 100L target.
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <strong className="text-white text-base block mb-1">⚖️ Audit Tactics & Evasion</strong>
                <p className="text-white/60 leading-relaxed">
                  Constantly monitor your opponent's holdings. If their portfolio card highlights any asset exceeding the applicable threshold (20L early, 40L later), initiate an audit to slice down their wealth. To protect yourself, always utilize the free Year-End rebalance phase to stay under the current limit.
                </p>
              </div>
              <div>
                <strong className="text-white text-base block mb-1">🏆 Winning the Endgame</strong>
                <p className="text-white/60 leading-relaxed">
                  When a player gets close to 100L, coordinate with other players to target them via Hostile Takeovers or Tax Raids. Leverage trade deals with trailing players who might have crash-resistant Bonds or highly liquid cash you need to purchase your final assets.
                </p>
              </div>
            </div>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 bg-black/30 backdrop-blur-md py-6 text-center text-white/40 text-sm">
        <p>© 2026 WealthCraft. All Rights Reserved. Built with absolute ruleset fidelity.</p>
      </footer>
    </div>
  );
}

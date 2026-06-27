"use client";
import { Suspense, useState, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { TILES, HOUSE_MARKET_PRICE, HOUSE_AUCTION_MIN } from "@/lib/game-engine/tiles";
import { netWorth } from "@/lib/game-engine/actions";
import { useGameTurn } from "@/hooks/useGameTurn";
import Board from "@/components/board/Board";
import PortfolioPanel from "@/components/game/PortfolioPanel";
import DiceRoller from "@/components/game/DiceRoller";
import GameLog from "@/components/game/GameLog";
import TradeModal from "@/components/game/TradeModal";
import AuctionModal from "@/components/game/AuctionModal";
import RebalanceModal from "@/components/game/RebalanceModal";
import LeadersDilemmaModal from "@/components/game/LeadersDilemmaModal";
import TargetedActionModal from "@/components/game/TargetedActionModal";
import ChoiceModal from "@/components/game/ChoiceModal";
import PassDeviceScreen from "@/components/game/PassDeviceScreen";
import TradeResponseModal from "@/components/game/TradeResponseModal";
import OpenTradeModal from "@/components/game/OpenTradeModal";
import { GameOverScreen } from "@/components/game/GameOverScreen";
import EndgameNotifyModal from "@/components/game/EndgameNotifyModal";
import { LogOut, MessageSquare, ShieldAlert } from "lucide-react";

const PLAYER_COLORS = ["#3B82F6", "#F97316", "#A855F7", "#EC4899"];

function GameRoomContent() {
  const params = useParams();
  const { data: session } = useSession();
  const router = useRouter();
  const code = params.code as string;
  const isLocal = code === "play-local";
  const userId = (session?.user as { id?: string })?.id;

  const [stableUserId, setStableUserId] = useState<string | undefined>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("wc_user_id") || undefined;
    }
    return undefined;
  });
  const [showTelemetry, setShowTelemetry] = useState(false);

  useEffect(() => {
    if (userId) {
      localStorage.setItem("wc_user_id", userId);
      if (userId !== stableUserId) {
        setStableUserId(userId);
      }
    }
  }, [userId, stableUserId]);

  const turn = useGameTurn({ code, isLocal, userId: stableUserId });


  // ─── UI LOGIC (TIPS) ────────────────────────────────────────────────────────
  const [activeTipIndex, setActiveTipIndex] = useState(0);

  const TIPS = useMemo(() => {
    const base = [
      "Stocks offer double the returns of Bonds but are more susceptible to Market Crashes. Keep a balanced portfolio!",
      "Trade with other players instead of rebalancing in the middle of the year to avoid the 3L penalty.",
      "Save up cash for Year-End! Rebalancing at the start of a new year is free.",
      "Watch out for the 'Tax Raid'! Keep your wealth distributed to minimize impact.",
      "⚠️ ASSET WARNING: Any single asset category (Cash, Bonds, Stocks) above 40L is AUDITABLE. Trade or rebalance to stay safe!",
      "🤝 Save 3L! Trading with other players has NO penalty, unlike mid-turn rebalancing which costs 3L.",
      "📈 Over-concentrated in Stocks? Trade them for Bonds with a player who needs growth to avoid an audit confiscation.",
      "🔄 Rebalancing at Year-End is free! But if you're auditable mid-year, a trade is your cheapest escape route.",
      "🎁 Don't let the bank take your excess wealth! Trading helps both players diversify and stay below the 40L audit limit.",
      "📉 Market Crash coming? Trade your high stock concentration for someone else's cash to hedge your risk.",
    ];

    if (!turn.allPlayersHaveHouses) {
      base.push("House Auctions are the cheapest way to get a home. Try to keep 10-15L cash ready!");
      base.push("🏠 Need cash for a House Auction? Propose a trade! It's faster and cheaper than selling assets back to the bank.");
      base.push("🏘️ MANDATORY PURCHASE: Keep enough cash for your mandatory house purchase at the end of Year 3!");
    }

    return base;
  }, [turn.allPlayersHaveHouses]);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 10000);
    return () => clearInterval(interval);
  }, [TIPS.length]);


  // ─── RENDERING ───────────────────────────────────────────────────────────────

  if (turn.loading) return <div className="min-h-screen flex items-center justify-center bg-[var(--cream)]">
    <div className="animate-spin text-4xl">💰</div>
  </div>;

  // Render full screen error ONLY if gameState is not loaded yet (lobby initialization phase)
  if (turn.error && !turn.gameState) return <div className="min-h-screen flex items-center justify-center bg-red-50 p-6">
    <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-sm">
      <div className="text-red-500 text-5xl mb-4">⚠️</div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">Error</h2>
      <p className="text-gray-500 text-sm mb-6">{turn.error}</p>
      <button onClick={() => router.push("/lobby")} className="btn-primary w-full">Back to Lobby</button>
    </div>
  </div>;

  if (!turn.gameState) return <div className="min-h-screen flex items-center justify-center bg-[var(--cream)] p-6">
    <div className="bg-white p-10 rounded-3xl shadow-xl text-center max-w-md border-4 border-[var(--gold)]">
      <h2 className="text-2xl font-black text-[var(--navy)] mb-4">Waiting for Host...</h2>
      <p className="text-gray-500 mb-8">Share the code with your friends to join the game.</p>
      <div className="bg-gray-100 p-6 rounded-2xl mb-6">
        <span className="text-4xl font-black tracking-widest text-[var(--navy)]">{code}</span>
      </div>

      {turn.room?.playerIds && (
        <div className="mb-8 text-left">
          <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-3 px-1">Players Joined ({turn.room.playerIds.length}/4)</h3>
          <div className="grid gap-2">
            {turn.room.playerIds.map((id: string, idx: number) => {
              const pName = idx === 0 ? "Host" : `Player ${idx + 1}`;
              return (
                <div key={id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                    {pName[0].toUpperCase()}
                  </div>
                  <span className="font-bold text-sm text-[var(--navy)]">{pName}</span>
                  {id === turn.room.hostId && <span className="ml-auto text-[8px] font-black uppercase bg-yellow-100 text-yellow-700 px-2 py-1 rounded-md">Host</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(isLocal || stableUserId === turn.room?.hostId) ? (
        <button onClick={() => turn.performAction("start")} className="btn-primary w-full py-4 text-lg">Start Game</button>
      ) : (
        <div className="bg-blue-50 text-blue-700 p-4 rounded-2xl text-sm font-bold animate-pulse border border-blue-100">
          Waiting for host to start the game...
        </div>
      )}
    </div>
  </div>;

  return (
    <div className="h-screen flex flex-col md:flex-row bg-[var(--cream)] overflow-hidden relative">
      {turn.gameState?.phase === "finished" && (
        <GameOverScreen gameState={turn.gameState} onExit={() => router.push("/lobby")} />
      )}

      {/* Sidebar: Players & Stats */}
      <div className="w-full md:w-80 bg-white/50 backdrop-blur-md border-r border-gray-200 p-3 flex flex-col gap-3 overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xl">💰</span>
            <span className="font-black text-sm tracking-tight">WealthCraft</span>
          </div>
          <button onClick={() => router.push("/lobby")} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
            <LogOut size={18} />
          </button>
        </div>


        {/* Connection Status Pill */}
        {!isLocal && (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-colors ${
            turn.connectionStatus === "connected"
              ? "bg-green-50 text-green-700 border-green-100"
              : turn.connectionStatus === "connecting"
              ? "bg-amber-50 text-amber-700 border-amber-100 animate-pulse"
              : "bg-red-50 text-red-700 border-red-100 animate-pulse"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              turn.connectionStatus === "connected" ? "bg-green-500" : turn.connectionStatus === "connecting" ? "bg-amber-500 animate-ping" : "bg-red-500"
            }`} />
            {turn.connectionStatus === "connected" ? "Online Sync Active" : turn.connectionStatus === "connecting" ? "Reconnecting..." : "Offline (Polling Fallback)"}
          </div>
        )}

        <div className="space-y-3">
          {turn.gameState.players.map((p, i) => (
            <PortfolioPanel
              key={p.id}
              player={p}
              isActive={turn.gameState!.currentPlayerIndex === i}
              color={PLAYER_COLORS[i % PLAYER_COLORS.length]}
              isPrivate={isLocal ? turn.gameState!.currentPlayerIndex !== i : p.id !== stableUserId}
            />
          ))}
          <div className="pt-2">
            <GameLog log={turn.gameState.log} />
          </div>

          {/* Diagnostics Telemetry Panel */}
          {!isLocal && (params.debug === "1" || (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1")) && (
            <div className="border border-gray-200 bg-white/70 backdrop-blur-md rounded-2xl p-3 shadow-md">
              <button
                onClick={() => setShowTelemetry(!showTelemetry)}
                className="w-full flex items-center justify-between text-xs font-bold text-[var(--navy)] outline-none"
              >
                <span className="flex items-center gap-1.5">⚡ Diagnostics Telemetry</span>
                <span>{showTelemetry ? "▲" : "▼"}</span>
              </button>
              
              {showTelemetry && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-2 text-[10px] text-gray-500 font-bold leading-relaxed">
                  <div className="flex justify-between">
                    <span>Pusher Connection:</span>
                    <span className="text-[var(--navy)] uppercase">{turn.connectionStatus}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pusher Reconnects:</span>
                    <span className="text-[var(--navy)]">{turn.pusherReconnectsCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Watchdog Refreshes:</span>
                    <span className="text-[var(--navy)]">{turn.watchdogRefreshes}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Failed API Actions:</span>
                    <span className="text-[var(--navy)]">{turn.failedActionsCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Last Action Duration:</span>
                    <span className="text-[var(--navy)]">{turn.recentActionDurationMs ? `${turn.recentActionDurationMs}ms` : "N/A"}</span>
                  </div>
                  
                  <div className="pt-2 border-t border-gray-100">
                    <div className="text-[9px] uppercase tracking-wider text-gray-400 mb-1.5 font-black">Live Player Heartbeats</div>
                    <div className="space-y-1.5">
                      {turn.gameState.players.map((p) => {
                        const tel = turn.playerTelemetry[p.id] || { lastSeen: new Date().toISOString(), connectionAge: 0, reconnectCount: 0, isOnline: true };
                        return (
                          <div key={p.id} className="flex items-center justify-between p-1 bg-gray-50 rounded border border-gray-100">
                            <span className="truncate max-w-[100px]">{p.name}</span>
                            <div className="flex items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full ${tel.isOnline ? 'bg-green-500' : 'bg-red-500 animate-ping'}`} />
                              <span>{tel.connectionAge}s</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col items-center justify-start p-2 md:p-4 overflow-y-auto pt-4 relative">
        {/* Dynamic Network Alert Banner */}
        {turn.error && (
          <div className="w-full max-w-3xl bg-red-100 border-2 border-red-300 text-red-800 px-4 py-3 rounded-2xl mb-4 flex items-center justify-between shadow-md animate-bounce-subtle z-50">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚠️</span>
              <div className="text-xs font-bold leading-snug">
                <span className="font-extrabold">Network Alert:</span> {turn.error}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => turn.setError("")}
                className="bg-red-200 hover:bg-red-300 text-red-900 font-extrabold px-3 py-1.5 rounded-xl text-[10px] transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={() => {
                  turn.setError("");
                  window.location.reload();
                }}
                className="bg-red-600 hover:bg-red-700 text-white font-extrabold px-3 py-1.5 rounded-xl text-[10px] transition-colors shadow"
              >
                Refresh Board
              </button>
            </div>
          </div>
        )}

        {/* Watchdog Stale Warning Banner */}
        {turn.watchdogStale && (
          <div className="w-full max-w-3xl bg-amber-50 border-2 border-amber-300 text-amber-800 px-4 py-3 rounded-2xl mb-4 flex items-center justify-start gap-3 shadow-md animate-pulse z-50">
            <span className="text-xl animate-spin">⏳</span>
            <div className="text-xs font-bold">
              <span className="font-extrabold">Auto Sync Alert:</span> Connection appears stale. Re-syncing room state from authoritative server...
            </div>
          </div>
        )}

        {/* Top Section: Board and Rules Sidebar */}
        <div className={`flex flex-col lg:flex-row items-center lg:items-start justify-center gap-4 w-full transition-all duration-1000 ${turn.isInitialSetup ? 'opacity-50 grayscale pointer-events-none' : 'opacity-100'}`}>
          {/* Left Side: Board and Notifications */}
          <div className="w-full max-w-3xl relative flex flex-col items-center gap-4">
            <Board
              tiles={TILES}
              players={turn.gameState.players}
              onTileClick={() => { }}
              rolling={turn.rolling}
              dice={turn.lastDice}
              overlayMessage={turn.botThinkingMessage || turn.overlayMessage}
              announcement={turn.gameState.announcement}
              privateMessage={turn.myPrivateMessage}
              disabled={turn.isInitialSetup}
            />

            {/* Bottom Section: Controls Overlay */}
            <div className={`w-full flex items-center justify-center gap-4 bg-white/90 backdrop-blur-md p-3 rounded-3xl shadow-xl border border-white/50 animate-slide-in scale-90 md:scale-95 transition-all duration-500 ${turn.isInitialSetup ? 'opacity-80' : ''}`}>
              {!turn.isInitialSetup && (
                <DiceRoller
                  onRoll={turn.handleRoll}
                  rolling={turn.rolling}
                  dice={turn.lastDice}
                  disabled={!turn.isMyTurn || (turn.gameState.phase !== "roll" && turn.diceMode !== "lottery")}
                  label={turn.diceMode === "lottery" ? "Roll" : "Roll Dice"}
                />
              )}

              {!turn.isSetupPhase && turn.timeLeft !== null && (
                <div className={`flex flex-col items-center justify-center px-4 py-2 rounded-2xl border-2 transition-colors ${turn.timeLeft < 10 ? 'border-red-500 bg-red-50 animate-pulse' : 'border-blue-100 bg-blue-50'}`}>
                  <div className="text-[8px] font-black uppercase text-gray-400 tracking-widest mb-1">Time</div>
                  <div className={`text-xl font-black ${turn.timeLeft < 10 ? 'text-red-600' : 'text-blue-600'}`}>
                    {turn.timeLeft}s
                  </div>
                </div>
              )}

              {!turn.isInitialSetup && (
                <>
                  <div className="h-16 w-px bg-gray-200" />

                  <div className="flex flex-col gap-1">
                    <div className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">Action</div>
                    <div className="flex gap-2">
                      {turn.isMyTurn && turn.diceMode !== "lottery" && (turn.gameState.phase === "action" || (turn.gameState.phase === "auction" && !turn.showAuction)) && (
                        <button onClick={() => {
                          if (turn.gameState!.phase === "auction") turn.setShowAuction(true);
                          else turn.handleTileAction();
                        }} className="btn-primary px-8">
                          {turn.gameState.phase === "auction" ? "Join Auction" : "Execute Tile"}
                        </button>
                      )}
                      {(turn.gameState.phase === "trade" || turn.gameState.phase === "year-end") && turn.isMyTurn && (
                        <>
                          <button
                            onClick={() => turn.setShowTrade(true)}
                            disabled={turn.currentPlayer?.hasTraded || turn.gameState.phase === "year-end"}
                            className="btn-secondary flex items-center gap-2 disabled:opacity-50 px-4"
                          >
                            <MessageSquare size={16} /> Trade
                          </button>
                          <button
                            onClick={() => turn.setShowRebalance(true)}
                            className={`px-4 ${turn.gameState.phase === "year-end" ? "btn-primary" : "btn-secondary"}`}
                          >
                            Rebalance
                          </button>
                          <button
                            onClick={() => turn.setShowTargetedAction("audit")}
                            disabled={turn.gameState.phase === "year-end"}
                            className="btn-secondary flex items-center gap-2 disabled:opacity-50 px-4"
                          >
                            <ShieldAlert size={16} /> Audit
                          </button>
                          {turn.gameState.phase === "trade" && (
                            <button
                              onClick={turn.handleEndTurn}
                              disabled={turn.isEndingTurn}
                              className="btn-primary disabled:opacity-50 px-8"
                            >
                              {turn.isEndingTurn ? "..." : "Next Turn"}
                            </button>
                          )}
                        </>
                      )}
                      {!turn.isMyTurn && turn.gameState.phase !== "year-end" && turn.gameState.phase !== "waiting-trade" && (
                        <>

                          <div className={`px-6 py-2 rounded-xl text-xs font-bold animate-pulse ${
                            (turn.connectionStatus === "connecting" || turn.connectionStatus === "unavailable")
                              ? "bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-2"
                              : "bg-gray-100 text-gray-500"
                          }`}>
                            {(turn.connectionStatus === "connecting" || turn.connectionStatus === "unavailable") && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                            )}
                            {(turn.connectionStatus === "connecting" || turn.connectionStatus === "unavailable")
                              ? "Reconnecting..."
                              : `Waiting for ${turn.currentPlayer?.name}...`}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right Side: Tips & Rules Sidebar */}
          <div className="w-full lg:w-80 flex flex-col gap-4 animate-slide-in">
            <div className="bg-white/80 backdrop-blur-md p-4 rounded-3xl shadow-xl border border-white/50 border-l-4 border-l-[var(--gold)]">
              <h2 className="text-lg font-black text-[var(--navy)] mb-3 flex items-center gap-2">
                <span className="text-xl">📜</span> Rules & Returns
              </h2>

              <div className="space-y-4 max-h-[620px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200">
                <section>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Market Returns (Paid in Asset)</h3>
                  <div className="grid grid-cols-1 gap-1.5">
                    <div className="bg-blue-50/75 p-2 rounded-xl border border-blue-100/60 flex justify-between items-center">
                      <div className="text-[10px] font-bold text-blue-800 uppercase">Bonds Return</div>
                      <div className="text-xs font-black text-blue-900">+1L Bond <span className="text-[8px] font-normal opacity-70">/ 5L held</span></div>
                    </div>
                    <div className="bg-purple-50/75 p-2 rounded-xl border border-purple-100/60 flex justify-between items-center">
                      <div className="text-[10px] font-bold text-purple-800 uppercase">Stocks Return</div>
                      <div className="text-xs font-black text-purple-900">+2L Stock <span className="text-[8px] font-normal opacity-70">/ 5L held</span></div>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Market Events (Per 5L Stocks Held)</h3>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="bg-green-50 p-2 rounded-xl border border-green-100/80 flex flex-col gap-0.5">
                      <div className="text-[8px] font-black text-green-800 uppercase flex items-center gap-1">📈 Stock Rally</div>
                      <span className="text-[9px] font-bold text-green-900">+2L Stocks <span className="text-[7px] font-normal opacity-75">(You Only)</span></span>
                    </div>
                    <div className="bg-red-50 p-2 rounded-xl border border-red-100/80 flex flex-col gap-0.5">
                      <div className="text-[8px] font-black text-red-800 uppercase flex items-center gap-1">📉 Stock Crash</div>
                      <span className="text-[9px] font-bold text-red-900">-2L Stocks <span className="text-[7px] font-normal opacity-75">(You Only)</span></span>
                    </div>
                    <div className="bg-emerald-50 p-2 rounded-xl border border-emerald-100/80 flex flex-col gap-0.5">
                      <div className="text-[8px] font-black text-emerald-800 uppercase flex items-center gap-1">🌟 Market Rally</div>
                      <span className="text-[9px] font-bold text-emerald-900">+3L Stocks <span className="text-[7px] font-normal opacity-75">(ALL Players)</span></span>
                    </div>
                    <div className="bg-rose-50 p-2 rounded-xl border border-rose-100/80 flex flex-col gap-0.5">
                      <div className="text-[8px] font-black text-rose-800 uppercase flex items-center gap-1">💥 Market Crash</div>
                      <span className="text-[9px] font-bold text-rose-900">-3L Stocks <span className="text-[7px] font-normal opacity-75">(ALL Players)</span></span>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Core Objectives</h3>
                  <ul className="space-y-1 text-[10px] font-bold text-gray-600">
                    <li className="flex gap-2 items-start"><span className="text-[var(--gold)] mt-0.5">●</span> <span><strong>100L Net Worth:</strong> Reach 100L assets to win the game.</span></li>
                    <li className="flex gap-2 items-start"><span className="text-[var(--gold)] mt-0.5">●</span> <span><strong>House Deadline:</strong> Must buy by end of Year 3. Auto-bought at 20L on entering Year 4.</span></li>
                    <li className="flex gap-2 items-start"><span className="text-[var(--gold)] mt-0.5">●</span> <span><strong>Asset Limit:</strong> Max 40L in one asset type. Audit target if exceeded.</span></li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Costs & Actions</h3>
                  <ul className="space-y-1 text-[10px] font-bold text-gray-600">
                    <li className="flex gap-2 items-start"><span className="text-[var(--gold)] mt-0.5">●</span> <span><strong>Mid-Year Rebalance:</strong> Costs a 3L fine outside of Year-End START.</span></li>
                    <li className="flex gap-2 items-start"><span className="text-[var(--gold)] mt-0.5">●</span> <span><strong>Tax Raid:</strong> Proposer pays 2L to enforce audit. Target player pays 5L.</span></li>
                    <li className="flex gap-2 items-start"><span className="text-[var(--gold)] mt-0.5">●</span> <span><strong>Hostile Takeover:</strong> Take up to 5L of one asset from another player (no splitting).</span></li>
                    <li className="flex gap-2 items-start"><span className="text-[var(--gold)] mt-0.5">●</span> <span><strong>Emergency:</strong> Costs 5L or 10L paid in Cash.</span></li>
                  </ul>
                </section>

                <section className="space-y-2 pt-1">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Special Mechanics</h3>

                  <div className="bg-blue-50/70 p-2 rounded-xl border border-blue-100 flex flex-col gap-0.5">
                    <span className="text-blue-800 font-black uppercase tracking-wider text-[9px] flex items-center gap-1">🌐 Free Trade Zone</span>
                    <span className="text-[9px] leading-relaxed text-blue-700 font-medium">Propose trade worth ≥25L while standing on tile 9 or 14 to earn both players +5L Cash!</span>
                  </div>

                  <div className="bg-purple-50/70 p-2 rounded-xl border border-purple-100 flex flex-col gap-0.5">
                    <span className="text-purple-800 font-black uppercase tracking-wider text-[9px] flex items-center gap-1">🤝 Valid Swaps</span>
                    <span className="text-[9px] leading-relaxed text-purple-700 font-medium">Trades must swap different types of assets. Same-asset swaps (e.g. cash for cash) are blocked.</span>
                  </div>
                </section>
              </div>
            </div>

            <div className="bg-[var(--navy)] p-4 rounded-3xl shadow-xl text-white min-h-[100px] flex flex-col justify-center">
              <h3 className="text-[10px] font-black uppercase tracking-widest mb-2 text-[var(--gold)] flex items-center gap-2">
                <span className="animate-pulse">💡</span> Tip
              </h3>
              <p className="text-[10px] font-bold leading-relaxed opacity-90">
                {TIPS[activeTipIndex]}
              </p>
            </div>
          </div>
        </div>

        {/* Modals */}
        <TradeModal
          isOpen={turn.showTrade && !turn.showPassDevice && !turn.initialPreview}
          onClose={() => turn.setShowTrade(false)}
          currentPlayer={turn.currentPlayer!}
          otherPlayers={turn.gameState.players.filter(p => p.id !== turn.currentPlayer?.id)}
          onPropose={(targetId, offer, request, tradeType) => {
            turn.performAction("trade-offer", { toPlayerId: targetId, offer, request, tradeType });
            turn.setShowTrade(false);
          }}
        />

        <AuctionModal
          isOpen={turn.showAuction && turn.gameState.phase === "auction" && !turn.showPassDevice && !turn.initialPreview}
          currentPlayer={isLocal ? (turn.currentBiddingPlayer || turn.currentPlayer!) : turn.gameState.players.find(p => p.id === stableUserId)!}
          hasBid={isLocal ? !turn.currentBiddingPlayer : !!turn.gameState.auctionState?.bids.find(b => b.playerId === stableUserId)}
          onBid={(amount) => {
            const bidderId = isLocal ? turn.currentBiddingPlayer?.id : stableUserId;
            turn.performAction("bid", { amount, bidderId });
            turn.setShowAuction(false);
          }}
          minBid={HOUSE_AUCTION_MIN}
          marketPrice={HOUSE_MARKET_PRICE}
          onClose={() => turn.setShowAuction(false)}
        />

        <RebalanceModal
          isOpen={(turn.gameState.phase === "year-end" || turn.showRebalance) && turn.isMyTurn && !turn.showPassDevice && !turn.initialPreview}
          player={turn.currentPlayer!}
          penalty={turn.rebalancePenaltyOverride !== null ? turn.rebalancePenaltyOverride : (turn.gameState.phase !== "year-end" ? 3 : 0)}
          emergencyAmount={turn.pendingEmergencyAmount ?? undefined}
          onRebalance={(c, b, s) => {
            turn.handleRebalance(c, b, s);
          }}
          onClose={turn.rebalancePenaltyOverride !== null ? undefined : () => turn.setShowRebalance(false)}
          externalTimeLeft={turn.timeLeft}
          skipReturnsDelay={turn.gameState.phase !== "year-end"}
        />

        {turn.showLeadersDilemma && (
          <LeadersDilemmaModal
            isOpen={true}
            player={turn.currentPlayer!}
            onDeclare={() => turn.performAction("declare")}
            onAudit={(idx) => turn.performAction("audit", { targetIdx: idx })}
            otherPlayers={turn.gameState.players.filter(p => p.id !== turn.currentPlayer?.id)}
            isCurrentTurn={turn.isMyTurn}
            needsToDeclare={netWorth(turn.currentPlayer!) >= 70 && !turn.currentPlayer?.wealthDeclared}
          />
        )}

        {turn.showTargetedAction && (
          <TargetedActionModal
            isOpen={true}
            type={turn.showTargetedAction}
            currentPlayer={turn.currentPlayer!}
            otherPlayers={turn.gameState.players.map((p, i) => ({ player: p, originalIndex: i })).filter(x => x.player.id !== turn.currentPlayer?.id)}
            onConfirm={(payload) => {
              const currentAction = turn.showTargetedAction;
              turn.setShowTargetedAction(null);
              if (currentAction === "audit") {
                turn.performAction("audit", payload);
              } else {
                turn.performAction("tile-action", payload);
              }
            }}
            onClose={() => turn.setShowTargetedAction(null)}
          />
        )}

        {turn.showChoiceModal && (
          <ChoiceModal
            isOpen={!!turn.showChoiceModal && !turn.showPassDevice && !turn.initialPreview}
            type={turn.showChoiceModal}
            playerCash={turn.currentPlayer?.cash || 0}
            emergencyAmount={turn.pendingEmergencyAmount ?? undefined}
            onConfirm={(payload) => {
              const currentModal = turn.showChoiceModal;
              turn.setShowChoiceModal(null);
              if (currentModal === "emergency-decision") {
                turn.performAction("emergency-decision", payload);
              } else {
                turn.performAction("tile-action", payload);
              }
            }}
            onClose={() => turn.setShowChoiceModal(null)}
          />
        )}

        {turn.showPassDevice && (
          <PassDeviceScreen
            nextPlayerName={(turn.gameState?.phase === "auction" ? turn.currentBiddingPlayer?.name : (turn.gameState?.phase === "waiting-trade" ? turn.gameState.players.find(p => p.id === turn.gameState!.pendingTrade?.toPlayerId)?.name : turn.currentPlayer?.name)) || "Next Player"}
            onContinue={() => turn.setShowPassDevice(false)}
          />
        )}

        {turn.gameState.pendingTrade?.tradeType !== "open" ? (
          <TradeResponseModal
            isOpen={
              turn.gameState.phase === "waiting-trade" &&
              (isLocal || turn.gameState.pendingTrade?.toPlayerId === stableUserId)
            }
            offer={turn.gameState!.pendingTrade!}
            fromPlayer={turn.gameState!.players.find(p => p.id === turn.gameState!.pendingTrade?.fromPlayerId)!}
            toPlayer={turn.gameState!.players.find(p => p.id === turn.gameState!.pendingTrade?.toPlayerId)!}
            onResponse={(accept) => turn.performAction("trade-response", { accept })}
          />
        ) : (
          <OpenTradeModal
            isOpen={turn.gameState.phase === "waiting-trade"}
            offer={turn.gameState!.pendingTrade!}
            currentPlayer={(isLocal ? turn.currentPlayer : turn.gameState!.players.find(p => p.id === stableUserId)) || turn.currentPlayer!}
            players={turn.gameState!.players}
            onResponse={(accept) => turn.performAction("trade-response", { accept, responderId: stableUserId })}
            onSelectWinner={(winnerId) => turn.performAction("open-trade-select", { winnerId })}
          />
        )}

        <EndgameNotifyModal
          isOpen={turn.gameState.endgameCandidate === true && turn.gameState.endgameTriggerAcknowledged === false}
          type="trigger"
          triggerPlayer={turn.gameState.players.find(p => p.id === turn.gameState!.endgameTriggeredByPlayerId)}
          onContinue={() => turn.performAction("acknowledge-endgame-trigger")}
        />

        <EndgameNotifyModal
          isOpen={turn.gameState.endgameCandidate === false && turn.gameState.endgameCancelledAcknowledged === false}
          type="cancelled"
          onContinue={() => turn.performAction("acknowledge-endgame-cancellation")}
        />


      </div>
    </div>
  );
}

export default function GameRoomPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[var(--cream)]"><div className="animate-spin text-4xl">💰</div></div>}>
      <GameRoomContent />
    </Suspense>
  );
}

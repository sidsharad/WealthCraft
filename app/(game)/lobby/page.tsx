"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const PLAYER_COLORS = ["#3B82F6", "#F97316", "#A855F7", "#EC4899"];
const BOT_NAMES = ["Investor Alpha", "Investor Beta", "Investor Gamma"];
const BOT_TYPES = ["BULL", "DISCIPLINED", "AUDIT_HAWK", "OPPORTUNIST", "SAFETY_BUILDER", "PROPERTY_BUILDER"];

import { cleanupExpiredRooms } from "@/lib/db/cleanup";

export default function LobbyPage() {
  const [mode, setMode] = useState<"online" | "solo" | "local" | "join" | null>(null);
  
  useEffect(() => {
    if (Math.random() < 0.01) {
      cleanupExpiredRooms().catch(console.error);
    }
    const params = new URLSearchParams(window.location.search);
    const m = params.get("mode");
    if (m === "local" || m === "online" || m === "solo" || m === "join") {
      setMode(m as any);
    }
  }, []);

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // Online Flow State
  const [onlineType, setOnlineType] = useState<"players" | "mixed">("players");
  const [onlinePlayersOnly, setOnlinePlayersOnly] = useState(2);
  const [onlineMixed, setOnlineMixed] = useState("2H1B");

  // Solo Flow State
  const [soloBots, setSoloBots] = useState(1);

  // Local Flow State
  const [localHumanCount, setLocalHumanCount] = useState(2);
  const [localBotCount, setLocalBotCount] = useState(0);
  
  function getRandomBotType() {
    return BOT_TYPES[Math.floor(Math.random() * BOT_TYPES.length)];
  }

  async function handleCreateOnline() {
    setLoading(true);
    setError("");
    try {
      let bots: any[] = [];
      if (onlineType === "mixed") {
        const numBots = onlineMixed === "2H1B" || onlineMixed === "3H1B" ? 1 : 2;
        bots = Array.from({ length: numBots }, (_, i) => ({
          name: BOT_NAMES[i],
          botType: getRandomBotType()
        }));
      }

      const res = await fetch("/api/rooms", {
        method: "POST",
        body: JSON.stringify({ action: "create", mode: "online", bots }),
        headers: { "Content-Type": "application/json" },
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      setLoading(false);
      if (!res.ok || !data) { setError(data?.error || "Failed to create room."); return; }
      router.push(`/room/${data.room.code}`);
    } catch (e: any) {
      setLoading(false);
      setError(e.message || "Failed to parse response.");
    }
  }

  async function handleJoin() {
    if (!code || code.length !== 6) { setError("Enter a valid 6-character room code."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        body: JSON.stringify({ action: "join", code: code.toUpperCase() }),
        headers: { "Content-Type": "application/json" },
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      setLoading(false);
      if (!res.ok || !data) { setError(data?.error || "Failed to join room."); return; }
      router.push(`/room/${data.room.code}`);
    } catch (e: any) {
      setLoading(false);
      setError(e.message || "Failed to parse response.");
    }
  }

  function handleSoloStart() {
    const bots = Array.from({ length: soloBots }, (_, i) => ({
      name: BOT_NAMES[i],
      botType: getRandomBotType()
    }));
    const params = new URLSearchParams({
      mode: "local",
      players: JSON.stringify(["Player"]), // Just one generic human for solo
      bots: JSON.stringify(bots),
    });
    router.push(`/room/play-local?${params.toString()}`);
  }

  function handleLocalStart() {
    if (localHumanCount + localBotCount < 2) {
      setError("Total players must be between 2 and 4.");
      return;
    }
    if (localHumanCount + localBotCount > 4) {
      setError("Total players must be between 2 and 4.");
      return;
    }
    const names = Array.from({ length: localHumanCount }, (_, i) => `Player ${i + 1}`);
    const bots = Array.from({ length: localBotCount }, (_, i) => ({
      name: BOT_NAMES[i],
      botType: getRandomBotType()
    }));
    const params = new URLSearchParams({
      mode: "local",
      players: JSON.stringify(names),
      bots: JSON.stringify(bots),
    });
    router.push(`/room/play-local?${params.toString()}`);
  }

  // Developer Tools
  const isDebug = process.env.NEXT_PUBLIC_DEBUG_BOTS === "true";

  return (
    <div className="min-h-screen p-6" style={{ background: "linear-gradient(135deg, #1A2744 0%, #0f172a 100%)" }}>
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="text-white/70 hover:text-white flex items-center gap-2 text-sm">
            ← Back
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-2xl">💰</span>
            <span className="text-white font-black text-lg">WealthCraft</span>
          </div>
          <div className="w-16" />
        </div>

        <div className="modal-card">
          <h2 className="text-2xl font-black mb-2" style={{ color: "var(--navy)" }}>Game Lobby</h2>
          
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-5">
              {error}
            </div>
          )}

          {mode === null && (
            <div className="grid gap-4">
              <button onClick={() => setMode("online")} className="flex items-center gap-4 p-5 rounded-xl border-2 border-gray-200 hover:border-yellow-400 hover:bg-yellow-50 transition-all text-left">
                <div className="text-3xl">🌐</div>
                <div>
                  <div className="font-bold text-gray-800">Online Multiplayer</div>
                  <div className="text-sm text-gray-500">Play online with friends</div>
                </div>
              </button>
              <button onClick={() => setMode("solo")} className="flex items-center gap-4 p-5 rounded-xl border-2 border-gray-200 hover:border-yellow-400 hover:bg-yellow-50 transition-all text-left">
                <div className="text-3xl">🤖</div>
                <div>
                  <div className="font-bold text-gray-800">Play vs Bots</div>
                  <div className="text-sm text-gray-500">Challenge AI opponents in a solo game</div>
                </div>
              </button>
              <button onClick={() => setMode("local")} className="flex items-center gap-4 p-5 rounded-xl border-2 border-gray-200 hover:border-yellow-400 hover:bg-yellow-50 transition-all text-left">
                <div className="text-3xl">🤝</div>
                <div>
                  <div className="font-bold text-gray-800">Local Pass-and-Play</div>
                  <div className="text-sm text-gray-500">Play locally with friends and optional AI bots</div>
                </div>
              </button>
              <button onClick={() => setMode("join")} className="flex items-center gap-4 p-5 rounded-xl border-2 border-gray-200 hover:border-yellow-400 hover:bg-yellow-50 transition-all text-left">
                <div className="text-3xl">🔗</div>
                <div>
                  <div className="font-bold text-gray-800">Join Room</div>
                  <div className="text-sm text-gray-500">Enter a 6-character code</div>
                </div>
              </button>
            </div>
          )}

          {mode === "online" && (
            <div className="space-y-6">
              <button onClick={() => setMode(null)} className="text-gray-500 hover:text-gray-800 text-sm flex items-center gap-1">
                ← Back
              </button>
              <h3 className="font-bold text-gray-800 uppercase tracking-wider text-sm">Online Multiplayer</h3>
              
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-3 block">Game Type</label>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <button 
                    onClick={() => setOnlineType("players")} 
                    className={`p-3 rounded-lg border-2 text-sm font-bold ${onlineType === "players" ? "border-yellow-400 bg-yellow-50 text-[var(--navy)]" : "border-gray-200 text-gray-500"}`}
                  >
                    Players Only
                  </button>
                  <button 
                    onClick={() => setOnlineType("mixed")} 
                    className={`p-3 rounded-lg border-2 text-sm font-bold ${onlineType === "mixed" ? "border-yellow-400 bg-yellow-50 text-[var(--navy)]" : "border-gray-200 text-gray-500"}`}
                  >
                    Players + Bots
                  </button>
                </div>
              </div>

              {onlineType === "players" && (
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-3 block">Players</label>
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    {[2, 3, 4].map(n => (
                      <button key={n} onClick={() => setOnlinePlayersOnly(n)} className={`p-3 rounded-lg border-2 text-sm font-bold ${onlinePlayersOnly === n ? "border-blue-500 bg-blue-50 text-[var(--navy)]" : "border-gray-200 text-gray-500"}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {onlineType === "mixed" && (
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-3 block">Players + Bots</label>
                  <div className="space-y-2 mb-6">
                    {[
                      { id: "2H1B", label: "2 Humans + 1 Bot" },
                      { id: "2H2B", label: "2 Humans + 2 Bots" },
                      { id: "3H1B", label: "3 Humans + 1 Bot" },
                    ].map(opt => (
                      <button key={opt.id} onClick={() => setOnlineMixed(opt.id)} className={`w-full p-3 rounded-lg border-2 text-sm font-bold text-left ${onlineMixed === opt.id ? "border-blue-500 bg-blue-50 text-[var(--navy)]" : "border-gray-200 text-gray-500"}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={handleCreateOnline} disabled={loading} className="btn-primary w-full py-3">
                {loading ? "Creating..." : "Create Room"}
              </button>
            </div>
          )}

          {mode === "solo" && (
            <div className="space-y-6">
              <button onClick={() => setMode(null)} className="text-gray-500 hover:text-gray-800 text-sm flex items-center gap-1">
                ← Back
              </button>
              <h3 className="font-bold text-gray-800 uppercase tracking-wider text-sm">Play vs Bots</h3>
              
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-3 block">Bot Opponents</label>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {[1, 2, 3].map(n => (
                    <button key={n} onClick={() => setSoloBots(n)} className={`p-3 rounded-lg border-2 text-sm font-bold ${soloBots === n ? "border-purple-500 bg-purple-50 text-[var(--navy)]" : "border-gray-200 text-gray-500"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={handleSoloStart} className="btn-primary w-full py-3">
                Start Game
              </button>
            </div>
          )}

          {mode === "local" && (
            <div className="space-y-6">
              <button onClick={() => setMode(null)} className="text-gray-500 hover:text-gray-800 text-sm flex items-center gap-1">
                ← Back
              </button>
              <h3 className="font-bold text-gray-800 uppercase tracking-wider text-sm">Local Pass-and-Play</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-2 flex justify-between">
                    <span>Human Players</span>
                    <span className="font-black text-[var(--navy)]">{localHumanCount}</span>
                  </label>
                  <input type="range" min={1} max={4} value={localHumanCount} onChange={(e) => setLocalHumanCount(Number(e.target.value))} className="w-full accent-green-600" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-2 flex justify-between">
                    <span>Bot Players</span>
                    <span className="font-black text-[var(--navy)]">{localBotCount}</span>
                  </label>
                  <input type="range" min={0} max={3} value={localBotCount} onChange={(e) => setLocalBotCount(Number(e.target.value))} className="w-full accent-green-600" />
                </div>
                <div className="text-xs text-gray-400 text-center font-bold uppercase">(Total players must be between 2 and 4)</div>
              </div>

              <button onClick={handleLocalStart} className="btn-primary w-full py-3 disabled:opacity-50" disabled={localHumanCount + localBotCount < 2 || localHumanCount + localBotCount > 4}>
                Start Game
              </button>
            </div>
          )}

          {mode === "join" && (
            <div className="space-y-5">
              <button onClick={() => setMode(null)} className="text-gray-500 hover:text-gray-800 text-sm flex items-center gap-1">
                ← Back
              </button>
              <h3 className="font-bold text-gray-800 uppercase tracking-wider text-sm">Join Room</h3>
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1 block">Room Code</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="XXXXXX"
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 text-center text-2xl font-black tracking-widest focus:outline-none focus:ring-2 focus:ring-yellow-400 uppercase"
                  maxLength={6}
                />
              </div>
              <button onClick={handleJoin} disabled={loading || code.length !== 6} className="btn-primary w-full py-3 disabled:opacity-50">
                {loading ? "Joining..." : "Join Room"}
              </button>
            </div>
          )}
        </div>
        
        {isDebug && (
          <div className="mt-8 modal-card bg-gray-900 border border-gray-700">
            <h3 className="text-yellow-400 font-bold text-xs uppercase tracking-widest mb-3 flex items-center gap-2">
              <span>🔧</span> Developer Tools
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <button className="bg-gray-800 text-gray-300 hover:text-white p-2 rounded text-xs font-bold transition-all hover:bg-gray-700 border border-gray-700">Watch Bots Play</button>
              <button className="bg-gray-800 text-gray-300 hover:text-white p-2 rounded text-xs font-bold transition-all hover:bg-gray-700 border border-gray-700">Run Tournament</button>
              <button className="bg-gray-800 text-gray-300 hover:text-white p-2 rounded text-xs font-bold transition-all hover:bg-gray-700 border border-gray-700">Replay Viewer</button>
              <button className="bg-gray-800 text-gray-300 hover:text-white p-2 rounded text-xs font-bold transition-all hover:bg-gray-700 border border-gray-700">Show Bot Thinking</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

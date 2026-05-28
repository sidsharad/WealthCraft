"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const PLAYER_COLORS = ["#3B82F6", "#F97316", "#A855F7", "#EC4899"];

export default function LobbyPage() {
  const [mode, setMode] = useState<"create" | "join" | "local" | null>(null);
  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("mode");
    if (m === "local" || m === "create" || m === "join") {
      setMode(m as any);
    }
  }, []);

  const [code, setCode] = useState("");
  const [gameMode, setGameMode] = useState<"online" | "local">("online");
  const [localPlayerCount, setLocalPlayerCount] = useState(2);
  const [localPlayers, setLocalPlayers] = useState(["Player 1", "Player 2", "", ""]);
  const [botCount, setBotCount] = useState(0);
  const [botPersonalities, setBotPersonalities] = useState<("defensive" | "balanced" | "aggressive")[]>(["balanced", "balanced", "balanced", "balanced"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdCode, setCreatedCode] = useState("");
  const router = useRouter();

  async function handleCreate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        body: JSON.stringify({ action: "create", mode: gameMode }),
        headers: { "Content-Type": "application/json" },
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      setLoading(false);
      if (!res.ok || !data) { setError(data?.error || "Failed to create room."); return; }
      setCreatedCode(data.room.code);
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

  function handleLocalStart() {
    const names = localPlayers.slice(0, localPlayerCount).filter(Boolean);
    if (names.length < 2) { setError("Add at least 2 players."); return; }
    
    const bots = Array.from({ length: botCount }, (_, i) => {
      const type = botPersonalities[i] || "balanced";
      const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
      return {
        name: `BOT (${typeLabel})`,
        botType: type,
      };
    });

    const params = new URLSearchParams({
      mode: "local",
      players: JSON.stringify(names),   // human player names only
      bots: JSON.stringify(bots),       // bot objects
    });
    router.push(`/room/play-local?${params.toString()}`);
  }

  return (
    <div className="min-h-screen p-6" style={{ background: "linear-gradient(135deg, #1A2744 0%, #0f172a 100%)" }}>
      <div className="max-w-xl mx-auto">
        {/* Header */}
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
          <p className="text-gray-500 text-sm mb-6">Choose how you want to play</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-5">
              {error}
            </div>
          )}

          {mode === null && (
            <div className="grid gap-4">
              <button onClick={() => setMode("create")} className="flex items-center gap-4 p-5 rounded-xl border-2 border-gray-200 hover:border-yellow-400 hover:bg-yellow-50 transition-all text-left">
                <div className="text-3xl">🌐</div>
                <div>
                  <div className="font-bold text-gray-800">Create Online Room</div>
                  <div className="text-sm text-gray-500">2–4 players, each on their own device</div>
                </div>
              </button>
              <button onClick={() => setMode("join")} className="flex items-center gap-4 p-5 rounded-xl border-2 border-gray-200 hover:border-yellow-400 hover:bg-yellow-50 transition-all text-left">
                <div className="text-3xl">🔗</div>
                <div>
                  <div className="font-bold text-gray-800">Join Room by Code</div>
                  <div className="text-sm text-gray-500">Enter a 6-character room code</div>
                </div>
              </button>
              <button onClick={() => setMode("local")} className="flex items-center gap-4 p-5 rounded-xl border-2 border-gray-200 hover:border-yellow-400 hover:bg-yellow-50 transition-all text-left">
                <div className="text-3xl">🤝</div>
                <div>
                  <div className="font-bold text-gray-800">Local Pass-and-Play</div>
                  <div className="text-sm text-gray-500">2–4 players on one screen + optional bots</div>
                </div>
              </button>
            </div>
          )}

          {mode === "create" && (
            <div className="space-y-5">
              <button onClick={() => setMode(null)} className="text-gray-500 hover:text-gray-800 text-sm flex items-center gap-1">
                ← Back
              </button>
              <h3 className="font-bold text-gray-800">Create Online Room</h3>
              <p className="text-gray-500 text-sm">Share the room code with your friends. The game starts when you press "Start Game" in the room.</p>
              <button onClick={handleCreate} disabled={loading} className="btn-primary w-full py-3">
                {loading ? "Creating..." : "🌐 Create Room"}
              </button>
            </div>
          )}

          {mode === "join" && (
            <div className="space-y-5">
              <button onClick={() => setMode(null)} className="text-gray-500 hover:text-gray-800 text-sm flex items-center gap-1">
                ← Back
              </button>
              <h3 className="font-bold text-gray-800">Join Online Room</h3>
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
                {loading ? "Joining..." : "🔗 Join Room"}
              </button>
            </div>
          )}

          {mode === "local" && (
            <div className="space-y-5">
              <button onClick={() => setMode(null)} className="text-gray-500 hover:text-gray-800 text-sm flex items-center gap-1">
                ← Back
              </button>
              <h3 className="font-bold text-gray-800">Local Pass-and-Play</h3>

              <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 block">Number of Human Players: {localPlayerCount}</label>
                <input type="range" min={2} max={4} value={localPlayerCount} onChange={(e) => setLocalPlayerCount(Number(e.target.value))}
                  className="w-full" />
              </div>

              <div className="space-y-2">
                {Array.from({ length: localPlayerCount }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                      style={{ background: PLAYER_COLORS[i] }}>
                      {(localPlayers[i] || "P")[0].toUpperCase()}
                    </div>
                    <input
                      type="text"
                      value={localPlayers[i] || ""}
                      onChange={(e) => {
                        const p = [...localPlayers];
                        p[i] = e.target.value;
                        setLocalPlayers(p);
                      }}
                      placeholder={`Player ${i + 1} name`}
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                    />
                  </div>
                ))}
              </div>

              {localPlayerCount < 4 && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-1 block">Add Bots: {botCount}</label>
                    <input type="range" min={0} max={4 - localPlayerCount} value={botCount}
                      onChange={(e) => setBotCount(Number(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-yellow-400" />
                  </div>

                  {botCount > 0 && (
                    <div className="space-y-2 border border-gray-200/50 bg-gray-50/50 p-3 rounded-lg">
                      <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1">Bot Strategy Config</label>
                      {Array.from({ length: botCount }).map((_, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 bg-white p-2 rounded-md shadow-sm border border-gray-100">
                          <span className="text-xs font-semibold text-gray-700">Bot {i + 1} Personality:</span>
                          <select
                             value={botPersonalities[i] || "balanced"}
                             onChange={(e) => {
                               const updated = [...botPersonalities];
                               updated[i] = e.target.value as any;
                               setBotPersonalities(updated);
                             }}
                             className="text-xs font-medium bg-gray-50 border border-gray-200 rounded p-1 text-gray-800 focus:outline-none focus:ring-1 focus:ring-yellow-400 cursor-pointer"
                          >
                            <option value="defensive">🛡️ Defensive</option>
                            <option value="balanced">⚖️ Balanced</option>
                            <option value="aggressive">⚡ Aggressive</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button onClick={handleLocalStart} className="btn-primary w-full py-3">
                🎮 Start Local Game
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

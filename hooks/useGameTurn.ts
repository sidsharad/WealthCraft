import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { GameState, PlayerState } from "@/lib/db/schema";
import { TILES } from "@/lib/game-engine/tiles";
import { dispatch, applyWinCheck, resolveTimeout } from "@/lib/game-engine/dispatcher";
import { createInitialGameState } from "@/lib/game-engine/actions";
import { getBotDecision } from "@/lib/game-engine/bot";
import { getPusherClient, getRoomChannel, PUSHER_EVENTS } from "@/lib/pusher";
import { checkVersion } from "@/hooks/useVersion";

export interface UseGameTurnProps {
  code: string;
  isLocal: boolean;
  userId?: string;
}

// Helper function to calculate clean diffs between pre-state and post-state
function diffGameStates(pre: GameState | null, post: GameState | null): Record<string, any> {
  const diff: Record<string, any> = {};
  if (!pre || !post) {
    return { preStateExist: !!pre, postStateExist: !!post };
  }

  if (pre.phase !== post.phase) diff.phase = { pre: pre.phase, post: post.phase };
  if (pre.currentPlayerIndex !== post.currentPlayerIndex) {
    diff.currentPlayerIndex = { pre: pre.currentPlayerIndex, post: post.currentPlayerIndex };
  }
  if (pre.turn !== post.turn) diff.turn = { pre: pre.turn, post: post.turn };
  if (pre.year !== post.year) diff.year = { pre: pre.year, post: post.year };
  if (pre.announcement !== post.announcement) diff.announcement = { pre: pre.announcement, post: post.announcement };

  // Players diff
  const playerDiffs: Record<string, any> = {};
  post.players.forEach((p) => {
    const preP = pre.players.find(x => x.id === p.id);
    if (!preP) {
      playerDiffs[p.name || p.id] = "added";
    } else {
      const pDiff: Record<string, any> = {};
      if (preP.cash !== p.cash) pDiff.cash = { pre: preP.cash, post: p.cash };
      if (preP.bonds !== p.bonds) pDiff.bonds = { pre: preP.bonds, post: p.bonds };
      if (preP.stocks !== p.stocks) pDiff.stocks = { pre: preP.stocks, post: p.stocks };
      if (preP.hasHouse !== p.hasHouse) pDiff.hasHouse = { pre: preP.hasHouse, post: p.hasHouse };
      if (preP.position !== p.position) pDiff.position = { pre: preP.position, post: p.position };
      if (Object.keys(pDiff).length > 0) {
        playerDiffs[p.name || p.id] = pDiff;
      }
    }
  });
  if (Object.keys(playerDiffs).length > 0) {
    diff.players = playerDiffs;
  }

  // Pending Trade diff
  if (JSON.stringify(pre.pendingTrade) !== JSON.stringify(post.pendingTrade)) {
    diff.pendingTrade = { pre: pre.pendingTrade, post: post.pendingTrade };
  }

  // Auction State diff
  if (JSON.stringify(pre.auctionState) !== JSON.stringify(post.auctionState)) {
    diff.auctionState = { pre: pre.auctionState, post: post.auctionState };
  }

  return diff;
}

// Telemetry logger for state transitions
function logStateTransition(
  source: string,
  actionId: string,
  pre: GameState | null,
  post: GameState | null,
  roomStatus: string,
  playerCount: number
) {
  const diff = diffGameStates(pre, post);
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: "STATE_TRANSITION",
    source,
    actionId,
    roomStatus,
    playerCount,
    activePlayer: post ? post.players[post.currentPlayerIndex]?.name || post.players[post.currentPlayerIndex]?.id : null,
    gamePhase: post?.phase || null,
    currentTurnBeforeAction: pre ? {
      currentPlayerIndex: pre.currentPlayerIndex,
      currentPlayerId: pre.players[pre.currentPlayerIndex]?.id,
      phase: pre.phase,
      turn: pre.turn,
      year: pre.year
    } : null,
    currentTurnAfterAction: post ? {
      currentPlayerIndex: post.currentPlayerIndex,
      currentPlayerId: post.players[post.currentPlayerIndex]?.id,
      phase: post.phase,
      turn: post.turn,
      year: post.year
    } : null,
    stateDiff: diff
  }, null, 2));
}

export function hashGameState(state: any): string {
  if (!state) return "null";
  const sortedStringify = (obj: any): string => {
    if (obj === null) return "null";
    if (typeof obj !== "object") return String(obj);
    if (Array.isArray(obj)) {
      return "[" + obj.map(sortedStringify).join(",") + "]";
    }
    const keys = Object.keys(obj).sort();
    return "{" + keys.map(k => `${k}:${sortedStringify(obj[k])}`).join(",") + "}";
  };
  const str = sortedStringify(state);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return (hash >>> 0).toString(16);
}

export function useGameTurn({ code, isLocal, userId }: UseGameTurnProps) {
  const searchParams = useSearchParams();

  // Stable caching of the userId to survive dynamic Next-Auth session flickering
  const [stableUserId, setStableUserId] = useState<string | undefined>(() => {
    if (userId) return userId;
    if (typeof window !== "undefined") {
      return localStorage.getItem("wc_user_id") || undefined;
    }
    return undefined;
  });

  useEffect(() => {
    if (userId && userId !== stableUserId) {
      localStorage.setItem("wc_user_id", userId);
      setStableUserId(userId);
    }
  }, [userId, stableUserId]);

  useEffect(() => {
    console.log("SYNC_TELEMETRY_V2_ACTIVE");
  }, []);

  const [gameState, _setGameState] = useState<GameState | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const lastGameVersionRef = useRef<number>(0);
  const fetchRoomRef = useRef<((source?: string) => void) | undefined>(undefined);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);

  const pendingVersionRef = useRef<number | null>(null);
  const pendingSinceRef = useRef<number | null>(null);
  const submittedVersionRef = useRef<number | null>(null);

  const setGameState = useCallback((s: GameState | null | undefined, source: string = "unknown", incomingVersion: number = 0, incomingUpdatedAt: number = 0) => {
    const pre = gameStateRef.current;
    
    console.log({
      source,
      roomId: code,
      gameVersion: incomingVersion > 0 ? incomingVersion : lastGameVersionRef.current,
      turn: s?.turn,
      currentPlayer: s?.currentPlayerIndex,
      timestamp: Date.now()
    });

    // 1. Log the SET_GAME_STATE attempt
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "SET_GAME_STATE_CALL",
      source: source,
      previousState: pre ? {
        turn: pre.turn,
        phase: pre.phase
      } : null,
      newState: s ? {
        turn: s.turn,
        phase: s.phase
      } : null
    }, null, 2));

    // 2. STATE_REGRESSION Detector
    if (pre && s) {
      const incomingTurn = s.turn;
      const currentTurn = pre.turn;
      const incomingYear = s.year;
      const currentYear = pre.year;

      const isLowerTurn = incomingYear < currentYear || (incomingYear === currentYear && incomingTurn < currentTurn);
      const isOlderVersion = incomingVersion > 0 && lastGameVersionRef.current > 0 && incomingVersion <= lastGameVersionRef.current;
      const isVersionGap = incomingVersion > 0 && lastGameVersionRef.current > 0 && incomingVersion > lastGameVersionRef.current + 1;

      if (isLowerTurn || isOlderVersion) {
        console.warn(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: "STATE_REGRESSION",
          source: source,
          rejectedState: {
            phase: s.phase,
            turn: incomingTurn,
            year: incomingYear,
            version: incomingVersion,
            updatedAt: incomingUpdatedAt > 0 ? new Date(incomingUpdatedAt).toISOString() : null
          },
          currentState: {
            phase: pre.phase,
            turn: currentTurn,
            year: currentYear,
            version: lastGameVersionRef.current
          },
          reason: isLowerTurn ? "incoming state has a lower turn/year count" : "incoming state is older or duplicate (version is <= current)"
        }, null, 2));
        
        // Reject the update!
        return;
      }
      
      if (isVersionGap) {
        console.warn("VERSION_GAP");
        // Automatically execute fetchRoom to resynchronize
        if (fetchRoomRef.current) fetchRoomRef.current("gap_sync");
      }
    }

    // Check if game state was lost or corrupted (either s is null/undefined, or it's an object missing vital properties)
    const isIncomingStateInvalid = !s || typeof s.phase === "undefined" || !Array.isArray(s.players);
    const isPreStateValid = pre && typeof pre.phase !== "undefined" && Array.isArray(pre.players);

    if (isPreStateValid && isIncomingStateInvalid) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "GAME_STATE_LOST",
        previousPhase: pre.phase,
        previousTurn: pre.turn,
        previousYear: pre.year,
        source: source,
        incomingValue: s === null ? "null" : (typeof s === "undefined" ? "undefined" : JSON.stringify(s))
      }, null, 2));
    }
    
    _setGameState(s as GameState | null);
    gameStateRef.current = s as GameState | null;

    if (s) {
      const hash = hashGameState(s);
      console.log(JSON.stringify({
        event: "STATE_HASH",
        turn: s.turn,
        year: s.year,
        hash
      }, null, 2));

      const currentPlayer = s.players[s.currentPlayerIndex];
      const isEligibleToBidTelemetry = s.players.find(p => p.id === stableUserId)?.hasHouse === false;
      const hasSubmittedBidTelemetry = !!s.auctionState?.bids.find(b => b.playerId === stableUserId);
      const isTradeResponderTelemetry = s.pendingTrade?.toPlayerId === stableUserId;

      const isMyTurnTelemetry = !!(isLocal || (
        s.phase === "auction"
          ? (isEligibleToBidTelemetry && !hasSubmittedBidTelemetry)
          : (s.phase === "waiting-trade"
              ? (currentPlayer?.id === stableUserId || isTradeResponderTelemetry)
              : (currentPlayer?.id === stableUserId))
      ));

      console.log(JSON.stringify({
        event: "TURN_OWNER_STATE",
        source,
        turn: s.turn,
        year: s.year,
        phase: s.phase,
        currentPlayerIndex: s.currentPlayerIndex,
        currentPlayerId: currentPlayer?.id,
        localUserId: stableUserId,
        isMyTurn: isMyTurnTelemetry,
        stateHash: hash
      }, null, 2));
    }
    
    if (incomingVersion > 0) {
      if (lastGameVersionRef.current > 0) {
        console.assert(
          incomingVersion >= lastGameVersionRef.current,
          "STATE_REGRESSION"
        );
      }
      lastGameVersionRef.current = incomingVersion;
      
      if (
          pendingVersionRef.current !== null &&
          lastGameVersionRef.current >= pendingVersionRef.current
      ) {
          console.log(JSON.stringify({
              timestamp: new Date().toISOString(),
              event: "ACTION_VERSION_CONFIRMED",
              version: pendingVersionRef.current,
              roomId: code,
              playerId: stableUserId
          }));
      
          pendingVersionRef.current = null;
          pendingSinceRef.current = null;
          submittedVersionRef.current = null;
      
          setIsSubmitting(false);
          setIsRecovering(false);
      }
    }
  }, [code, isLocal, stableUserId]);

  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [rolling, setRolling] = useState(false);
  const [lastDice, setLastDice] = useState<number | null>(null);
  const [diceMode, setDiceMode] = useState<"move" | "lottery">("move");

  const [showTrade, setShowTrade] = useState(false);
  const [showAuction, setShowAuction] = useState(false);
  const [showRebalance, setShowRebalance] = useState(false);
  const [showLeadersDilemma, setShowLeadersDilemma] = useState(false);
  const [showTargetedAction, setShowTargetedAction] = useState<"tax-raid" | "hostile-takeover" | "audit" | null>(null);
  const [showChoiceModal, setShowChoiceModal] = useState<"lottery" | "ipo" | "emergency" | "emergency-decision" | null>(null);
  const [showPassDevice, setShowPassDevice] = useState(false);

  const [pendingEmergencyAmount, setPendingEmergencyAmount] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [turnTimeLeft, setTurnTimeLeft] = useState<number | null>(null);
  const [rebalancePenaltyOverride, setRebalancePenaltyOverride] = useState<number | null>(null);
  const [overlayMessage, setOverlayMessage] = useState<string | null>(null);

  const [isBotProcessing, setIsBotProcessing] = useState(false);
  const [botActionTrigger, setBotActionTrigger] = useState(0);
  const isBotProcessingRef = useRef(false);
  const activeBotExecution = useRef<string | null>(null);
  const [botThinkingMessage, setBotThinkingMessage] = useState<string | null>(null);
  const [botDebug, setBotDebug] = useState<any | null>(null);
  const [initialPreview, setInitialPreview] = useState(true);
  const [isEndingTurn, setIsEndingTurn] = useState(false);
  const [portfolios, setPortfolios] = useState<Record<string, { cash: number, bonds: number, stocks: number }>>({});
  const [connectionStatus, setConnectionStatus] = useState<string>("connected");
  
  // Telemetry state counters
  const [pusherReconnectsCount, setPusherReconnectsCount] = useState<number>(0);
  const [watchdogRefreshes, setWatchdogRefreshes] = useState<number>(0);

  useEffect(() => {
    const id = setInterval(() => {
        if (
            pendingVersionRef.current !== null &&
            pendingSinceRef.current !== null &&
            Date.now() - pendingSinceRef.current > 10000
        ) {
            console.log(JSON.stringify({
                event: "ACTION_TIMEOUT",
                version: pendingVersionRef.current,
                roomId: code
            }));

            if (fetchRoomRef.current) fetchRoomRef.current("pending_timeout");
        }

        if (
            pendingVersionRef.current !== null &&
            pendingSinceRef.current !== null &&
            Date.now() - pendingSinceRef.current > 15000
        ) {
            console.log(JSON.stringify({
                event: "ACTION_RECOVERED",
                roomId: code
            }));

            pendingVersionRef.current = null;
            pendingSinceRef.current = null;
            submittedVersionRef.current = null;

            setIsSubmitting(false);
            setIsRecovering(false);

            setOverlayMessage("Connection interrupted. Refreshing game state...");
            setTimeout(() => setOverlayMessage(null), 3000);
        }
    }, 1000);

    return () => clearInterval(id);
  }, [code]);
  const [failedActionsCount, setFailedActionsCount] = useState<number>(0);
  const [recentActionDurationMs, setRecentActionDurationMs] = useState<number | null>(null);
  const [watchdogStale, setWatchdogStale] = useState<boolean>(false);
  const [playerTelemetry, setPlayerTelemetry] = useState<Record<string, { lastSeen: string; connectionAge: number; reconnectCount: number; isOnline: boolean }>>({});
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const lastUpdateTimestampRef = useRef<number>(Date.now());

  const currentBiddingPlayer = useMemo(() => {
    if (!gameState || gameState.phase !== "auction") return null;
    return gameState.players.find(p => !p.hasHouse && !gameState.auctionState?.bids.find(b => b.playerId === p.id));
  }, [gameState]);

  const eligibleBiddersCount = useMemo(() => {
    if (!gameState) return 0;
    return gameState.players.filter(p => !p.hasHouse).length;
  }, [gameState]);

  const hasSubmittedBid = useMemo(() => {
    if (!gameState || !gameState.auctionState || !stableUserId) return false;
    return !!gameState.auctionState.bids.find(b => b.playerId === stableUserId);
  }, [gameState, stableUserId]);

  const isEligibleToBid = useMemo(() => {
    if (!gameState || !stableUserId) return false;
    const player = gameState.players.find(p => p.id === stableUserId);
    return player ? !player.hasHouse : false;
  }, [gameState, stableUserId]);

  const isTradeResponder = useMemo(() => {
    if (!gameState || gameState.phase !== "waiting-trade" || !stableUserId) return false;
    return gameState.pendingTrade?.toPlayerId === stableUserId;
  }, [gameState, stableUserId]);

  // Derived properties with try-catch guarding and temporary console logging for render-time safety
  let currentPlayer = undefined;
  try {
    currentPlayer = gameState?.players?.[gameState?.currentPlayerIndex ?? -1];
  } catch (err: any) {
    console.error("[RenderException] Failed to resolve currentPlayer:", {
      error: err?.message || err,
      gameStateExists: !!gameState,
      currentPlayerIndex: gameState?.currentPlayerIndex,
      playersCount: gameState?.players?.length
    });
  }

  let isMyTurn = false;
  try {
    isMyTurn = !!(isLocal || (
      gameState?.phase === "auction"
        ? (isEligibleToBid && !hasSubmittedBid)
        : (gameState?.phase === "waiting-trade"
            ? (currentPlayer?.id === stableUserId || isTradeResponder)
            : (gameState && currentPlayer?.id === stableUserId))
    ));
  } catch (err: any) {
    console.error("[RenderException] Failed to resolve isMyTurn:", {
      error: err?.message || err,
      gameStatePhase: gameState?.phase,
      currentPlayerId: currentPlayer?.id
    });
  }

  let allPlayersHaveHouses = false;
  try {
    allPlayersHaveHouses = gameState?.players?.every(p => p.hasHouse) ?? false;
  } catch (err: any) {
    console.error("[RenderException] Failed to resolve allPlayersHaveHouses:", {
      error: err?.message || err,
      playersCount: gameState?.players?.length
    });
  }

  let isSetupPhase = false;
  let isInitialSetup = false;
  try {
    isSetupPhase = !!(gameState?.year === 1 && gameState?.phase === "year-end" && (gameState?.turn ?? 0) < (gameState?.players?.length ?? 0));
    isInitialSetup = isSetupPhase && !initialPreview;
  } catch (err: any) {
    console.error("[RenderException] Failed to resolve setup phase flags:", {
      error: err?.message || err,
      year: gameState?.year,
      phase: gameState?.phase,
      turn: gameState?.turn,
      playersCount: gameState?.players?.length
    });
  }

  let myPlayer = undefined;
  try {
    myPlayer = isLocal ? currentPlayer : gameState?.players?.find(p => p.id === stableUserId);
  } catch (err: any) {
    console.error("[RenderException] Failed to resolve myPlayer:", {
      error: err?.message || err,
      isLocal,
      currentPlayerExists: !!currentPlayer,
      playersCount: gameState?.players?.length
    });
  }

  let myPrivateMessage = undefined;
  try {
    myPrivateMessage = myPlayer?.privateMessage || (isMyTurn ? gameState?.privateMessage : undefined);
  } catch (err: any) {
    console.error("[RenderException] Failed to resolve myPrivateMessage:", {
      error: err?.message || err,
      myPlayerExists: !!myPlayer,
      isMyTurn
    });
  }

  // Initial preview timer
  useEffect(() => {
    const timer = setTimeout(() => setInitialPreview(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  const fetchDiagnosticsRef = useRef<{ minuteStarted: number; counts: Record<string, number> }>({ minuteStarted: Date.now(), counts: {} });

  const fetchRoom = useCallback(async (source: string = "poll_fetch", showBlockingError: boolean = false) => {
    const now = Date.now();
    if (now - fetchDiagnosticsRef.current.minuteStarted > 60000) {
      console.log(JSON.stringify({
        event: "FETCH_DIAGNOSTICS_SUMMARY",
        roomId: code,
        durationMs: now - fetchDiagnosticsRef.current.minuteStarted,
        totalCalls: Object.values(fetchDiagnosticsRef.current.counts).reduce((a, b) => a + b, 0),
        counts: fetchDiagnosticsRef.current.counts
      }));
      fetchDiagnosticsRef.current = { minuteStarted: now, counts: {} };
    }
    fetchDiagnosticsRef.current.counts[source] = (fetchDiagnosticsRef.current.counts[source] || 0) + 1;

    console.log(JSON.stringify({ event: "client_fetch_trigger", source }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second fetch timeout

    try {
      const res = await fetch(`/api/rooms?code=${code}&t=${Date.now()}&source=${source}`, { 
        cache: "no-store",
        signal: controller.signal
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(data?.error || "Failed to fetch room details");
      if (!data?.room) throw new Error("Room details not found");
      
      if (data.appVersion) {
        checkVersion(data.appVersion);
      }
      
      const newGameState = data.room.gameState;
      const preState = gameStateRef.current;
      const stateChanged = !preState || JSON.stringify(preState) !== JSON.stringify(newGameState);
      const incomingVersion = data?.room?.gameVersion || 0;
      const incomingUpdatedAt = data?.room?.updatedAt ? new Date(data.room.updatedAt).getTime() : 0;

      // Log the fetch response
      console.log(JSON.stringify({
        event: "room_fetch",
        roomId: data?.room?.id || code,
        playerCount: data?.room?.playerIds?.length || 0,
        source: source,
        responseSize: text.length,
        timestamp: new Date().toISOString()
      }));

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "FETCH_ROOM_RESPONSE",
        source: source,
        roomUpdatedAt: data?.room?.updatedAt || null,
        gameState: newGameState ? {
          turn: newGameState.turn,
          phase: newGameState.phase,
          currentPlayerIndex: newGameState.currentPlayerIndex
        } : null
      }, null, 2));

      setGameState(newGameState, source, incomingVersion, incomingUpdatedAt);
      setRoom(data.room);
      roomIdRef.current = data.room.id;
      setLoading(false);

      // Track telemetry updates
      lastUpdateTimestampRef.current = Date.now();
      if (stableUserId) {
        const nowStr = new Date().toISOString();
        setPlayerTelemetry(prev => {
          const next = { ...prev };
          data.room.playerIds.forEach((pid: string) => {
            const current = next[pid] || { lastSeen: nowStr, connectionAge: 0, reconnectCount: 0, isOnline: true };
            next[pid] = {
              ...current,
              lastSeen: pid === stableUserId ? nowStr : (newGameState?.currentPlayerIndex !== undefined && newGameState?.players?.[newGameState.currentPlayerIndex]?.id === pid ? nowStr : current.lastSeen),
              isOnline: true
            };
          });
          return next;
        });
      }
    } catch (e: any) {
      console.warn("[fetchRoom Warning] Failed to poll room:", e.message);
      if (showBlockingError) {
        setError(e.message);
      }
      setLoading(false);
    } finally {
      clearTimeout(timeoutId);
    }
  }, [code, setGameState, setError]);

  // Fetch / Init Logic
  const hasFetchedInitForCode = useRef<string | null>(null);

  useEffect(() => {
    if (isLocal) {
      const playersJson = searchParams.get("players");
      const botsJson = searchParams.get("bots");
      if (playersJson && !gameState) {
        try {
          const playerNames = JSON.parse(playersJson);
          const botNames = botsJson ? JSON.parse(botsJson) : [];
          
          const allPlayers = [
            ...playerNames.map((name: string, i: number) => ({
              id: `player_${i}`, name, avatar: "", isBot: false,
            })),
            ...botNames.map((bot: any, i: number) => ({
              id: `bot_${i}`,
              name: typeof bot === "string" ? bot : bot.name,
              avatar: "",
              isBot: true,
              botType: typeof bot === "string" ? "balanced" : bot.botType,
            })),
          ];
      
          setGameState(createInitialGameState(allPlayers));
        } catch (e) {
          setError("Failed to initialize local game. Check URL parameters.");
        }
      }
      setLoading(false);
    } else {
      if (hasFetchedInitForCode.current !== code) {
        hasFetchedInitForCode.current = code;
        fetchRoom("initial_fetch", true); // show blocking error on initial fetch
      }
    }
  }, [code, isLocal, fetchRoom, searchParams]);

  // Pusher / Online Sync with Polling Fallback
  useEffect(() => {
    if (isLocal || !code) return;

    const pusher = getPusherClient();
    let channel: any = null;

    const handleStateChange = (state: any) => {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "PUSHER_CONNECTION_STATE_CHANGE",
        roomId: roomIdRef.current,
        playerId: stableUserId,
        previous: state.previous,
        current: state.current
      }));
      setConnectionStatus(state.current);

      if (state.current === "connected") {
        if (state.previous === "connecting" || state.previous === "unavailable" || state.previous === "disconnected") {
          console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            event: "PUSHER_RECONNECTED",
            roomId: roomIdRef.current,
            playerId: stableUserId,
            message: "Pusher connection re-established, triggering reconnect state validation..."
          }));
          
          setPusherReconnectsCount(prev => prev + 1);
          
          if (stableUserId) {
            setPlayerTelemetry(prev => {
              const current = prev[stableUserId] || { lastSeen: new Date().toISOString(), connectionAge: 0, reconnectCount: 0, isOnline: true };
              return {
                ...prev,
                [stableUserId]: {
                  ...current,
                  reconnectCount: current.reconnectCount + 1,
                  lastSeen: new Date().toISOString()
                }
              };
            });
          }

          // Trigger recovery fetch and verification
          const preFetchPhase = gameStateRef.current?.phase;
          const preFetchPlayerIdx = gameStateRef.current?.currentPlayerIndex;

          fetchRoom("reconnect_fetch", false).then(() => {
            const postFetchPhase = gameStateRef.current?.phase;
            const postFetchPlayerIdx = gameStateRef.current?.currentPlayerIndex;

            if (preFetchPhase && postFetchPhase && (preFetchPhase !== postFetchPhase || preFetchPlayerIdx !== postFetchPlayerIdx)) {
              console.warn(JSON.stringify({
                timestamp: new Date().toISOString(),
                event: "STATE_MISMATCH_DETECTED",
                roomId: roomIdRef.current,
                playerId: stableUserId,
                message: "Sync state mismatch resolved on reconnect",
                localState: { phase: preFetchPhase, currentPlayerIndex: preFetchPlayerIdx },
                serverAuthoritativeState: { phase: postFetchPhase, currentPlayerIndex: postFetchPlayerIdx }
              }));
            } else {
              console.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                event: "STATE_SYNC_VERIFIED",
                roomId: roomIdRef.current,
                playerId: stableUserId,
                message: "Authoritative server state verified matching local state successfully"
              }));
            }
          });
        }
      }
    };

    if (pusher) {
      try {
        setConnectionStatus(pusher.connection.state);
        pusher.connection.bind("state_change", handleStateChange);

        channel = pusher.subscribe(getRoomChannel(code));
        
        const createPusherHandler = (eventName: string) => {
          return (data: any) => {
            const incomingVersion = data?.version || 0;
            const currentVersion = lastGameVersionRef.current;
            
            console.log(JSON.stringify({
              timestamp: new Date().toISOString(),
              event: "ACTION_PUBLISH_RECEIVED",
              eventName,
              roomCode: code,
              incomingVersion,
              currentVersion,
              fetchTriggered: true
            }, null, 2));
            
            lastUpdateTimestampRef.current = Date.now(); // Record pusher event time for watchdog
            
            if (incomingVersion > 0 && currentVersion > 0) {
              if (incomingVersion <= currentVersion) {
                // Ignore stale or duplicate events
                return;
              }
              if (incomingVersion > currentVersion + 1) {
                console.warn("VERSION_GAP: Pusher delivered version", incomingVersion, "but we are at", currentVersion);
                console.log(JSON.stringify({
                  source: "version-gap-recovery",
                  gameVersion: incomingVersion,
                  turn: gameStateRef.current?.turn,
                  currentPlayer: gameStateRef.current?.currentPlayerIndex,
                  timestamp: Date.now(),
                }));
                fetchRoom("pusher_gap", false);
                return;
              }
            }
            
            fetchRoom("pusher", false);
          };
        };
        
        channel.bind(PUSHER_EVENTS.GAME_STATE_UPDATE, createPusherHandler(PUSHER_EVENTS.GAME_STATE_UPDATE));
        channel.bind(PUSHER_EVENTS.TRADE_OFFER, createPusherHandler(PUSHER_EVENTS.TRADE_OFFER));
        channel.bind(PUSHER_EVENTS.GAME_STARTED, createPusherHandler(PUSHER_EVENTS.GAME_STARTED));
        channel.bind(PUSHER_EVENTS.GAME_FINISHED, createPusherHandler(PUSHER_EVENTS.GAME_FINISHED));
      } catch (err) {
        console.warn("[Pusher Subscription Warning] Failed to subscribe to channel:", err);
      }
    }

    // Priority 1: Eliminating Aggressive Polling
    let isSubscribed = true;
    let fallbackPollTimer: NodeJS.Timeout;
    
    // We update this timestamp when a Pusher event arrives or a fetch succeeds.
    // Ensure initial value is present.
    lastUpdateTimestampRef.current = Date.now();
    
    const fallbackPoll = async () => {
      if (!isSubscribed) return;
      try {
        if (document.visibilityState === "hidden") return;
        if (!gameStateRef.current || gameStateRef.current.phase !== "finished") {
          console.log(JSON.stringify({ event: "fallback_poll_triggered" }));
          await fetchRoom("fallback_poll", false);
        }
      } catch (e) {
        // Safe to ignore
      } finally {
        if (isSubscribed) {
          fallbackPollTimer = setTimeout(fallbackPoll, 60000);
        }
      }
    };

    const managePolling = () => {
      if (!isSubscribed) return;
      const state = pusher?.connection?.state;
      if (state !== "connected") {
        if (!fallbackPollTimer) {
          console.log(JSON.stringify({ event: "fallback_poll_started", connectionState: state }));
          fallbackPollTimer = setTimeout(fallbackPoll, 60000);
        }
      } else {
        if (fallbackPollTimer) {
          console.log(JSON.stringify({ event: "fallback_poll_stopped" }));
          clearTimeout(fallbackPollTimer);
          fallbackPollTimer = undefined as any;
        }
      }
    };

    // Listen to connection state changes explicitly
    pusher?.connection?.bind("state_change", (states: any) => {
      console.log(JSON.stringify({ event: states.current === "connected" ? "pusher_connected" : "pusher_disconnected", state: states.current }));
      managePolling();
    });
    
    managePolling();


    // When the browser tab becomes active again, fetch immediately.
    // This fixes the issue where Chrome throttles setTimeout in inactive tabs after 5 minutes!
    const handleVisibilityChange = () => {
      const state = document.visibilityState;
      console.log(JSON.stringify({ event: state === "visible" ? "tab_visible" : "tab_hidden" }));
      if (state === "visible" && isSubscribed) {
        fetchRoom("visibility_change_fetch", false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isSubscribed = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (pusher) {
        try {
          pusher.connection.unbind("state_change", handleStateChange);
        } catch (e) {}
        if (channel) {
          try {
            pusher.unsubscribe(getRoomChannel(code));
          } catch (e) {}
        }
      }
      clearTimeout(fallbackPollTimer);
    };
  }, [code, isLocal, fetchRoom]);

  // The 15-second Stale Watchdog Timer has been replaced by the new silent failure detection logic in the main hook.

  // 10-second Active Gameplay Freeze Detection Watchdog
  useEffect(() => {
    if (!gameState || gameState.phase === "finished") return;

    const interval = setInterval(() => {
      const timeSinceUpdate = Date.now() - lastUpdateTimestampRef.current;
      if (timeSinceUpdate > 10000) {
        console.warn(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: "FREEZE_DETECTED",
          roomId: roomIdRef.current,
          playerId: stableUserId,
          timeSinceLastUpdateMs: timeSinceUpdate,
          gamePhase: gameState.phase,
          activePlayer: gameState?.players?.[gameState?.currentPlayerIndex ?? -1]?.name || gameState?.players?.[gameState?.currentPlayerIndex ?? -1]?.id || null,
          pusherState: connectionStatus,
          watchdogRefreshesCount: watchdogRefreshes,
          message: `Active gameplay freeze detected! No state updates received for ${Math.round(timeSinceUpdate / 1000)}s.`
        }, null, 2));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState, connectionStatus, stableUserId, watchdogRefreshes]);

  // Player presence age & heartbeat interval
  useEffect(() => {
    if (isLocal || !gameState) return;
    
    const interval = setInterval(() => {
      const nowStr = new Date().toISOString();
      const nextTelemetry = { ...playerTelemetry };
      let telemetryChanged = false;
      
      gameState.players.forEach(p => {
        const prev = nextTelemetry[p.id] || { lastSeen: nowStr, connectionAge: 0, reconnectCount: 0, isOnline: true };
        
        let age = prev.connectionAge;
        if (p.id === stableUserId) {
          age += 1;
        }
        
        const timeSinceLastSeen = Date.now() - new Date(prev.lastSeen).getTime();
        const isOnline = timeSinceLastSeen < 10000;
        
        if (prev.connectionAge !== age || prev.isOnline !== isOnline) {
          nextTelemetry[p.id] = {
            ...prev,
            connectionAge: age,
            isOnline
          };
          telemetryChanged = true;
        }
      });
      
      if (telemetryChanged) {
        setPlayerTelemetry(nextTelemetry);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isLocal, gameState, playerTelemetry, stableUserId]);

  // Reset transient UI states when the turn advances to a different player
  useEffect(() => {
    if (!gameState) return;
    setShowChoiceModal(null);
    setShowAuction(false);
    setShowTargetedAction(null);
    setShowTrade(false);
    setShowRebalance(false);
    setPendingEmergencyAmount(null);
    setRebalancePenaltyOverride(null);
  }, [gameState?.currentPlayerIndex]);

  // Handle auto-rebalance for emergency trades if trade is rejected or fails to cover
  useEffect(() => {
    if (gameState?.emergencyState?.status === "rebalance-required" && gameState.emergencyState.playerId === stableUserId) {
      if (!showRebalance) {
         setRebalancePenaltyOverride(3);
         setShowRebalance(true);
      }
    }
  }, [gameState?.emergencyState?.status, gameState?.emergencyState?.playerId, stableUserId, showRebalance]);

  // Action Dispatcher
  const performAction = useCallback(async (action: string, payload?: any) => {
    if (
        isSubmitting ||
        isRecovering ||
        pendingVersionRef.current !== null
    ) {
        return;
    }

    const handleSideEffect = (fx: any, stateToSet: GameState) => {
      if (fx.type === "show-modal") {
        const m = fx.modal;
        if (m === "ipo" || m === "lottery") setShowChoiceModal(m);
        else if (m === "emergency") {
          setPendingEmergencyAmount(fx.emergencyAmount);
          setShowChoiceModal("emergency");
        }
        else if (m === "emergency-decision") {
          setShowChoiceModal("emergency-decision");
        }
        else if (m === "tax-raid") setShowTargetedAction("tax-raid");
        else if (m === "hostile-takeover") setShowTargetedAction("hostile-takeover");
        else if (m === "audit") setShowTargetedAction("audit");
        return true;
      }
      if (fx.type === "show-trade") {
        setShowTrade(true);
        setShowChoiceModal(null);
        setGameState(stateToSet);
        return true;
      }
      if (fx.type === "start-lottery-roll") {
        setDiceMode("lottery");
        setShowChoiceModal(null);
        setOverlayMessage("🎰 ROLL FOR YOUR LOTTERY PRIZE!");
        setGameState(stateToSet);
        return true;
      }
      if (fx.type === "show-auction") {
        setShowAuction(true);
        return false;
      }
      if (fx.type === "needs-rebalance") {
        setRebalancePenaltyOverride(fx.penalty);
        setShowRebalance(true);
        setGameState(stateToSet);
        return true;
      }
      if (fx.type === "error") {
        const isBot = stateToSet?.players?.[stateToSet?.currentPlayerIndex]?.isBot;
        if (!isBot) {
          alert(fx.message);
        } else {
          console.error("BOT DISPATCH ERROR (suppressed alert):", fx.message);
        }
        return true;
      }
      if (fx.type === "show-pass-device") {
        const nextBiddingPlayer = stateToSet?.players?.find(p => !p.hasHouse && !stateToSet?.auctionState?.bids?.find(b => b.playerId === p.id));
        const nextTradeResponder = stateToSet?.phase === "waiting-trade"
          ? stateToSet?.players?.find(p => p.id === stateToSet?.pendingTrade?.toPlayerId)
          : undefined;
        const nextActivePlayer = stateToSet?.players?.[stateToSet?.currentPlayerIndex ?? -1];
        const nextIsBot = nextBiddingPlayer?.isBot || nextTradeResponder?.isBot || (stateToSet?.phase !== "auction" && stateToSet?.phase !== "waiting-trade" && nextActivePlayer?.isBot);

        if (nextIsBot || !isLocal) {
          setShowPassDevice(false);
        } else {
          setShowPassDevice(true);
        }
        return false;
      }
      return false;
    };

    if (isLocal) {
      if (action === "start" && !gameState) return; // handled by URL params in local

      if (gameStateRef.current) {
        const preState = gameStateRef.current;
        const actionId = `local_${action}_${Date.now()}`;
        const result = dispatch(gameStateRef.current, action, payload);

        if (result.dice !== undefined) setLastDice(result.dice);

        if (result.sideEffect) {
          if (handleSideEffect(result.sideEffect, result.state)) {
            const finalState = applyWinCheck(result.state);
            setGameState(finalState);
            logStateTransition(action, actionId, preState, finalState, "active", finalState?.players?.length ?? 0);
            return result;
          }
        }

        const finalState = applyWinCheck(result.state);
        if (action === "tile-action" || action === "rebalance") {
          setPendingEmergencyAmount(null);
        }
        if (finalState?.currentPlayerIndex !== (gameStateRef.current?.currentPlayerIndex ?? -1)) {
          setPendingEmergencyAmount(null);
          const nextPlayer = finalState?.players?.[finalState?.currentPlayerIndex ?? -1];
          if (nextPlayer && !nextPlayer.isBot) {
            setShowPassDevice(true);
          } else {
            setShowPassDevice(false);
          }
        }
        setGameState(finalState);
        logStateTransition(action, actionId, preState, finalState, "active", finalState?.players?.length ?? 0);
        return result;
      }
      return null;
    }

    // Online Mode Dispatch
    const requestStartTime = Date.now();
    const startTimeISO = new Date().toISOString();
    const actionId = `${action}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    let roomId = roomIdRef.current;
    let fallbackPerformed = false;

    setIsSubmitting(true);
    console.log(JSON.stringify({
        event: "ACTION_SUBMIT",
        localVersion: lastGameVersionRef.current,
        roomId: roomId || code,
        playerId: stableUserId
    }));

    try {
      if (!roomId) {
        fallbackPerformed = true;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second timeout for read metadata fallback
        try {
          const roomRes = await fetch(`/api/rooms?code=${code}&t=${Date.now()}`, { 
            cache: "no-store",
            signal: controller.signal
          });
          const roomText = await roomRes.text();
          const roomData = roomText ? JSON.parse(roomText) : null;
          if (!roomRes.ok || !roomData) throw new Error(roomData?.error || "Failed to fetch room details");
          roomId = roomData.room.id;
          roomIdRef.current = roomId;
        } catch (err: any) {
          if (err.name === "AbortError") {
            console.error(JSON.stringify({
              timestamp: new Date().toISOString(),
              event: "CLIENT_READ_TIMEOUT",
              roomId: "unknown",
              playerId: stableUserId,
              actionId,
              actionType: action,
              durationMs: Date.now() - requestStartTime,
              timeoutLimitMs: 5000,
              timeoutFlag: true,
              reconnectCount: pusherReconnectsCount,
              watchdogRefreshCount: watchdogRefreshes,
              pusherState: connectionStatus
            }));
            throw new Error("Failed to load room info: connection timed out.");
          }
          throw err;
        } finally {
          clearTimeout(timeoutId);
        }
      }

      if (!roomId) throw new Error("Room ID not found");

      const actionController = new AbortController();
      const actionTimeoutId = setTimeout(() => actionController.abort(), 10000); // 10-second timeout for action submissions
      try {
        const actionRes = await fetch(`/api/rooms/${roomId}/action`, {
          method: "POST",
          body: JSON.stringify({ 
            action, 
            payload, 
            actionId,
            clientVersion: gameStateRef.current?.version,
            clientCurrentPlayer: gameStateRef.current?.currentPlayerIndex
          }),
          headers: { "Content-Type": "application/json" },
          signal: actionController.signal
        });
        const actionText = await actionRes.text();
        const data = actionText ? JSON.parse(actionText) : null;
        
        if (!actionRes.ok || !data) {
          if (actionRes.status === 403 && data?.error === "Not your turn") {
            console.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                event: "TURN_DESYNC_RECOVERED",
                roomId: roomIdRef.current,
                playerId: stableUserId
            }));
        
            setIsRecovering(true);
            setOverlayMessage("Synchronizing game state...");
        
            if (fetchRoomRef.current) fetchRoomRef.current("turn_desync_recovery");
        
            if (
                submittedVersionRef.current !== null &&
                lastGameVersionRef.current > submittedVersionRef.current
            ) {
                console.log(JSON.stringify({
                    timestamp: new Date().toISOString(),
                    event: "ACTION_RECOVERED",
                    roomId: roomIdRef.current,
                    playerId: stableUserId
                }));
            }
            return null;
          }
          throw new Error(data?.error || "Failed to perform action");
        }
        
        submittedVersionRef.current = lastGameVersionRef.current;
        pendingVersionRef.current = data.gameVersion;
        pendingSinceRef.current = Date.now();
        
        console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            event: "ACTION_HTTP_SUCCESS",
            roomId: roomIdRef.current,
            playerId: stableUserId,
            serverVersion: data.gameVersion
        }));
        
        if (data.appVersion) {
          checkVersion(data.appVersion);
        }
        
        const preState = gameStateRef.current;
        if (data.gameVersion > 0 && lastGameVersionRef.current > 0) {
          console.assert(
            data.gameVersion === lastGameVersionRef.current + 1,
            "INVALID_VERSION_INCREMENT"
          );
        }
        
        setGameState(data.gameState, `action_${action}`, data.gameVersion || 0, data.updatedAt || 0);
        if (data.dice) setLastDice(data.dice);
        
        let sideEffectHandled = false;
        if (data.sideEffect) {
          sideEffectHandled = handleSideEffect(data.sideEffect, data.gameState);
        } else if (data.needsRebalance) {
          setRebalancePenaltyOverride(5 + (data.gameState.phase !== "year-end" ? 3 : 0));
          setShowRebalance(true);
        }

        if (!sideEffectHandled && (action === "tile-action" || action === "rebalance")) {
          setPendingEmergencyAmount(null);
        }

        const duration = Date.now() - requestStartTime;
        setRecentActionDurationMs(duration);

        logStateTransition(action, actionId, preState, data.gameState, room?.status || "active", data.gameState.players.length);

        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: "CLIENT_ACTION_SUCCESS",
          roomId,
          playerId: stableUserId,
          actionId,
          actionType: action,
          durationMs: duration,
          timeoutFlag: false,
          reconnectCount: pusherReconnectsCount,
          watchdogRefreshCount: watchdogRefreshes,
          pusherState: connectionStatus,
          fallbackPerformed
        }));

        return data;
      } catch (err: any) {
        setIsSubmitting(false);
        setIsRecovering(false);
        if (err.name === "AbortError") {
          console.error(JSON.stringify({
            timestamp: new Date().toISOString(),
            event: "CLIENT_ACTION_TIMEOUT",
            roomId,
            playerId: stableUserId,
            actionId,
            actionType: action,
            durationMs: Date.now() - requestStartTime,
            timeoutLimitMs: 10000,
            timeoutFlag: true,
            reconnectCount: pusherReconnectsCount,
            watchdogRefreshCount: watchdogRefreshes,
            pusherState: connectionStatus
          }));
          setFailedActionsCount(prev => prev + 1);
          throw new Error("Action submission timed out. Check your connection and try again.");
        }
        throw err;
      } finally {
        clearTimeout(actionTimeoutId);
      }
    } catch (e: any) {
      setIsSubmitting(false);
      setIsRecovering(false);
      
      const isForceTimeoutBufferError = action === "force-timeout" && e?.message?.includes("Timeout deadline not reached");
      
      if (!isForceTimeoutBufferError) {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: "CLIENT_ACTION_FAILED",
          roomId: roomId || "unknown",
          playerId: stableUserId,
          actionId,
          actionType: action,
          durationMs: Date.now() - requestStartTime,
          timeoutFlag: false,
          reconnectCount: pusherReconnectsCount,
          watchdogRefreshCount: watchdogRefreshes,
          pusherState: connectionStatus,
          error: e?.message || e
        }));
        setFailedActionsCount(prev => prev + 1);
        setError(e.message);
      } else {
        console.log("Suppressed expected force-timeout deadlock-recovery rejection:", e?.message);
      }
    }
  }, [code, gameState, isLocal, stableUserId, setGameState]);

  // ─── DISPLAY-ONLY TURN COUNTDOWN (driven by server-authoritative turnStartTimestamp) ───
  useEffect(() => {
    if (!gameState || gameState.phase === "finished" || !gameState.turnStartTimestamp) {
      if (turnTimeLeft !== null) setTurnTimeLeft(null);
      return;
    }

    const update = () => {
      const elapsed = (Date.now() - gameState.turnStartTimestamp!) / 1000;
      setTurnTimeLeft(Math.max(0, Math.round(30 - elapsed)));
    };
    update();
    const id = setInterval(update, 250);
    return () => clearInterval(id);
  }, [gameState?.turnStartTimestamp, gameState?.phase]);

  // Turn Timer
  const timeoutStateRef = useRef({
    showChoiceModal, showAuction, showTargetedAction, pendingEmergencyAmount,
    isLocal, currentBiddingPlayerId: currentBiddingPlayer?.id, userId: stableUserId,
    showRebalance
  });

  const lastPhaseRef = useRef<string | null>(null);
  const lastPlayerIdxRef = useRef<number | null>(null);

  useEffect(() => {
    timeoutStateRef.current = {
      showChoiceModal, showAuction, showTargetedAction, pendingEmergencyAmount,
      isLocal, currentBiddingPlayerId: currentBiddingPlayer?.id, userId: stableUserId,
      showRebalance
    };
  }, [showChoiceModal, showAuction, showTargetedAction, pendingEmergencyAmount, isLocal, currentBiddingPlayer, stableUserId, showRebalance]);

  useEffect(() => {
    if (!gameState || gameState.endgameCandidate || gameState.phase === "finished") return;

    // Reset timer to null if phase or player index changes (gives each phase/turn a fresh 30s)
    const phaseChanged = lastPhaseRef.current !== gameState.phase;
    const playerChanged = lastPlayerIdxRef.current !== gameState.currentPlayerIndex;
    if (phaseChanged || playerChanged) {
      lastPhaseRef.current = gameState.phase;
      lastPlayerIdxRef.current = gameState.currentPlayerIndex;
      setTimeLeft(null);
      return;
    }

    const needsTimer = ["action", "auction", "trade", "waiting-trade", "year-end"].includes(gameState.phase);
    if (!needsTimer) {
      if (timeLeft !== null) setTimeLeft(null);
      return;
    }

    if (timeLeft === null) {
      setTimeLeft(30);
      return;
    }

    if (timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    } else {
      setTimeLeft(null); // Reset timer immediately to prevent duplicate triggers!
      const { showChoiceModal, showAuction, showTargetedAction, pendingEmergencyAmount, isLocal, currentBiddingPlayerId, userId } = timeoutStateRef.current;
      const resolution = resolveTimeout(gameState, {
        activeModal: showChoiceModal,
        activeTargetedAction: showTargetedAction,
        auctionOpen: showAuction,
        pendingEmergencyAmount,
        bidderId: isLocal ? currentBiddingPlayerId : userId,
      });

      if (resolution) {
        performAction(resolution.action, resolution.payload);
        if (showChoiceModal) { setShowChoiceModal(null); setPendingEmergencyAmount(null); }
        if (showAuction) setShowAuction(false);
        if (showTargetedAction) setShowTargetedAction(null);
        if (timeoutStateRef.current.showRebalance) { setShowRebalance(false); setRebalancePenaltyOverride(null); }
      }
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [gameState?.phase, gameState?.currentPlayerIndex, timeLeft, performAction]);

  // ─── OBSERVER TIMEOUT (Deadlock Recovery) ───────────────────────────────────
  useEffect(() => {
    // Only run if we are NOT the active player holding the main timer
    if (isMyTurn) return;
    
    const interval = setInterval(() => {
      if (!room?.updatedAt) return;
      const idleTime = Date.now() - new Date(room.updatedAt).getTime();
      
      // If the room has been dead for 40s, poke the server
      if (idleTime > 40000) {
        performAction("force-timeout");
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isMyTurn, room?.updatedAt, performAction]);

  // Auto-clear overlay
  useEffect(() => {
    if (overlayMessage) {
      const timer = setTimeout(() => setOverlayMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [overlayMessage]);

  // Portfolio tracking
  useEffect(() => {
    if (!gameState) return;
    
    let myIdx = -1;
    if (isLocal) myIdx = gameState?.currentPlayerIndex ?? -1;
    else if (stableUserId) myIdx = gameState?.players?.findIndex(p => p.id === stableUserId) ?? -1;
    
    if (myIdx === -1) return;
    const myP = gameState?.players?.[myIdx];
    if (!myP) return;
    const prev = portfolios[myP.id];
    
    if (prev) {
      const changes: string[] = [];
      const cashDiff = myP.cash - prev.cash;
      const bondDiff = myP.bonds - prev.bonds;
      const stockDiff = myP.stocks - prev.stocks;

      if (cashDiff !== 0) changes.push(`${cashDiff > 0 ? "+" : ""}${cashDiff}L Cash`);
      if (bondDiff !== 0) changes.push(`${bondDiff > 0 ? "+" : ""}${bondDiff}L Bonds`);
      if (stockDiff !== 0) changes.push(`${stockDiff > 0 ? "+" : ""}${stockDiff}L Stocks`);

      if (changes.length > 0) {
        const isGain = (cashDiff + bondDiff + stockDiff) >= 0;
        setOverlayMessage(`${isGain ? "💰" : "📉"} ${isGain ? "Gained" : "Lost"}: ${changes.join(", ")}`);
      }
    }
    
    const newPortfolios = { ...portfolios };
    let hasChanged = false;
    gameState.players.forEach(p => {
      const current = portfolios[p.id];
      if (!current || current.cash !== p.cash || current.bonds !== p.bonds || current.stocks !== p.stocks) {
        newPortfolios[p.id] = { cash: p.cash, bonds: p.bonds, stocks: p.stocks };
        hasChanged = true;
      }
    });
    if (hasChanged) setPortfolios(newPortfolios);
  }, [gameState?.players, gameState?.currentPlayerIndex, isLocal, stableUserId]);

  // Keep fetchRoomRef updated
  useEffect(() => {
    fetchRoomRef.current = fetchRoom;
  }, [fetchRoom]);

  // Reset Pass Device screen on turn change in online mode
  useEffect(() => {
    if (!isLocal) {
      setShowPassDevice(false);
    }
  }, [gameState?.currentPlayerIndex, isLocal]);

  // Handlers
  const handleTileAction = useCallback(async (payload?: any) => {
    if (!payload && pendingEmergencyAmount !== null) {
      setShowChoiceModal("emergency");
      return;
    }
    await performAction("tile-action", payload);
  }, [pendingEmergencyAmount, performAction]);

  const handleRebalance = useCallback((newCash: number, newBonds: number, newStocks: number) => {
    const isMidYear = gameState?.phase !== "year-end";
    const payload: any = { newCash, newBonds, newStocks };
    if (isMidYear) payload.penalty = 3;
    
    const isSetup = gameState?.year === 1 && gameState?.phase === "year-end" && (gameState?.turn ?? 0) < (gameState?.players.length ?? 0);
    const wasYearEnd = gameState?.phase === "year-end";

    performAction("rebalance", payload).then(() => {
      setShowRebalance(false);
      setRebalancePenaltyOverride(null);
      if (wasYearEnd && !isSetup) handleTileAction();
    });
  }, [performAction, gameState?.phase, gameState?.year, gameState?.turn, gameState?.players?.length, handleTileAction]);

  const handleRoll = useCallback(async () => {
    setRolling(true);
    setTimeout(async () => {
      const dice = Math.floor(Math.random() * 6) + 1;
      setLastDice(dice);
      setRolling(false);
      
      await new Promise(r => setTimeout(r, 1000));

      if (diceMode === "lottery") {
        await performAction("lottery-resolve", { dice });
        setDiceMode("move");
        setOverlayMessage(null);
      } else {
        const result = await performAction("roll", { dice });
        if (result?.state?.phase === "year-end" || result?.gameState?.phase === "year-end") return;
        handleTileAction();
      }
    }, 800);
  }, [diceMode, performAction, handleTileAction]);

  const handleEndTurn = useCallback(async () => {
    if (isEndingTurn) return;
    setIsEndingTurn(true);
    try {
      const result = await performAction("end-turn");
      if (isLocal) {
        const nextState = result?.state || result?.gameState;
        if (nextState) {
          const nextPlayer = nextState?.players?.[nextState?.currentPlayerIndex ?? -1];
          if (nextPlayer && nextPlayer.isBot) {
            setShowPassDevice(false);
          } else {
            setShowPassDevice(true);
          }
        } else {
          setShowPassDevice(true);
        }
      }
    } finally {
      setIsEndingTurn(false);
    }
  }, [isEndingTurn, isLocal, performAction]);

  // Decoupled Automated Bot Turn Loop
  useEffect(() => {
    const isHost = !isLocal && room && stableUserId === room.hostId;
    if ((!isLocal && !isHost) || !gameState || gameState.phase === "finished") {
      return;
    }

    let activeBotIdx = -1;
    console.log("BOT TURN DETECTOR EFFECT TRIGGERED. Phase:", gameState?.phase, "PlayerIdx:", gameState?.currentPlayerIndex);
    if (gameState?.phase === "auction") {
      if (currentBiddingPlayer?.isBot) {
        activeBotIdx = gameState?.players?.findIndex(p => p.id === currentBiddingPlayer.id) ?? -1;
      }
    } else if (gameState?.phase === "waiting-trade") {
      const responder = gameState?.players?.find(p => p.id === gameState?.pendingTrade?.toPlayerId);
      if (responder?.isBot) {
        activeBotIdx = gameState?.players?.findIndex(p => p.id === responder.id) ?? -1;
      }
    } else {
      const activePlayer = gameState?.players?.[gameState?.currentPlayerIndex ?? -1];
      if (activePlayer?.isBot) {
        activeBotIdx = gameState?.currentPlayerIndex ?? -1;
      }
    }

    if (activeBotIdx === -1) {
      if (botDebug !== null) setBotDebug(null);
      console.log("BOT DETECTOR: No active bot found.");
      return;
    }

    console.log("BOT TURN START", activeBotIdx);
    console.log("BOT DETECTED", gameState?.players?.[activeBotIdx]?.name);
    console.log({
        TRACE: "BOT_PHASE",
        playerId: gameState?.players?.[activeBotIdx]?.id,
        phase: gameState?.phase,
        turn: gameState?.turn
    });

    // If an AI bot is active, immediately dismiss any pass-device screens to keep automation fluid
    if (showPassDevice) {
      setShowPassDevice(false);
      return;
    }

    if (initialPreview || isBotProcessingRef.current) {
      return;
    }

    let active = true;
    const runBotAction = async () => {
      const executionId = crypto.randomUUID();
      activeBotExecution.current = executionId;
      isBotProcessingRef.current = true;
      setIsBotProcessing(true);

      const botName = gameState?.players?.[activeBotIdx]?.name || "The bot";
      
      if (process.env.ENABLE_BOT_TELEMETRY !== "false") {
        console.log({
            TRACE:"BOT_TURN_START",
            turn: gameState?.turn,
            playerId: gameState?.players?.[activeBotIdx]?.id,
            playerName: botName,
            phase: gameState?.phase,
            isBot: true,
            lock: true
        });
      }
      
      const watchdogWarning = setTimeout(() => {
        if (activeBotExecution.current === executionId) {
          console.error({
            TRACE: "BOT_STUCK_WARNING",
            playerId: gameState?.players?.[activeBotIdx]?.id,
            phase: gameState?.phase
          });
        }
      }, 5000);

      const watchdogReset = setTimeout(() => {
        if (activeBotExecution.current === executionId) {
          console.error({
            TRACE: "BOT_DEADLOCK_RECOVERED",
            playerId: gameState?.players?.[activeBotIdx]?.id,
            phase: gameState?.phase
          });
          isBotProcessingRef.current = false;
          activeBotExecution.current = null;
          setIsBotProcessing(false);
        }
      }, 10000);

      let decision: any = null;
      try {
        const thinkingMessages = [
          `${botName} is evaluating investments...`,
          `${botName} is analyzing the market...`,
          `${botName} is planning the next move...`
        ];
        setBotThinkingMessage(thinkingMessages[Math.floor(Math.random() * thinkingMessages.length)]);

        // 300 - 700ms delay for human-like experience
        const delayMs = Math.floor(Math.random() * 401) + 300;
        await new Promise(r => setTimeout(r, delayMs));

        if (!active) {
          setBotThinkingMessage(null);
          return;
        }
        
        if (process.env.ENABLE_BOT_TELEMETRY !== "false") {
            console.log({
                TRACE:"BOT_ACTION_PHASE",
                playerId: gameState?.players?.[activeBotIdx]?.id,
                phase: gameState?.phase,
                statePhase: gameState?.phase
            });
        }
        
        console.log("Calling getBotDecision()");
        decision = getBotDecision(gameState, activeBotIdx);
        console.log("Bot action", decision);
        if (decision && decision.debug) {
          setBotDebug(decision.debug);
        }

        setBotThinkingMessage(null);

        console.log("Dispatching bot action", decision.type);

        const executeBotAction = async (decision: any, performAction: any, computedState: any) => {
            const executionId = `${computedState.currentPlayer}_${computedState.turn}_${decision.type}_${Date.now()}`;
            
            console.log({
                TRACE: "BOT_EXECUTION_BEGIN",
                executionId,
                playerId: gameState?.players?.[activeBotIdx]?.id,
                turn: computedState.turn,
                phase: computedState.phase,
                action: decision.type,
                payload: decision.payload
            });
            
            const latestState = gameStateRef.current;
            console.log({
                TRACE: "BOT_STATE_DRIFT",
                computedState,
                executedState: {
                    turn: latestState?.turn,
                    phase: latestState?.phase,
                    currentPlayer: latestState?.currentPlayerIndex
                }
            });

            console.log({
                TRACE: "BOT_PAYLOAD",
                action: decision.type,
                payload: decision.payload
            });

            let success = true;
            try {
                switch(decision.type) {
                    case "roll":
                        setRolling(true);
                        await new Promise(r => setTimeout(r, 800));
                        const dice = Math.floor(Math.random() * 6) + 1;
                        setLastDice(dice);
                        setRolling(false);
                        await new Promise(r => setTimeout(r, 1000));
                        
                        console.log({
                            TRACE: "BOT_ROLL",
                            playerId: gameState?.players?.[activeBotIdx]?.id,
                            botType: gameState?.players?.[activeBotIdx]?.botType,
                            phase: gameState?.phase,
                            turn: gameState?.turn
                        });

                        if (diceMode === "lottery") {
                            await performAction("lottery-resolve", { dice });
                            setDiceMode("move");
                            setOverlayMessage(null);
                        } else {
                            await performAction("roll", { dice });
                        }
                        break;
                    case "tile-action":
                    case "tax-raid":
                    case "hostile-takeover":
                    case "ipo":
                    case "pass":
                        const tilePayload = decision.payload || {};
                        if (pendingEmergencyAmount !== null) {
                            tilePayload.amount = pendingEmergencyAmount;
                        }
                        await performAction("tile-action", tilePayload);
                        break;
                    case "house-auction-bid":
                        const bidderId = gameState?.players?.[activeBotIdx]?.id;
                        if (bidderId) {
                            await performAction("bid", { amount: decision.payload?.amount, bidderId });
                        }
                        break;
                    case "rebalance":
                        await performAction("rebalance", decision.payload);
                        break;
                    case "audit":
                        await performAction("audit", decision.payload);
                        break;
                    case "trade-response":
                    case "accept-trade":
                    case "reject-trade":
                        await performAction("trade-response", decision.payload);
                        break;
                    case "create-trade":
                        await performAction("create-trade", decision.payload);
                        break;
                    case "end-turn":
                    case "skip":
                        await performAction("end-turn");
                        break;
                    default:
                        console.error({
                            TRACE: "BOT_ACTION_UNSUPPORTED",
                            action: decision.type,
                            payload: decision.payload
                        });
                        success = false;
                        break;
                }
            } catch(e) {
                success = false;
                throw e;
            } finally {
                console.log({
                    TRACE: "BOT_EXECUTION_END",
                    executionId,
                    success
                });
            }
        };

        const computedState = {
            turn: gameState.turn,
            phase: gameState.phase,
            currentPlayer: gameState.currentPlayerIndex
        };

        await executeBotAction(decision, performAction, computedState);
      } catch (err) {
        console.error("Bot action error:", err);
      } finally {
        clearTimeout(watchdogWarning);
        clearTimeout(watchdogReset);
        if (activeBotExecution.current === executionId) {
          isBotProcessingRef.current = false;
          activeBotExecution.current = null;
          setIsBotProcessing(false);
          if (decision && decision.type !== "end-turn" && decision.type !== "skip") {
            setBotActionTrigger(t => t + 1);
          }
          console.log("Bot action completed, isBotProcessing set to false");
        }
      }
    };

    runBotAction();

    return () => {
      active = false;
    };
  }, [
    isLocal,
    room,
    stableUserId,
    gameState?.phase,
    gameState?.currentPlayerIndex,
    gameState?.pendingTrade?.toPlayerId,
    currentBiddingPlayer?.id,
    initialPreview,
    showPassDevice,
    botActionTrigger,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  return {
    gameState,
    isSubmitting,
    isRecovering,
    isPendingVersion: pendingVersionRef.current !== null,
    room,
    loading,
    error,
    setError,
    connectionStatus,
    lastRoomUpdateTimestamp: lastUpdateTimestampRef.current,
    serializedGameStateSizeBytes: gameState ? JSON.stringify(gameState).length : 0,
    watchdogRefreshes,
    watchdogStale,
    pusherReconnectsCount,
    failedActionsCount,
    recentActionDurationMs,
    playerTelemetry,
    rolling,
    lastDice,
    diceMode,
    timeLeft,
    turnTimeLeft,
    overlayMessage,
    initialPreview,
    isLocal,
    isMyTurn,
    currentPlayer,
    currentBiddingPlayer,
    botDebug,
    botThinkingMessage,
    isBotProcessing,
    eligibleBiddersCount,
    allPlayersHaveHouses,
    isSetupPhase,
    isInitialSetup,
    myPlayer,
    myPrivateMessage,
    
    isEndingTurn,
    // Modals
    showTrade, setShowTrade,
    showAuction, setShowAuction,
    showRebalance, setShowRebalance,
    showLeadersDilemma, setShowLeadersDilemma,
    showTargetedAction, setShowTargetedAction,
    showChoiceModal, setShowChoiceModal,
    showPassDevice, setShowPassDevice,
    pendingEmergencyAmount,
    rebalancePenaltyOverride, setRebalancePenaltyOverride,

    // Handlers
    performAction,
    handleTileAction,
    handleRebalance,
    handleRoll,
    handleEndTurn,
  };
}

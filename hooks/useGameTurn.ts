import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { GameState, PlayerState } from "@/lib/db/schema";
import { TILES } from "@/lib/game-engine/tiles";
import { dispatch, applyWinCheck, resolveTimeout } from "@/lib/game-engine/dispatcher";
import { createInitialGameState } from "@/lib/game-engine/actions";
import { getBotDecision } from "@/lib/game-engine/bot";
import { getPusherClient, getRoomChannel, PUSHER_EVENTS } from "@/lib/pusher";

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
  const lastRoomUpdatedAtRef = useRef<number>(0);

  const setGameState = useCallback((s: GameState | null | undefined, source: string = "unknown", incomingUpdatedAt: number = 0) => {
    const pre = gameStateRef.current;

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
      const isOlderTimestamp = incomingUpdatedAt > 0 && lastRoomUpdatedAtRef.current > 0 && incomingUpdatedAt < lastRoomUpdatedAtRef.current;

      if (isLowerTurn || isOlderTimestamp) {
        console.warn(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: "STATE_REGRESSION",
          source: source,
          rejectedState: {
            phase: s.phase,
            turn: incomingTurn,
            year: incomingYear,
            updatedAt: incomingUpdatedAt > 0 ? new Date(incomingUpdatedAt).toISOString() : null
          },
          currentState: {
            phase: pre.phase,
            turn: currentTurn,
            year: currentYear,
            updatedAt: lastRoomUpdatedAtRef.current > 0 ? new Date(lastRoomUpdatedAtRef.current).toISOString() : null
          },
          reason: isLowerTurn ? "incoming state has a lower turn/year count" : "incoming state is older (updatedAt timestamp is older)"
        }, null, 2));
        
        // Reject the update!
        return;
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
    
    if (incomingUpdatedAt > 0) {
      lastRoomUpdatedAtRef.current = incomingUpdatedAt;
    }
  }, [isLocal, stableUserId]);

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
  const [showChoiceModal, setShowChoiceModal] = useState<"lottery" | "ipo" | "emergency" | null>(null);
  const [showPassDevice, setShowPassDevice] = useState(false);

  const [pendingEmergencyAmount, setPendingEmergencyAmount] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [rebalancePenaltyOverride, setRebalancePenaltyOverride] = useState<number | null>(null);
  const [overlayMessage, setOverlayMessage] = useState<string | null>(null);

  const [isBotProcessing, setIsBotProcessing] = useState(false);
  const [botDebug, setBotDebug] = useState<any | null>(null);
  const [initialPreview, setInitialPreview] = useState(true);
  const [isEndingTurn, setIsEndingTurn] = useState(false);
  const [portfolios, setPortfolios] = useState<Record<string, { cash: number, bonds: number, stocks: number }>>({});
  const [connectionStatus, setConnectionStatus] = useState<string>("connected");
  
  // Telemetry state counters
  const [pusherReconnectsCount, setPusherReconnectsCount] = useState<number>(0);
  const [watchdogRefreshes, setWatchdogRefreshes] = useState<number>(0);
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

  const fetchRoom = useCallback(async (source: string = "poll_fetch", showBlockingError: boolean = false) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second fetch timeout

    try {
      const res = await fetch(`/api/rooms?code=${code}&t=${Date.now()}`, { 
        cache: "no-store",
        signal: controller.signal
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(data?.error || "Failed to fetch room details");
      if (!data?.room) throw new Error("Room details not found");
      
      const newGameState = data.room.gameState;
      const preState = gameStateRef.current;
      const stateChanged = !preState || JSON.stringify(preState) !== JSON.stringify(newGameState);
      const incomingUpdatedAt = data?.room?.updatedAt ? new Date(data.room.updatedAt).getTime() : 0;

      // Log the fetch response
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

      setGameState(newGameState, source, incomingUpdatedAt);
      setRoom(data.room);
      roomIdRef.current = data.room.id;
      setLoading(false);

      if (stateChanged) {
        logStateTransition(source, source === "initial_fetch" ? "init" : `fetch_${Date.now()}`, preState, newGameState, data.room.status, data.room.playerIds.length);
      }

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
      fetchRoom("initial_fetch", true); // show blocking error on initial fetch
    }
  }, [code, isLocal, fetchRoom, gameState, searchParams, setError, setGameState]);

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
        
        // When Pusher notifies us of an update, fetch the fresh state immediately.
        // This avoids Pusher's 10KB message limit which was breaking the game mid-way!
        const createPusherHandler = (eventName: string) => {
          return () => {
            console.log(JSON.stringify({
              timestamp: new Date().toISOString(),
              event: "PUSHER_EVENT_RECEIVED",
              eventName,
              roomCode: code,
              fetchTriggered: true
            }, null, 2));
            fetchRoom("pusher_update_fetch", false);
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

    // Fail-safe Hybrid Polling: always poll the server every 1.5 seconds as a fallback.
    // This ensures that turns and transitions synchronize seamlessly even if Pusher disconnects.
    // Uses a recursive setTimeout to prevent requests from stacking and stalling the browser.
    let isSubscribed = true;
    let pollTimer: NodeJS.Timeout;

    const poll = async () => {
      if (!isSubscribed) return;
      try {
        if (!gameStateRef.current || gameStateRef.current.phase !== "finished") {
          await fetchRoom("poll_fetch", false); // background poll (silent)
        }
      } catch (e) {
        // Safe to ignore: error logged in fetchRoom, continue scheduling next poll
      } finally {
        if (isSubscribed) {
          pollTimer = setTimeout(poll, 1500);
        }
      }
    };
    pollTimer = setTimeout(poll, 1500);

    // When the browser tab becomes active again, fetch immediately.
    // This fixes the issue where Chrome throttles setTimeout in inactive tabs after 5 minutes!
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isSubscribed) {
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
      clearTimeout(pollTimer);
    };
  }, [code, isLocal, fetchRoom]);

  // 15-second Stale Watchdog Timer
  useEffect(() => {
    if (isLocal || !gameState || gameState.phase === "finished") return;

    const interval = setInterval(() => {
      const timeSinceUpdate = Date.now() - lastUpdateTimestampRef.current;
      if (timeSinceUpdate > 15000) {
        setWatchdogStale(true);
        console.warn(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: "WATCHDOG_STALE_DETECTED",
          roomId: roomIdRef.current,
          playerId: stableUserId,
          timeSinceLastUpdateMs: timeSinceUpdate,
          watchdogRefreshesCount: watchdogRefreshes + 1,
          message: "No updates received for >15 seconds. Triggering stale refresh recovery."
        }));

        setWatchdogRefreshes(prev => prev + 1);
        
        fetchRoom("watchdog_fetch", false)
          .then(() => {
            setWatchdogStale(false);
            console.log(JSON.stringify({
              timestamp: new Date().toISOString(),
              event: "WATCHDOG_RECOVERY_SUCCESS",
              roomId: roomIdRef.current,
              playerId: stableUserId,
              watchdogRefreshesCount: watchdogRefreshes + 1,
              message: "Watchdog successfully recovered room state"
            }));
          })
          .catch((err) => {
            console.error(JSON.stringify({
              timestamp: new Date().toISOString(),
              event: "WATCHDOG_RECOVERY_FAILURE",
              roomId: roomIdRef.current,
              playerId: stableUserId,
              watchdogRefreshesCount: watchdogRefreshes + 1,
              error: err?.message || err,
              message: "Watchdog recovery refresh failed"
            }));
          });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isLocal, gameState, fetchRoom, stableUserId, watchdogRefreshes]);

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

  // Action Dispatcher
  const performAction = useCallback(async (action: string, payload?: any) => {
    const handleSideEffect = (fx: any, stateToSet: GameState) => {
      if (fx.type === "show-modal") {
        const m = fx.modal;
        if (m === "ipo" || m === "lottery") setShowChoiceModal(m);
        else if (m === "emergency") {
          setPendingEmergencyAmount(fx.emergencyAmount);
          setShowChoiceModal("emergency");
        }
        else if (m === "tax-raid") setShowTargetedAction("tax-raid");
        else if (m === "hostile-takeover") setShowTargetedAction("hostile-takeover");
        else if (m === "audit") setShowTargetedAction("audit");
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
        alert(fx.message);
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
          body: JSON.stringify({ action, payload, actionId }),
          headers: { "Content-Type": "application/json" },
          signal: actionController.signal
        });
        const actionText = await actionRes.text();
        const data = actionText ? JSON.parse(actionText) : null;
        if (!actionRes.ok || !data) throw new Error(data?.error || "Failed to perform action");
        
        const preState = gameStateRef.current;
        setGameState(data.gameState, `action_${action}`, Date.now());
        if (data.dice) setLastDice(data.dice);
        
        if (data.sideEffect) {
          handleSideEffect(data.sideEffect, data.gameState);
        } else if (data.needsRebalance) {
          setRebalancePenaltyOverride(5 + (data.gameState.phase !== "year-end" ? 3 : 0));
          setShowRebalance(true);
        } else {
          if (action === "tile-action") {
            setPendingEmergencyAmount(null);
          }
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
    }
  }, [code, gameState, isLocal, stableUserId, setGameState]);

  // Turn Timer
  const timeoutStateRef = useRef({
    showChoiceModal, showAuction, showTargetedAction, pendingEmergencyAmount,
    isLocal, currentBiddingPlayerId: currentBiddingPlayer?.id, userId: stableUserId
  });

  const lastPhaseRef = useRef<string | null>(null);
  const lastPlayerIdxRef = useRef<number | null>(null);

  useEffect(() => {
    timeoutStateRef.current = {
      showChoiceModal, showAuction, showTargetedAction, pendingEmergencyAmount,
      isLocal, currentBiddingPlayerId: currentBiddingPlayer?.id, userId: stableUserId
    };
  }, [showChoiceModal, showAuction, showTargetedAction, pendingEmergencyAmount, isLocal, currentBiddingPlayer, stableUserId]);

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
      }
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [gameState?.phase, gameState?.currentPlayerIndex, timeLeft, performAction]);

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
      return;
    }

    // If an AI bot is active, immediately dismiss any pass-device screens to keep automation fluid
    if (showPassDevice) {
      setShowPassDevice(false);
      return;
    }

    if (initialPreview || isBotProcessing) {
      return;
    }

    let active = true;
    const runBotAction = async () => {
      setIsBotProcessing(true);

      const decision = getBotDecision(gameState, activeBotIdx);
      if (decision && decision.debug) {
        setBotDebug(decision.debug);
      }

      await new Promise(r => setTimeout(r, 1500));
      if (!active) {
        return;
      }

      try {
        if (decision.type === "roll") {
          setRolling(true);
          await new Promise(r => setTimeout(r, 800));
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
            if (result?.state?.phase !== "year-end" && result?.gameState?.phase !== "year-end") {
              const pendingEmergency = result?.state?.pendingEmergencyAmount ?? null;
              const payload: any = {};
              if (pendingEmergency !== null) {
                payload.amount = pendingEmergency;
              }
              await performAction("tile-action", payload);
            }
          }
        } else if (decision.type === "tile-action") {
          const payload = decision.payload || {};
          if (pendingEmergencyAmount !== null) {
            payload.amount = pendingEmergencyAmount;
          }
          await performAction("tile-action", payload);
        } else if (decision.type === "house-auction-bid") {
          const bidderId = gameState?.players?.[activeBotIdx]?.id;
          if (bidderId) {
            await performAction("bid", { amount: decision.payload?.amount, bidderId });
          }
        } else if (decision.type === "rebalance") {
          const isSetup = gameState?.year === 1 && gameState?.phase === "year-end" && (gameState?.turn ?? 0) < (gameState?.players?.length ?? 0);
          const wasYearEnd = gameState.phase === "year-end";

          const result = await performAction("rebalance", decision.payload);
          if (wasYearEnd && !isSetup) {
            const nextState = result?.state || result?.gameState;
            const pendingEmergency = nextState?.pendingEmergencyAmount ?? null;
            const payload: any = {};
            if (pendingEmergency !== null) {
              payload.amount = pendingEmergency;
            }
            await performAction("tile-action", payload);
          }
        } else if (decision.type === "audit") {
          await performAction("audit", decision.payload);
        } else if (decision.type === "trade-response") {
          await performAction("trade-response", decision.payload);
        } else if (decision.type === "end-turn") {
          await performAction("end-turn");
        }
      } catch (err) {
        console.error("Bot action error:", err);
      } finally {
        if (active) {
          setIsBotProcessing(false);
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
    isBotProcessing,
  ]);

  return {
    gameState,
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
    overlayMessage,
    initialPreview,
    isLocal,
    isMyTurn,
    currentPlayer,
    currentBiddingPlayer,
    botDebug,
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

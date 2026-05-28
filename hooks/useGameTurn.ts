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

export function useGameTurn({ code, isLocal, userId }: UseGameTurnProps) {
  const searchParams = useSearchParams();

  const [gameState, _setGameState] = useState<GameState | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const setGameState = useCallback((s: GameState | null) => {
    _setGameState(s);
    gameStateRef.current = s;
  }, []);

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
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const currentBiddingPlayer = useMemo(() => {
    if (!gameState || gameState.phase !== "auction") return null;
    return gameState.players.find(p => !p.hasHouse && !gameState.auctionState?.bids.find(b => b.playerId === p.id));
  }, [gameState]);

  const eligibleBiddersCount = useMemo(() => {
    if (!gameState) return 0;
    return gameState.players.filter(p => !p.hasHouse).length;
  }, [gameState]);

  // Derived properties
  const currentPlayer = gameState?.players[gameState.currentPlayerIndex];
  const isMyTurn = !!(isLocal || (gameState?.phase === "auction" ? !!currentBiddingPlayer : (gameState && currentPlayer?.id === userId)));
  const allPlayersHaveHouses = gameState?.players.every(p => p.hasHouse) ?? false;
  const isSetupPhase = gameState?.year === 1 && gameState?.phase === "year-end" && (gameState?.turn ?? 0) < (gameState?.players.length ?? 0);
  const isInitialSetup = isSetupPhase && !initialPreview;
  
  const myPlayer = isLocal ? currentPlayer : gameState?.players.find(p => p.id === userId);
  const myPrivateMessage = myPlayer?.privateMessage || (isMyTurn ? gameState?.privateMessage : undefined);

  // Initial preview timer
  useEffect(() => {
    const timer = setTimeout(() => setInitialPreview(false), 2000);
    return () => clearTimeout(timer);
  }, []);

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
      fetchRoom(true); // show blocking error on initial fetch
    }
  }, [code, isLocal]);

  async function fetchRoom(showBlockingError: boolean = false) {
    try {
      const res = await fetch(`/api/rooms?code=${code}`, { cache: "no-store" });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(data?.error || "Failed to fetch room details");
      if (!data?.room) throw new Error("Room details not found");
      setGameState(data.room.gameState);
      setRoom(data.room);
      setLoading(false);
    } catch (e: any) {
      console.warn("[fetchRoom Warning] Failed to poll room:", e.message);
      if (showBlockingError) {
        setError(e.message);
      }
      setLoading(false);
    }
  }

  // Pusher / Online Sync with Polling Fallback
  useEffect(() => {
    if (isLocal || !code) return;

    const pusher = getPusherClient();
    if (pusher) {
      const channel = pusher.subscribe(getRoomChannel(code));
      channel.bind(PUSHER_EVENTS.GAME_STATE_UPDATE, (data: { gameState: GameState }) => setGameState(data.gameState));
      channel.bind(PUSHER_EVENTS.GAME_STARTED, (data: { gameState: GameState }) => setGameState(data.gameState));
      channel.bind(PUSHER_EVENTS.GAME_FINISHED, (data: { gameState: GameState }) => setGameState(data.gameState));

      return () => {
        pusher.unsubscribe(getRoomChannel(code));
      };
    } else {
      // Fallback: Poll server every 2 seconds when Pusher is not configured
      const interval = setInterval(() => {
        if (!gameState || gameState.phase !== "finished") {
          fetchRoom(false); // do not show blocking error on background polls
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [code, isLocal, gameState?.phase, setGameState]);

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
        const nextBiddingPlayer = stateToSet?.players.find(p => !p.hasHouse && !stateToSet.auctionState?.bids.find(b => b.playerId === p.id));
        const nextTradeResponder = stateToSet?.phase === "waiting-trade"
          ? stateToSet?.players.find(p => p.id === stateToSet?.pendingTrade?.toPlayerId)
          : undefined;
        const nextActivePlayer = stateToSet?.players[stateToSet.currentPlayerIndex];
        const nextIsBot = nextBiddingPlayer?.isBot || nextTradeResponder?.isBot || (stateToSet?.phase !== "auction" && stateToSet?.phase !== "waiting-trade" && nextActivePlayer?.isBot);

        if (nextIsBot) {
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
        const result = dispatch(gameStateRef.current, action, payload);

        if (result.dice !== undefined) setLastDice(result.dice);

        if (result.sideEffect) {
          if (handleSideEffect(result.sideEffect, result.state)) {
            return result;
          }
        }

        const finalState = applyWinCheck(result.state);
        if (finalState.currentPlayerIndex !== (gameStateRef.current?.currentPlayerIndex ?? -1)) {
          setPendingEmergencyAmount(null);
          const nextPlayer = finalState.players[finalState.currentPlayerIndex];
          if (nextPlayer && !nextPlayer.isBot) {
            setShowPassDevice(true);
          } else {
            setShowPassDevice(false);
          }
        }
        setGameState(finalState);
        return result;
      }
      return null;
    }

    // Online Mode Dispatch
    try {
      const roomRes = await fetch(`/api/rooms?code=${code}`, { cache: "no-store" });
      const roomText = await roomRes.text();
      const roomData = roomText ? JSON.parse(roomText) : null;
      if (!roomRes.ok || !roomData) throw new Error(roomData?.error || "Failed to fetch room details");
      const roomId = roomData.room.id;

      const actionRes = await fetch(`/api/rooms/${roomId}/action`, {
        method: "POST",
        body: JSON.stringify({ action, payload }),
        headers: { "Content-Type": "application/json" },
      });
      const actionText = await actionRes.text();
      const data = actionText ? JSON.parse(actionText) : null;
      if (!actionRes.ok || !data) throw new Error(data?.error || "Failed to perform action");
      
      setGameState(data.gameState);
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
      return data;
    } catch (e: any) {
      setError(e.message);
    }
  }, [code, gameState, isLocal, userId, setGameState]);

  // Turn Timer
  const timeoutStateRef = useRef({
    showChoiceModal, showAuction, showTargetedAction, pendingEmergencyAmount,
    isLocal, currentBiddingPlayerId: currentBiddingPlayer?.id, userId
  });

  const lastPhaseRef = useRef<string | null>(null);
  const lastPlayerIdxRef = useRef<number | null>(null);

  useEffect(() => {
    timeoutStateRef.current = {
      showChoiceModal, showAuction, showTargetedAction, pendingEmergencyAmount,
      isLocal, currentBiddingPlayerId: currentBiddingPlayer?.id, userId
    };
  }, [showChoiceModal, showAuction, showTargetedAction, pendingEmergencyAmount, isLocal, currentBiddingPlayer, userId]);

  useEffect(() => {
    if (!gameState || gameState.endgame || gameState.phase === "finished") return;

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
    if (isLocal) myIdx = gameState.currentPlayerIndex;
    else if (userId) myIdx = gameState.players.findIndex(p => p.id === userId);
    
    if (myIdx === -1) return;
    const myP = gameState.players[myIdx];
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
  }, [gameState?.players, gameState?.currentPlayerIndex, isLocal, userId]);

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
          const nextPlayer = nextState.players[nextState.currentPlayerIndex];
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
    if (!isLocal || !gameState || gameState.phase === "finished") {
      return;
    }

    let activeBotIdx = -1;
    if (gameState.phase === "auction") {
      if (currentBiddingPlayer?.isBot) {
        activeBotIdx = gameState.players.findIndex(p => p.id === currentBiddingPlayer.id);
      }
    } else if (gameState.phase === "waiting-trade") {
      const responder = gameState.players.find(p => p.id === gameState.pendingTrade?.toPlayerId);
      if (responder?.isBot) {
        activeBotIdx = gameState.players.findIndex(p => p.id === responder.id);
      }
    } else {
      const activePlayer = gameState.players[gameState.currentPlayerIndex];
      if (activePlayer?.isBot) {
        activeBotIdx = gameState.currentPlayerIndex;
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
          const bidderId = gameState.players[activeBotIdx].id;
          await performAction("bid", { amount: decision.payload?.amount, bidderId });
        } else if (decision.type === "rebalance") {
          const isSetup = gameState.year === 1 && gameState.phase === "year-end" && (gameState.turn ?? 0) < gameState.players.length;
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

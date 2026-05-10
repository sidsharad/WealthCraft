"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { getPusherClient, getRoomChannel, PUSHER_EVENTS } from "@/lib/pusher";
import { TILES, TILE_COUNT, HOUSE_MARKET_PRICE, HOUSE_AUCTION_MIN } from "@/lib/game-engine/tiles";
import { GameState, PlayerState, LogEntry } from "@/lib/db/schema";
import { netWorth } from "@/lib/game-engine/validators";
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
import { 
  createInitialGameState,
  rollDice,
  processDiceRoll,
  collectIncome,
  applyBonus,
  applyStockRally,
  applyStockCrash,
  applyMarketCrash,
  applyMarketRally,
  applyIPO,
  applyIncomeFreezeToPlayer,
  applyEmergency,
  deductLotteryFee,
  applyLotteryReward,
  applyTaxRaid,
  applyHostileTakeover,
  resolveTrade,
  calculateYearEndReturns,
  applyYearEndRebalance,
  resolveHouseAuction,
  processWealthDeclaration,
  processAudit,
  processConcentrationAudit,
  checkWinCondition,
  advanceTurn,
  addLog,
} from "@/lib/game-engine/actions";
import { getTileByPosition } from "@/lib/game-engine/tiles";
import { Trophy, Home, Settings, LogOut, MessageSquare, ShieldAlert } from "lucide-react";
import { getBotDecision, BotAction } from "@/lib/game-engine/bot";

const PLAYER_COLORS = ["#3B82F6", "#F97316", "#A855F7", "#EC4899"];

export default function GameRoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const router = useRouter();
  const code = params.code as string;
  const isLocal = code === "play-local";

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rolling, setRolling] = useState(false);
  const [lastDice, setLastDice] = useState<number | null>(null);
  const [error, setError] = useState("");

  const userId = (session?.user as { id?: string })?.id;

  const currentBiddingPlayer = useMemo(() => {
    if (!gameState || gameState.phase !== "auction") return null;
    return gameState.players.find(p => !p.hasHouse && !gameState.auctionState?.bids.find(b => b.playerId === p.id));
  }, [gameState]);

  const eligibleBiddersCount = useMemo(() => {
    if (!gameState) return 0;
    return gameState.players.filter(p => !p.hasHouse).length;
  }, [gameState]);
  const [showTrade, setShowTrade] = useState(false);
  const [showAuction, setShowAuction] = useState(false);
  const [showRebalance, setShowRebalance] = useState(false);
  const [showLeadersDilemma, setShowLeadersDilemma] = useState(false);
  const [showTargetedAction, setShowTargetedAction] = useState<"tax-raid" | "hostile-takeover" | "concentration-audit" | null>(null);
  const [showChoiceModal, setShowChoiceModal] = useState<"lottery" | "ipo" | "emergency" | null>(null);
  const [showPassDevice, setShowPassDevice] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [rebalancePenaltyOverride, setRebalancePenaltyOverride] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Turn Timer Logic
  useEffect(() => {
    if (!gameState || gameState.endgame || gameState.phase === "finished") return;

    // Start timer when phase changes to something active (not roll, not year-end)
    const needsTimer = ["action", "auction", "trade", "waiting-trade"].includes(gameState.phase);
    
    if (needsTimer && timeLeft === null) {
      setTimeLeft(60);
    } else if (!needsTimer) {
      if (timeLeft !== null) setTimeLeft(null);
    }

    if (timeLeft !== null && timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    } else if (timeLeft === 0) {
      handleEndTurn();
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [gameState?.phase, gameState?.currentPlayerIndex, timeLeft]);

  const [isBotProcessing, setIsBotProcessing] = useState(false);
  const [overlayMessage, setOverlayMessage] = useState<string | null>(null);
  const [diceMode, setDiceMode] = useState<"move" | "lottery">("move");

  const allPlayersHaveHouses = gameState?.players.every(p => p.hasHouse) ?? false;

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

    if (!allPlayersHaveHouses) {
      base.push("House Auctions are the cheapest way to get a home. Try to keep 10-15L cash ready!");
      base.push("🏠 Need cash for a House Auction? Propose a trade! It's faster and cheaper than selling assets back to the bank.");
      base.push("🏘️ MANDATORY PURCHASE: Keep enough cash for your mandatory house purchase at the end of Year 3!");
    }

    return base;
  }, [allPlayersHaveHouses]);
  const [activeTipIndex, setActiveTipIndex] = useState(0);

  const [turnStartPortfolio, setTurnStartPortfolio] = useState<PlayerState | null>(null);
  const [isEndingTurn, setIsEndingTurn] = useState(false);

  const generatePortfolioDiff = (oldP: PlayerState, newP: PlayerState) => {
    const diffs = [];
    if (newP.cash !== oldP.cash) diffs.push(`${newP.cash > oldP.cash ? '➕' : '➖'} Cash: ${Math.abs(newP.cash - oldP.cash)}L`);
    if (newP.bonds !== oldP.bonds) diffs.push(`${newP.bonds > oldP.bonds ? '➕' : '➖'} Bonds: ${Math.abs(newP.bonds - oldP.bonds)}L`);
    if (newP.stocks !== oldP.stocks) diffs.push(`${newP.stocks > oldP.stocks ? '➕' : '➖'} Stocks: ${Math.abs(newP.stocks - oldP.stocks)}L`);
    if (newP.hasHouse && !oldP.hasHouse) diffs.push("🏠 Acquired House");
    return diffs.join("\n");
  };

  useEffect(() => {
    if (gameState && currentPlayer) {
      console.log(`[Turn Start] Capturing portfolio for ${currentPlayer.name}`);
      setTurnStartPortfolio(JSON.parse(JSON.stringify(currentPlayer)));
    }
  }, [gameState?.currentPlayerIndex]);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 10000); // Change tip every 10 seconds
    return () => clearInterval(interval);
  }, [TIPS.length]);


  const isMyTurn = !!(isLocal || (gameState?.phase === "auction" ? !!currentBiddingPlayer : (gameState && gameState.players[gameState.currentPlayerIndex].id === userId)));
  const currentPlayer = gameState?.players[gameState.currentPlayerIndex];
  
  // ─── INITIAL LOAD ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isLocal) {
      const playersJson = searchParams.get("players");
      const botsJson = searchParams.get("bots");
      if (playersJson && !gameState) {
        try {
          const playerNames = JSON.parse(playersJson);
          const botNames = botsJson ? JSON.parse(botsJson) : [];
          initLocalGame(playerNames, botNames);
        } catch (e) {
          setError("Failed to initialize local game. Check URL parameters.");
        }
      }
      setLoading(false);
    } else {
      fetchRoom();
    }
  }, [code, isLocal]);

  async function fetchRoom() {
    try {
      const res = await fetch(`/api/rooms?code=${code}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGameState(data.room.gameState);
      setRoom(data.room);
      setLoading(false);
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  }

  function initLocalGame(names: string[], bots: string[]) {
    const allPlayers = [
      ...names.map((name, i) => ({
        id: `player_${i}`,
        name,
        avatar: "",
        isBot: false,
      })),
      ...bots.map((name, i) => ({
        id: `bot_${i}`,
        name,
        avatar: "",
        isBot: true,
      })),
    ];

    const initialState = createInitialGameState(allPlayers);
    setGameState(initialState);
  }

  const [portfolios, setPortfolios] = useState<Record<string, { cash: number, bonds: number, stocks: number }>>({});

  // Auto-clear overlay message
  useEffect(() => {
    if (overlayMessage) {
      const timer = setTimeout(() => setOverlayMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [overlayMessage]);

  useEffect(() => {
    if (isLocal || !code) return;

    const pusher = getPusherClient();
    if (!pusher) return; // Pusher not configured — online mode unavailable

    const channel = pusher.subscribe(getRoomChannel(code));

    channel.bind(PUSHER_EVENTS.GAME_STATE_UPDATE, (data: { gameState: GameState }) => {
      setGameState(data.gameState);
    });

    channel.bind(PUSHER_EVENTS.GAME_STARTED, (data: { gameState: GameState }) => {
      setGameState(data.gameState);
    });

    channel.bind(PUSHER_EVENTS.GAME_FINISHED, (data: { gameState: GameState, leaderboard: any }) => {
      setGameState(data.gameState);
    });

    return () => {
      pusher.unsubscribe(getRoomChannel(code));
    };
  }, [code, isLocal]);


  // ─── GAME ACTIONS ─────────────────────────────────────────────────────────────

  const performAction = useCallback(async (action: string, payload?: any) => {
    if (isLocal) {
      if (action === "start" && !gameState) {
        const playersJson = searchParams.get("players");
        const playerNames = playersJson ? JSON.parse(playersJson) : ["Player 1", "Player 2"];
        const botsJson = searchParams.get("bots");
        const botNames = botsJson ? JSON.parse(botsJson) : [];
        initLocalGame(playerNames, botNames);
        return;
      }

      if (gameState) {
        let state = { ...gameState };
        const playerIdx = state.currentPlayerIndex;
        const player = state.players[playerIdx];

        switch (action) {
          case "roll":
            const diceValue = rollDice();
            const result = processDiceRoll(state, playerIdx, diceValue);
            state = result.state;
            setLastDice(result.dice);

            const tile = getTileByPosition(result.newPosition);
            if (tile.effect === "income-freeze") {
              state = applyIncomeFreezeToPlayer(state, playerIdx);
            } else {
              state = collectIncome(state, playerIdx);
            }

            if (result.passedStart) {
              state = calculateYearEndReturns(state, playerIdx);
              state = { ...state, phase: "year-end" };
            } else {
              state = { ...state, phase: "action" };
            }
            break;
            
          case "lottery-resolve":
            state = applyLotteryReward(state, playerIdx, payload.dice || (Math.floor(Math.random() * 6) + 1));
            state = { ...state, phase: "trade" };
            break;

          case "tile-action":
            const currentTile = getTileByPosition(player.position);
            switch (currentTile.effect) {
              case "bonus": state = applyBonus(state, playerIdx); break;
              case "stock-rally": state = applyStockRally(state, playerIdx); break;
              case "stock-crash": state = applyStockCrash(state, playerIdx); break;
              case "market-crash": state = applyMarketCrash(state, playerIdx); break;
              case "market-rally": state = applyMarketRally(state, playerIdx); break;
              case "ipo": 
                if (!payload) {
                  setShowChoiceModal("ipo");
                  return;
                }
                if (player.cash < payload.amount) {
                  alert(`Insufficient cash for IPO. You must rebalance first (3L penalty applies).`);
                  setShowRebalance(true);
                  return;
                }
                state = applyIPO(state, playerIdx, payload.amount); 
                break;
              case "emergency": 
                if (!payload) {
                  setShowChoiceModal("emergency");
                  return;
                }
                if (player.cash < payload.amount) {
                  alert(`Insufficient cash for Emergency. You must rebalance first (3L penalty applies).`);
                  setShowRebalance(true);
                  return;
                }
                state = applyEmergency(state, playerIdx, payload.amount); 
                break;
              case "lottery": 
                if (!payload) {
                  setShowChoiceModal("lottery");
                  return;
                }
                if (payload.play) {
                  state = deductLotteryFee(state, playerIdx);
                  setDiceMode("lottery");
                  setShowChoiceModal(null);
                  setOverlayMessage("🎰 ROLL FOR YOUR LOTTERY PRIZE!");
                } else {
                  state = { ...state, phase: "trade" };
                }
                break;
                break;
              case "tax-raid": 
                if (!payload) {
                  setShowTargetedAction("tax-raid");
                  return;
                }
                const targetIdx = typeof payload.targetIdx === 'string' ? parseInt(payload.targetIdx) : payload.targetIdx;
                if (payload.skip) {
                  state = addLog(state, `${player.name} chose to take no action.`);
                } else {
                  const tr = applyTaxRaid(state, playerIdx, targetIdx);
                  if (tr.valid) {
                    state = tr.state;
                  } else {
                    alert(tr.error);
                    return;
                  }
                }
                break;
              case "hostile-takeover": 
                if (!payload) {
                  setShowTargetedAction("hostile-takeover");
                  return;
                }
                const htTargetIdx = typeof payload.targetIdx === 'string' ? parseInt(payload.targetIdx) : payload.targetIdx;
                if (payload.skip) {
                  state = addLog(state, `${player.name} chose to take no action.`);
                } else {
                  const ht = applyHostileTakeover(state, playerIdx, htTargetIdx, payload.demandType);
                  if (ht.valid) {
                    state = ht.state;
                  } else {
                    alert(ht.error);
                    return;
                  }
                }
                break;
              case "house-auction": 
                const eligibleCount = state.players.filter(p => !p.hasHouse).length;
                if (eligibleCount > 0) {
                  state = { ...state, phase: "auction", auctionState: { bids: [], open: true, timerStart: Date.now() } };
                  setShowAuction(true);
                } else {
                  state = { ...state, phase: "trade", announcement: "🏠 NO AUCTION: All players already own houses." };
                }
                break;
            }
            if (state.phase !== "auction") state = { ...state, phase: "trade" };
            break;

          case "bid":
            if (state.auctionState?.open) {
              const bidderId = payload.bidderId || player.id;
              const existingBids = state.auctionState.bids.filter(b => b.playerId !== bidderId);
              state = {
                ...state,
                auctionState: {
                  ...state.auctionState,
                  bids: [...existingBids, { playerId: bidderId, amount: payload.amount }]
                }
              };
              if (state.auctionState?.bids && state.auctionState.bids.length >= eligibleBiddersCount) {
                const res = resolveHouseAuction(state);
                state = res.state;
              } else if (isLocal) {
                setShowPassDevice(true);
              }
            }
            break;

          case "rebalance":
            const reb = applyYearEndRebalance(state, playerIdx, payload.newCash, payload.newBonds, payload.newStocks, payload.penalty || 0);
            if (reb.valid) {
              const isMidYear = state.phase !== "year-end";
              const nextPhase = isMidYear ? "action" : (state.turn < state.players.length ? "roll" : "trade");
              state = { ...reb.state, phase: nextPhase };
            } else {
              alert(`Rebalance failed: ${reb.error}`);
            }
            break;

          case "trade-offer":
            state = {
              ...state,
              phase: "waiting-trade",
              pendingTrade: {
                fromPlayerId: player.id,
                toPlayerId: payload.toPlayerId,
                offer: payload.offer,
                request: payload.request
              }
            };
            if (isLocal) setShowPassDevice(true);
            break;
          case "trade-response":
            state = resolveTrade(state, payload.accept);
            break;
          case "end-turn":
            state = advanceTurn(state);
            break;
          case "concentration-audit":
            const caTargetIdx = typeof payload.targetIdx === 'string' ? parseInt(payload.targetIdx) : payload.targetIdx;
            const ca = processConcentrationAudit(state, playerIdx, caTargetIdx);
            if (ca.valid) {
              state = ca.state;
              if (ca.needsRebalance) {
                setRebalancePenaltyOverride(5 + (state.phase !== "year-end" ? 3 : 0));
                setShowRebalance(true);
              }
            } else {
              alert(ca.error);
              return;
            }
            break;
        }

        const win = checkWinCondition(state);
        if (win.triggered && !state.endgame) {
          state = { ...state, endgame: true };
          const msg = `🚨 FINAL ROUND! A player has reached 100L. Everyone gets one last turn!`;
          state = addLog(state, msg);
          state = { ...state, announcement: msg };
        }

        if (state.currentPlayerIndex !== gameState.currentPlayerIndex) {
          setShowPassDevice(true);
        } 
        setGameState(state);
      }
      return;
    }

    try {
      const roomRes = await fetch(`/api/rooms?code=${code}`);
      const roomData = await roomRes.json();
      if (!roomRes.ok) throw new Error(roomData.error);
      const roomId = roomData.room.id;

      const actionRes = await fetch(`/api/rooms/${roomId}/action`, {
        method: "POST",
        body: JSON.stringify({ action, payload }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await actionRes.json();
      if (!actionRes.ok) throw new Error(data.error);
      setGameState(data.gameState);
      if (data.dice) setLastDice(data.dice);
      
      if (data.needsRebalance) {
        setRebalancePenaltyOverride(5 + (data.gameState.phase !== "year-end" ? 3 : 0));
        setShowRebalance(true);
      }
    } catch (e: any) {
      setError(e.message);
    }
  }, [code, gameState, isLocal, userId, isBotProcessing, currentBiddingPlayer]);

  // Effect to show portfolio changes to the specific player
  useEffect(() => {
    if (!gameState) return;
    
    // Find "my" player index
    let myIdx = -1;
    if (isLocal) {
      myIdx = gameState.currentPlayerIndex;
    } else if (userId) {
      myIdx = gameState.players.findIndex(p => p.id === userId);
    }
    
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
    
    // Update the portfolio map for all players in gameState to stay in sync
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

  const handleRebalance = useCallback((newCash: number, newBonds: number, newStocks: number) => {
    // Check if it's a mid-year rebalance (penalty applies)
    const isMidYear = gameState?.phase !== "year-end";
    const payload: any = { newCash, newBonds, newStocks };
    if (isMidYear) {
      payload.penalty = 3; // REBALANCE_PENALTY
    }
    performAction("rebalance", payload);
  }, [performAction, gameState?.phase]);

  const handleRoll = async () => {
    setRolling(true);
    setTimeout(async () => {
      if (diceMode === "lottery") {
        const dice = Math.floor(Math.random() * 6) + 1;
        setLastDice(dice);
        await performAction("lottery-resolve", { dice });
        setDiceMode("move");
      } else {
        await performAction("roll");
      }
      setRolling(false);
    }, 1200); // Increased to match 3D transition length
  };

  const handleTileAction = async (payload?: any) => {
    // For online mode, we need to show the modal locally before sending the action to the server
    if (!payload && currentPlayer && !isLocal) {
      const tile = getTileByPosition(currentPlayer.position);
      if (["ipo", "lottery", "emergency"].includes(tile.effect)) {
        setShowChoiceModal(tile.effect as any);
        return;
      }
      if (["tax-raid", "hostile-takeover"].includes(tile.effect)) {
        setShowTargetedAction(tile.effect as any);
        return;
      }
    }
    await performAction("tile-action", payload);
  };

  const handleEndTurn = async () => {
    if (isEndingTurn) return;
    setIsEndingTurn(true);

    await performAction("end-turn");
    if (isLocal) setShowPassDevice(true);
    setIsEndingTurn(false);
  };

  // ─── BOT LOGIC ────────────────────────────────────────────────────────────────

  /* Bot logic disabled for manual mode
  useEffect(() => {
    if (gameState && currentPlayer?.isBot && gameState.phase !== "finished" && !isBotProcessing) {
      const decision = getBotDecision(gameState, gameState.currentPlayerIndex);
      if (decision.type !== "skip") {
        processBotAction(decision);
      } else if (gameState.phase === "roll") {
        setTimeout(handleRoll, 1500);
      } else if (gameState.phase === "action") {
        setTimeout(() => handleTileAction(), 1500);
      } else if (gameState.phase === "trade") {
        setTimeout(handleEndTurn, 1500);
      }
    }
  }, [gameState, currentPlayer, isBotProcessing]);
  */

  async function processBotAction(decision: BotAction) {
    setIsBotProcessing(true);
    setTimeout(async () => {
      await performAction(decision.type, decision.payload);
      setIsBotProcessing(false);
    }, 1500);
  }

  // ─── RENDERING ───────────────────────────────────────────────────────────────

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[var(--cream)]">
    <div className="animate-spin text-4xl">💰</div>
  </div>;

  if (error) return <div className="min-h-screen flex items-center justify-center bg-red-50 p-6">
    <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-sm">
      <div className="text-red-500 text-5xl mb-4">⚠️</div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">Error</h2>
      <p className="text-gray-500 text-sm mb-6">{error}</p>
      <button onClick={() => router.push("/lobby")} className="btn-primary w-full">Back to Lobby</button>
    </div>
  </div>;

  if (!gameState) return <div className="min-h-screen flex items-center justify-center bg-[var(--cream)] p-6">
    <div className="bg-white p-10 rounded-3xl shadow-xl text-center max-w-md border-4 border-[var(--gold)]">
      <h2 className="text-2xl font-black text-[var(--navy)] mb-4">Waiting for Host...</h2>
      <p className="text-gray-500 mb-8">Share the code with your friends to join the game.</p>
      <div className="bg-gray-100 p-6 rounded-2xl mb-6">
        <span className="text-4xl font-black tracking-widest text-[var(--navy)]">{code}</span>
      </div>

      {room?.playerIds && (
        <div className="mb-8 text-left">
          <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-3 px-1">Players Joined ({room.playerIds.length}/4)</h3>
          <div className="grid gap-2">
            {room.playerIds.map((id: string, idx: number) => {
              const pName = gameState?.players.find(p => p.id === id)?.name || (idx === 0 ? "Host" : `Player ${idx + 1}`);
              return (
                <div key={id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                    {pName[0].toUpperCase()}
                  </div>
                  <span className="font-bold text-sm text-[var(--navy)]">{pName}</span>
                  {id === room.hostId && <span className="ml-auto text-[8px] font-black uppercase bg-yellow-100 text-yellow-700 px-2 py-1 rounded-md">Host</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(isLocal || userId === room?.hostId) ? (
        <button onClick={() => performAction("start")} className="btn-primary w-full py-4 text-lg">Start Game</button>
      ) : (
        <div className="bg-blue-50 text-blue-700 p-4 rounded-2xl text-sm font-bold animate-pulse border border-blue-100">
          Waiting for host to start the game...
        </div>
      )}
    </div>
  </div>;


  return (
    <div className="h-screen flex flex-col md:flex-row bg-[var(--cream)] overflow-hidden">
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

        <div className="space-y-3">
          {gameState.players.map((p, i) => (
            <PortfolioPanel
              key={p.id}
              player={p}
              isActive={gameState.currentPlayerIndex === i}
              color={PLAYER_COLORS[i % PLAYER_COLORS.length]}
              isPrivate={isLocal ? gameState.currentPlayerIndex !== i : p.id !== userId}
            />
          ))}
          <div className="pt-2">
            <GameLog log={gameState.log} />
          </div>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col items-center justify-start p-2 md:p-4 overflow-y-auto pt-4">
        {/* Top Section: Board and Rules Sidebar */}
        <div className="flex flex-col lg:flex-row items-center lg:items-start justify-center gap-4 w-full">
          {/* Left Side: Board and Notifications */}
          <div className="w-full max-w-3xl relative flex flex-col items-center gap-4">
            <Board 
              tiles={TILES} 
              players={gameState.players} 
              onTileClick={(tile) => {
                // Show tile info popover/tooltip
              }}
              rolling={rolling}
              dice={lastDice}
              overlayMessage={overlayMessage}
              announcement={gameState.announcement}
              privateMessage={isMyTurn ? gameState.privateMessage : undefined}
            />

            {/* Bottom Section: Controls Overlay - Now Centered Below Board */}
            <div className="w-full flex items-center justify-center gap-4 bg-white/90 backdrop-blur-md p-3 rounded-3xl shadow-xl border border-white/50 animate-slide-in scale-90 md:scale-95">
              <DiceRoller 
                onRoll={handleRoll} 
                rolling={rolling} 
                dice={lastDice} 
                disabled={!isMyTurn || (gameState.phase !== "roll" && diceMode !== "lottery")} 
                label={diceMode === "lottery" ? "Roll" : "Roll Dice"}
              />

              {timeLeft !== null && (
                <div className={`flex flex-col items-center justify-center px-4 py-2 rounded-2xl border-2 transition-colors ${timeLeft < 10 ? 'border-red-500 bg-red-50 animate-pulse' : 'border-blue-100 bg-blue-50'}`}>
                  <div className="text-[8px] font-black uppercase text-gray-400 tracking-widest mb-1">Time</div>
                  <div className={`text-xl font-black ${timeLeft < 10 ? 'text-red-600' : 'text-blue-600'}`}>
                    {timeLeft}s
                  </div>
                </div>
              )}

              <div className="h-16 w-px bg-gray-200" />

              <div className="flex flex-col gap-1">
                <div className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">Action</div>
                <div className="flex gap-2">
                  {isMyTurn && (gameState.phase === "action" || (gameState.phase === "auction" && !showAuction)) && (
                    <button onClick={() => {
                      if (gameState.phase === "auction") setShowAuction(true);
                      else handleTileAction();
                    }} className="btn-primary px-8">
                      {gameState.phase === "auction" ? "Join Auction" : "Execute Tile"}
                    </button>
                  )}
                  {isMyTurn && gameState.phase === "trade" && (
                    <>
                      <button 
                        onClick={() => setShowTrade(true)} 
                        disabled={currentPlayer?.hasTraded}
                        className="btn-secondary flex items-center gap-2 disabled:opacity-50 px-4"
                      >
                        <MessageSquare size={16} /> Trade
                      </button>
                      <button onClick={() => setShowRebalance(true)} className="btn-secondary px-4">
                        Rebalance
                      </button>
                      <button onClick={() => setShowTargetedAction("concentration-audit")} className="btn-secondary flex items-center gap-2 px-4">
                        <ShieldAlert size={16} /> Audit
                      </button>
                      <button 
                        onClick={handleEndTurn} 
                        disabled={isEndingTurn}
                        className="btn-primary disabled:opacity-50 px-8"
                      >
                        {isEndingTurn ? "..." : "Next Turn"}
                      </button>
                    </>
                  )}
                  {isMyTurn && gameState.phase === "year-end" && (
                    <button onClick={() => setShowRebalance(true)} className="btn-primary w-full py-2 px-8">Rebalance Portfolio</button>
                  )}
                  {!isMyTurn && gameState.phase !== "year-end" && (
                    <div className="bg-gray-100 text-gray-500 px-6 py-2 rounded-xl text-xs font-bold animate-pulse">
                      Waiting for {currentPlayer?.name}...
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Tips & Rules Sidebar */}
          <div className="w-full lg:w-80 flex flex-col gap-4 animate-slide-in">
            <div className="bg-white/80 backdrop-blur-md p-4 rounded-3xl shadow-xl border border-white/50 border-l-4 border-l-[var(--gold)]">
              <h2 className="text-lg font-black text-[var(--navy)] mb-3 flex items-center gap-2">
                <span className="text-xl">📜</span> Rules & Returns
              </h2>
              
              <div className="space-y-3">
                <section>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Market Returns</h3>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="bg-blue-50 p-2 rounded-xl border border-blue-100 flex justify-between items-center">
                      <div className="text-[10px] font-bold text-blue-800 uppercase">Bonds</div>
                      <div className="text-xs font-black text-blue-900">+1L <span className="text-[8px] font-normal opacity-70">/ 5L</span></div>
                    </div>
                    <div className="bg-purple-50 p-2 rounded-xl border border-purple-100 flex justify-between items-center">
                      <div className="text-[10px] font-bold text-purple-800 uppercase">Stocks</div>
                      <div className="text-xs font-black text-purple-900">+2L <span className="text-[8px] font-normal opacity-70">/ 5L</span></div>
                    </div>
                  </div>
                </section>

                <section>
                  <ul className="space-y-1.5 text-[10px] font-bold text-gray-600">
                    <li className="flex gap-2"><span className="text-[var(--gold)]">●</span> House by end of Year 3.</li>
                    <li className="flex gap-2"><span className="text-[var(--gold)]">●</span> 100L Wealth to win.</li>
                    <li className="flex gap-2"><span className="text-[var(--gold)]">●</span> Tax Raid: 2L fine target 5L.</li>
                    <li className="flex gap-2"><span className="text-[var(--gold)]">●</span> Audit: &gt; 40L assets.</li>
                  </ul>
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
        isOpen={showTrade} 
        onClose={() => setShowTrade(false)} 
        currentPlayer={currentPlayer!} 
        otherPlayers={gameState.players.filter(p => p.id !== currentPlayer?.id)}
        onPropose={(targetId, offer, request) => {
          performAction("trade-offer", { toPlayerId: targetId, offer, request });
          setShowTrade(false);
        }}
      />

      <AuctionModal 
        isOpen={showAuction && gameState.phase === "auction"} 
        currentPlayer={isLocal ? (currentBiddingPlayer || currentPlayer!) : gameState.players.find(p => p.id === userId)!}
        hasBid={isLocal ? !currentBiddingPlayer : !!gameState.auctionState?.bids.find(b => b.playerId === userId)}
        onBid={(amount) => {
          const bidderId = isLocal ? currentBiddingPlayer?.id : userId;
          performAction("bid", { amount, bidderId });
        }}
        minBid={HOUSE_AUCTION_MIN}
        marketPrice={HOUSE_MARKET_PRICE}
        onClose={() => setShowAuction(false)}
      />

      <RebalanceModal 
        isOpen={(gameState.phase === "year-end" || showRebalance) && isMyTurn}
        player={currentPlayer!}
        penalty={rebalancePenaltyOverride !== null ? rebalancePenaltyOverride : (gameState.phase !== "year-end" ? 3 : 0)}
        onRebalance={(c, b, s) => {
          handleRebalance(c, b, s);
          setShowRebalance(false);
          setRebalancePenaltyOverride(null);
        }}
        onClose={rebalancePenaltyOverride !== null ? undefined : () => setShowRebalance(false)}
      />

      {showLeadersDilemma && (
        <LeadersDilemmaModal 
          isOpen={true}
          player={currentPlayer!}
          onDeclare={() => performAction("declare")}
          onAudit={(idx) => performAction("audit", { targetIdx: idx })}
          otherPlayers={gameState.players.filter(p => p.id !== currentPlayer?.id)}
          isCurrentTurn={isMyTurn}
          needsToDeclare={netWorth(currentPlayer!) >= 70 && !currentPlayer?.wealthDeclared}
        />
      )}

      {showTargetedAction && (
        <TargetedActionModal 
          isOpen={true}
          type={showTargetedAction}
          currentPlayer={currentPlayer!}
          otherPlayers={gameState.players.map((p, i) => ({ player: p, originalIndex: i })).filter(x => x.player.id !== currentPlayer?.id)}
          onConfirm={(payload) => {
            if (showTargetedAction === "concentration-audit") {
              performAction("concentration-audit", payload);
            } else {
              performAction("tile-action", payload);
            }
            setShowTargetedAction(null);
          }}
          onClose={() => setShowTargetedAction(null)}
        />
      )}

      {showChoiceModal && (
        <ChoiceModal 
          isOpen={true}
          type={showChoiceModal}
          playerCash={currentPlayer?.cash || 0}
          onConfirm={(payload) => {
            performAction("tile-action", payload);
            setShowChoiceModal(null);
          }}
          onClose={() => setShowChoiceModal(null)}
        />
      )}

      {showPassDevice && (
        <PassDeviceScreen 
          nextPlayerName={(gameState?.phase === "auction" ? currentBiddingPlayer?.name : (gameState?.phase === "waiting-trade" ? gameState.players.find(p => p.id === gameState.pendingTrade?.toPlayerId)?.name : currentPlayer?.name)) || "Next Player"} 
          onContinue={() => setShowPassDevice(false)} 
        />
      )}

      <TradeResponseModal 
        isOpen={gameState.phase === "waiting-trade"}
        offer={gameState.pendingTrade!}
        fromPlayer={gameState.players.find(p => p.id === gameState.pendingTrade?.fromPlayerId)!}
        toPlayer={gameState.players.find(p => p.id === gameState.pendingTrade?.toPlayerId)!}
        onResponse={(accept) => performAction("trade-response", { accept })}
      />
    </div>
  </div>
  );
}

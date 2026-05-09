import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRoomById, updateGameState, recordGameResult } from "@/lib/db/queries";
import { pusherServer, getRoomChannel, PUSHER_EVENTS } from "@/lib/pusher";
import { db } from "@/lib/db";
import { rooms, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { GameState } from "@/lib/db/schema";
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
  getLeaderboard,
} from "@/lib/game-engine/actions";
import { getTileByPosition } from "@/lib/game-engine/tiles";
import { netWorth } from "@/lib/game-engine/validators";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action, payload } = body;
  const userId = (session.user as { id?: string }).id!;

  // Load current room
  const room = await getRoomById(roomId);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  let gameState = room.gameState as GameState | null;

  // ─── START GAME ────────────────────────────────────────────────────────────
  if (action === "start") {
    if (room.hostId !== userId) {
      return NextResponse.json({ error: "Only host can start the game" }, { status: 403 });
    }
    const playerIds = room.playerIds as string[];
    if (playerIds.length < 2) {
      return NextResponse.json({ error: "Need at least 2 players" }, { status: 400 });
    }

    // Load player details
    const playerDetails = await Promise.all(
      playerIds.map(async (pid) => {
        const [u] = await db.select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
          .from(users).where(eq(users.id, pid));
        return {
          id: pid,
          name: u?.name ?? "Player",
          avatar: u?.avatarUrl ?? "",
          isBot: pid.startsWith("bot_"),
        };
      })
    );

    // Add any bot players from payload
    const bots = payload?.bots ?? [];
    const allPlayers = [
      ...playerDetails,
      ...bots.map((b: { name: string }) => ({
        id: `bot_${Date.now()}_${Math.random()}`,
        name: b.name,
        avatar: "",
        isBot: true,
      })),
    ];

    gameState = createInitialGameState(allPlayers);
    await db.update(rooms).set({ status: "active", gameState, updatedAt: new Date() }).where(eq(rooms.id, roomId));

    await pusherServer.trigger(getRoomChannel(room.code), PUSHER_EVENTS.GAME_STARTED, { gameState });
    return NextResponse.json({ gameState });
  }

  if (!gameState) return NextResponse.json({ error: "Game not started" }, { status: 400 });

  const currentPlayerIdx = gameState.currentPlayerIndex;
  const currentPlayer = gameState.players[currentPlayerIdx];

  // Validate it's the player's turn (for online mode)
  if (room.mode === "online" && currentPlayer.id !== userId && action !== "bid" && action !== "trade-respond" && action !== "declare" && action !== "audit") {
    return NextResponse.json({ error: "Not your turn" }, { status: 403 });
  }

  let state = gameState;

  // ─── ACTION HANDLERS ──────────────────────────────────────────────────────

  if (action === "roll") {
    if (state.phase !== "roll") return NextResponse.json({ error: "Not roll phase" }, { status: 400 });

    const dice = rollDice();
    const result = processDiceRoll(state, currentPlayerIdx, dice);
    state = result.state;

    // Collect income (unless income freeze)
    const tile = getTileByPosition(result.newPosition);
    if (tile.effect === "income-freeze") {
      state = applyIncomeFreezeToPlayer(state, currentPlayerIdx);
    } else {
      state = collectIncome(state, currentPlayerIdx);
    }

    // Check if passed start (year-end trigger)
    if (result.passedStart) {
      state = calculateYearEndReturns(state, currentPlayerIdx);
      state = { ...state, phase: "year-end" };
    } else {
      state = { ...state, phase: "action" };
    }

    // Check win condition
    const win = checkWinCondition(state);
    if (win.triggered && !state.endgame) {
      state = { ...state, endgame: true, winTriggeredByPlayerId: win.triggeringPlayerId };
    }

    await updateGameState(roomId, state);
    await pusherServer.trigger(getRoomChannel(room.code), PUSHER_EVENTS.GAME_STATE_UPDATE, { gameState: state });
    return NextResponse.json({ gameState: state, dice });
  }

  if (action === "tile-action") {
    if (state.phase !== "action") return NextResponse.json({ error: "Not action phase" }, { status: 400 });

    const tile = getTileByPosition(currentPlayer.position);

    switch (tile.effect) {
      case "bonus":
        state = applyBonus(state, currentPlayerIdx);
        break;
      case "stock-rally":
        state = applyStockRally(state, currentPlayerIdx);
        break;
      case "stock-crash":
        state = applyStockCrash(state, currentPlayerIdx);
        break;
      case "market-crash":
        state = applyMarketCrash(state, currentPlayerIdx);
        break;
      case "market-rally":
        state = applyMarketRally(state, currentPlayerIdx);
        break;
      case "ipo":
        const ipoAmount = payload?.amount ?? 0;
        state = applyIPO(state, currentPlayerIdx, ipoAmount);
        break;
      case "income-freeze":
        // Already applied at roll time
        break;
      case "emergency":
        const emergencyAmount = payload?.amount as 3 | 5 ?? 3;
        state = applyEmergency(state, currentPlayerIdx, emergencyAmount);
        break;
      case "lottery":
        if (payload?.play) {
          const dieResult = Math.floor(Math.random() * 6) + 1;
          state = applyLotteryReward(state, currentPlayerIdx, dieResult);
        }
        break;
      case "hostile-takeover":
        if (payload?.targetIdx !== undefined) {
          const htResult = applyHostileTakeover(
            state,
            currentPlayerIdx,
            payload.targetIdx,
            payload.spendAmount,
            payload.demandType
          );
          if (!htResult.valid) return NextResponse.json({ error: htResult.error }, { status: 400 });
          state = htResult.state;
        }
        break;
      case "tax-raid":
        if (payload?.targetIdx !== undefined) {
          const trResult = applyTaxRaid(state, currentPlayerIdx, payload.targetIdx);
          if (!trResult.valid) return NextResponse.json({ error: trResult.error }, { status: 400 });
          state = trResult.state;
        }
        break;
      case "house-auction":
        state = {
          ...state,
          phase: "auction",
          auctionState: { bids: [], open: true, timerStart: Date.now() },
        };
        await updateGameState(roomId, state);
        await pusherServer.trigger(getRoomChannel(room.code), PUSHER_EVENTS.GAME_STATE_UPDATE, { gameState: state });
        return NextResponse.json({ gameState: state });
    }

    // After tile action, move to trade phase
    state = { ...state, phase: "trade" };

    // Check wealth declaration requirements
    state.players.forEach((p, i) => {
      if (netWorth(p) >= 70 && !p.wealthDeclared) {
        // Flag will prompt declaration modal on client
      }
    });

    const win = checkWinCondition(state);
    if (win.triggered && !state.endgame) {
      state = { ...state, endgame: true, winTriggeredByPlayerId: win.triggeringPlayerId };
    }

    await updateGameState(roomId, state);
    await pusherServer.trigger(getRoomChannel(room.code), PUSHER_EVENTS.GAME_STATE_UPDATE, { gameState: state });
    return NextResponse.json({ gameState: state });
  }

  if (action === "bid") {
    // House auction bid — any player can submit
    const bidderIdx = state.players.findIndex((p) => p.id === userId);
    if (bidderIdx === -1) return NextResponse.json({ error: "Player not in game" }, { status: 403 });

    const bidAmount = payload?.amount ?? 0;
    if (!state.auctionState?.open) return NextResponse.json({ error: "Auction not open" }, { status: 400 });

    const existingBids = state.auctionState.bids.filter((b) => b.playerId !== userId);
    state = {
      ...state,
      auctionState: {
        ...state.auctionState,
        bids: [...existingBids, { playerId: userId, amount: bidAmount }],
      },
    };

    // Check if all players have bid
    const playerCount = state.players.filter((p) => !p.isBot).length;
    if (state.auctionState.bids.length >= state.players.length) {
      const result = resolveHouseAuction(state);
      state = result.state;
    }

    await updateGameState(roomId, state);
    await pusherServer.trigger(getRoomChannel(room.code), PUSHER_EVENTS.GAME_STATE_UPDATE, { gameState: state });
    return NextResponse.json({ gameState: state });
  }

  if (action === "rebalance") {
    const { newCash, newBonds, newStocks } = payload;
    const result = applyYearEndRebalance(state, currentPlayerIdx, newCash, newBonds, newStocks);
    if (!result.valid) return NextResponse.json({ error: result.error }, { status: 400 });
    
    state = { ...result.state, phase: "roll" };

    await updateGameState(roomId, state);
    await pusherServer.trigger(getRoomChannel(room.code), PUSHER_EVENTS.GAME_STATE_UPDATE, { gameState: state });
    return NextResponse.json({ gameState: state });
  }

  if (action === "trade-offer") {
    const { toPlayerId, offer, request } = payload;
    const toIdx = state.players.findIndex((p) => p.id === toPlayerId);
    if (toIdx === -1) return NextResponse.json({ error: "Target player not found" }, { status: 400 });

    state = {
      ...state,
      phase: "waiting-trade",
      pendingTrade: { fromPlayerId: userId, toPlayerId, offer, request },
    };

    await updateGameState(roomId, state);
    await pusherServer.trigger(getRoomChannel(room.code), PUSHER_EVENTS.TRADE_OFFER, { gameState: state, trade: state.pendingTrade });
    return NextResponse.json({ gameState: state });
  }

  if (action === "trade-respond") {
    if (!state.pendingTrade) return NextResponse.json({ error: "No pending trade" }, { status: 400 });

    if (payload?.accept) {
      state = resolveTrade(state, true);
    } else {
      state = resolveTrade(state, false);
    }

    await updateGameState(roomId, state);
    await pusherServer.trigger(getRoomChannel(room.code), PUSHER_EVENTS.GAME_STATE_UPDATE, { gameState: state });
    return NextResponse.json({ gameState: state });
  }

  if (action === "end-turn") {
    if (state.phase !== "trade") return NextResponse.json({ error: "Cannot end turn yet" }, { status: 400 });

    if (state.endgame) {
      // Check if all players have gone this round
      const nextIdx = (currentPlayerIdx + 1) % state.players.length;
      if (nextIdx === 0) {
        // Everyone has gone — end game
        state = { ...state, phase: "finished" };
        const leaderboard = getLeaderboard(state);
        const winner = leaderboard[0];

        // Persist results for human players
        if (winner && !winner.isBot) {
          const loserIds = leaderboard.slice(1).filter((p) => !p.isBot).map((p) => p.id);
          await recordGameResult(winner.id, loserIds);
        }

        await updateGameState(roomId, state);
        await db.update(rooms).set({ status: "finished" }).where(eq(rooms.id, roomId));
        await pusherServer.trigger(getRoomChannel(room.code), PUSHER_EVENTS.GAME_FINISHED, { gameState: state, leaderboard });
        return NextResponse.json({ gameState: state, leaderboard });
      }
    }

    state = advanceTurn(state);
    await updateGameState(roomId, state);
    await pusherServer.trigger(getRoomChannel(room.code), PUSHER_EVENTS.GAME_STATE_UPDATE, { gameState: state });
    return NextResponse.json({ gameState: state });
  }

  if (action === "declare") {
    const playerIdx = state.players.findIndex((p) => p.id === userId);
    if (playerIdx === -1) return NextResponse.json({ error: "Player not found" }, { status: 403 });
    state = processWealthDeclaration(state, playerIdx);
    await updateGameState(roomId, state);
    await pusherServer.trigger(getRoomChannel(room.code), PUSHER_EVENTS.GAME_STATE_UPDATE, { gameState: state });
    return NextResponse.json({ gameState: state });
  }

  if (action === "audit") {
    const auditorIdx = state.players.findIndex((p) => p.id === userId);
    const targetIdx = payload?.targetIdx;
    if (auditorIdx === -1 || targetIdx === undefined) {
      return NextResponse.json({ error: "Invalid audit" }, { status: 400 });
    }
    const result = processAudit(state, auditorIdx, targetIdx);
    if (!result.valid) return NextResponse.json({ error: result.error }, { status: 400 });
    state = result.state;
    await updateGameState(roomId, state);
    await pusherServer.trigger(getRoomChannel(room.code), PUSHER_EVENTS.GAME_STATE_UPDATE, { gameState: state });
    return NextResponse.json({ gameState: state });
  }

  if (action === "concentration-audit") {
    const auditorIdx = state.players.findIndex((p) => p.id === userId);
    const targetIdx = payload?.targetIdx;
    if (auditorIdx === -1 || targetIdx === undefined) {
      return NextResponse.json({ error: "Invalid audit" }, { status: 400 });
    }
    const result = processConcentrationAudit(state, auditorIdx, targetIdx);
    if (!result.valid) return NextResponse.json({ error: result.error }, { status: 400 });
    state = result.state;
    
    // Note: in online mode, the client will see ca.needsRebalance and prompt rebalance.
    // However, we should ensure the backend state reflects that it's the action phase or a state where rebalance is allowed.
    // For now, processConcentrationAudit doesn't change the phase if rebalance is needed.
    
    await updateGameState(roomId, state);
    await pusherServer.trigger(getRoomChannel(room.code), PUSHER_EVENTS.GAME_STATE_UPDATE, { gameState: state });
    return NextResponse.json({ gameState: state, needsRebalance: result.needsRebalance });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

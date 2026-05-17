import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRoomById, updateGameState, recordGameResult } from "@/lib/db/queries";
import { pusherServer, getRoomChannel, PUSHER_EVENTS } from "@/lib/pusher";
import { db } from "@/lib/db";
import { rooms, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { GameState } from "@/lib/db/schema";
import { createInitialGameState, getLeaderboard } from "@/lib/game-engine/actions";
import { dispatch, applyWinCheck } from "@/lib/game-engine/dispatcher";

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

  // ─── START GAME (special — needs DB user lookups) ─────────────────────────
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
  if (room.mode === "online" && currentPlayer.id !== userId && action !== "bid" && action !== "trade-response" && action !== "audit") {
    return NextResponse.json({ error: "Not your turn" }, { status: 403 });
  }

  // ─── END-TURN (special — needs endgame finalization with DB writes) ────────
  if (action === "end-turn") {
    if (gameState.endgame) {
      const nextIdx = (currentPlayerIdx + 1) % gameState.players.length;
      if (nextIdx === 0) {
        // Everyone has gone — end game
        let state: GameState = { ...gameState, phase: "finished" };
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

    // Normal end-turn — delegate to dispatcher
    const result = dispatch(gameState, "end-turn", payload);
    await updateGameState(roomId, result.state);
    await pusherServer.trigger(getRoomChannel(room.code), PUSHER_EVENTS.GAME_STATE_UPDATE, { gameState: result.state });
    return NextResponse.json({ gameState: result.state });
  }

  // ─── ALL OTHER ACTIONS — delegate to dispatcher ───────────────────────────
  const result = dispatch(gameState, action, payload);

  // Check for side-effect errors from the dispatcher
  if (result.sideEffect?.type === "error") {
    return NextResponse.json({ error: (result.sideEffect as any).message }, { status: 400 });
  }

  // Apply win-condition check
  let state = applyWinCheck(result.state);

  // Persist and broadcast
  await updateGameState(roomId, state);

  // Use the appropriate Pusher event
  const pusherEvent = action === "trade-offer"
    ? PUSHER_EVENTS.TRADE_OFFER
    : PUSHER_EVENTS.GAME_STATE_UPDATE;

  const pusherPayload: Record<string, unknown> = { gameState: state };
  if (action === "trade-offer" && state.pendingTrade) {
    pusherPayload.trade = state.pendingTrade;
  }

  await pusherServer.trigger(getRoomChannel(room.code), pusherEvent, pusherPayload);

  // Build response — include extra fields consumers may need
  const response: Record<string, unknown> = { gameState: state };
  if (result.dice !== undefined) response.dice = result.dice;
  if (result.sideEffect?.type === "needs-rebalance") response.needsRebalance = true;
  if (result.sideEffect) response.sideEffect = result.sideEffect;

  return NextResponse.json(response);
}

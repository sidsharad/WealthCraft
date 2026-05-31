import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRoomById, updateGameState, recordGameResult } from "@/lib/db/queries";
import { getRoomChannel, PUSHER_EVENTS, safeTrigger } from "@/lib/pusher";
import { db } from "@/lib/db";
import { rooms, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { GameState } from "@/lib/db/schema";
import { createInitialGameState, getLeaderboard } from "@/lib/game-engine/actions";
import { dispatch, applyWinCheck } from "@/lib/game-engine/dispatcher";
import { roomLocks } from "@/lib/locks";

function hashGameState(state: any): string {
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

// ─── CONCURRENCY LOCK MANAGER ─────────────────────────────────────────────────

function acquireRoomLock(roomId: string, holder: string): boolean {
  const lock = roomLocks.get(roomId);
  const now = Date.now();
  
  if (lock && now - lock.lockedAt < 10000) { // 10-second turn lock auto-release
    return false;
  }
  
  roomLocks.set(roomId, { lockedAt: now, holder });
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: "LOCK_TRACE",
    roomId,
    lockOwner: holder,
    lockAge: 0
  }, null, 2));
  return true;
}

function releaseRoomLock(roomId: string, holder: string) {
  const lock = roomLocks.get(roomId);
  if (lock && lock.holder === holder) {
    const lockAge = Date.now() - lock.lockedAt;
    roomLocks.delete(roomId);
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "LOCK_TRACE",
      roomId,
      lockOwner: holder,
      lockAge: lockAge
    }, null, 2));
  }
}

// ─── IDEMPOTENCY UTILITY ──────────────────────────────────────────────────────
function appendActionId(state: GameState, actionId?: string): GameState {
  if (!actionId) return state;
  const processed: string[] = (state as any).processedActionIds ?? [];
  const nextProcessed = [...processed.filter(id => id !== actionId), actionId].slice(-50); // Rolling cache of last 50 actionIds
  return {
    ...state,
    processedActionIds: nextProcessed
  } as any;
}

// ─── STATE MACHINE INTEGRITY VALIDATOR ─────────────────────────────────────────
interface StateValidationError {
  field: string;
  value: any;
  message: string;
}

function validateGameState(state: GameState, room: any): { valid: boolean; errors: StateValidationError[] } {
  const errors: StateValidationError[] = [];

  // 1. Validate Phase is valid
  const validPhases = ["roll", "action", "trade", "year-end", "auction", "finished", "waiting-trade"];
  if (!validPhases.includes(state.phase)) {
    errors.push({ field: "phase", value: state.phase, message: "Invalid game phase value" });
  }

  // 2. Validate currentPlayerIndex is valid
  if (typeof state.currentPlayerIndex !== "number" || state.currentPlayerIndex < 0 || state.currentPlayerIndex >= state.players.length) {
    errors.push({ field: "currentPlayerIndex", value: state.currentPlayerIndex, message: "currentPlayerIndex out of bounds or invalid type" });
  }

  // 3. Validate currentPlayer exists
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer) {
    errors.push({ field: "currentPlayer", value: null, message: "currentPlayer is undefined or null at currentPlayerIndex" });
  }

  // 4. Validate active player belongs to room (only for human players)
  if (currentPlayer && !currentPlayer.isBot && room?.playerIds) {
    const playerIds = room.playerIds as string[];
    if (!playerIds.includes(currentPlayer.id)) {
      errors.push({ field: "currentPlayer.id", value: currentPlayer.id, message: "Current active human player is not in room playerIds list" });
    }
  }

  // 5. Validate room status is valid
  const validRoomStatuses = ["active", "finished", "waiting"];
  if (room && !validRoomStatuses.includes(room.status)) {
    errors.push({ field: "room.status", value: room.status, message: "Invalid room status value" });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action, payload, actionId } = body;
  const userId = (session.user as { id?: string }).id!;

  const startTime = Date.now();
  let phaseBefore = "lobby";
  let turnBefore = 0;
  let phaseAfter = "lobby";
  let turnAfter = 0;

  // 1. Acquire Room Concurrency Lock
  const holder = `${userId}_${action}_${actionId || "no_id"}_${Date.now()}`;
  if (!acquireRoomLock(roomId, holder)) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "LOCK_CONFLICT",
      roomId,
      playerId: userId,
      action,
      actionId,
      message: "Room is currently locked by another active action"
    }));
    return NextResponse.json({ error: "Another action is in progress. Please retry in a moment." }, { status: 409 });
  }

  try {
    // Load current room
    const room = await getRoomById(roomId);
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

    // 2. Validate player is part of this room
    const playerIds = room.playerIds as string[];
    if (!playerIds.includes(userId)) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "VALIDATION_FAILED",
        roomId,
        playerId: userId,
        action,
        error: "Player not in room"
      }));
      return NextResponse.json({ error: "Player not in this room" }, { status: 403 });
    }

    let gameState = room.gameState as GameState | null;
    if (gameState) {
      phaseBefore = gameState.phase;
      turnBefore = gameState.turn;
    }

    // ─── START GAME (special — needs DB user lookups) ─────────────────────────
    if (action === "start") {
      if (room.hostId !== userId) {
        return NextResponse.json({ error: "Only host can start the game" }, { status: 403 });
      }
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
      gameState = appendActionId(gameState, actionId);
      await db.update(rooms).set({ status: "active", gameState, updatedAt: new Date() }).where(eq(rooms.id, roomId));

      safeTrigger(getRoomChannel(room.code), PUSHER_EVENTS.GAME_STARTED, { timestamp: Date.now() }).catch(err =>
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: "PUSHER_TRIGGER_FAILURE",
          roomId,
          playerId: userId,
          action: "start",
          error: err?.message || err
        }))
      );
      phaseAfter = gameState.phase;
      turnAfter = gameState.turn;
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "ACTION_TRACE",
        actionId: actionId || null,
        actionType: action,
        playerId: userId,
        roomId: roomId,
        phaseBefore,
        phaseAfter,
        turnBefore,
        turnAfter,
        durationMs: Date.now() - startTime
      }, null, 2));
      console.log(JSON.stringify({
        event: "STATE_HASH",
        turn: gameState.turn,
        year: gameState.year,
        hash: hashGameState(gameState)
      }, null, 2));
      return NextResponse.json({ gameState });
    }

    if (!gameState) return NextResponse.json({ error: "Game not started" }, { status: 400 });

    // 3. Validate Game State Integrity
    if (!gameState.players || typeof gameState.currentPlayerIndex !== "number") {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "VALIDATION_FAILED",
        roomId,
        playerId: userId,
        action,
        error: "Game state corrupted"
      }));
      return NextResponse.json({ error: "Game state is corrupted" }, { status: 500 });
    }

    // 4. Validate Action Idempotency
    const processedIds: string[] = (gameState as any).processedActionIds ?? [];
    if (actionId && processedIds.includes(actionId)) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "IDEMPOTENCY_BLOCK",
        roomId,
        playerId: userId,
        action,
        actionId,
        message: "Duplicate action request blocked, returning current state"
      }));
      phaseAfter = gameState.phase;
      turnAfter = gameState.turn;
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "ACTION_TRACE",
        actionId: actionId || null,
        actionType: action,
        playerId: userId,
        roomId: roomId,
        phaseBefore,
        phaseAfter,
        turnBefore,
        turnAfter,
        durationMs: Date.now() - startTime
      }, null, 2));
      console.log(JSON.stringify({
        event: "STATE_HASH",
        turn: gameState.turn,
        year: gameState.year,
        hash: hashGameState(gameState)
      }, null, 2));
      return NextResponse.json({ gameState });
    }

    const currentPlayerIdx = gameState.currentPlayerIndex;
    const currentPlayer = gameState.players[currentPlayerIdx];

    // Validate it's the player's turn (for online mode)
    const isBotTurn = currentPlayer.isBot;
    const isHost = room.hostId === userId;

    if (room.mode === "online" && !isBotTurn && currentPlayer.id !== userId && action !== "bid" && action !== "trade-response" && action !== "audit") {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "VALIDATION_FAILED",
        roomId,
        playerId: userId,
        action,
        error: "Not player's turn"
      }));
      return NextResponse.json({ error: "Not your turn" }, { status: 403 });
    }

    if (room.mode === "online" && isBotTurn && !isHost && action !== "bid" && action !== "trade-response" && action !== "audit") {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "VALIDATION_FAILED",
        roomId,
        playerId: userId,
        action,
        error: "Only the room host can submit actions for bots in online mode"
      }));
      return NextResponse.json({ error: "Only the room host can submit actions for bots" }, { status: 403 });
    }

    // ─── END-TURN (special — needs endgame finalization with DB writes) ────────
    if (action === "end-turn") {
      if (gameState.endgame) {
        const nextIdx = (currentPlayerIdx + 1) % gameState.players.length;
        if (nextIdx === 0) {
          console.log(JSON.stringify({ event: "GAME_FINISHED_TRIGGER" }));

          // Everyone has gone — end game
          let state: GameState = { ...gameState, phase: "finished" };
          const leaderboard = getLeaderboard(state);
          const winner = leaderboard[0];

          console.log(JSON.stringify({ event: "WINNER_COMPUTED", winnerId: winner?.id }));

          // Persist results for human players
          if (winner && !winner.isBot) {
            const loserIds = leaderboard.slice(1).filter((p) => !p.isBot).map((p) => p.id);
            await recordGameResult(winner.id, loserIds);
          }

          state = appendActionId(state, actionId);

          const validation = validateGameState(state, room);
          if (!validation.valid) {
            console.warn(JSON.stringify({
              timestamp: new Date().toISOString(),
              event: "INVALID_GAME_STATE",
              roomId,
              lastAction: { action, payload, actionId },
              errors: validation.errors,
              previousState: {
                phase: gameState.phase,
                currentPlayerIndex: gameState.currentPlayerIndex,
                turn: gameState.turn,
                year: gameState.year
              },
              nextState: {
                phase: state.phase,
                currentPlayerIndex: state.currentPlayerIndex,
                turn: state.turn,
                year: state.year
              },
              fullRoomSnapshot: room
            }, null, 2));
          }

          await updateGameState(roomId, state);
          await db.update(rooms).set({ status: "finished" }).where(eq(rooms.id, roomId));
          console.log(JSON.stringify({ event: "GAME_FINISHED_COMMIT" }));
          
          safeTrigger(getRoomChannel(room.code), PUSHER_EVENTS.GAME_FINISHED, { timestamp: Date.now() }).catch(err =>
            console.error(JSON.stringify({
              timestamp: new Date().toISOString(),
              event: "PUSHER_TRIGGER_FAILURE",
              roomId,
              playerId: userId,
              action: "end-turn",
              error: err?.message || err
            }))
          );
          phaseAfter = state.phase;
          turnAfter = state.turn;
          console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            event: "ACTION_TRACE",
            actionId: actionId || null,
            actionType: action,
            playerId: userId,
            roomId: roomId,
            phaseBefore,
            phaseAfter,
            turnBefore,
            turnAfter,
            durationMs: Date.now() - startTime
          }, null, 2));
          console.log(JSON.stringify({
            event: "STATE_HASH",
            turn: state.turn,
            year: state.year,
            hash: hashGameState(state)
          }, null, 2));
          return NextResponse.json({ gameState: state, leaderboard });
        }
      }

      // Normal end-turn — delegate to dispatcher
      const result = dispatch(gameState, "end-turn", payload);
      let nextState = result.state;
      nextState = appendActionId(nextState, actionId);

      const validation = validateGameState(nextState, room);
      if (!validation.valid) {
        console.warn(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: "INVALID_GAME_STATE",
          roomId,
          lastAction: { action, payload, actionId },
          errors: validation.errors,
          previousState: {
            phase: gameState.phase,
            currentPlayerIndex: gameState.currentPlayerIndex,
            turn: gameState.turn,
            year: gameState.year
          },
          nextState: {
            phase: nextState.phase,
            currentPlayerIndex: nextState.currentPlayerIndex,
            turn: nextState.turn,
            year: nextState.year
          },
          fullRoomSnapshot: room
        }, null, 2));
      }

      await updateGameState(roomId, nextState);
      safeTrigger(getRoomChannel(room.code), PUSHER_EVENTS.GAME_STATE_UPDATE, { timestamp: Date.now() }).catch(err =>
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: "PUSHER_TRIGGER_FAILURE",
          roomId,
          playerId: userId,
          action: "end-turn",
          error: err?.message || err
        }))
      );
      phaseAfter = nextState.phase;
      turnAfter = nextState.turn;
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "ACTION_TRACE",
        actionId: actionId || null,
        actionType: action,
        playerId: userId,
        roomId: roomId,
        phaseBefore,
        phaseAfter,
        turnBefore,
        turnAfter,
        durationMs: Date.now() - startTime
      }, null, 2));
      console.log(JSON.stringify({
        event: "STATE_HASH",
        turn: nextState.turn,
        year: nextState.year,
        hash: hashGameState(nextState)
      }, null, 2));
      return NextResponse.json({ gameState: nextState });
    }

    // ─── ALL OTHER ACTIONS — delegate to dispatcher ───────────────────────────
    const result = dispatch(gameState, action, payload);

    // Check for side-effect errors from the dispatcher
    if (result.sideEffect?.type === "error") {
      return NextResponse.json({ error: (result.sideEffect as any).message }, { status: 400 });
    }

    // Apply win-condition check
    let state = applyWinCheck(result.state);
    state = appendActionId(state, actionId);

    const validation = validateGameState(state, room);
    if (!validation.valid) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "INVALID_GAME_STATE",
        roomId,
        lastAction: { action, payload, actionId },
        errors: validation.errors,
        previousState: {
          phase: gameState.phase,
          currentPlayerIndex: gameState.currentPlayerIndex,
          turn: gameState.turn,
          year: gameState.year
        },
        nextState: {
          phase: state.phase,
          currentPlayerIndex: state.currentPlayerIndex,
          turn: state.turn,
          year: state.year
        },
        fullRoomSnapshot: room
      }, null, 2));
    }

    // Persist and broadcast
    await updateGameState(roomId, state);

    // Use the appropriate Pusher event
    const pusherEvent = action === "trade-offer"
      ? PUSHER_EVENTS.TRADE_OFFER
      : PUSHER_EVENTS.GAME_STATE_UPDATE;

    // Send a lightweight payload to trigger clients to fetch the state
    const pusherPayload: Record<string, unknown> = { timestamp: Date.now() };

    safeTrigger(getRoomChannel(room.code), pusherEvent, pusherPayload).catch(err =>
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "PUSHER_TRIGGER_FAILURE",
        roomId,
        playerId: userId,
        action,
        error: err?.message || err
      }))
    );

    // Build response — include extra fields consumers may need
    const response: Record<string, unknown> = { gameState: state };
    if (result.dice !== undefined) response.dice = result.dice;
    if (result.sideEffect?.type === "needs-rebalance") response.needsRebalance = true;
    if (result.sideEffect) response.sideEffect = result.sideEffect;

    phaseAfter = state.phase;
    turnAfter = state.turn;
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "ACTION_TRACE",
      actionId: actionId || null,
      actionType: action,
      playerId: userId,
      roomId: roomId,
      phaseBefore,
      phaseAfter,
      turnBefore,
      turnAfter,
      durationMs: Date.now() - startTime
    }, null, 2));
    console.log(JSON.stringify({
      event: "STATE_HASH",
      turn: state.turn,
      year: state.year,
      hash: hashGameState(state)
    }, null, 2));
    return NextResponse.json(response);
  } finally {
    // 5. Always release the lock
    releaseRoomLock(roomId, holder);
  }
}

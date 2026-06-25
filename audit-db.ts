import { db } from "./lib/db";
import { rooms } from "./lib/db/schema";

async function runAudit() {
  const allRooms = await db.select().from(rooms);
  
  let totalSize = 0;
  let maxGameState = 0;
  let maxLogSize = 0;
  let maxActionsSize = 0;
  let maxTradeSize = 0;
  let maxPlayersSize = 0;
  let roomsCount = allRooms.length;

  for (const r of allRooms) {
    const gameState = r.gameState as any;
    if (gameState) {
      const gSize = Buffer.byteLength(JSON.stringify(gameState));
      if (gSize > maxGameState) maxGameState = gSize;

      const logSize = gameState.log ? Buffer.byteLength(JSON.stringify(gameState.log)) : 0;
      if (logSize > maxLogSize) maxLogSize = logSize;

      const actionsSize = gameState.processedActionIds ? Buffer.byteLength(JSON.stringify(gameState.processedActionIds)) : 0;
      if (actionsSize > maxActionsSize) maxActionsSize = actionsSize;

      const tradeSize = gameState.pendingTrade ? Buffer.byteLength(JSON.stringify(gameState.pendingTrade)) : 0;
      if (tradeSize > maxTradeSize) maxTradeSize = tradeSize;

      const playersSize = gameState.players ? Buffer.byteLength(JSON.stringify(gameState.players)) : 0;
      if (playersSize > maxPlayersSize) maxPlayersSize = playersSize;

      totalSize += gSize;
    }
  }

  const avgGameStateSize = roomsCount > 0 ? totalSize / roomsCount : 0;

  console.log(JSON.stringify({
    roomsAnalyzed: roomsCount,
    avgGameStateSize: Math.round(avgGameStateSize),
    maxGameStateSize: maxGameState,
    breakdownOfMax: {
      playersData: maxPlayersSize,
      logHistory: maxLogSize,
      processedActions: maxActionsSize,
      tradeData: maxTradeSize,
    }
  }, null, 2));
  
  process.exit(0);
}

runAudit().catch(console.error);

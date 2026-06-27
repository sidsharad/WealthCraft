import { createInitialGameState, performActionReducer } from "../lib/game-engine/actions";
import { getBotDecision } from "../lib/game-engine/bot";

async function runTest() {
  let state = createInitialGameState({
    id: "test",
    hostId: "p1",
    status: "playing",
    players: [
      { id: "p1", name: "Human", isBot: false },
      { id: "p2", name: "Bot1", isBot: true }
    ],
    settings: {
      initialWealth: 10,
      turnTimeLimit: 60,
      winningWealth: 100,
      yearEndBonus: 2,
      houseMarketPrice: 20
    }
  });

  // Advance game to make it Bot1's turn (trade phase so it can audit)
  // Human turn: roll
  state = performActionReducer(state, 0, { type: "roll", payload: { dice: 1 } }).state;
  // Human lands on a tile, does tile-action
  state = performActionReducer(state, 0, { type: "tile-action", payload: {} }).state;
  // Human ends turn
  state = performActionReducer(state, 0, { type: "end-turn", payload: {} }).state;
  
  console.log("Human Turn Completed.");
  console.log(`Current Player: ${state.players[state.currentPlayerIndex].name}, Phase: ${state.phase}`);

  // Bot1 turn
  // 1. Roll
  let action = getBotDecision(state, 1);
  console.log("Bot Roll Action:", action);
  state = performActionReducer(state, 1, { type: "roll", payload: { dice: 1 } }).state;

  // 2. Tile Action
  action = getBotDecision(state, 1);
  console.log("Bot Tile Action:", action);
  state = performActionReducer(state, 1, { type: "tile-action", payload: {} }).state;

  // 3. Trade phase (Bot can audit here)
  // To force an audit, let's give the bot a specific personality or just see if it audits.
  action = getBotDecision(state, 1);
  console.log("Bot Trade Phase Action:", action);
  
  // If the bot audits, dispatch it
  if (action.type === "audit") {
    console.log("Bot is auditing!");
    state = performActionReducer(state, 1, action).state;
    console.log("Post-audit phase:", state.phase);
  }

  console.log("Game Continues Successfully!");
}

runTest().catch(console.error);

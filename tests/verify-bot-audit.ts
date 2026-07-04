import { createInitialGameState } from "../lib/game-engine/actions";
import { getBotDecision } from "../lib/game-engine/bot";
import { dispatch } from "../lib/game-engine/dispatcher";

async function runTest() {
  let state = createInitialGameState([
      { id: "p1", name: "Human", avatar: "a1", isBot: false },
      { id: "p2", name: "Bot1", avatar: "a2", isBot: true }
  ]);

  state = dispatch(state, "roll", { dice: 1 }).state;
  state = dispatch(state, "tile-action", {}).state;
  state = dispatch(state, "end-turn", {}).state;
  
  console.log("Human Turn Completed.");
  console.log(`Current Player: ${state.players[state.currentPlayerIndex].name}, Phase: ${state.phase}`);

  let action = getBotDecision(state, 1);
  console.log("Bot Roll Action:", action);
  state = dispatch(state, "roll", { dice: 1 }).state;

  action = getBotDecision(state, 1);
  console.log("Bot Tile Action:", action);
  state = dispatch(state, "tile-action", {}).state;

  action = getBotDecision(state, 1);
  console.log("Bot Trade Phase Action:", action);
  
  if (action.type === "audit") {
    console.log("Bot is auditing!");
    state = dispatch(state, action.type, action.payload).state;
    console.log("Post-audit phase:", state.phase);
  } else {
    console.log("Bot did not audit.");
  }

  console.log("Game Continues Successfully!");
}

runTest().catch(console.error);

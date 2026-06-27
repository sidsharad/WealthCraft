import { createInitialBotState, getBotDecision } from "../lib/game-engine/bot";
import { updateStrategicMode } from "../lib/game-engine/bot-engine";
import { GameState, PlayerState } from "../lib/db/schema";

console.log("=== 5. Verify Strategy Modes ===");

const createBot = (id: string, name: string, botType: "defensive" | "balanced" | "aggressive"): PlayerState => {
  return {
    id,
    name,
    avatar: "",
    isBot: true,
    botType,
    cash: 10,
    bonds: 0,
    stocks: 0,
    hasHouse: false,
    jobLossActive: false,
    incomeFreezeActive: false,
    position: 0,
    year: 1,
    turnsWithJobLoss: 0,
    hasTraded: false,
    wealthDeclared: false,
    botState: null as any
  };
};

const runStrategyTest = (name: string, stateModifiers: (s: GameState) => void, botIndex: number = 1) => {
  const p1 = createBot("human", "Human", "balanced");
  p1.isBot = false;
  
  const bot1 = createBot("bot1", "Bot", "balanced");

  let state: GameState = {
    turn: 1,
    year: 1,
    currentPlayerIndex: botIndex,
    phase: "action",
    players: [p1, bot1],
    log: []
  };

  // Initialize bot state
  bot1.botState = createInitialBotState("bot1", "balanced", state.players);

  // Apply modifiers
  stateModifiers(state);

  // Update strategic mode
  state = updateStrategicMode(state);
  
  console.log(`\nScenario: ${name}`);
  console.log(`Mode = ${state.players[botIndex].botState?.strategicMode}`);
};

// EXPANSION
runStrategyTest("Expansion (Year 1, No threats)", s => {
  s.turn = 1;
  s.players[0].cash = 10;
  s.players[1].cash = 10;
});

// AGGRESSIVE
runStrategyTest("Aggressive (Leader ahead by >25L)", s => {
  s.players[0].cash = 50; // Human is leader
  s.players[1].cash = 10; // Bot is trailing by 40L (which is >25L)
});

// ENDGAME
runStrategyTest("Endgame (Bot net worth >90L)", s => {
  s.players[1].cash = 95; // Bot has >90L
});

// SABOTAGE
runStrategyTest("Sabotage (Human = 95L, Bot = 60L)", s => {
  s.players[0].cash = 95; // Human is leader at 95L
  s.players[1].cash = 60; // Bot trailing heavily while leader > 50L and bot cannot win easily
});

console.log("\n=== 6. Verify Explanation Engine ===");

// We will run one turn to get the debug payload
const p1 = createBot("human", "Human", "balanced");
p1.isBot = false;
p1.cash = 95;

const bot1 = createBot("bot1", "Bot", "aggressive");
bot1.cash = 60;
bot1.botState = createInitialBotState("bot1", "aggressive", [p1, bot1]);
bot1.botState.strategicMode = "AGGRESSIVE"; // Force it for the demo

let state: GameState = {
  turn: 10,
  year: 1,
  currentPlayerIndex: 1,
  phase: "trade",
  players: [p1, bot1],
  log: []
};

// Add an observation to the model just so it shows up in inferences
bot1.botState.playerModels["human"].stocks.mean = 55;
bot1.botState.playerModels["human"].stocks.confidence = 87;
bot1.botState.playerModels["human"].stocks.variance = 13;

const decision = getBotDecision(state, 1);
console.log(JSON.stringify(decision.debug, null, 2));

console.log("\nDone.");

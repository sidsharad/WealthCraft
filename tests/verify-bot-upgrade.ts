import { evaluateActionUtility } from "../lib/game-engine/bot-engine";
import { PlayerState, GameState } from "../db/schema";
import { BotAction } from "../lib/game-engine/bot";

const bot: PlayerState = {
  id: "bot",
  name: "Bot",
  isBot: true,
  cash: 10, bonds: 0, stocks: 0,
  year: 1, wealthDeclared: false, hasHouse: false,
  botState: {
    strategicMode: "BALANCED",
    personality: { greed: 50, risk: 50, liquidity: 50, aggression: 50, targetAllocation: { cash: 33, bonds: 33, stocks: 34 } },
    motivations: { revenge: 0, attackLeader: 0 },
    emotions: { revenge: 0, fear: 0, confidence: 50 },
    memory: { successfulAudits: 0, failedAudits: 0, revengeTargets: [], acceptedTrades: 0, rejectedTrades: 0 },
    playerModels: {}
  }
};

function runTest(name: string, year: number, targetNw: number, sMean: number, sVar: number, bMean: number, bVar: number) {
  console.log(`\n### ${name}`);
  
  const target: PlayerState = {
    id: "p1", name: "Player 1", isBot: false,
    cash: targetNw - sMean - bMean, bonds: bMean, stocks: sMean,
    year: year, wealthDeclared: false, hasHouse: false
  };

  const state: GameState = {
    id: "g", hostId: "bot", status: "playing",
    players: [bot, target], currentPlayerIndex: 0, turn: 1, year: year, phase: "action",
    settings: { initialWealth: 10, turnTimeLimit: 60, winningWealth: 100, yearEndBonus: 0, houseMarketPrice: 20 }
  };

  bot.botState!.playerModels["p1"] = {
    cash: { mean: target.cash, variance: 0, confidence: 100 },
    bonds: { mean: bMean, variance: bVar, confidence: 100 },
    stocks: { mean: sMean, variance: sVar, confidence: 100 }
  };

  const action: BotAction = { type: "audit", payload: { targetIdx: 1 } };
  const utility = evaluateActionUtility(state, bot, action);
  
  // To get the probability from the log, we can just look at if utility > 0.
  // We can also extract the exact numbers by slightly modifying our bot-engine script to console.log it, or just compute it here.
  const threshold = year <= 2 ? 20 : 40;
  
  const pStocks = sVar <= 0 ? (sMean > threshold ? 1 : 0) : 1 / (1 + Math.exp(-1.702 * ((sMean - threshold) / Math.sqrt(sVar))));
  
  console.log(`Year: ${year}`);
  console.log(`Predicted stocks: ${sMean}L`);
  console.log(`Probability: ${Math.round(pStocks * 100)}%`);
  console.log(`Result: ${utility > 0 ? "AUDIT" : "NO AUDIT"}`);
}

// Scenario 1: Year 2, Player net worth = 29L, Stocks = 8L, Bonds = 5L, Cash = 16L
runTest("Scenario 1", 2, 29, 8, 0, 5, 0);

// Scenario 2: Year 2, Predicted stocks = 27L, Probability = 82% (threshold=20)
// If P = 0.82 => 1 / (1 + exp(-1.702 * z)) = 0.82 => exp(-1.702z) = (1/0.82) - 1 = 1.219 - 1 = 0.219 => -1.702z = ln(0.219) = -1.518 => z = 0.892
// z = (27 - 20) / sqrt(var) = 7 / sqrt(var) = 0.892 => sqrt(var) = 7.84 => var = 61.6
runTest("Scenario 2", 2, 35, 27, 61.6, 5, 0);

// Scenario 3: Year 4, Predicted stocks = 35L
runTest("Scenario 3", 4, 40, 35, 20, 5, 0);

// Scenario 4: Year 4, Predicted stocks = 48L, Probability = 88% (threshold=40)
// If P = 0.88 => 1 / (1 + exp(-1.702z)) = 0.88 => exp(-1.702z) = 0.136 => -1.702z = -1.995 => z = 1.17
// z = (48 - 40) / sqrt(var) = 8 / sqrt(var) = 1.17 => sqrt(var) = 6.83 => var = 46.7
runTest("Scenario 4", 4, 60, 48, 46.7, 5, 0);

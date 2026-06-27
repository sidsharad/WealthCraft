import { evaluateActionUtility } from "../lib/game-engine/bot-engine";
import { PlayerState, GameState, BotState } from "../db/schema";
import { BotAction } from "../lib/game-engine/bot";
import { netWorth } from "../lib/game-engine/actions";

function createBot(id: string, type: any, cash: number, mode: any = "BALANCED"): PlayerState {
  return {
    id, name: id, isBot: true, botType: type,
    cash, bonds: 0, stocks: 0,
    year: 1, wealthDeclared: false, hasHouse: false,
    botState: {
      strategicMode: mode,
      personality: { greed: 50, risk: 50, liquidity: 50, aggression: 50, targetAllocation: { cash: 33, bonds: 33, stocks: 34 } },
      motivations: { revenge: 0, attackLeader: 0 },
      emotions: { revenge: 0, fear: 0, confidence: 50 },
      memory: { successfulAudits: 0, failedAudits: 0, revengeTargets: [], acceptedTrades: 0, rejectedTrades: 0 },
      playerModels: {}
    }
  } as PlayerState;
}

function runScenario(name: string, botNw: number, leaderNw: number, type: any, mode: any = "BALANCED") {
  console.log(`\n### ${name}`);
  
  const bot = createBot("bot", type, botNw, mode);
  const leader = createBot("leader", "DISCIPLINED", leaderNw);
  
  const state: GameState = {
    id: "g", hostId: "bot", status: "playing",
    players: [bot, leader], currentPlayerIndex: 0, turn: 1, year: 1, phase: "action",
    settings: { initialWealth: 10, turnTimeLimit: 60, winningWealth: 100, yearEndBonus: 0, houseMarketPrice: 20 }
  };

  // Populate inference model
  bot.botState!.playerModels["leader"] = {
    cash: { mean: leaderNw, variance: 0, confidence: 100 },
    bonds: { mean: 0, variance: 0, confidence: 100 },
    stocks: { mean: 0, variance: 0, confidence: 100 },
    riskScore: 0, aggressionScore: 0, tradeAcceptanceScore: 0
  };

  const action: BotAction = { type: "tile-action", payload: { targetIdx: 1 } };
  const utility = evaluateActionUtility(state, bot, action, { tileType: "tax-raid" });
  
  console.log(`Result: ${utility > 0 ? "TAX RAID" : "SKIP TAX RAID"}`);
  console.log(`Utility: ${utility}`);
}

runScenario("Scenario A (Bot=96L, Leader=45L, Bull)", 96, 45, "BULL");
runScenario("Scenario B (Bot=70L, Leader=95L, Audit Hawk)", 70, 95, "AUDIT_HAWK");
runScenario("Scenario C (Bot=85L, Leader=98L, Opportunist)", 85, 98, "OPPORTUNIST");
runScenario("Scenario D (Bot=18L cash, Safety Builder)", 18, 50, "SAFETY_BUILDER");
runScenario("Scenario E (Mode=SABOTAGE, Leader=92L, Bot=65L)", 65, 92, "BULL", "SABOTAGE");

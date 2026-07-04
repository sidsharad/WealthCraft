import { getBotDecision, BOT_PROFILES } from '@/lib/game-engine/bot';
import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '@/lib/game-engine/actions';
import type { GameState } from '@/lib/db/schema';

describe('Agentic Bot Engine - Slice 1: Personality & State', () => {
  let state: GameState;

  beforeEach(() => {
    const mockPlayers = [
      { id: "p1", name: "Player 1", avatar: "p1", isBot: false, cash: 10, bonds: 10, stocks: 10, hasHouse: false, jobLossActive: false, position: 0, year: 1, missedTurns: 0, hasTraded: false },
      { id: "bot1", name: "Bot 1", avatar: "b1", isBot: true, botType: "DISCIPLINED", cash: 10, bonds: 10, stocks: 10, hasHouse: false, jobLossActive: false, position: 0, year: 1, missedTurns: 0, hasTraded: false },
      { id: "bot2", name: "Bot 2", avatar: "b2", isBot: true, botType: "BULL", cash: 10, bonds: 10, stocks: 10, hasHouse: false, jobLossActive: false, position: 0, year: 1, missedTurns: 0, hasTraded: false },
      { id: "bot3", name: "Bot 3", avatar: "b3", isBot: true, botType: "SAFETY_BUILDER", cash: 10, bonds: 10, stocks: 10, hasHouse: false, jobLossActive: false, position: 0, year: 1, missedTurns: 0, hasTraded: false }
    ];
    state = createInitialGameState(mockPlayers);
  });

  it('initializes bots with the correct BotState structure', () => {
    const human = state.players.find(p => p.id === 'p1');
    expect(human?.botState).toBeUndefined();
    
    // 1. Bull (was aggressive)
    const bullBot = state.players.find(p => p.id === "bot2");
    expect(bullBot?.botState).toBeDefined();
    expect(bullBot?.botState?.strategicMode).toBe('BALANCED'); // Starts balanced
    expect(bullBot?.botState?.emotions.confidence).toBe(50);
    expect(bullBot?.botState?.memory.successfulAudits).toBe(0);
    
    // Personality check
    expect(bullBot?.botState?.personality.risk).toBe(95);
    expect(bullBot?.botState?.personality.greed).toBe(95);

    // 2. Safety Builder (was defensive)
    const safetyBot = state.players.find(p => p.id === "bot3");
    expect(safetyBot?.botState).toBeDefined();
    expect(safetyBot?.botState?.personality.risk).toBe(10);
    expect(safetyBot?.botState?.personality.greed).toBe(30);
    expect(safetyBot?.botState?.personality.liquidity).toBe(95);
  });

  it('initializes player models for all opponents', () => {
    const bot = state.players.find(p => p.id === 'bot1');
    
    // Should have models for p1 and bot2, but NOT for itself
    expect(bot?.botState?.playerModels['p1']).toBeDefined();
    expect(bot?.botState?.playerModels['bot2']).toBeDefined();
    expect(bot?.botState?.playerModels['bot1']).toBeUndefined();

    // Initial estimates should match starting assets (10L cash, 0 bonds, 0 stocks)
    // with 100% confidence because starting state is public knowledge.
    const humanModel = bot?.botState?.playerModels['p1'];
    expect(humanModel?.cash.mean).toBe(10);
    expect(humanModel?.bonds.mean).toBe(5);
    expect(humanModel?.stocks.mean).toBe(5);
    expect(humanModel?.cash.confidence).toBe(100);
  });
});

import { notifyBotsOfEvent, decayBotConfidence } from '@/lib/game-engine/bot-engine';

describe('Agentic Bot Engine - Slice 2: Observation & Inference', () => {
  let state: GameState;
  
  beforeEach(() => {
    const mockPlayers = [
      { id: 'p1', name: 'Human', avatar: '', isBot: false },
      { id: 'bot1', name: 'Bot', avatar: '', isBot: true, botType: 'aggressive' },
    ];
    state = createInitialGameState(mockPlayers);
  });

  it('updates estimates when an IPO is observed', () => {
    // IPO ₹5L -> +10L Stocks, -5L Cash, 100% confidence
    const newState = notifyBotsOfEvent(state, state, { type: 'IPO', playerId: 'p1', amount: 5 });
    
    const bot = newState.players.find(p => p.id === 'bot1');
    const model = bot?.botState?.playerModels['p1'];
    
    expect(model?.cash.mean).toBeLessThanOrEqual(5);
    expect(model?.stocks.mean).toBeGreaterThan(0);
    expect(model?.stocks.variance).toBe(0);
    expect(model?.cash.variance).toBe(0);
  });

  it('updates estimates correctly for Year-End Return', () => {
    let bot = state.players.find(p => p.id === 'bot1')!;
    bot.botState!.playerModels['p1'].bonds.mean = 15;
    bot.botState!.playerModels['p1'].stocks.mean = 35;
    bot.botState!.playerModels['p1'].bonds.variance = 60;
    bot.botState!.playerModels['p1'].stocks.variance = 60;

    // Observe a return of 3 bonds and 7 stocks (3*5 = 15L bonds, 7*5 = 35L stocks).
    const newState = notifyBotsOfEvent(state, state, { type: 'YEAR_END_RETURN', playerId: 'p1', bondReturn: 3, stockReturn: 7 });
    
    bot = newState.players.find(p => p.id === 'bot1')!;
    const model = bot.botState?.playerModels['p1'];

    expect(model?.bonds.mean).toBe(15);
    expect(model?.stocks.mean).toBe(35);
    expect(model?.stocks.variance).toBe(30);
  });

  it('decays confidence every turn', () => {
    let bot = state.players.find(p => p.id === 'bot1');
    let model = bot?.botState?.playerModels['p1'];
    model!.cash.variance = 1.0;
    model!.bonds.variance = 1.0;
    model!.stocks.variance = 1.0;
    
    const newState = decayBotConfidence(state);
    
    bot = newState.players.find(p => p.id === 'bot1');
    model = bot?.botState?.playerModels['p1'];
    
    // Initial was 1.0
    expect(model?.cash.variance).toBe(1.05);
    expect(model?.bonds.variance).toBe(1.05);
    expect(model?.stocks.variance).toBe(1.05);
  });
});

describe('Agentic Bot Engine - Slice 3: Memory & Emotions', () => {
  let state: GameState;
  
  beforeEach(() => {
    const mockPlayers = [
      { id: 'p1', name: 'Human', avatar: '', isBot: false },
      { id: 'bot1', name: 'Bot', avatar: '', isBot: true, botType: 'aggressive' },
    ];
    state = createInitialGameState(mockPlayers);
  });

  it('updates emotions and memory on a successful audit', () => {
    // If bot1 successfully audits p1
    const newState = notifyBotsOfEvent(state, state, { type: 'SUCCESSFUL_AUDIT', playerId: 'p1', auditorId: 'bot1', assetConfiscated: 'cash', amount: 10 });
    
    const bot = newState.players.find(p => p.id === 'bot1')!;
    
    expect(bot.botState?.memory.successfulAudits).toBe(1);
    expect(bot.botState?.emotions.confidence).toBe(70); // 50 start + 20
  });

  it('updates emotions and memory on a failed audit', () => {
    // If bot1 fails an audit against p1
    const newState = notifyBotsOfEvent(state, state, { type: 'FAILED_AUDIT', playerId: 'p1', auditorId: 'bot1' });
    
    const bot = newState.players.find(p => p.id === 'bot1')!;
    
    // We just test that the test doesn't crash since FAILED_AUDIT is no longer updating emotions directly.
    // We can just verify the memory.
    expect(bot.botState?.memory.failedAudits).toBe(1);
  });

  it('generates revenge targets when audited by an opponent', () => {
    // If p1 successfully audits bot1
    const newState = notifyBotsOfEvent(state, state, { type: 'SUCCESSFUL_AUDIT', playerId: 'bot1', auditorId: 'p1', assetConfiscated: 'cash', amount: 10 });
    
    const bot = newState.players.find(p => p.id === 'bot1')!;
    
    expect(bot.botState?.emotions.revenge).toBe(40); // 0 + 40
    expect(bot.botState?.memory.revengeTargets).toContain('p1');
  });

  it('records trade acceptance and rejection', () => {
    let newState = notifyBotsOfEvent(state, state, { type: 'TRADE_ACCEPTED', proposerId: 'bot1', responderId: 'p1' });
    newState = notifyBotsOfEvent(newState, newState, { type: 'TRADE_REJECTED', proposerId: 'bot1', responderId: 'p1' });
    
    const bot = newState.players.find(p => p.id === 'bot1')!;
    
    expect(bot.botState?.memory.acceptedTrades).toBe(1);
    expect(bot.botState?.memory.rejectedTrades).toBe(1);
  });
});




describe('Agentic Bot Engine - V6.0 Strategic Priority & Humanization Engine', () => {
  let state: GameState;

  beforeEach(() => {
    const mockPlayers = [
      { id: "p1", name: "Player 1", avatar: "p1", isBot: false, cash: 20, bonds: 20, stocks: 20, hasHouse: false, jobLossActive: false, position: 0, year: 1, missedTurns: 0, hasTraded: false },
      { id: "bull", name: "Bull", avatar: "b1", isBot: true, botType: "BULL", cash: 20, bonds: 20, stocks: 20, hasHouse: false, jobLossActive: false, position: 0, year: 1, missedTurns: 0, hasTraded: false },
      { id: "disciplined", name: "Disc", avatar: "b2", isBot: true, botType: "DISCIPLINED", cash: 20, bonds: 20, stocks: 20, hasHouse: false, jobLossActive: false, position: 0, year: 1, missedTurns: 0, hasTraded: false },
      { id: "hawk", name: "Hawk", avatar: "b3", isBot: true, botType: "AUDIT_HAWK", cash: 20, bonds: 20, stocks: 20, hasHouse: false, jobLossActive: false, position: 0, year: 1, missedTurns: 0, hasTraded: false },
      { id: "safe", name: "Safe", avatar: "b4", isBot: true, botType: "SAFETY_BUILDER", cash: 15, bonds: 20, stocks: 20, hasHouse: false, jobLossActive: false, position: 0, year: 1, missedTurns: 0, hasTraded: false },
      { id: "property", name: "Prop", avatar: "b5", isBot: true, botType: "PROPERTY_BUILDER", cash: 20, bonds: 20, stocks: 20, hasHouse: false, jobLossActive: false, position: 0, year: 1, missedTurns: 0, hasTraded: false }
    ];
    state = createInitialGameState(mockPlayers);
    // Initialize models
    for (let i = 1; i < state.players.length; i++) {
        const bot = state.players[i];
        if (bot.botState) {
            bot.botState.memory.auditBudget = { attempted: 0, succeeded: 0, failed: 0 };
            bot.botState.memory.auditBudgetYear = 1;
            bot.botState.tilt = 0;
            bot.botState.recentFailures = 0;
            bot.botState.regrets = [];
           for (const p of state.players) {
               if (p.id !== bot.id) {
                   bot.botState.playerModels[p.id] = {
                       cash: { mean: p.cash, confidence: 100, variance: 0, lowerBound: p.cash, upperBound: p.cash, source: "INITIAL" },
                       bonds: { mean: p.bonds, confidence: 100, variance: 0, lowerBound: p.bonds, upperBound: p.bonds, source: "INITIAL" },
                       stocks: { mean: p.stocks, confidence: 100, variance: 0, lowerBound: p.stocks, upperBound: p.stocks, source: "INITIAL" },
                       property: { hasHouse: false, houseValue: 0 },
                       hypotheses: [],
                       hiddenWealth: 0,
                       visibilityScore: 100,
                       suspicionScore: 0,
                       lastObservedTurn: 0,
                       reconciliationHistory: [],
                       riskScore: 50,
                       aggressionScore: 50,
                       tradeAcceptanceScore: 50
                   };
               }
           }
        }
    }
  });

  it('Bull never voluntarily sells stocks', () => {
    state.phase = "trade";
    const bullIdx = 1;
    const action = getBotDecision(state, bullIdx);
    
    // In V6, if it rebalances, it should not sell stocks
    if (action.type === "rebalance") {
        expect(action.payload.stocksAmount).toBeGreaterThanOrEqual(20);
    }
  });

  it('Hawk stops auditing after repeated failures', () => {
    state.phase = "trade";
    const hawkIdx = 3;
    const hawk = state.players[hawkIdx];
    
    // Simulate failed audits exhausted
    hawk.botState!.memory.auditBudget.attempted = 3;
    hawk.botState!.memory.auditBudget.failed = 3;
    
    const action = getBotDecision(state, hawkIdx);
    // Should pass, or do anything except audit since budget is exhausted
    expect(action.type).not.toBe("audit");
  });

  it('Safe never violates 15L floor', () => {
    state.phase = "action";
    const safeIdx = 4;
    const safe = state.players[safeIdx];
    
    // Simulate landing on IPO which costs up to 5L
    safe.position = 5; // Suppose tile 5 is IPO. getTileByPosition(5) is "ipo" in test context usually.
    // If it's IPO, it shouldn't buy if cash drops below 15L. Safe has exactly 15L cash here.
    
    // Force IPO effect manually if tile is mocked or wait for natural generation
    // We just call it and ensure payload.amount (if IPO) doesn't reduce cash below 15.
    const action = getBotDecision(state, safeIdx);
    if (action.type === "tile-action" && action.payload && action.payload.amount !== undefined) {
        expect(safe.cash - action.payload.amount).toBeGreaterThanOrEqual(15);
    }
  });

  it('No EV<0 actions are selected unless overridden', () => {
    state.phase = "trade";
    const safeIdx = 4;
    
    const action = getBotDecision(state, safeIdx);
    
    if (action.type !== "skip" && action.type !== "end-turn") {
        expect(action.debug?.decisionTree).toBeDefined();
        // Safe builder has low risk tolerance, EV must be >= 0
        const chosenDebug = action.debug!.decisionTree.candidateActions.find((c: any) => c.action === action.type);
        expect(chosenDebug?.ev).toBeGreaterThanOrEqual(0);
    }
  });

  it('No repeated audits on the same target', () => {
    state.phase = "trade";
    const hawkIdx = 3;
    const hawk = state.players[hawkIdx];
    
    // Insert SUCCESSFUL audit into memory
    hawk.botState!.memory.auditMemory["p1_cash"] = {
        targetPlayerId: "p1",
        asset: "cash",
        auditTurn: 1,
        outcome: "SUCCESS",
        thresholdUsed: 20,
        lockedEstimate: { lowerBound: 20, upperBound: 20, confidence: 100, variance: 0, mean: 20 }
    };
    
    const action = getBotDecision(state, hawkIdx);
    if (action.type === "audit") {
        const payload = action.payload as any;
        expect(`${state.players[payload.targetIdx].id}_${payload.targetAsset}`).not.toBe("p1_cash");
    }
  });

  it('Decision trees are generated and attached to final action', () => {
    state.phase = "trade";
    const bullIdx = 1;
    const action = getBotDecision(state, bullIdx);
    
    expect(action.debug).toBeDefined();
    expect(action.debug!.decisionTree).toBeDefined();
    expect(action.debug!.decisionTree.priority).toBeDefined();
    expect(action.debug!.decisionTree.chosen).toBe(action.type);
    expect(action.debug!.decisionTree.reason).toContain("utility");
  });

  it('Personality is preserved and prevents bankruptcy', () => {
    state.phase = "trade";
    const bullIdx = 1;
    const bull = state.players[bullIdx];
    
    // Simulate near bankruptcy
    bull.cash = 1;
    
    const action = getBotDecision(state, bullIdx);
    if (action.type === "tile-action" && action.payload?.amount !== undefined) {
        expect(bull.cash - action.payload.amount).toBeGreaterThanOrEqual(0);
    }
  });

});

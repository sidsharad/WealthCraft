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
    expect(humanModel?.bonds.mean).toBe(0);
    expect(humanModel?.stocks.mean).toBe(0);
    expect(humanModel?.cash.confidence).toBe(20);
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
    const newState = notifyBotsOfEvent(state, { type: 'IPO', playerId: 'p1', amount: 5 });
    
    const bot = newState.players.find(p => p.id === 'bot1');
    const model = bot?.botState?.playerModels['p1'];
    
    expect(model?.cash.mean).toBe(5); // 10L start - 5L
    expect(model?.stocks.mean).toBe(10);
    expect(model?.stocks.variance).toBe(50);
    expect(model?.cash.variance).toBe(50);
  });

  it('updates estimates correctly for Year-End Return', () => {
    let bot = state.players.find(p => p.id === 'bot1')!;
    bot.botState!.playerModels['p1'].bonds.mean = 15;
    bot.botState!.playerModels['p1'].stocks.mean = 35;
    bot.botState!.playerModels['p1'].bonds.variance = 60;
    bot.botState!.playerModels['p1'].stocks.variance = 60;

    // Observe a return of 17L. 
    // 17L = (B/5)*1 + (S/5)*2
    // If B=15 -> 3L, so we need 14L from S -> S=35.
    // This perfectly matches the current estimate, so the closest search should lock onto B=15, S=35.
    const newState = notifyBotsOfEvent(state, { type: 'YEAR_END_RETURN', playerId: 'p1', returnAmount: 17 });
    
    bot = newState.players.find(p => p.id === 'bot1')!;
    const model = bot.botState?.playerModels['p1'];

    expect(model?.bonds.mean).toBe(15);
    expect(model?.stocks.mean).toBe(35);
    expect(model?.bonds.variance).toBe(24); // 60 * 0.4
    expect(model?.stocks.variance).toBe(24);
  });

  it('decays confidence every turn', () => {
    const newState = decayBotConfidence(state);
    
    const bot = newState.players.find(p => p.id === 'bot1');
    const model = bot?.botState?.playerModels['p1'];
    
    // Initial was 100
    expect(model?.cash.variance).toBe(105); // 100 * 1.05
    expect(model?.bonds.variance).toBe(105);
    expect(model?.stocks.variance).toBe(105);
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
    const newState = notifyBotsOfEvent(state, { type: 'SUCCESSFUL_AUDIT', playerId: 'p1', auditorId: 'bot1', assetConfiscated: 'cash', amount: 10 });
    
    const bot = newState.players.find(p => p.id === 'bot1')!;
    
    expect(bot.botState?.memory.successfulAudits).toBe(1);
    expect(bot.botState?.emotions.confidence).toBe(70); // 50 start + 20
  });

  it('updates emotions and memory on a failed audit', () => {
    // If bot1 fails an audit against p1
    const newState = notifyBotsOfEvent(state, { type: 'FAILED_AUDIT', playerId: 'p1', auditorId: 'bot1' });
    
    const bot = newState.players.find(p => p.id === 'bot1')!;
    
    // We just test that the test doesn't crash since FAILED_AUDIT is no longer updating emotions directly.
    // We can just verify the memory.
    expect(bot.botState?.memory.failedAudits).toBe(1);
  });

  it('generates revenge targets when audited by an opponent', () => {
    // If p1 successfully audits bot1
    const newState = notifyBotsOfEvent(state, { type: 'SUCCESSFUL_AUDIT', playerId: 'bot1', auditorId: 'p1', assetConfiscated: 'cash', amount: 10 });
    
    const bot = newState.players.find(p => p.id === 'bot1')!;
    
    expect(bot.botState?.emotions.revenge).toBe(40); // 0 + 40
    expect(bot.botState?.memory.revengeTargets).toContain('p1');
  });

  it('records trade acceptance and rejection', () => {
    let newState = notifyBotsOfEvent(state, { type: 'TRADE_ACCEPTED', proposerId: 'bot1', responderId: 'p1' });
    newState = notifyBotsOfEvent(newState, { type: 'TRADE_REJECTED', proposerId: 'bot1', responderId: 'p1' });
    
    const bot = newState.players.find(p => p.id === 'bot1')!;
    
    expect(bot.botState?.memory.acceptedTrades).toBe(1);
    expect(bot.botState?.memory.rejectedTrades).toBe(1);
  });
});

import { evaluateActionUtility } from '@/lib/game-engine/bot-engine';
import { BotAction } from '@/lib/game-engine/bot';

describe('Agentic Bot Engine - Slice 4: Utility Scoring Engine', () => {
  let state: GameState;
  
  beforeEach(() => {
    const mockPlayers = [
      { id: 'p1', name: 'Human', avatar: '', isBot: false },
      { id: 'bot1', name: 'Bot', avatar: '', isBot: true, botType: 'aggressive' },
    ];
    state = createInitialGameState(mockPlayers);
  });

  it('calculates utility score taking personality and emotions into account', () => {
    const bot = state.players.find(p => p.id === 'bot1')!;
    
    // An aggressive bot evaluating an IPO
    const ipoAction: BotAction = { type: 'tile-action', payload: { amount: 5 } };
    const score = evaluateActionUtility(state, bot, ipoAction, { tileType: 'ipo' });
    
    // Should return a positive score for an aggressive bot (high risk/greed)
    expect(score).toBeGreaterThan(0);
  });

  it('penalizes liquidity drain for defensive bots', () => {
    // Switch bot to defensive
    let bot = state.players.find(p => p.id === 'bot1')!;
    bot.botType = 'defensive';
    bot.botState!.personality = { risk: 10, greed: 30, aggression: 20, liquidity: 95, sociability: 50 };
    bot.cash = 6; // Very low cash
    
    const ipoAction: BotAction = { type: 'tile-action', payload: { amount: 5 } };
    const score = evaluateActionUtility(state, bot, ipoAction, { tileType: 'ipo' });
    
    // A defensive bot with 6L cash trying to spend 5L on an IPO should get a massive liquidity penalty
    expect(score).toBeLessThan(0);
  });
});

describe('Agentic Bot Engine - Slice 5: Audit Decision Engine', () => {
  let state: GameState;
  
  beforeEach(() => {
    const mockPlayers = [
      { id: 'p1', name: 'Human', avatar: '', isBot: false },
      { id: 'bot1', name: 'Bot', avatar: '', isBot: true, botType: 'aggressive' },
    ];
    state = createInitialGameState(mockPlayers);
  });

  it('calculates expected value for an audit based on inferred portfolios', () => {
    let bot = state.players.find(p => p.id === 'bot1')!;
    
    // Manually set inference: target has 60L stocks, 100% confidence (variance = 0)
    bot.botState!.playerModels['p1'].stocks.mean = 60;
    bot.botState!.playerModels['p1'].stocks.variance = 0;
    
    const auditAction: BotAction = { 
      type: 'audit', 
      payload: { targetPlayerId: 'p1', targetAsset: 'stocks' } 
    };
    
    const score = evaluateActionUtility(state, bot, auditAction);
    
    // EV = (1.0 * 20L excess) - 0 = 20. strategicBenefit = 40.
    // personalityAlignment for aggressive bot = aggression (40)
    // score = 40 + 40 - 0 - 0 = 80
    expect(score).toBeGreaterThan(50);
  });

  it('inflates audit score if target is a revenge target', () => {
    let bot = state.players.find(p => p.id === 'bot1')!;
    
    // Low EV target
    bot.botState!.playerModels['p1'].stocks.mean = 40;
    bot.botState!.playerModels['p1'].stocks.variance = 0;
    
    const auditAction: BotAction = { 
      type: 'audit', 
      payload: { targetPlayerId: 'p1', targetAsset: 'stocks' } 
    };
    
    const baseScore = evaluateActionUtility(state, bot, auditAction);
    
    // Make target a revenge target
    bot.botState!.memory.revengeTargets.push('p1');
    bot.botState!.emotions.revenge = 50;
    
    const revengeScore = evaluateActionUtility(state, bot, auditAction);
    
    expect(revengeScore).toBeGreaterThan(baseScore);
  });
});

import { getYearEndOptimizationTrade } from '@/lib/game-engine/bot-engine';

describe('Agentic Bot Engine - Slice 6: Trade Engine & Year-End Optimization', () => {
  let state: GameState;
  
  beforeEach(() => {
    const mockPlayers = [
      { id: 'p1', name: 'Human', avatar: '', isBot: false },
      { id: 'bot1', name: 'Bot', avatar: '', isBot: true, botType: 'aggressive' },
    ];
    state = createInitialGameState(mockPlayers);
  });

  it('calculates portfolio deficit and generates a trade offer before rebalancing', () => {
    let bot = state.players.find(p => p.id === 'bot1')!;
    
    // Aggressive Bull Investor wants: 80% stocks, 10% bonds, 10% cash.
    // Let's give them 50L Net Worth: 40L cash, 10L bonds, 0 stocks.
    // Target for 50L NW: 5L cash, 5L bonds, 40L stocks.
    // Deficit: wants 40L stocks.
    // Surplus: has 35L extra cash, 5L extra bonds.
    bot.cash = 40;
    bot.bonds = 10;
    bot.stocks = 0;
    
    // We infer the human has 40L stocks (so we can trade with them)
    bot.botState!.playerModels['p1'].stocks.mean = 40;
    
    const trade = getYearEndOptimizationTrade(state, bot);
    
    expect(trade).not.toBeNull();
    expect(trade?.toPlayerId).toBe('p1');
    expect(trade?.request.stocks).toBeGreaterThan(0);
    // Should offer cash for stocks
    expect(trade?.request.stocks).toBeGreaterThan(0);
    // Should offer cash for stocks
    expect(trade?.offer.cash).toBeGreaterThan(0);
  });
});

import { updateStrategicMode } from '@/lib/game-engine/bot-engine';

describe('Agentic Bot Engine - Slice 7: Strategy Transitions', () => {
  let state: GameState;
  
  beforeEach(() => {
    const mockPlayers = [
      { id: 'p1', name: 'Human', avatar: '', isBot: false },
      { id: 'bot1', name: 'Bot', avatar: '', isBot: true, botType: 'aggressive' },
    ];
    state = createInitialGameState(mockPlayers);
  });

  it('switches to ENDGAME when net worth is >= 90L', () => {
    let bot = state.players.find(p => p.id === 'bot1')!;
    bot.cash = 100; // NW = 100L
    
    const newState = updateStrategicMode(state);
    bot = newState.players.find(p => p.id === 'bot1')!;
    
    expect(bot.botState?.strategicMode).toBe('ENDGAME');
  });

  it('switches to RECOVERY when cash is below 5L', () => {
    let bot = state.players.find(p => p.id === 'bot1')!;
    bot.cash = 4;
    
    const newState = updateStrategicMode(state);
    bot = newState.players.find(p => p.id === 'bot1')!;
    
    expect(bot.botState?.strategicMode).toBe('RECOVERY');
  });

  it('switches to AGGRESSIVE when trailing leader by > 25L', () => {
    let p1 = state.players.find(p => p.id === 'p1')!;
    p1.cash = 50; // Human has 50L
    
    let bot = state.players.find(p => p.id === 'bot1')!;
    bot.cash = 20; // Bot has 20L. Difference = 30L.
    
    const newState = updateStrategicMode(state);
    bot = newState.players.find(p => p.id === 'bot1')!;
    
    expect(bot.botState?.strategicMode).toBe('AGGRESSIVE');
  });

  it('switches to DEFENSIVE when leading by > 15L', () => {
    let p1 = state.players.find(p => p.id === 'p1')!;
    p1.cash = 10;
    
    let bot = state.players.find(p => p.id === 'bot1')!;
    bot.cash = 30; // Lead = 20L
    
    const newState = updateStrategicMode(state);
    bot = newState.players.find(p => p.id === 'bot1')!;
    
    expect(bot.botState?.strategicMode).toBe('DEFENSIVE');
  });
});

describe('Agentic Bot Engine - Slice 9: Bot Explanation Engine', () => {
  let state: GameState;
  
  beforeEach(() => {
    const mockPlayers = [
      { id: 'p1', name: 'Human', avatar: '', isBot: false },
      { id: 'bot1', name: 'Bot', avatar: '', isBot: true, botType: 'aggressive' },
    ];
    state = createInitialGameState(mockPlayers);
  });

  it('generates an explanation payload attached to actions', () => {
    let bot = state.players.find(p => p.id === 'bot1')!;
    
    // Use selectActionDeterministically to ensure payload is generated properly
    const scoredActions = [
      { action: { type: 'audit' as const, payload: { targetPlayerId: 'p1', targetAsset: 'stocks' } }, score: 92 },
      { action: { type: 'ipo' as const }, score: 40 }
    ];
    
    const action = selectActionDeterministically(state, bot, scoredActions);
    
    expect(action.debug?.mode).toBe('BALANCED');
    expect(action.debug?.selectedAction).toBe('audit');
    expect(action.debug?.score).toBe(92);
    expect(action.debug?.candidateActions?.length).toBe(2);
    expect(action.debug?.whyNot?.length).toBe(1);
    expect(action.debug?.inferences?.length).toBe(3);
  });
});


import { seededRandom, selectActionDeterministically } from '@/lib/game-engine/bot-engine';

describe('Agentic Bot Engine - Slice 8: Seeded Randomness', () => {
  let state: GameState;
  
  beforeEach(() => {
    const mockPlayers = [
      { id: 'p1', name: 'Human', avatar: '', isBot: false },
      { id: 'bot1', name: 'Bot', avatar: '', isBot: true, botType: 'aggressive' },
    ];
    state = createInitialGameState(mockPlayers);
  });

  it('generates consistent pseudo-random numbers given a seed', () => {
    const seed = 12345;
    const result1 = seededRandom(seed);
    const result2 = seededRandom(seed);
    
    expect(result1).toBe(result2);
    expect(result1).toBeGreaterThanOrEqual(0);
    expect(result1).toBeLessThan(1);
  });

  it('deterministically selects an action from a scored list', () => {
    const bot = state.players.find(p => p.id === 'bot1')!;
    const actions = [
      { action: { type: 'audit' as const }, score: 100 }, // best
      { action: { type: 'tile-action' as const }, score: 80 }, // second
      { action: { type: 'skip' as const }, score: 20 } // third
    ];
    
    // We expect the function to return the same action repeatedly
    const selection1 = selectActionDeterministically(state, bot, actions);
    const selection2 = selectActionDeterministically(state, bot, actions);
    
    expect(selection1.type).toBe(selection2.type);
    
    // Also, it should pick the best one in 90% of cases (statistically),
    // but deterministically for this seed.
  });
});








import type { GameState, BotState, PlayerState, TradeOffer } from "../db/schema";
import { countBlocks, netWorth } from "./actions";
import { BotAction } from "./bot";

export type ObservationEvent =
  | { type: "IPO"; playerId: string; amount: number }
  | { type: "STOCK_RALLY"; playerId: string; gain: number }
  | { type: "STOCK_CRASH"; playerId: string; loss: number }
  | { type: "MARKET_RALLY"; playerId: string; gain: number }
  | { type: "MARKET_CRASH"; playerId: string; loss: number }
  | { type: "PUBLIC_TRADE"; playerId: string; cashDiff: number; bondDiff: number; stockDiff: number }
  | { type: "PUBLIC_REBALANCE"; playerId: string; cashDiff: number; bondDiff: number; stockDiff: number }
  | { type: "SUCCESSFUL_AUDIT"; playerId: string; auditorId: string; assetConfiscated: "cash" | "bonds" | "stocks"; amount: number }
  | { type: "FAILED_AUDIT"; playerId: string; auditorId: string }
  | { type: "YEAR_END_RETURN"; playerId: string; bondReturn: number; stockReturn: number }
  | { type: "TRADE_ACCEPTED"; proposerId: string; responderId: string }
  | { type: "TRADE_REJECTED"; proposerId: string; responderId: string };

/**
 * Notifies all bots in the game of a public event so they can update their portfolio inferences.
 * This is a pure function that returns the modified GameState.
 */
export function notifyBotsOfEvent(state: GameState, event: ObservationEvent): GameState {
  let newState = { ...state };
  
  // Create a new array of players to ensure immutability
  const updatedPlayers = state.players.map((botPlayer) => {
    // Only bots observe events
    if (!botPlayer.isBot || !botPlayer.botState) return botPlayer;
    
    const newBotState: BotState = JSON.parse(JSON.stringify(botPlayer.botState));
    
    // Process emotional & memory events (these apply even if the bot is involved)
    if (event.type === "SUCCESSFUL_AUDIT") {
      if (event.auditorId === botPlayer.id) {
        newBotState.memory.successfulAudits++;
        newBotState.emotions.confidence = Math.min(100, newBotState.emotions.confidence + 20);
      } else if (event.playerId === botPlayer.id) {
        newBotState.emotions.revenge = Math.min(100, newBotState.emotions.revenge + 40);
        if (!newBotState.memory.revengeTargets.includes(event.auditorId)) {
          newBotState.memory.revengeTargets.push(event.auditorId);
        }
      }
    } else if (event.type === "FAILED_AUDIT") {
      if (event.auditorId === botPlayer.id) {
        newBotState.memory.failedAudits++;
        newBotState.emotions.fear = Math.min(100, newBotState.emotions.fear + 10);
      } else if (event.playerId === botPlayer.id) {
        // Being targeted by a failed audit still generates some revenge
        newBotState.emotions.revenge = Math.min(100, newBotState.emotions.revenge + 20);
        if (!newBotState.memory.revengeTargets.includes(event.auditorId)) {
          newBotState.memory.revengeTargets.push(event.auditorId);
        }
      }
    } else if (event.type === "TRADE_ACCEPTED") {
      if (event.proposerId === botPlayer.id || event.responderId === botPlayer.id) {
        newBotState.memory.acceptedTrades++;
      }
    } else if (event.type === "TRADE_REJECTED") {
      if (event.proposerId === botPlayer.id || event.responderId === botPlayer.id) {
        newBotState.memory.rejectedTrades++;
      }
    }

    // Bots don't need to infer their own portfolio (they know it)
    if ("playerId" in event && botPlayer.id === event.playerId) return { ...botPlayer, botState: newBotState };

    const playerId = "playerId" in event ? event.playerId : undefined;
    if (!playerId) return { ...botPlayer, botState: newBotState };
    const model = newBotState.playerModels[playerId];
    if (!model) return { ...botPlayer, botState: newBotState };

    const clampConf = (v: number) => Math.max(0, Math.min(100, 100 - v));

    // 1. Process specific event types
    switch (event.type) {
      case "IPO":
        model.stocks.mean += (event.amount * 2);
        model.cash.mean = Math.max(0, model.cash.mean - event.amount);
        model.stocks.variance *= 0.5;
        model.cash.variance *= 0.5;
        break;

      case "STOCK_RALLY":
        model.stocks.mean = event.gain * 2.5;
        model.stocks.variance *= 0.7;
        break;

      case "STOCK_CRASH":
        model.stocks.mean = event.loss * 2.5;
        model.stocks.variance *= 0.6;
        break;

      case "MARKET_RALLY":
        model.stocks.mean += (event.gain * 5 / 3);
        model.stocks.variance *= 0.8;
        break;

      case "MARKET_CRASH":
        model.stocks.mean = Math.max(0, model.stocks.mean - (event.loss * 5 / 3));
        model.stocks.variance *= 0.8;
        break;

      case "PUBLIC_TRADE":
        model.cash.mean += event.cashDiff;
        model.bonds.mean += event.bondDiff;
        model.stocks.mean += event.stockDiff;
        model.cash.variance *= 0.25;
        model.bonds.variance *= 0.25;
        model.stocks.variance *= 0.25;
        break;
        
      case "PUBLIC_REBALANCE":
        model.cash.mean += event.cashDiff;
        model.bonds.mean += event.bondDiff;
        model.stocks.mean += event.stockDiff;
        model.cash.variance *= 0.3;
        model.bonds.variance *= 0.3;
        model.stocks.variance *= 0.3;
        break;

      case "SUCCESSFUL_AUDIT":
        if (event.assetConfiscated === "cash") {
          model.cash.mean = 40;
          model.cash.variance *= 0.1;
        } else if (event.assetConfiscated === "bonds") {
          model.bonds.mean = 40;
          model.bonds.variance *= 0.1;
        } else if (event.assetConfiscated === "stocks") {
          model.stocks.mean = 40;
          model.stocks.variance *= 0.1;
        }
        break;

      case "YEAR_END_RETURN":
        model.bonds.mean = event.bondReturn * 5;
        model.bonds.variance *= 0.5;
        
        if (event.stockReturn !== undefined) {
          model.stocks.mean = event.stockReturn * 5;
          model.stocks.variance *= 0.5;
        }
        break;
    }

    // Recalculate human-readable confidence
    model.cash.confidence = clampConf(model.cash.variance);
    model.bonds.confidence = clampConf(model.bonds.variance);
    model.stocks.confidence = clampConf(model.stocks.variance);

    return { ...botPlayer, botState: newBotState };
  });

  newState.players = updatedPlayers;
  return newState;
}

/**
 * Applies confidence decay to all bot player models. Called once per turn transition.
 */
export function decayBotConfidence(state: GameState): GameState {
  const updatedPlayers = state.players.map((botPlayer) => {
    if (!botPlayer.isBot || !botPlayer.botState) return botPlayer;
    const newBotState: BotState = JSON.parse(JSON.stringify(botPlayer.botState));
    
    const clampConf = (v: number) => Math.max(0, Math.min(100, 100 - v));

    for (const model of Object.values(newBotState.playerModels)) {
      model.cash.variance *= 1.05;
      model.bonds.variance *= 1.05;
      model.stocks.variance *= 1.05;
      
      model.cash.confidence = clampConf(model.cash.variance);
      model.bonds.confidence = clampConf(model.bonds.variance);
      model.stocks.confidence = clampConf(model.stocks.variance);
    }
    
    return { ...botPlayer, botState: newBotState };
  });

  return { ...state, players: updatedPlayers };
}

/**
 * Calculates the utility score of an action for a bot.
 * score = winningProbability + strategicBenefit + personalityAlignment + emotionalBias - risk - liquidityPenalty;
 */
export function evaluateActionUtility(
  state: GameState,
  bot: PlayerState,
  action: BotAction,
  context?: { tileType?: string; cost?: number }
): number {
  if (!bot.botState) return 0;
  
  const b = bot.botState;
  let score = 0;
  
  // 1. Liquidity Management
  // Calculate cash remaining after action
  const cost = context?.cost || (action.payload?.amount as number) || 0;
  const remainingCash = bot.cash - cost;
  
  let liquidityPenalty = 0;
  if (remainingCash < 5) {
    liquidityPenalty = (5 - remainingCash) * (b.personality.liquidity / 10);
  } else if (remainingCash > 20) {
    liquidityPenalty = -((remainingCash - 20) * ((100 - b.personality.liquidity) / 20));
  }
  
  let winningProbability = 0;
  let strategicBenefit = 0;
  let personalityAlignment = 0;
  let motivationBias = 0;
  let emotionBias = 0;
  let risk = 0;

  // Basic alignment & risk for generic actions
  if (action.type === "tile-action" && context?.tileType === "ipo") {
    personalityAlignment = (b.personality.greed * 0.5) + (b.personality.risk * 0.5);
    risk = 20 * (100 - b.personality.risk) / 100;
    strategicBenefit = 10;
    if (b.strategicMode === "EXPANSION") strategicBenefit += 20;
    winningProbability += 5;
  }
  
  if (action.type === "tile-action" && context?.tileType === "tax-raid") {
    const targetIdx = action.payload?.targetIdx as number | undefined;
    if (targetIdx !== undefined) {
      const targetPlayer = state.players[targetIdx];
      const targetId = targetPlayer.id;

      // 1. Identify Leader
      const allNetWorths = state.players.map(p => {
         if (p.id === bot.id) return { id: p.id, nw: netWorth(p) };
         const model = b.playerModels[p.id];
         if (!model) return { id: p.id, nw: 0 };
         return { id: p.id, nw: model.cash.mean + model.bonds.mean + model.stocks.mean };
      });
      const maxNw = Math.max(...allNetWorths.map(p => p.nw));
      const leader = allNetWorths.find(p => p.nw === maxNw)!;

      // 7. Self Protection Logic
      if (bot.cash < 2) return -9999;
      
      const botNw = netWorth(bot);
      const sortedNw = [...allNetWorths].sort((a, b) => b.nw - a.nw);
      const secondPlaceNw = sortedNw[0].id === bot.id ? sortedNw[1]?.nw || 0 : sortedNw[0].nw;
      if (botNw > secondPlaceNw + 15) return -9999;

      // 2. Relative Gain
      const relativeGain = 3;

      // 3. Win Probability Change
      const winProb = (nwMap: Record<string, number>) => {
          const myNw = nwMap[bot.id];
          const mNw = Math.max(...Object.values(nwMap));
          if (mNw === 0) return 0;
          return myNw / mNw;
      };

      const nwBefore = Object.fromEntries(allNetWorths.map(p => [p.id, p.nw]));
      const nwAfter = { ...nwBefore };
      nwAfter[bot.id] -= 2;
      nwAfter[targetId] -= 5;

      const probBefore = winProb(nwBefore);
      const probAfter = winProb(nwAfter);
      const deltaWinProbability = probAfter - probBefore;

      if (deltaWinProbability <= 0) return -9999;

      // 4. Personality Modifiers
      let personalityBias = 0;
      switch (bot.botType) {
          case "BULL":
              personalityBias = 0;
              if (leader.nw < 90) return -9999;
              break;
          case "DISCIPLINED":
              personalityBias = 10;
              break;
          case "AUDIT_HAWK":
              personalityBias = 50;
              if (targetId === leader.id) personalityBias += 50;
              break;
          case "OPPORTUNIST":
              if (leader.nw <= 80 && (100 - leader.nw) >= 15) return -9999;
              personalityBias = 20;
              break;
          case "SAFETY_BUILDER":
              if (bot.cash < 20) return -9999;
              personalityBias = -40;
              break;
          case "PROPERTY_BUILDER":
              personalityBias = 30;
              if (targetId === leader.id) personalityBias += 20;
              break;
      }

      // 5. Strategy Mode Modifiers
      let strategyModeBias = 0;
      switch (b.strategicMode) {
          case "BALANCED": strategyModeBias = 0; break;
          case "AGGRESSIVE": strategyModeBias = 25; break;
          case "DEFENSIVE": strategyModeBias = -20; break;
          case "RECOVERY": strategyModeBias = 10; break;
          case "EXPANSION": strategyModeBias = -10; break;
          case "SABOTAGE": strategyModeBias = 100; break;
          case "ENDGAME": strategyModeBias = 75; break;
      }

      // 6. Leader Protection Logic
      let leaderProtectionBonus = 0;
      if (leader.nw >= 80) leaderProtectionBonus += 25;
      if (leader.nw >= 90) leaderProtectionBonus += 75;
      if (leader.nw >= 95) leaderProtectionBonus += 150;

      // 8. Final Utility Formula
      const revengeBonus = b.memory.revengeTargets.includes(targetId) ? b.emotions.revenge : 0;
      
      const taxRaidUtility = 
          deltaWinProbability * 100
          + relativeGain * 5
          + personalityBias
          + strategyModeBias
          + leaderProtectionBonus
          + revengeBonus
          - liquidityPenalty;

      if (taxRaidUtility <= 0) return -9999;
      return taxRaidUtility;
    }
  }

  if (action.type === "audit") {
    personalityAlignment = b.personality.aggression;
    const targetIdx = action.payload?.targetIdx as number;
    
    if (targetIdx !== undefined) {
      const targetPlayer = state.players[targetIdx];
      const targetId = targetPlayer.id;
      const model = b.playerModels[targetId];
      if (model && targetPlayer) {
        
        // Infer Cash from public Net Worth
        const nw = netWorth(targetPlayer);
        model.cash.mean = Math.max(0, nw - model.stocks.mean - model.bonds.mean);
        
        const threshold = state.year <= 2 ? 20 : 40;
        
        let maxEV = -Infinity;
        let maxProb = 0;
        let bestAsset = "";

        const evaluateAsset = (mean: number, variance: number, name: string) => {
          if (mean < threshold * 0.8) return;
          
          let probSuccess = 0;
          if (variance <= 0) {
            probSuccess = mean > threshold ? 1 : 0;
          } else {
            const stddev = Math.sqrt(variance);
            const z = (mean - threshold) / stddev;
            // Approximation of Normal CDF: 1 / (1 + exp(-1.702 * z))
            probSuccess = 1 / (1 + Math.exp(-1.702 * z));
          }
          
          if (probSuccess > 0.70) {
            const expectedExcess = Math.max(0, mean - threshold);
            const ev = (probSuccess * expectedExcess) - ((1 - probSuccess) * 5);
            if (ev > maxEV) {
              maxEV = ev;
              maxProb = probSuccess;
              bestAsset = name;
            }
          }
        };

        evaluateAsset(model.cash.mean, model.cash.variance, "cash");
        evaluateAsset(model.bonds.mean, model.bonds.variance, "bonds");
        evaluateAsset(model.stocks.mean, model.stocks.variance, "stocks");

        if (maxEV > 0) {
          strategicBenefit = maxEV * 2; 

          // Motivation & Emotion Bias
          if (b.memory.revengeTargets.includes(targetId)) {
            motivationBias += b.motivations.revenge;
            emotionBias += b.emotions.revenge;
            strategicBenefit += 15;
          }

          const allNw = state.players.map(p => ({ id: p.id, nw: netWorth(p) }));
          const maxNw = Math.max(...allNw.map(p => p.nw));
          if (targetId === allNw.find(p => p.nw === maxNw)?.id) {
            motivationBias += b.motivations.attackLeader;
            strategicBenefit += 20;
          }

          if (b.strategicMode === "SABOTAGE") strategicBenefit += 30;
          if (b.strategicMode === "ENDGAME") strategicBenefit += 15;
        } else {
          // Rule 6/8: Skip if EV <= 0 or prob <= 70%
          return -9999;
        }
      }
    }
  }
  
  score = winningProbability + strategicBenefit + personalityAlignment + motivationBias + emotionBias - risk - liquidityPenalty;

  
  
  // Normalize slightly and add baseline randomness in the engine itself, but for now return pure score.
  return score;
}

/**
 * Slice 6: Year-End Portfolio Optimization Trade Search.
 * Searches for a mutually beneficial swap to hit target allocations before paying rebalance penalties.
 */
export function getYearEndOptimizationTrade(state: GameState, bot: PlayerState): TradeOffer | null {
  if (!bot.botState) return null;
  const nw = netWorth(bot);
  if (nw === 0) return null;

  const b = bot.botState;
  
  const targetCash = (b.personality.targetAllocation.cash / 100) * nw;
  const targetBonds = (b.personality.targetAllocation.bonds / 100) * nw;
  const targetStocks = (b.personality.targetAllocation.stocks / 100) * nw;
  
  // What are we desperate to give away?
  const surplusCash = Math.max(0, bot.cash - targetCash);
  const surplusBonds = Math.max(0, bot.bonds - targetBonds);
  const surplusStocks = Math.max(0, bot.stocks - targetStocks);
  
  // What do we desperately need?
  const deficitCash = Math.max(0, targetCash - bot.cash);
  const deficitBonds = Math.max(0, targetBonds - bot.bonds);
  const deficitStocks = Math.max(0, targetStocks - bot.stocks);
  
  // If we are relatively close (within 5L), don't bother trading.
  if (deficitCash <= 5 && deficitBonds <= 5 && deficitStocks <= 5) return null;
  
  // Construct our ideal offer.
  // We can only trade in multiples of 5L for bonds/stocks to be clean.
  const offerCash = Math.floor(surplusCash / 5) * 5;
  const offerBonds = Math.floor(surplusBonds / 5) * 5;
  const offerStocks = Math.floor(surplusStocks / 5) * 5;
  
  const requestCash = Math.floor(deficitCash / 5) * 5;
  const requestBonds = Math.floor(deficitBonds / 5) * 5;
  const requestStocks = Math.floor(deficitStocks / 5) * 5;
  
  if (offerCash + offerBonds + offerStocks === 0 || requestCash + requestBonds + requestStocks === 0) return null;
  
  // Search opponents (using inferred models!)
  for (const p of state.players) {
    if (p.id === bot.id) continue;
    
    // Have we blacklisted them out of revenge?
    if (b.memory.revengeTargets.includes(p.id)) continue;
    
    const model = b.playerModels[p.id];
    if (!model) continue;
    
    // We infer they have what we want?
    if (requestCash > 0 && model.cash.mean < requestCash) continue;
    if (requestBonds > 0 && model.bonds.mean < requestBonds) continue;
    if (requestStocks > 0 && model.stocks.mean < requestStocks) continue;
    
    // Perfect! We found someone who (we think) has what we need. Let's offer them what we have in surplus.
    return {
      fromPlayerId: bot.id,
      toPlayerId: p.id,
      offer: { cash: offerCash, bonds: offerBonds, stocks: offerStocks },
      request: { cash: requestCash, bonds: requestBonds, stocks: requestStocks },
      tradeType: "direct",
      status: "pending",
      createdAt: Date.now()
    };
  }
  
  return null;
}

/**
 * Slice 7: Strategy Transitions.
 * Evaluates the game state and updates the strategic mode of all bots.
 */
export function updateStrategicMode(state: GameState): GameState {
  const allNetWorths = state.players.map(p => ({ id: p.id, nw: netWorth(p) }));
  const maxNw = Math.max(...allNetWorths.map(p => p.nw));
  const leaderId = allNetWorths.find(p => p.nw === maxNw)?.id;

  const updatedPlayers = state.players.map((botPlayer) => {
    if (!botPlayer.isBot || !botPlayer.botState) return botPlayer;
    const newBotState: BotState = JSON.parse(JSON.stringify(botPlayer.botState));
    
    const myNw = netWorth(botPlayer);
    
    // Check transitions in priority order
    if (myNw >= 90) {
      newBotState.strategicMode = "ENDGAME";
    } else if (botPlayer.cash < 5) {
      newBotState.strategicMode = "RECOVERY";
    } else if (botPlayer.id !== leaderId && (maxNw - myNw) > 30 && maxNw > 50) {
      newBotState.strategicMode = "SABOTAGE";
    } else if (botPlayer.id !== leaderId && (maxNw - myNw) > 20) {
      newBotState.strategicMode = "AGGRESSIVE";
    } else if (botPlayer.id === leaderId && myNw > 15) {
      // Check if leading by > 15L
      const secondMaxNw = Math.max(...allNetWorths.filter(p => p.id !== leaderId).map(p => p.nw), 0);
      if (myNw - secondMaxNw > 15) {
        newBotState.strategicMode = "DEFENSIVE";
      } else {
        newBotState.strategicMode = "BALANCED"; // default fallback if lead shrinks
      }
    } else if (state.turn < 10 && maxNw < 30) {
      newBotState.strategicMode = "EXPANSION";
    } else {
      newBotState.strategicMode = "BALANCED";
    }
    
    return { ...botPlayer, botState: newBotState };
  });

  return { ...state, players: updatedPlayers };
}

/**
 * Slice 8: Seeded Randomness
 * A simple deterministic PRNG (Mulberry32)
 */
export function seededRandom(seed: number): number {
  let t = seed += 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

export interface ScoredAction {
  action: BotAction;
  score: number;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
  }
  return hash;
}

/**
 * Deterministically selects an action from a list of scored actions.
 * 90% top choice, 8% second choice, 2% third choice.
 */
export function selectActionDeterministically(state: GameState, bot: PlayerState, scoredActions: ScoredAction[]): BotAction {
  if (scoredActions.length === 0) {
    return { type: "skip" };
  }
  
  // Sort descending by score
  const sorted = [...scoredActions].sort((a, b) => b.score - a.score);
  
  // Create explanation payloads
  const candidateActions = sorted.map(s => ({ action: s.action.type, score: Math.round(s.score) }));
  const whyNot = sorted.slice(1).map(s => ({ 
    action: s.action.type, 
    reason: `Score (${Math.round(s.score)}) is lower than selected action` 
  }));

  const inferences: { asset: string; estimate: number; confidence: number }[] = [];
  if (bot.botState) {
    for (const [pId, model] of Object.entries(bot.botState.playerModels)) {
      inferences.push({ asset: `cash[${pId}]`, estimate: Math.round(model.cash.mean), confidence: Math.round(model.cash.confidence) });
      inferences.push({ asset: `bonds[${pId}]`, estimate: Math.round(model.bonds.mean), confidence: Math.round(model.bonds.confidence) });
      inferences.push({ asset: `stocks[${pId}]`, estimate: Math.round(model.stocks.mean), confidence: Math.round(model.stocks.confidence) });
    }
  }

  // Generate a deterministic seed based on prompt: hash(gameId) ^ turn ^ playerId ^ actionCounter
  // actionCounter is simulated by processedActionIds length or just state.turn
  const gameIdHash = hashString("WealthCraft_Game"); 
  const playerIdHash = hashString(bot.id);
  const actionCounter = state.processedActionIds ? state.processedActionIds.length : 0;
  const seed = gameIdHash ^ state.turn ^ playerIdHash ^ actionCounter;
  
  const rand = seededRandom(seed);
  
  let selectedAction = sorted[0];
  if (rand >= 0.90 && sorted.length >= 2) {
    selectedAction = rand >= 0.98 && sorted.length >= 3 ? sorted[2] : sorted[1];
  }

  // Attach final explanation to debug
  if (!selectedAction.action.debug) selectedAction.action.debug = {} as any;
  selectedAction.action.debug!.mode = bot.botState?.strategicMode || "BALANCED";
  selectedAction.action.debug!.observations = [];
  selectedAction.action.debug!.candidateActions = candidateActions;
  selectedAction.action.debug!.whyNot = whyNot;
  selectedAction.action.debug!.inferences = inferences;
  selectedAction.action.debug!.selectedAction = selectedAction.action.type;
  selectedAction.action.debug!.score = Math.round(selectedAction.score);

  return selectedAction.action;
}

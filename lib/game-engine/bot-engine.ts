import type { GameState, BotState, PlayerState, TradeOffer } from "../db/schema";
import { countBlocks, netWorth } from "./actions";
import { BotAction } from "./bot";
import { AuditKnowledgeState, AuditEligibility, AuditMemory, PlayerModel, PortfolioHypothesis } from "../db/schema";

export type ObservationEvent =
  | { type: "IPO"; playerId: string; amount: number }
  | { type: "STOCK_RALLY"; playerId: string; gain: number }
  | { type: "STOCK_CRASH"; playerId: string; loss: number }
  | { type: "MARKET_RALLY"; playerId: string; gain: number; cashGain: number; bondGain: number; stockGain: number }
  | { type: "MARKET_CRASH"; playerId: string; loss: number; cashLoss: number; bondLoss: number; stockLoss: number }
  | { type: "PUBLIC_TRADE"; playerId: string; cashDiff: number; bondDiff: number; stockDiff: number; proposerId?: string; responderId?: string; proposerDiff?: any; responderDiff?: any }
  | { type: "PUBLIC_REBALANCE"; playerId: string; cashDiff: number; bondDiff: number; stockDiff: number }
  | { type: "TAX_RAID"; attackerId: string; targetId: string; attackerDiff: number; targetDiff: number }
  | { type: "SUCCESSFUL_AUDIT"; auditorId: string; targetId: string; assetConfiscated: "cash"|"bonds"|"stocks"; amount: number }
  | { type: "FAILED_AUDIT"; auditorId: string; targetId: string; auditorDiff: number }
  | { type: "YEAR_END_RETURN"; playerId: string; bondReturn: number; stockReturn: number }
  | { type: "TRADE_ACCEPTED"; proposerId: string; responderId: string }
  | { type: "TRADE_REJECTED"; proposerId: string; responderId: string }
  | { type: "INCOME"; playerId: string; amount: number }
  | { type: "INCOME_FREEZE"; playerId: string }
  | { type: "BONUS"; playerId: string; amount: number }
  | { type: "LOTTERY"; playerId: string; amount: number }
  | { type: "LOTTERY_PURCHASE"; playerId: string; amount: number }
  | { type: "HOUSE_PURCHASE"; playerId: string; amount: number }
  | { type: "HOUSE_AUCTION_WIN"; playerId: string; amount: number }
  | { type: "EMERGENCY"; playerId: string; amount: number }
  | { type: "REBALANCE_COMPLETED"; playerId: string }
  | { type: "HOSTILE_TAKEOVER"; attackerId: string; targetId: string; assetType: "cash"|"bonds"|"stocks"; cost: number; amount: number };

export interface ThresholdResult {
  probability: number;
  expectedExcess: number;
  expectedValue: number;
  confidence: number;
}

export function getAuditThreshold(asset: string, year: number) {
    const threshold = (year <= 2 ? 20 : 40);
    
    if (process.env.ENABLE_BOT_TELEMETRY !== "false") {
      console.log({
          TRACE: "AUDIT_THRESHOLD",
          year,
          asset,
          threshold
      });
    }

    return threshold;
}

export function estimateProbabilityAboveThreshold(model: PlayerModel, asset: "cash" | "bonds" | "stocks", threshold: number): ThresholdResult {
  if (model.hypotheses && model.hypotheses.length > 0) {
    let prob = 0;
    let expExcess = 0;
    let confSum = 0;
    
    for (const h of model.hypotheses) {
      const range = h[asset + "Range" as keyof typeof h] as [number, number] | undefined;
      if (range) {
        const [min, max] = range;
        if (min >= threshold) {
          prob += h.probability;
          expExcess += h.probability * (((min + max) / 2) - threshold);
        } else if (max > threshold) {
          const overlapProb = (max - threshold) / (max - min);
          prob += h.probability * overlapProb;
          const avgExcess = (max - threshold) / 2;
          expExcess += h.probability * overlapProb * avgExcess;
        }
        confSum += h.probability * h.confidence;
      } else {
        const est = model[asset];
        if (est.mean > threshold) {
          prob += h.probability;
          expExcess += h.probability * Math.max(0, est.mean - threshold);
        }
        confSum += h.probability * est.confidence;
      }
    }
    return { probability: prob, expectedExcess: expExcess, expectedValue: prob * expExcess, confidence: confSum || 50 };
  } else {
    const est = model[asset];
    let probSuccess = 0;
    let expectedExcess = 0;
    if (est.variance <= 0 || est.lowerBound === est.upperBound) {
      probSuccess = est.mean >= threshold ? 1 : 0;
      expectedExcess = Math.max(0, est.mean - threshold);
    } else {
      const stddev = Math.sqrt(est.variance);
      const z = (est.mean - threshold) / stddev;
      probSuccess = 1 / (1 + Math.exp(-1.702 * z));
      expectedExcess = Math.max(0, est.mean - threshold);
    }
    return { probability: probSuccess, expectedExcess, expectedValue: probSuccess * expectedExcess, confidence: est.confidence };
  }
}

export function applyAuditConstraints(hypotheses: PortfolioHypothesis[], auditMemory: Record<string, AuditMemory> | undefined, playerId: string): PortfolioHypothesis[] {
  if (!auditMemory) return hypotheses;
  
  let validHypotheses = hypotheses.map(h => {
    let isValid = true;
    const check = (asset: string, range?: [number, number]) => {
      const memory = auditMemory[`${playerId}_${asset}`];
      if (!memory || !range) return;
      if (range[1] < memory.lockedEstimate.lowerBound || range[0] > memory.lockedEstimate.upperBound) {
        isValid = false;
      }
    };
    check("cash", h.cashRange);
    check("bonds", h.bondRange);
    check("stocks", h.stockRange);
    
    if (!isValid) h.probability = 0;
    return h;
  });

  const totalProb = validHypotheses.reduce((sum, h) => sum + h.probability, 0);
  if (totalProb > 0) {
    validHypotheses.forEach(h => h.probability /= totalProb);
  }
  
  return validHypotheses.filter(h => h.probability > 0);
}

export function appendAuditHistory(memory: AuditMemory, eventType: string, reason: string, delta?: number) {
  if (!memory.sourceHistory) memory.sourceHistory = [];
  memory.sourceHistory.push({
    turn: 0,
    eventType,
    delta,
    previous: { lower: memory.lockedEstimate.lowerBound, upper: memory.lockedEstimate.upperBound },
    next: { lower: memory.lockedEstimate.lowerBound, upper: memory.lockedEstimate.upperBound },
    reason
  });
}

export function detectAuditContradiction(memory: AuditMemory, observationBounds: {lower: number, upper: number}) {
  const { lowerBound, upperBound } = memory.lockedEstimate;
  const isContradiction = observationBounds.lower > upperBound || observationBounds.upper < lowerBound;
  return { contradiction: isContradiction, severity: isContradiction ? 1 : 0 };
}

export function resolveContradiction(memory: AuditMemory) {
  memory.contradictionCount = (memory.contradictionCount || 0) + 1;
  if (memory.state === "CERTAIN") {
    memory.state = "BOUNDED";
    memory.auditKnowledgeStrength = Math.max(0, memory.auditKnowledgeStrength - 20);
  } else if (memory.state === "BOUNDED") {
    memory.state = "UNCERTAIN";
    memory.auditKnowledgeStrength = Math.max(0, memory.auditKnowledgeStrength - 30);
  } else {
    memory.lockedEstimate.lowerBound = 0;
    memory.lockedEstimate.upperBound = 9999;
  }
}

export function degradeAuditKnowledge(memory: AuditMemory, eventType: string) {
  let penalty = 0;
  if (eventType === "IPO" || eventType === "TAX_RAID") penalty = 5;
  else if (eventType === "TRADE") penalty = 10;
  else if (eventType === "YEAR_END") penalty = 15;
  else if (eventType === "MARKET_RALLY" || eventType === "MARKET_CRASH" || eventType === "STOCK_RALLY" || eventType === "STOCK_CRASH") penalty = 20;
  else if (eventType === "REBALANCE_COMPLETED") penalty = 40;
  else if (eventType === "CONTRADICTION") penalty = 30;
  
  memory.auditKnowledgeStrength = Math.max(0, memory.auditKnowledgeStrength - penalty);
}

export function explainAuditKnowledge(memory: AuditMemory) {
  const explanation = (memory.sourceHistory || []).map(h => `Turn ${h.turn}: ${h.reason}`);
  return {
    state: memory.state,
    confidence: memory.lockedEstimate.confidence,
    strength: memory.auditKnowledgeStrength,
    bounds: [memory.lockedEstimate.lowerBound, memory.lockedEstimate.upperBound],
    contradictionCount: memory.contradictionCount,
    explanation
  };
}

export function detectContradictions(hypotheses: PortfolioHypothesis[], memory: Record<string, AuditMemory>, targetId: string) {
    return hypotheses;
}

export function normalizeProbabilities(hypotheses: PortfolioHypothesis[]) {
    let sum = 0;
    hypotheses.forEach(h => sum += h.probability);
    if (sum > 0) {
        hypotheses.forEach(h => h.probability /= sum);
    }
    return hypotheses;
}

export function checkAuditEligibility(model: PlayerModel, targetId: string, asset: "cash" | "stocks" | "bonds", year: number, memory: Record<string, AuditMemory> | undefined): AuditEligibility {
  const threshold = getAuditThreshold(asset, year);
  const lock = memory ? memory[`${targetId}_${asset}`] : undefined;
  
  if (lock) {
    if (lock.state === "CERTAIN" || lock.state === "BOUNDED") {
      if (lock.lockedEstimate.upperBound < threshold) {
        if (process.env.ENABLE_BOT_TELEMETRY !== "false") console.log({ TRACE:"AUDIT_MEMORY_CHECK", target: targetId, asset, memory: lock, eligible: false });
        return { eligible: false, probability: 0, expectedValue: -9999, reason: "KNOWN_FAIL" };
      }
      if (lock.lockedEstimate.lowerBound >= threshold) {
        if (process.env.ENABLE_BOT_TELEMETRY !== "false") console.log({ TRACE:"AUDIT_MEMORY_CHECK", target: targetId, asset, memory: lock, eligible: false });
        return { eligible: false, probability: 1, expectedValue: -9999, reason: "KNOWN_SUCCESS" };
      }
    }
  }

  if (process.env.ENABLE_BOT_TELEMETRY !== "false") console.log({ TRACE:"AUDIT_MEMORY_CHECK", target: targetId, asset, memory: lock, eligible: true });

  const res = estimateProbabilityAboveThreshold(model, asset, threshold);
  if (res.probability <= 0.70) {
    return { eligible: false, probability: res.probability, expectedValue: res.expectedValue, reason: "LOW_CONFIDENCE" };
  }
  if (res.expectedValue <= 0) {
    return { eligible: false, probability: res.probability, expectedValue: res.expectedValue, reason: "NEGATIVE_EV" };
  }

  return { eligible: true, probability: res.probability, expectedValue: res.expectedValue, reason: "SUCCESS" };
}

export function notifyBotsOfEvent(previousState: GameState, nextState: GameState, event: ObservationEvent): GameState {
  const state = nextState;
  let newState = { ...state };
  
  const updatedPlayers = state.players.map((botPlayer) => {
    if (!botPlayer.isBot || !botPlayer.botState) return botPlayer;
    
    const newBotState: BotState = JSON.parse(JSON.stringify(botPlayer.botState));
    if (!newBotState.memory.auditMemory) newBotState.memory.auditMemory = {};
    
    if (event.type === "SUCCESSFUL_AUDIT") {
      if (event.auditorId === botPlayer.id) {
        newBotState.memory.successfulAudits++;
        newBotState.memory.auditBudget.attempted = (newBotState.memory.auditBudget.attempted || 0) + 1;
        newBotState.emotions.confidence = Math.min(100, newBotState.emotions.confidence + 20);
      } else if (event.targetId === botPlayer.id) {
        newBotState.emotions.revenge = Math.min(100, newBotState.emotions.revenge + 40);
        if (!newBotState.memory.revengeTargets.includes(event.auditorId)) {
          newBotState.memory.revengeTargets.push(event.auditorId);
        }
      }
    } else if (event.type === "FAILED_AUDIT") {
      if (event.auditorId === botPlayer.id) {
        newBotState.memory.failedAudits++;
        newBotState.memory.auditBudget.attempted = (newBotState.memory.auditBudget.attempted || 0) + 1;
        newBotState.emotions.fear = Math.min(100, newBotState.emotions.fear + 10);
      } else if (event.targetId === botPlayer.id) {
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

    const getTargetId = (): string | undefined => {
      if ("playerId" in event) return (event as any).playerId;
      if ("targetId" in event) return (event as any).targetId;
      if ("attackerId" in event) return (event as any).attackerId;
      return undefined;
    };
    
    const mutateExact = (pid: string, asset: "cash"|"stocks"|"bonds", delta: number, turn: number = 0) => {
      const pm = newBotState.playerModels[pid];
      if (pm && pm[asset]) {
        pm[asset].lowerBound = Math.max(0, pm[asset].lowerBound + delta);
        pm[asset].upperBound = Math.max(0, pm[asset].upperBound + delta);
      }
      if (!newBotState.memory.auditMemory) return;
      const mem = newBotState.memory.auditMemory[`${pid}_${asset}`];
      if (mem) {
        mem.lockedEstimate.lowerBound = Math.max(0, mem.lockedEstimate.lowerBound + delta);
        mem.lockedEstimate.upperBound = Math.max(0, mem.lockedEstimate.upperBound + delta);
        mem.suspicionSinceAudit += 1;
        mem.estimateLastChangedTurn = turn || state.turn;
        appendAuditHistory(mem, "EXACT", `Exact mutation of ${delta}`, delta);
        if (mem.sourceHistory && mem.sourceHistory.length > 0) mem.sourceHistory[mem.sourceHistory.length - 1].turn = turn || state.turn;
        degradeAuditKnowledge(mem, "EXACT");
      }
    };

    const mutateAmbiguous = (pid: string, asset: "cash"|"stocks"|"bonds", lowerDelta: number, upperDelta: number, turn: number = 0) => {
      const pm = newBotState.playerModels[pid];
      if (pm && pm[asset]) {
        pm[asset].lowerBound = Math.max(0, pm[asset].lowerBound + lowerDelta);
        pm[asset].upperBound = Math.max(0, pm[asset].upperBound + upperDelta);
        pm[asset].confidence = Math.max(0, pm[asset].confidence - 20); // Degrading confidence on ambiguity
      }
      if (!newBotState.memory.auditMemory) return;
      const mem = newBotState.memory.auditMemory[`${pid}_${asset}`];
      if (mem) {
        if (mem.state === "CERTAIN") mem.state = "BOUNDED";
        mem.lockedEstimate.lowerBound = Math.max(0, mem.lockedEstimate.lowerBound + lowerDelta);
        mem.lockedEstimate.upperBound = Math.max(0, mem.lockedEstimate.upperBound + upperDelta);
        mem.suspicionSinceAudit += 1;
        mem.estimateLastChangedTurn = turn || state.turn;
        appendAuditHistory(mem, "AMBIGUOUS", `Ambiguous mutation [${lowerDelta}, ${upperDelta}]`);
        if (mem.sourceHistory && mem.sourceHistory.length > 0) mem.sourceHistory[mem.sourceHistory.length - 1].turn = turn || state.turn;
        degradeAuditKnowledge(mem, "AMBIGUOUS");
      }
    };
    
    const mutateHidden = (pid: string, turn: number = 0) => {
      if (!newBotState.memory.auditMemory) return;
      for (const asset of ["cash", "stocks", "bonds"] as const) {
        const mem = newBotState.memory.auditMemory[`${pid}_${asset}`];
        if (mem) {
          mem.state = "UNCERTAIN";
          mem.lockedEstimate.certainty = false;
          mem.suspicionSinceAudit += 1;
          mem.estimateLastChangedTurn = turn || state.turn;
          appendAuditHistory(mem, "REBALANCE_COMPLETED", `Hidden rebalance invalidated absolute bounds`);
          if (mem.sourceHistory && mem.sourceHistory.length > 0) mem.sourceHistory[mem.sourceHistory.length - 1].turn = turn || state.turn;
          degradeAuditKnowledge(mem, "REBALANCE_COMPLETED");
        }
      }
    };

    const clampConf = (v: number) => Math.max(0, Math.min(100, 100 - v));
    const turn = state.turn;

    // Handle multi-target and third-party exact mutations before single-target early return
    if (event.type === "TAX_RAID") {
       if (event.attackerId !== botPlayer.id) mutateExact(event.attackerId, "cash", event.attackerDiff, turn);
       if (event.targetId !== botPlayer.id) mutateExact(event.targetId, "cash", event.targetDiff, turn);
    }
    if (event.type === "SUCCESSFUL_AUDIT") {
       if (event.auditorId !== botPlayer.id) mutateExact(event.auditorId, event.assetConfiscated, event.amount, turn);
    }
    if (event.type === "FAILED_AUDIT") {
       if (event.auditorId !== botPlayer.id) mutateExact(event.auditorId, "cash", event.auditorDiff, turn);
    }
    if (event.type === "HOSTILE_TAKEOVER") {
       if (event.attackerId !== botPlayer.id) {
           mutateExact(event.attackerId, event.assetType, event.amount, turn);
       }
       if (event.targetId !== botPlayer.id) {
           mutateExact(event.targetId, event.assetType, -event.amount, turn);
       }
       return { ...botPlayer, botState: newBotState };
    }
    if (event.type === "PUBLIC_TRADE") {
       if (event.proposerId && event.proposerId !== botPlayer.id && event.proposerDiff) {
           mutateExact(event.proposerId, "cash", event.proposerDiff.cash, turn);
           mutateExact(event.proposerId, "bonds", event.proposerDiff.bonds, turn);
           mutateExact(event.proposerId, "stocks", event.proposerDiff.stocks, turn);
           const m = newBotState.playerModels[event.proposerId];
           if (m) {
               m.cash.mean += event.proposerDiff.cash; m.bonds.mean += event.proposerDiff.bonds; m.stocks.mean += event.proposerDiff.stocks;
               m.cash.variance *= 0.25; m.bonds.variance *= 0.25; m.stocks.variance *= 0.25;
           }
       }
       if (event.responderId && event.responderId !== botPlayer.id && event.responderDiff) {
           mutateExact(event.responderId, "cash", event.responderDiff.cash, turn);
           mutateExact(event.responderId, "bonds", event.responderDiff.bonds, turn);
           mutateExact(event.responderId, "stocks", event.responderDiff.stocks, turn);
           const m = newBotState.playerModels[event.responderId];
           if (m) {
               m.cash.mean += event.responderDiff.cash; m.bonds.mean += event.responderDiff.bonds; m.stocks.mean += event.responderDiff.stocks;
               m.cash.variance *= 0.25; m.bonds.variance *= 0.25; m.stocks.variance *= 0.25;
           }
       }
       return { ...botPlayer, botState: newBotState };
    }
    if (event.type === "PUBLIC_REBALANCE") {
       if (event.playerId !== botPlayer.id) {
           mutateExact(event.playerId, "cash", event.cashDiff, turn);
           mutateExact(event.playerId, "bonds", event.bondDiff, turn);
           mutateExact(event.playerId, "stocks", event.stockDiff, turn);
       }
       return { ...botPlayer, botState: newBotState };
    }

    const targetId = ("playerId" in event) ? (event as any).playerId : (("targetId" in event) ? (event as any).targetId : null);
    if (!targetId || botPlayer.id === targetId) return { ...botPlayer, botState: newBotState };
    
    const model = newBotState.playerModels[targetId];
    if (!model) return { ...botPlayer, botState: newBotState };

    switch (event.type) {
      case "INCOME":
        model.cash.mean += event.amount;
        model.cash.source = "INCOME";
        model.cash.lastUpdatedTurn = turn;
        mutateExact(targetId, "cash", event.amount);
        break;
      case "INCOME_FREEZE":
        model.cash.source = "INCOME";
        model.cash.lastUpdatedTurn = turn;
        break;
      case "IPO":
        model.stocks.mean += (event.amount * 2);
        model.cash.mean = Math.max(0, model.cash.mean - event.amount);
        model.stocks.variance *= 0.5;
        model.cash.variance *= 0.5;
        mutateExact(targetId, "cash", -event.amount);
        mutateExact(targetId, "stocks", event.amount * 2);
        break;
      case "EMERGENCY":
        model.cash.mean = Math.max(0, model.cash.mean - event.amount);
        mutateExact(targetId, "cash", -event.amount);
        break;
      case "BONUS":
      case "LOTTERY":
        model.cash.mean += event.amount;
        mutateExact(targetId, "cash", event.amount);
        break;
      case "LOTTERY_PURCHASE":
      case "HOUSE_PURCHASE":
      case "HOUSE_AUCTION_WIN":
        model.cash.mean = Math.max(0, model.cash.mean - event.amount);
        mutateExact(targetId, "cash", -event.amount);
        break;
      case "STOCK_RALLY": {
        mutateExact(targetId, "stocks", event.gain);
        model.stocks.mean += event.gain;
        model.stocks.source = "RALLY";
        model.stocks.lastUpdatedTurn = turn;
        if (model.hypotheses) {
          model.hypotheses = applyAuditConstraints(model.hypotheses, newBotState.memory.auditMemory, targetId);
        }
        break;
      }
      case "STOCK_CRASH": {
        mutateExact(targetId, "stocks", -event.loss);
        model.stocks.mean = Math.max(0, model.stocks.mean - event.loss);
        model.stocks.source = "CRASH";
        model.stocks.lastUpdatedTurn = turn;
        if (model.hypotheses) {
          model.hypotheses = applyAuditConstraints(model.hypotheses, newBotState.memory.auditMemory, targetId);
        }
        break;
      }
      case "MARKET_RALLY":
        mutateExact(targetId, "cash", event.cashGain);
        mutateExact(targetId, "bonds", event.bondGain);
        mutateExact(targetId, "stocks", event.stockGain);
        model.stocks.mean += (event.stockGain * 5 / 3);
        model.stocks.variance *= 0.8;
        break;
      case "MARKET_CRASH":
        mutateExact(targetId, "cash", -event.cashLoss);
        mutateExact(targetId, "bonds", -event.bondLoss);
        mutateExact(targetId, "stocks", -event.stockLoss);
        model.stocks.mean = Math.max(0, model.stocks.mean - (event.stockLoss * 5 / 3));
        model.stocks.variance *= 0.8;
        break;
      case "REBALANCE_COMPLETED":
        mutateHidden(targetId);
        model.cash.confidence = Math.max(40, model.cash.confidence - 20);
        model.bonds.confidence = Math.max(40, model.bonds.confidence - 20);
        model.stocks.confidence = Math.max(40, model.stocks.confidence - 20);
        model.cash.variance = (model.cash.variance || 1) * 1.5;
        model.bonds.variance = (model.bonds.variance || 1) * 1.5;
        model.stocks.variance = (model.stocks.variance || 1) * 1.5;
        break;
      case "SUCCESSFUL_AUDIT": {
        const asset = event.assetConfiscated;
        model[asset].mean = event.amount;
        model[asset].variance = 0;
        model[asset].confidence = 100;
        model[asset].source = "AUDIT";
        model[asset].lastUpdatedTurn = turn;
        const threshold = getAuditThreshold(asset, nextState.year);
        // On successful audit, the player's wealth in that asset was exactly the threshold limit after confiscation
        // Actually, if amount > 0 was confiscated, they are left with exactly the threshold!
        // But event.amount is the CONFISCATED amount. The remaining is threshold.
        // Wait, the event.amount is the confiscated amount. We should set mean to threshold, not event.amount!
        model[asset].mean = threshold;
        model[asset].lowerBound = threshold;
        model[asset].upperBound = threshold;
        newBotState.memory.auditMemory[`${targetId}_${asset}`] = { targetPlayerId: targetId, asset: asset, auditTurn: turn, outcome: "SUCCESS", thresholdUsed: threshold, state: "CERTAIN", lockedEstimate: { lowerBound: threshold, upperBound: threshold, confidence: 100, certainty: true }, estimateLastChangedTurn: turn, auditKnowledgeStrength: 100, suspicionSinceAudit: 0, failedAuditCount: 0, contradictionCount: 0, sourceHistory: [] };
        appendAuditHistory(newBotState.memory.auditMemory[`${targetId}_${asset}`], "SUCCESSFUL_AUDIT", "Audit succeeded and verified exact amount");
        if (process.env.ENABLE_BOT_TELEMETRY !== "false") console.log({ TRACE:"AUDIT_MEMORY_WRITE", target: targetId, asset, outcome: "SUCCESS", threshold, lockedEstimate: newBotState.memory.auditMemory[`${targetId}_${asset}`].lockedEstimate });
        if (model.hypotheses) model.hypotheses = applyAuditConstraints(model.hypotheses, newBotState.memory.auditMemory, targetId);
        break;
      }
      case "FAILED_AUDIT": {
        for (const assetKey of ["cash", "bonds", "stocks"] as const) {
          const threshold = getAuditThreshold(assetKey, nextState.year);
          model[assetKey].mean = Math.min(model[assetKey].mean, Math.max(0, threshold - 1));
          model[assetKey].variance = 5;
          model[assetKey].confidence = 100;
          model[assetKey].source = "AUDIT";
          model[assetKey].lastUpdatedTurn = turn;
          const existing = newBotState.memory.auditMemory[`${targetId}_${assetKey}`];
          const fails = existing ? existing.failedAuditCount + 1 : 1;
          newBotState.memory.auditMemory[`${targetId}_${assetKey}`] = { targetPlayerId: targetId, asset: assetKey, auditTurn: turn, outcome: "FAIL", thresholdUsed: threshold, state: "BOUNDED", lockedEstimate: { lowerBound: 0, upperBound: threshold - 1, confidence: 100, certainty: true }, estimateLastChangedTurn: turn, auditKnowledgeStrength: 100, suspicionSinceAudit: 0, failedAuditCount: fails, contradictionCount: existing ? existing.contradictionCount : 0, sourceHistory: [] };
          appendAuditHistory(newBotState.memory.auditMemory[`${targetId}_${assetKey}`], "FAILED_AUDIT", "Audit failed, establishing upper bound");
          if (process.env.ENABLE_BOT_TELEMETRY !== "false") console.log({ TRACE:"AUDIT_MEMORY_WRITE", target: targetId, asset: assetKey, outcome: "FAIL", threshold, lockedEstimate: newBotState.memory.auditMemory[`${targetId}_${assetKey}`].lockedEstimate });
        }
        if (model.hypotheses) model.hypotheses = applyAuditConstraints(model.hypotheses, newBotState.memory.auditMemory, targetId);
        break;
      }
      case "YEAR_END_RETURN":
        mutateExact(targetId, "bonds", event.bondReturn);
        model.bonds.mean = (event.bondReturn / 1) * 5 + event.bondReturn;
        model.bonds.variance *= 0.5;
        if (event.stockReturn !== undefined) {
          mutateExact(targetId, "stocks", event.stockReturn);
          model.stocks.mean = (event.stockReturn / 2) * 5 + event.stockReturn;
          model.stocks.variance *= 0.5;
        }
        if (model.hypotheses) model.hypotheses = applyAuditConstraints(model.hypotheses, newBotState.memory.auditMemory, targetId);
        break;
    }

    model.cash.confidence = clampConf(model.cash.variance);
    model.bonds.confidence = clampConf(model.bonds.variance);
    model.stocks.confidence = clampConf(model.stocks.variance);

    return { ...botPlayer, botState: newBotState };
  });

  newState.players = updatedPlayers;
  return newState;
}

export function decayBotConfidence(state: GameState): GameState {
  const updatedPlayers = state.players.map((botPlayer) => {
    if (!botPlayer.isBot || !botPlayer.botState) return botPlayer;
    const newBotState: BotState = JSON.parse(JSON.stringify(botPlayer.botState));
    if (!newBotState.memory.auditMemory) newBotState.memory.auditMemory = {};
    
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


import { CandidateAction } from "./bot";
import { BotProfile } from "../db/schema";

// Fallback for seeded random if not imported
function _seededRandom(seed: number) {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

export function evaluateCandidateAction(
  state: GameState,
  bot: PlayerState,
  action: BotAction,
  profile: BotProfile
): CandidateAction | null {
  if (!bot.botState) return null;
  const b = bot.botState;
  
  const rejectAction = (reason: string): CandidateAction => ({
      action, category: "PASS", priority: 0, hardValid: false,
      expectedValue: 0, probability: 0, utility: -9999, urgency: 0, risk: 0,
      explanation: reason, reason
  });

  let category: CandidateAction["category"] = "OPPORTUNISTIC";
  let cost = 0;
  
  let probabilitySuccess = 1;
  let probabilityFailure = 0;
  let expectedGain = 0;
  let expectedLoss = 0;
  
  let strategicBenefit = 0;
  let personalityBias = 0;

  // Scoreboard Context
  const nwSorted = [...state.players].map(p => ({ id: p.id, nw: p.cash + p.bonds + p.stocks })).sort((a,b) => b.nw - a.nw);
  const botNw = bot.cash + bot.bonds + bot.stocks;
  const leaderNw = nwSorted[0]?.nw || 0;
  const secondNw = nwSorted[1]?.nw || 0;
  
  let effRisk = profile.riskTolerance;
  if (nwSorted[0].id === bot.id && (botNw - secondNw) > 30) {
      effRisk *= 0.9;
      personalityBias -= 5;
  } else if ((leaderNw - botNw) > 30) {
      effRisk *= 1.10;
      personalityBias += 10;
  }

  let auditKnowledgeBonus = 0;
  let emotionBonus = 0;
  let motivationBonus = 0;
  let urgencyBonus = 0;
  let riskPenalty = 0;
  let liquidityPenalty = 0;
  let explanation = "Default candidate";

  if (action.type === "skip" || action.type === "end-turn") {
      category = "PASS";
      explanation = "Pass turn";
  } else if (action.type === "roll") {
      category = "MANDATORY";
      strategicBenefit = 100;
      explanation = "Roll dice";
  } else if (action.type === "tile-action") {
      category = "OPPORTUNISTIC";
      
      if (action.payload?.targetIdx !== undefined) {
         // tax raid / hostile takeover
         cost = 2; // tax raid cost
         probabilitySuccess = 0.5;
         probabilityFailure = 0.5;
         expectedGain = 5;
         expectedLoss = 2;
         strategicBenefit = 10;
         category = "STRATEGIC";
      } else if (action.payload?.amount !== undefined) {
         // IPO
         cost = action.payload.amount;
         category = cost === 0 ? "PASS" : "STRATEGIC";
         expectedGain = cost * 2;
         expectedLoss = cost;
         probabilitySuccess = 0.6;
         probabilityFailure = 0.4;
         if (profile.type === "BULL") {
            personalityBias += 20; // Bull loves IPO
            explanation = "Bull loves buying the dip";
         }
      } else {
         category = "MANDATORY";
      }
  } else if (action.type === "audit") {
      category = "STRATEGIC";
      const targetIdx = action.payload?.targetIdx;
      if (targetIdx !== undefined) {
          const target = state.players[targetIdx];
          const model = b.playerModels[target.id];
          
          if (b.memory.auditBudget.attempted >= profile.auditBudget) {
              return rejectAction("AUDIT_BUDGET_EXHAUSTED"); // Audit Budget exhausted
          }
          
          // 2 turn cooldown for ANY audit against this target (prevents consecutive turn spamming across different assets)
          let mostRecentAuditTurn = -1;
          for (const key in b.memory.auditMemory) {
              if (key.startsWith(target.id + "_")) {
                  mostRecentAuditTurn = Math.max(mostRecentAuditTurn, b.memory.auditMemory[key].auditTurn);
                  
                  // Also check if they were already successfully audited and brought down to threshold
                  if (b.memory.auditMemory[key].outcome === "SUCCESS") {
                      // We don't permanently lock them anymore, because they can get income later!
                      // Wait, we DO permanently lock them? No! The user's earlier problem was a permanent lock on SUCCESS.
                      // Actually, if it was successful, we shouldn't lock them forever. The 2-turn cooldown handles spamming.
                  }
              }
          }
          if (mostRecentAuditTurn !== -1 && (state.turn - mostRecentAuditTurn < 2)) {
              return rejectAction("AUDIT_COOLDOWN");
          }

          let totalExpectedGain = 0;
          let anyAboveThreshold = false;
          let minConfidence = 100;
          
          const assets = ["cash", "bonds", "stocks"] as const;
          for (const asset of assets) {
              const threshold = getAuditThreshold(asset, state.year);
              const est = model ? (model[asset]?.mean || 0) : 0;
              const conf = model ? (model[asset]?.confidence || 0) : 0;
              minConfidence = Math.min(minConfidence, conf);
              
              if (est > threshold) {
                  anyAboveThreshold = true;
                  totalExpectedGain += (est - threshold);
              }
          }
          
          if (minConfidence < profile.auditThreshold) {
              return rejectAction("LOW_CONFIDENCE");
          }
          
          if (!anyAboveThreshold) {
              return {
                  action,
                  category: "STRATEGIC",
                  priority: 0,
                  hardValid: false,
                  expectedValue: 0,
                  probability: 0,
                  utility: -9999,
                  urgency: 0,
                  risk: 0,
                  explanation: "Below threshold across all assets",
                  reason: "BELOW_THRESHOLD"
              };
          }

          cost = 1;
          probabilitySuccess = 0.7; // Approx
          probabilityFailure = 0.3;
          expectedGain = totalExpectedGain; // Sum of Confiscation
          expectedLoss = 1;
          strategicBenefit = 15 + (totalExpectedGain > 5 ? 10 : 0);
          explanation = `Audit confidence (${minConfidence}%) exceeds threshold, expected gain ${totalExpectedGain}L`;
          
          urgencyBonus += profile.urgencyWeights.audit;
          if (profile.type === "AUDIT_HAWK") {
              personalityBias += 30;
              explanation = "Hawk loves auditing";
          }
      }
  } else if (action.type === "rebalance") {
      category = "PORTFOLIO";
      cost = action.payload?.penalty || 0;
      
      const benefit = 5; // Simplified benefit
      if (cost > benefit) return rejectAction("REBALANCE_NOT_WORTH_IT"); // Rule 3: Rebalance penalty > expected benefit
      
      const drift = Math.abs(bot.cash - (action.payload?.newCash || 0)) + Math.abs(bot.bonds - (action.payload?.newBonds || 0)) + Math.abs(bot.stocks - (action.payload?.newStocks || 0));
      if (drift < 5 && cost > 0) return rejectAction("REBALANCE_NO_OP");
      
      expectedLoss = cost;
      expectedGain = benefit;
      strategicBenefit = benefit - cost;
      explanation = "Portfolio alignment";
      if (profile.type === "DISCIPLINED") personalityBias += 15;
      
      // Rule: Bull never voluntarily sells stocks
      if (profile.type === "BULL" && action.payload?.stocksAmount < bot.stocks) {
          return rejectAction("BULL_STOCKS_PRESERVATION");
      }
  } else if (action.type === "trade-offer") {
      category = "PORTFOLIO";
      
      if (b.memory.lastTradeRejectionTurn === state.turn) {
          return rejectAction("RECENTLY_REJECTED");
      }
      
      const req = action.payload?.request;
      const off = action.payload?.offer;
      if (req && off) {
          expectedGain = req.cash + req.bonds + req.stocks;
          expectedLoss = off.cash + off.bonds + off.stocks;
          probabilitySuccess = 0.3;
          probabilityFailure = 0; // No hard loss on fail, just no gain
      }
      if (profile.type === "SAFETY_BUILDER") {
          personalityBias -= 10;
          explanation = "Safe builder prefers avoiding trades";
      } else {
          explanation = "Trade optimization";
      }
  } else if (action.type === "house-auction-bid") {
      category = "STRATEGIC";
      cost = action.payload?.amount || 0;
      if (profile.type === "PROPERTY_BUILDER" && !bot.hasHouse) {
          urgencyBonus += profile.urgencyWeights.property;
          personalityBias += 50;
          explanation = "Property builder desperately wants a house";
          
          // Property Builder Uncertainty
          const rivalBidEstimate = (cost + Math.floor(Math.random() * 7) - 3);
          if (cost > rivalBidEstimate) strategicBenefit += 5; 
      }
  } else if (action.type === "trade-response") {
      category = "MANDATORY";
      if (action.payload?.accept === false) {
          expectedGain = 0;
          expectedLoss = 0;
          strategicBenefit = 0;
          explanation = "Reject trade";
      } else {
          // Verify we can actually afford the trade we are asked for
          const req = state.pendingTrade?.request;
          if (req && (bot.cash < req.cash || bot.bonds < req.bonds || bot.stocks < req.stocks)) {
              return rejectAction("BANKRUPTCY_RISK");
          }
          
          // Simplistic EV: since we don't know the exact trade here without state, just give it a slightly positive value to accept sometimes
          expectedGain = 1;
          expectedLoss = 0.5;
          strategicBenefit = 0.5;
          explanation = "Accept trade";
      }
  } else if (action.type === "emergency-decision") {
      category = "MANDATORY";
      if (action.payload?.decision === "trade") {
          expectedGain = 10;
          expectedLoss = 0;
          strategicBenefit = 10;
          explanation = "Attempt trade before rebalancing";
          if (profile.type === "BULL") personalityBias += 10; // Bull prefers trading to avoid rebalance penalty
      } else {
          expectedGain = 0;
          expectedLoss = 0;
          strategicBenefit = 0;
          explanation = "Accept rebalance immediately";
      }
  }

  // Hard rules
  const remainingCash = bot.cash - cost;
  if (category !== "PASS" && category !== "MANDATORY") {
      if (remainingCash < 0) return rejectAction("BANKRUPTCY_RISK"); // Rule 1
      if (remainingCash < profile.hardCashFloor && b.strategicMode !== "DESPERATE") return rejectAction("CASH_FLOOR"); // Rule 2
  }
  
  // Calculate EV
  let expectedValue = (probabilitySuccess * expectedGain) - (probabilityFailure * expectedLoss);
  
  if (expectedValue < 0) {
      if (action.type === "audit" && profile.type !== "AUDIT_HAWK") return rejectAction("NEGATIVE_EV_AUDIT");
      if (effRisk < 60) return rejectAction("NEGATIVE_EV"); // Rule 4
  }
  
  // Strategy Mode Modifiers
  if (b.strategicMode === "AGGRESSIVE") personalityBias += 10;
  if (b.strategicMode === "DEFENSIVE") personalityBias -= 10;
  if (b.strategicMode === "HOME_OWNER" && profile.type === "PROPERTY_BUILDER") personalityBias -= 30; // Changes personality after acquiring house
  
  // Tilt Engine (modifies personality based on tilt)
  if (b.tilt > 0) {
      if (profile.type === "BULL") personalityBias += (b.tilt * 0.5); // more aggressive
      if (profile.type === "DISCIPLINED") personalityBias -= (b.tilt * 0.2); // more conservative
      if (profile.type === "AUDIT_HAWK") emotionBonus += (b.tilt * 0.8); // revenge
  }
  
  // Embarrassment Engine
  let embarrassmentPenalty = 0;
  if (action.type === "audit") {
      embarrassmentPenalty = b.recentFailures * 10;
      if (b.recentFailures >= 3) embarrassmentPenalty += 150; // Heavy tilt rejection
  }
  
  // Regret Engine
  const currentTurn = state.turn;
  const matchRegrets = b.regrets.filter(r => {
      if (action.type === "tile-action" && action.payload?.amount !== undefined) return r.action === "IPO";
      if (action.type === "audit") return r.action === "AUDIT";
      return false;
  });
  for (const regret of matchRegrets) {
      const decay = Math.max(0, 1 - (currentTurn - regret.turn) * 0.2);
      if (decay > 0) {
          emotionBonus -= (regret.emotionalImpact * decay);
          explanation += ` (Regret: -${Math.floor(regret.emotionalImpact * decay)})`;
      }
  }

  // Bull Recovery Engine
  if (b.strategicMode === "RECOVERY") {
      if ((action.type === "tile-action" && action.payload?.amount !== undefined) || action.type === "audit" || (action.type === "tile-action" && action.payload?.targetIdx !== undefined)) {
          expectedValue = -100;
          explanation = "Bull Recovery Mode prevents risk";
      }
  }

  // Safe Desperation Engine
  if (b.strategicMode === "DESPERATE" && profile.type === "SAFETY_BUILDER") {
      if (action.type === "audit" || (action.type === "tile-action" && action.payload?.targetIdx !== undefined)) {
          personalityBias += 100;
          explanation = "Safe Builder DESPERATION move";
      }
  }

  // Hawk Imperfection
  if (action.type === "audit" && profile.type === "AUDIT_HAWK") {
      if (Math.random() < 0.20) {
          expectedValue = -100;
          explanation = "Hawk hesitates";
      }
  }

  const utility = strategicBenefit + personalityBias + auditKnowledgeBonus + emotionBonus + motivationBonus + urgencyBonus + expectedValue - riskPenalty - liquidityPenalty - embarrassmentPenalty;
  
  console.log({
      TRACE: "UTILITY",
      action: action.type,
      utility,
      expectedValue,
      probability: probabilitySuccess
  });

  return {
     action,
     category,
     priority: 6,
     hardValid: true,
     expectedValue,
     probability: probabilitySuccess,
     utility,
     urgency: urgencyBonus,
     risk: riskPenalty,
     explanation
  };
}

export function selectActionHumanized(state: GameState, bot: PlayerState, candidates: CandidateAction[], profile: BotProfile): BotAction {
    if (candidates.length === 0) return { type: "skip" };
    
    // Add personality variance to utility
    const gameIdHash = 12345;
    const actionCounter = state.processedActionIds ? state.processedActionIds.length : 0;
    const seed = gameIdHash ^ state.turn ^ actionCounter;
    
    for (const cand of candidates) {
        const variance = (profile.personalityVariance * 2) * _seededRandom(seed + cand.utility) - profile.personalityVariance;
        cand.utility += variance;
    }
    
    // Re-sort
    candidates.sort((a, b) => {
        const priorityOrder: Record<string, number> = {
          "SURVIVAL": 1,
          "MANDATORY": 2,
          "STRATEGIC": 3,
          "PORTFOLIO": 4,
          "OPPORTUNISTIC": 5,
          "PASS": 6
        };
        const pA = priorityOrder[a.category] || 6;
        const pB = priorityOrder[b.category] || 6;
        
        if (pA !== pB) return pA - pB;
        return b.utility - a.utility;
    });

    // Human Mistake Engine
    if (candidates.length >= 2 && bot.botState) {
        // We simulate frustration/low confidence check probabilistically if it's not explicitly stored yet
        // In the simulation, tilt and frustration may not rise naturally, so we allow a 15% random chance of "frustration"
        const isFrustrated = bot.botState.emotions.frustration > 50 || bot.botState.tilt > 10 || Math.random() < 0.30;
        const isUnconfident = bot.botState.emotions.confidence < 50 || Math.random() < 0.30;
        
        if (isFrustrated && isUnconfident) {
            const top = candidates[0];
            const second = candidates[1];
            if ((top.utility - second.utility) <= 20) {
                const roll = Math.random();
                let chosenIdx = 0;
                if (roll > 0.50 && roll <= 0.85) chosenIdx = 1;
                else if (roll > 0.85 && candidates.length >= 3) {
                    const third = candidates[2];
                    if ((top.utility - third.utility) <= 30) {
                        chosenIdx = 2;
                    } else chosenIdx = 1;
                }
                if (chosenIdx !== 0) {
                    candidates[0] = candidates[chosenIdx];
                    candidates[chosenIdx] = top;
                    candidates[0].explanation += " [Mistake Engine Triggered]";
                    
                    console.log({
                        TRACE: "HUMAN_MISTAKE",
                        playerId: bot.id,
                        bestAction: top.action,
                        selectedAction: candidates[0].action,
                        utilityGap: top.utility - candidates[0].utility,
                        frustration: bot.botState.emotions.frustration,
                        confidence: bot.botState.emotions.confidence,
                        tilt: bot.botState.tilt
                    });
                }
            }
        }
    }

    // Humanization Probability Engine
    let selectedCand = candidates[0];
    for (let i = 0; i < candidates.length; i++) {
        const cand = candidates[i];
        if (cand.utility < 0) continue; // reject
        
        const rand = _seededRandom(seed + i);
        let prob = 1.0;
        if (cand.utility <= 2) prob = 0.25;
        else if (cand.utility <= 5) prob = 0.60;
        else if (cand.utility <= 10) prob = 0.90;
        else prob = 0.95;
        
        if (rand <= prob) {
            selectedCand = cand;
            break;
        }
    }
    
    console.log({
        TRACE: "HUMANIZATION",
        candidateActions: candidates.map(c => ({ action: c.action.type, utility: c.utility })),
        chosenAction: selectedCand.action.type
    });

    if (!selectedCand) selectedCand = candidates[candidates.length - 1]; // Fallback to pass if all rejected
    
    // Attach Decision Tree Debug
    if (!selectedCand.action.debug) selectedCand.action.debug = {} as any;
    const tree = {
        priority: selectedCand.category,
        candidateActions: candidates.map(c => ({
            action: c.action.type,
            score: c.utility,
            ev: c.expectedValue,
            probability: 1.0,
            utility: c.utility,
            reason: c.explanation
        })),
        chosen: selectedCand.action.type,
        reason: "Highest utility after humanization threshold"
    };
    selectedCand.action.debug!.decisionTree = tree;

    if (process.env.ENABLE_BOT_TELEMETRY === "true") {
        console.log(JSON.stringify({
            botType: profile.type,
            strategyMode: bot.botState?.strategicMode || "NORMAL",
            emotionalState: bot.botState?.emotions || {},
            candidateActions: candidates.map(c => c.action.type),
            rejectedActions: candidates.filter(c => c !== selectedCand).map(c => c.action.type),
            chosenAction: selectedCand.action.type,
            decisionTree: tree,
            portfolio: { cash: bot.cash, bonds: bot.bonds, stocks: bot.stocks, hasHouse: bot.hasHouse },
            auditMemory: bot.botState?.memory.auditMemory || {},
            regretMemory: bot.botState?.regrets || []
        }, null, 2));
    }

    return selectedCand.action;
}

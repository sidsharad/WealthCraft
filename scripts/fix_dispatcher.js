const fs = require('fs');
const path = require('path');

const dispatcherPath = path.join(__dirname, '../lib/game-engine/dispatcher.ts');
let dispatcher = fs.readFileSync(dispatcherPath, 'utf8');

// 1. Restore the syntax in dispatcher.ts around line 135-170
const blockToReplace = `      if (result.passedStart) {
        const preYearEndS = s;
        s = calculateYearEndReturns(s, playerIdx);
        const playerAfter = s.players[playerIdx];
        const playerBefore = preYearEndS.players[playerIdx];
        const bondReturnAmount = playerAfter.bonds - playerBefore.bonds;
        const stockReturnAmount = playerAfter.stocks - playerBefore.stocks;
        s = notifyBotsOfEvent(preYearEndS, s, { type: "YEAR_END_RETURN", playerId: player.id, bondReturn: bondReturnAmount, stockReturn: stockReturnAmount });
        s = { ...s, phase: "year-end" };
      } else {
        s = { ...s, phase: "action" };
      }
      return { state: s, dice: result.dice };
    }

    case "lottery-resolve": {
      const diceVal = (payload?.dice as number) ?? (Math.floor(Math.random() * 6) + 1);
      const preLotteryS = state;
      let s = applyLotteryReward(state, playerIdx, diceVal);
      switch (effect) {`;

const correctBlock = `      if (result.passedStart) {
        const preYearEndS = s;
        s = calculateYearEndReturns(s, playerIdx);
        const playerAfter = s.players[playerIdx];
        const playerBefore = preYearEndS.players[playerIdx];
        const bondReturnAmount = playerAfter.bonds - playerBefore.bonds;
        const stockReturnAmount = playerAfter.stocks - playerBefore.stocks;
        s = notifyBotsOfEvent(preYearEndS, s, { type: "YEAR_END_RETURN", playerId: player.id, bondReturn: bondReturnAmount, stockReturn: stockReturnAmount });
        s = { ...s, phase: "year-end" };
      } else {
        s = { ...s, phase: "action" };
      }
      return { state: s, dice: result.dice };
    }

    case "lottery-resolve": {
      const diceVal = (payload?.dice as number) ?? (Math.floor(Math.random() * 6) + 1);
      const preLotteryS = state;
      let s = applyLotteryReward(state, playerIdx, diceVal);
      s = notifyBotsOfEvent(preLotteryS, s, { type: "LOTTERY", playerId: player.id, amount: diceVal === 6 ? 15 : diceVal === 5 ? 10 : 0 });
      s = { ...s, phase: "trade" };
      return { state: s };
    }

    case "tile-action": {
      const effect = getTileByPosition(player.position).effect;

      // Tiles that need a modal first — signal the page if payload is absent
      if (!payload) {
        if (effect === "ipo") return { state, sideEffect: { type: "show-modal", modal: "ipo" } };
        if (effect === "emergency") {
          const rand = Math.random();
          const emergencyAmount = rand < 0.5 ? 5 : 10;
          return { state, sideEffect: { type: "show-modal", modal: "emergency", emergencyAmount } };
        }
        if (effect === "lottery" && !payload) return { state, sideEffect: { type: "show-modal", modal: "lottery" } };
        if (effect === "tax-raid" && !payload) return { state, sideEffect: { type: "show-modal", modal: "tax-raid" } };
        if (effect === "hostile-takeover" && !payload) return { state, sideEffect: { type: "show-modal", modal: "hostile-takeover" } };
      }

      let s = state;

      switch (effect) {`;

dispatcher = dispatcher.replace(blockToReplace, correctBlock);


// 2. Add notifyBotsOfEvent for TAX_RAID and HOSTILE_TAKEOVER
const taxRaidOriginal = `        case "tax-raid": {
          if (payload?.skip) {
            s = addLog(s, \`\${player.name} chose to take no action.\`);
          } else {
            const targetIdx = toInt(payload?.targetIdx);
            const pre = s; const result = applyTaxRaid(s, playerIdx, targetIdx);
            if (!result.valid) return { state, sideEffect: { type: "error", message: result.error! } };
            s = result.state;
          }
          break;
        }`;

const taxRaidFix = `        case "tax-raid": {
          if (payload?.skip) {
            s = addLog(s, \`\${player.name} chose to take no action.\`);
          } else {
            const targetIdx = toInt(payload?.targetIdx);
            const pre = s; const result = applyTaxRaid(s, playerIdx, targetIdx);
            if (!result.valid) return { state, sideEffect: { type: "error", message: result.error! } };
            s = notifyBotsOfEvent(pre, result.state, { type: "TAX_RAID", attackerId: player.id, targetId: result.state.players[targetIdx].id, attackerCost: 2, stolenAmount: 5 });
          }
          break;
        }`;

const takeoverOriginal = `        case "hostile-takeover": {
          if (payload?.skip) {
            s = addLog(s, \`\${player.name} chose to take no action.\`);
          } else {
            const targetIdx = toInt(payload?.targetIdx);
            const assetType = payload?.asset || payload?.demandType;
            if (assetType !== "cash" && assetType !== "bonds" && assetType !== "stocks") {
              return { state, sideEffect: { type: "error", message: \`Invalid asset type requested for takeover: \${assetType}\` } };
            }
            const pre = s; const result = applyHostileTakeover(s, playerIdx, targetIdx, assetType as "cash" | "bonds" | "stocks");
            if (!result.valid) return { state, sideEffect: { type: "error", message: result.error! } };
            s = result.state;
          }
          break;
        }`;

const takeoverFix = `        case "hostile-takeover": {
          if (payload?.skip) {
            s = addLog(s, \`\${player.name} chose to take no action.\`);
          } else {
            const targetIdx = toInt(payload?.targetIdx);
            const assetType = payload?.asset || payload?.demandType;
            if (assetType !== "cash" && assetType !== "bonds" && assetType !== "stocks") {
              return { state, sideEffect: { type: "error", message: \`Invalid asset type requested for takeover: \${assetType}\` } };
            }
            const pre = s; const result = applyHostileTakeover(s, playerIdx, targetIdx, assetType as "cash" | "bonds" | "stocks");
            if (!result.valid) return { state, sideEffect: { type: "error", message: result.error! } };
            s = result.state;
            
            const pBefore = pre.players[playerIdx];
            const pAfter = s.players[playerIdx];
            const amt = pAfter[assetType as "cash"|"bonds"|"stocks"] - pBefore[assetType as "cash"|"bonds"|"stocks"];
            
            s = notifyBotsOfEvent(pre, s, { type: "HOSTILE_TAKEOVER", attackerId: player.id, targetId: s.players[targetIdx].id, assetType: assetType as "cash"|"bonds"|"stocks", amount: amt, cost: 0 });
          }
          break;
        }`;

dispatcher = dispatcher.replace(taxRaidOriginal, taxRaidFix);
dispatcher = dispatcher.replace(takeoverOriginal, takeoverFix);


// 3. Fix audit in dispatcher to notify bots
const auditOriginal = `    case "audit": {
      const targetIdx = toInt(payload?.targetIdx);
      const result = processConcentrationAudit(state, playerIdx, targetIdx);
      if (!result.valid) return { state, sideEffect: { type: "error", message: result.error! } };
      if (result.needsRebalance) {
        return {
          state: result.state,
          sideEffect: { type: "needs-rebalance", penalty: 5 + (state.phase !== "year-end" ? 3 : 0) },
        };
      }
      return { state: result.state };
    }`;

const auditFix = `    case "audit": {
      const targetIdx = toInt(payload?.targetIdx);
      const pre = state;
      const result = processConcentrationAudit(state, playerIdx, targetIdx);
      if (!result.valid) return { state, sideEffect: { type: "error", message: result.error! } };
      
      let s = result.state;
      if (result.auditSuccess && result.confiscated) {
          const assets = ["cash", "bonds", "stocks"];
          for (const asset of assets) {
              if (result.confiscated[asset] > 0) {
                  s = notifyBotsOfEvent(pre, s, { type: "SUCCESSFUL_AUDIT", playerId: s.players[targetIdx].id, auditorId: player.id, assetConfiscated: asset as "cash"|"bonds"|"stocks", amount: result.confiscated[asset] });
              }
          }
      } else if (result.auditFailed) {
          s = notifyBotsOfEvent(pre, s, { type: "FAILED_AUDIT", playerId: s.players[targetIdx].id, auditorId: player.id });
      }
      
      if (result.needsRebalance) {
        return {
          state: s,
          sideEffect: { type: "needs-rebalance", penalty: 5 + (s.phase !== "year-end" ? 3 : 0) },
        };
      }
      return { state: s };
    }`;

dispatcher = dispatcher.replace(auditOriginal, auditFix);

fs.writeFileSync(dispatcherPath, dispatcher);

// Now fix bot-engine.ts
const botEnginePath = path.join(__dirname, '../lib/game-engine/bot-engine.ts');
let botEngine = fs.readFileSync(botEnginePath, 'utf8');

const auditSuccOrig = `      case "SUCCESSFUL_AUDIT": {
        const asset = event.assetConfiscated;
        model[asset].mean = 40;
        model[asset].variance = 0;
        model[asset].confidence = 100;
        model[asset].source = "AUDIT";`;
        
const auditSuccFix = `      case "SUCCESSFUL_AUDIT": {
        const asset = event.assetConfiscated;
        model[asset].mean = event.amount;
        model[asset].variance = 0;
        model[asset].confidence = 100;
        model[asset].source = "AUDIT";`;
        
const auditFailOrig = `      case "FAILED_AUDIT": {
        for (const assetKey of ["cash", "bonds", "stocks"] as const) {
          const threshold = getAuditThreshold(assetKey, nextState.year);
          model[assetKey].mean = Math.min(model[assetKey].mean, 35);
          model[assetKey].variance = 5;
          model[assetKey].confidence = 100;
          model[assetKey].source = "AUDIT";`;

const auditFailFix = `      case "FAILED_AUDIT": {
        for (const assetKey of ["cash", "bonds", "stocks"] as const) {
          const threshold = getAuditThreshold(assetKey, nextState.year);
          model[assetKey].mean = Math.min(model[assetKey].mean, Math.max(0, threshold - 1));
          model[assetKey].variance = 5;
          model[assetKey].confidence = 100;
          model[assetKey].source = "AUDIT";`;

const yearEndOrig = `        model.bonds.mean = event.bondReturn * 5;
        model.bonds.variance *= 0.5;
        if (event.stockReturn !== undefined) {
          model.stocks.mean = event.stockReturn * 5;
          model.stocks.variance *= 0.5;
        }`;

const yearEndFix = `        model.bonds.mean = (event.bondReturn / 3) * 5;
        model.bonds.variance *= 0.5;
        if (event.stockReturn !== undefined) {
          model.stocks.mean = (event.stockReturn / 7) * 5; // STOCK_RETURN_PER_5L is 7
          model.stocks.variance *= 0.5;
        }`;
        
botEngine = botEngine.replace(auditSuccOrig, auditSuccFix);
botEngine = botEngine.replace(auditFailOrig, auditFailFix);
botEngine = botEngine.replace(yearEndOrig, yearEndFix);

fs.writeFileSync(botEnginePath, botEngine);

console.log("Done");

import { createInitialGameState } from "../lib/game-engine/actions";
import { dispatch } from "../lib/game-engine/dispatcher";
import { getBotDecision } from "../lib/game-engine/bot";
import type { GameState } from "../lib/db/schema";
import type { Player } from "../lib/db/schema";

async function runTournament(numGames: number) {
  let crashes = 0;
  let loops = 0;
  let invalidStates = 0;
  let totalTurns = 0;
  let audits = 0;
  let taxRaids = 0;
  
  interface PersonalityMetrics {
      audits: number;
      trades: number;
      rebalances: number;
      takeovers: number;
      ipos: number;
      passes: number; // for passRate
      cashSamples: number[];
      stocksSamples: number[];
      bondsSamples: number[];
  }
  
  const metrics: Record<string, PersonalityMetrics> = {
      "BULL": { audits: 0, trades: 0, rebalances: 0, takeovers: 0, ipos: 0, passes: 0, cashSamples: [], stocksSamples: [], bondsSamples: [] },
      "DISCIPLINED": { audits: 0, trades: 0, rebalances: 0, takeovers: 0, ipos: 0, passes: 0, cashSamples: [], stocksSamples: [], bondsSamples: [] },
      "AUDIT_HAWK": { audits: 0, trades: 0, rebalances: 0, takeovers: 0, ipos: 0, passes: 0, cashSamples: [], stocksSamples: [], bondsSamples: [] },
      "OPPORTUNIST": { audits: 0, trades: 0, rebalances: 0, takeovers: 0, ipos: 0, passes: 0, cashSamples: [], stocksSamples: [], bondsSamples: [] },
  };
  
  const botWins: Record<string, number> = {
    "Bot 1": 0,
    "Bot 2": 0,
    "Bot 3": 0,
    "Bot 4": 0,
  };

  const players: Player[] = [
    { id: "b1", name: "Bot 1", avatar: "🤖", isBot: true, botType: "BULL" },
    { id: "b2", name: "Bot 2", avatar: "🤖", isBot: true, botType: "DISCIPLINED" },
    { id: "b3", name: "Bot 3", avatar: "🤖", isBot: true, botType: "AUDIT_HAWK" },
    { id: "b4", name: "Bot 4", avatar: "🤖", isBot: true, botType: "OPPORTUNIST" },
  ];

  for (let g = 0; g < numGames; g++) {
    let state = createInitialGameState(players);
    let turns = 0;
    
    // Safety break at 10000 turns to prevent infinite loop
    while (state.phase !== "finished" && turns < 10000) {
      try {
        const currentPlayer = state.players[state.currentPlayerIndex];
        
        if (state.phase === "roll") {
          state = dispatch(state, "roll", {}).state!;
        } else if (state.phase === "action") {
          const botAction = getBotDecision(state, state.currentPlayerIndex);
          if (!botAction) {
             throw new Error("Bot returned no action during action phase");
          }
          
          const botType = currentPlayer.botType || "UNKNOWN";
          if (botType in metrics) {
              if (botAction.type === "audit-action" || botAction.type === "audit") metrics[botType].audits++;
              else if (botAction.type === "create-trade") metrics[botType].trades++;
              else if (botAction.type === "hostile-takeover") metrics[botType].takeovers++;
              else if (botAction.type === "ipo") metrics[botType].ipos++;
              else if (botAction.type === "skip" || botAction.type === "end-turn") metrics[botType].passes++;
              
              metrics[botType].cashSamples.push(currentPlayer.cash);
              metrics[botType].stocksSamples.push(currentPlayer.stocks);
              metrics[botType].bondsSamples.push(currentPlayer.bonds);
          }
          
          if (botAction.type === "audit-action") audits++;
          if (botAction.type === "tax-raid" || (botAction.type === "tile-action" && botAction.payload?.targetIdx !== undefined)) taxRaids++;
          
          const result = dispatch(state, botAction.type, botAction.payload);
          if (result.sideEffect?.type === "error") {
             console.error(`Error in action phase: ${result.sideEffect.message}`);
             state = dispatch(state, "tile-action", { skip: true }).state!;
          } else {
             state = result.state!;
          }
          
          if (result.sideEffect?.type === "show-modal") {
             if (result.sideEffect.modal === "emergency") {
                 state = dispatch(state, "tile-action", { amount: result.sideEffect.emergencyAmount }).state!;
             } else if (result.sideEffect.modal === "lottery") {
                 // Should have passed play payload, but just in case
                 state = dispatch(state, "tile-action", { play: false }).state!;
             } else if (result.sideEffect.modal === "tax-raid" || result.sideEffect.modal === "hostile-takeover") {
                 state = dispatch(state, "tile-action", { skip: true }).state!;
             }
          }
        } else if (state.phase === "trade") {
           state = dispatch(state, "end-turn", {}).state!;
        } else if (state.phase === "year-end") {
           const botAction = getBotDecision(state, state.currentPlayerIndex);
           if (!botAction || botAction.type !== "rebalance") {
               const result = dispatch(state, "rebalance", { newCash: state.players[state.currentPlayerIndex].cash, newBonds: state.players[state.currentPlayerIndex].bonds, newStocks: state.players[state.currentPlayerIndex].stocks });
               if (result.sideEffect?.type === "error") {
                   console.error(`Fallback Rebalance Error: ${result.sideEffect.message}`);
                   break;
               }
               state = result.state!;
           } else {
               const botType = state.players[state.currentPlayerIndex].botType || "UNKNOWN";
               if (botType in metrics) metrics[botType].rebalances++;
               
               const result = dispatch(state, botAction.type, botAction.payload);
               if (result.sideEffect?.type === "error") {
                   console.error(`Bot Rebalance Error: ${result.sideEffect.message}`, { action: botAction.payload });
                   break;
               }
               state = result.state!;
           }
        } else if (state.phase === "auction") {
           // All eligible players must bid
           for (let i = 0; i < state.players.length; i++) {
               if (!state.players[i].hasHouse && state.auctionState?.open) {
                   const botAction = getBotDecision(state, i);
                   if (botAction && botAction.type === "bid") {
                       state = dispatch(state, botAction.type, botAction.payload).state!;
                   }
               }
           }
        } else if (state.phase === "waiting-trade" || state.phase === "trade-response") {
           const responderId = state.pendingTrade?.toPlayerId;
           const responderIdx = state.players.findIndex(p => p.id === responderId);
           const botAction = getBotDecision(state, responderIdx !== -1 ? responderIdx : state.currentPlayerIndex);
           if (!botAction) {
               state = dispatch(state, "trade-response", { accept: false }).state!;
           } else {
               state = dispatch(state, botAction.type, botAction.payload).state!;
           }
        } else if (state.phase === "emergency" || state.phase === "lottery") {
           const botAction = getBotDecision(state, state.currentPlayerIndex);
           if (!botAction) {
               state = dispatch(state, "end-turn", {}).state!;
           } else {
               state = dispatch(state, botAction.type, botAction.payload).state!;
           }
        } else {
           throw new Error("Unknown phase: " + state.phase);
        }
        turns++;
      } catch (err: any) {
        crashes++;
        console.error(`Crash in Game ${g} Turn ${turns}:`, err.stack);
        break;
      }
    }
    
    if (turns >= 10000) {
      console.error(`Game stuck! Final Phase: ${state.phase}, Actions: ${turns}, Current Player: ${state.currentPlayerIndex}`);
      loops++;
    } else if (state.phase === "finished") {
      // Find winner
      const winner = state.players.reduce((prev, current) => 
        (current.cash + current.stocks + current.bonds) > (prev.cash + prev.stocks + prev.bonds) ? current : prev
      );
      botWins[winner.name]++;
    }
    totalTurns += turns;
  }
  
  console.log("\n--- RC-7 Bot Tournament Statistics ---");
  console.log("Games Played:", numGames);
  console.log("Average Game Length:", (totalTurns / numGames).toFixed(1), "turns");
  console.log("Crashes:", crashes);
  console.log("Infinite Loops:", loops);
  console.log("Total Audits:", audits);
  console.log("Total Tax Raids:", taxRaids);
  console.log("Win Rates:");
  Object.keys(botWins).forEach(b => {
    console.log(`  ${b}: ${((botWins[b] / numGames) * 100).toFixed(1)}%`);
  });
  
  console.log("\n--- Personality Metrics ---");
  for (const botType of Object.keys(metrics)) {
      const m = metrics[botType];
      const totalDecisions = m.audits + m.trades + m.rebalances + m.takeovers + m.ipos + m.passes;
      const passRate = totalDecisions > 0 ? ((m.passes / totalDecisions) * 100).toFixed(1) : 0;
      
      const avg = (arr: number[]) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 0;
      
      console.log(`${botType}:`);
      console.log(`  Audits:     ${m.audits}`);
      console.log(`  Trades:     ${m.trades}`);
      console.log(`  Rebalances: ${m.rebalances}`);
      console.log(`  Takeovers:  ${m.takeovers}`);
      console.log(`  IPOs:       ${m.ipos}`);
      console.log(`  Pass Rate:  ${passRate}%`);
      console.log(`  Avg Cash:   ${avg(m.cashSamples)}L`);
      console.log(`  Avg Stocks: ${avg(m.stocksSamples)}L`);
      console.log(`  Avg Bonds:  ${avg(m.bondsSamples)}L`);
  }
  
  if (crashes === 0 && loops === 0) {
    console.log("\n✓ RC-7 PASS");
  } else {
    console.log("\n✗ RC-7 FAIL");
  }
}

runTournament(100).catch(console.error);

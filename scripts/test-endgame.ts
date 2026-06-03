import { createInitialGameState, advanceTurn, checkWinCondition } from "../lib/game-engine/actions";
import { dispatch } from "../lib/game-engine/dispatcher";
import { GameState } from "../lib/db/schema";

// Helper to inspect state and simulate
function logState(label: string, s: GameState) {
    console.log(`\n=== ${label} ===`);
    console.log(`Phase: ${s.phase}, Turn: ${s.turn}, CurrentPlayerIdx: ${s.currentPlayerIndex}`);
    console.log(`EndgameCandidate: ${s.endgameCandidate}`);
    console.log(`TriggerAck: ${s.endgameTriggerAcknowledged}, CancelAck: ${s.endgameCancelledAcknowledged}`);
    console.log("Player Wealth:");
    s.players.forEach(p => {
        const nw = p.cash + p.stocks + p.bonds + (p.hasHouse ? 50 : 0);
        console.log(`  ${p.name}: ${nw}L`);
    });
    console.log("-----------------------");
}

async function run() {
    console.log("INITIALIZING TEST STATE...");
    let s = createInitialGameState([{ id: "p1", name: "Player 1", avatar: "a", isBot: false }, { id: "p2", name: "Player 2", avatar: "b", isBot: false }]);
    
    // Scenario 1: Endgame Trigger
    console.log("\n\n--- SCENARIO 1: Endgame Trigger ---");
    // Artificially inflate P1 wealth
    s.players[0].cash = 105;
    s = advanceTurn(s); // advance from p1 to p2
    logState("After P1 turn (reaches 105L)", s);
    
    console.log("Simulating 'acknowledge-endgame-trigger' from UI...");
    let result = dispatch(s, "acknowledge-endgame-trigger");
    s = result.state;
    logState("After Trigger Acknowledged", s);

    // Scenario 2: Endgame Cancellation
    console.log("\n\n--- SCENARIO 2: Endgame Cancellation ---");
    // P2's turn. Let's make P1 lose money
    s.players[0].cash = 90;
    
    // End P2's turn (this should complete the round)
    s = advanceTurn(s);
    logState("After P2 turn (round ends, P1 dropped below 100L)", s);
    
    console.log("Simulating 'acknowledge-endgame-cancellation' from UI...");
    result = dispatch(s, "acknowledge-endgame-cancellation");
    s = result.state;
    logState("After Cancellation Acknowledged", s);

    // Scenario 3: Re-Trigger
    console.log("\n\n--- SCENARIO 3: Re-Trigger ---");
    // Next round starts. P1 is active. Let's make P2 cross 100L on P2's turn.
    // Wait, let's just make P2 cross 100L.
    s.players[1].cash = 110;
    s = advanceTurn(s); // P1 turn ends, next is P2. P2 > 100L triggers endgameCandidate!
    logState("After P1 turn (P2 crossed 100L)", s);
    
    console.log("Simulating 'acknowledge-endgame-trigger' again...");
    result = dispatch(s, "acknowledge-endgame-trigger");
    s = result.state;
    logState("After Re-Trigger Acknowledged", s);

    // Scenario 5: Round Completion
    console.log("\n\n--- SCENARIO 5: Round Completion Validation ---");
    // P2 is active. They finish their turn, completing the round. P2 is still > 100L.
    s = advanceTurn(s);
    logState("After P2 turn (Round completes, P2 > 100L)", s);
}

run();

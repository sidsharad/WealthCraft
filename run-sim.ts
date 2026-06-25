import { createInitialGameState } from './lib/game-engine/actions';
import { getBotDecision } from './lib/game-engine/bot';
import { dispatch } from './lib/game-engine/dispatcher';

let state = createInitialGameState([
  { id: 'p1', name: 'Bot 1', avatar: '', isBot: true, botType: 'aggressive' },
  { id: 'p2', name: 'Bot 2', avatar: '', isBot: true, botType: 'balanced' },
  { id: 'p3', name: 'Bot 3', avatar: '', isBot: true, botType: 'defensive' },
  { id: 'p4', name: 'Bot 4', avatar: '', isBot: true, botType: 'balanced' }
]);

let maxPayloadSize = 0;
let turns = 0;
let MAX_TURNS = 200; // Total actions
let cycle = 0;

while(state.phase !== 'finished' && cycle < MAX_TURNS) {
  cycle++;
  if (state.phase === 'roll') turns++;
  
  const botIdx = state.currentPlayerIndex;
  const decision = getBotDecision(state, botIdx);
  const result = dispatch(state, decision.type, decision.payload);
  
  if (result && result.state) {
     state = result.state;
     const size = Buffer.byteLength(JSON.stringify(state));
     if (size > maxPayloadSize) maxPayloadSize = size;
  }
}

console.log(JSON.stringify({
  finalTurn: state.turn,
  finalPhase: state.phase,
  maxPayloadSize: maxPayloadSize,
  logLength: state.log.length,
  actionLength: state.processedActionIds?.length || 0
}, null, 2));

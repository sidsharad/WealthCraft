import dispatch from './lib/game-engine/dispatcher';
import { GameState } from './lib/db/schema';
import assert from 'assert';

const mockState: GameState = {
  phase: 'action',
  turnIdx: 0,
  year: 1,
  players: [
    { id: '1', name: 'P1', cash: 10, bonds: 10, stocks: 10, houses: 0, hasHouse: false, position: 13, isActive: true },
    { id: '2', name: 'P2', cash: 10, bonds: 10, stocks: 10, houses: 0, hasHouse: false, position: 0, isActive: true }
  ],
  market: {
    bonds: { price: 10, trend: 'up' },
    stocks: { price: 10, trend: 'up' },
    housing: { price: 10, trend: 'up' }
  },
  history: [],
  auctionState: null,
  logs: []
};

async function test() {
  // Test takes cash
  const res1 = dispatch(mockState, 'tile-action', { type: 'hostile-takeover', targetIdx: 1, asset: 'cash' });
  assert.strictEqual(res1.state.players[0].cash, 15);
  assert.strictEqual(res1.state.players[1].cash, 5);

  // Test takes bonds
  const res2 = dispatch(mockState, 'tile-action', { type: 'hostile-takeover', targetIdx: 1, asset: 'bonds' });
  assert.strictEqual(res2.state.players[0].bonds, 15);
  assert.strictEqual(res2.state.players[1].bonds, 5);

  // Test takes stocks
  const res3 = dispatch(mockState, 'tile-action', { type: 'hostile-takeover', targetIdx: 1, asset: 'stocks' });
  assert.strictEqual(res3.state.players[0].stocks, 15);
  assert.strictEqual(res3.state.players[1].stocks, 5);

  // Test validates asset
  const res4 = dispatch(mockState, 'tile-action', { type: 'hostile-takeover', targetIdx: 1, asset: 'invalid' });
  assert.strictEqual(res4.sideEffect?.type, 'error');
  assert.ok(res4.sideEffect?.message.includes('Invalid asset type'));

  console.log("All tests passed!");
}

test().catch(console.error);

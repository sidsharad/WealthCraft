import { getBestRebalance } from "../lib/game-engine/bot";
import { PlayerState } from "../db/schema";

function createBot(cash: number, bonds: number, stocks: number): PlayerState {
  return {
    id: "bot", name: "bot", isBot: true,
    cash, bonds, stocks,
    year: 1, wealthDeclared: false, hasHouse: false,
  } as PlayerState;
}

function runTest(name: string, cash: number, bonds: number, stocks: number, expectedStocksDelta: number, expectedBondsDelta: number) {
  console.log(`\n### ${name}`);
  const bot = createBot(cash, bonds, stocks);
  const total = cash + bonds + stocks;
  console.log(`Current: Cash=${cash} Bonds=${bonds} Stocks=${stocks} (Total=${total})`);
  
  const { newCash, newBonds, newStocks } = getBestRebalance(bot, 0, "aggressive");
  
  const cDelta = newCash - cash;
  const bDelta = newBonds - bonds;
  const sDelta = newStocks - stocks;

  console.log(`New: Cash=${newCash} Bonds=${newBonds} Stocks=${newStocks}`);
  console.log(`Deltas: Cash=${cDelta} Bonds=${bDelta} Stocks=${sDelta}`);
  
  const passedS = sDelta === expectedStocksDelta;
  const passedB = bDelta === expectedBondsDelta || (bDelta % 5 === 0);
  
  console.log(passedS ? `[PASS] stocksDelta matched` : `[FAIL] Expected stocksDelta=${expectedStocksDelta}`);
}

// Test 1
runTest("Test 1: Target Stocks ~60", 4, 13, 78, -15, 10);

// Test 2
runTest("Test 2: Target Bonds ~30", 50, 13, 20, 0, 15);

// Test 3
runTest("Test 3: Target Stocks ~60", 5, 4, 91, -30, 25);

// Test 4
runTest("Test 4: Target Stocks ~30", 20, 18, 22, 5, 0);

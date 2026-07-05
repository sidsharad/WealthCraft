import { chromium } from '@playwright/test';

async function runValidation() {
  console.log("Starting WealthCraft RC-P3.1 Bot Validation Suite...");
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs: any[] = [];
  page.on('console', msg => {
    try {
      if (msg.text().includes('TRACE')) {
         logs.push(JSON.parse(msg.text()));
         console.log(msg.text());
      }
    } catch(e) {}
  });

  console.log("Creating Local Room...");
  await page.goto('http://localhost:3000/local');
  
  console.log("Adding Bots...");
  for (let i = 0; i < 3; i++) {
    await page.click('button:has-text("Add Bot")');
    await page.waitForTimeout(500);
  }

  console.log("Starting Game...");
  await page.click('button:has-text("Start Game")');
  
  await page.waitForSelector('text=Turn 1');
  console.log("Game started.");

  let turn = 1;
  const maxTurns = 50;
  
  while (turn <= maxTurns) {
    try {
      const isHumanTurn = await page.locator(`text=It's your turn!`).isVisible();
      if (isHumanTurn) {
         const rollBtn = page.locator('button:has-text("Roll Dice")');
         if (await rollBtn.isVisible()) {
             await rollBtn.click();
             await page.waitForTimeout(1000);
         }
         
         const endTurnBtn = page.locator('button:has-text("End Turn")');
         if (await endTurnBtn.isVisible()) {
             await endTurnBtn.click();
             await page.waitForTimeout(500);
         }
         
         const dismissBtn = page.locator('button:has-text("Pay")');
         if (await dismissBtn.isVisible()) await dismissBtn.click();
         const skipBtn = page.locator('button:has-text("Skip")');
         if (await skipBtn.isVisible()) await skipBtn.click();
      }

      await page.waitForTimeout(1000);
      
      const turnText = await page.locator('.turn-indicator').innerText().catch(() => "");
      if (turnText && turnText.includes("Turn ")) {
         const match = turnText.match(/Turn (\d+)/);
         if (match) turn = parseInt(match[1]);
      }
    } catch(e) {
      console.error(e);
    }
  }

  console.log("Simulation finished. Analyzing logs...");
  
  const issues = logs.filter(l => l.TRACE === "BOT_ACTION_UNSUPPORTED" || (l.TRACE === "BOT_STATE_DRIFT" && l.computedState.turn !== l.executedState.turn));
  console.log("Issues found:", issues.length);
  
  await browser.close();
}

runValidation().catch(console.error);

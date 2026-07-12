import { test, expect, chromium } from '@playwright/test';
import * as fs from 'fs';

async function runValidation() {
  console.log("Starting WealthCraft RC-P5 Diagnostics (Local Mode)...");
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logFile = 'rc-p5-trace.log';
  fs.writeFileSync(logFile, '--- RC-P5 TRACE START ---\n');

  page.on('console', msg => {
      const text = msg.text();
      fs.appendFileSync(logFile, `[LOG] ${text}\n`);
  });

  page.on('pageerror', err => {
      fs.appendFileSync(logFile, `[PAGE_ERR] ${err.message}\n`);
  });

  const params = new URLSearchParams({
    mode: "local",
    players: JSON.stringify([]),
    bots: JSON.stringify([
      {name: "Bot 1", botType: "SAFETY_BUILDER"},
      {name: "Bot 2", botType: "BULL"}
    ])
  });

  const gameUrl = `http://localhost:3000/room/play-local?${params.toString()}`;
  console.log(`Loading Game: ${gameUrl}`);
  
  await page.goto(gameUrl);
  
  console.log("Waiting a few seconds for UI to load...");
  await page.waitForTimeout(5000);
  
  await page.screenshot({ path: 'screenshot_start.png' });
  console.log("Screenshot saved as screenshot_start.png");

  const autoPlayTurn = async () => {
    try {
       // We'll click ANY button that looks like a progression button
       const selectors = [
           'button:has-text("Pay")',
           'button:has-text("Pass")',
           'button:has-text("Accept")',
           'button:has-text("OK")',
           'button:has-text("Close")',
           'button:has-text("Roll Dice")',
           'button:has-text("End Turn")',
           'button:has-text("Start Turn")',
           'button:has-text("Next Year")',
           'button:has-text("Finish Turn")',
           'button:has-text("Confirm Strategy")',
           'button:has-text("End Year")'
       ];

       let acted = false;
       for (const sel of selectors) {
           const btn = page.locator(sel).first();
           if (await btn.isVisible()) {
               try {
                   await btn.click({ timeout: 2000 });
                   await page.waitForTimeout(500);
                   acted = true;
                   break;
               } catch (e) {
                   // button not actionable yet
               }
           }
       }
       return acted;
    } catch (e) {
       return false;
    }
  };

  let turnsCompleted = 0;
  console.log("Executing 100 turns...");
  
  let stallCounter = 0;

  while (turnsCompleted < 100) {
    let acted = await autoPlayTurn();
    
    if (acted) {
      await page.waitForTimeout(1000); 
      stallCounter = 0;
    } else {
      await page.waitForTimeout(500);
      stallCounter++;
    }

    // Try to find the turn number, might be "Turn X" or "Year X"
    const textElements = await page.locator('.font-bold.text-lg').allInnerTexts();
    for (const text of textElements) {
        if (text.includes("Turn ")) {
            const currentTurn = parseInt(text.replace("Turn ", ""));
            if (!isNaN(currentTurn) && currentTurn > turnsCompleted) {
                turnsCompleted = currentTurn;
                if (turnsCompleted % 10 === 0) console.log(`Reached Turn ${turnsCompleted}`);
            }
        }
    }

    if (stallCounter > 60) { // 30 seconds without acting
        console.log("GAME STALLED OR BOT FROZEN! Taking screenshot.");
        await page.screenshot({ path: 'screenshot_stalled.png' });
        break;
    }
  }

  console.log("Simulation finished. Processing logs...");
  await browser.close();
}

runValidation().catch(e => {
  console.error("VALIDATION FAILED", e);
  process.exit(1);
});

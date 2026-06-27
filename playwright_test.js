const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER:', msg.text()));

  await page.goto('http://localhost:3000/lobby');
  
  // Click Local Pass-and-Play
  await page.getByText('Local Pass-and-Play').click();
  
  // Wait for sliders
  await page.waitForTimeout(500);
  
  // We want 1 Human, 3 Bots to quickly get to a bot turn
  // The default might be 2 humans, 2 bots. Let's just start with whatever it is.
  // Click Start Game
  await page.getByText('Start Game').click();
  
  // Wait for board
  await page.waitForTimeout(1000);
  
  // At this point it's Player 1's turn (Human).
  console.log("TEST: Game started, attempting to play human turn...");
  
  // The button should say "Roll Dice"
  try {
    const rollBtn = page.getByText('Roll Dice');
    if (await rollBtn.isVisible()) {
        await rollBtn.click();
        await page.waitForTimeout(3000); // Wait for roll animation
    }
  } catch(e) {
    console.log("TEST: Roll Dice not found or failed.");
  }
  
  // If there's an action, just click "End Turn" or "Skip" or "Buy"
  // Let's just wait 2 seconds, click the primary action button
  try {
      const primaryBtn = page.locator('button.bg-green-600').first(); // "End Turn" or "Buy" or something
      if (await primaryBtn.isVisible()) {
          console.log("TEST: Clicking primary action button");
          await primaryBtn.click();
          await page.waitForTimeout(1000);
      } else {
          // try to find "End Turn"
          const endBtn = page.getByText('End Turn');
          if (await endBtn.isVisible()) {
              console.log("TEST: Clicking End Turn");
              await endBtn.click();
              await page.waitForTimeout(1000);
          }
      }
  } catch(e) {}
  
  // Let's wait a few seconds to let the bot turn trigger
  console.log("TEST: Waiting for bot turn...");
  await page.waitForTimeout(5000);
  
  await browser.close();
})();

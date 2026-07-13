# WealthCraft Playtest Guide

This document outlines the required test matrices for validating WealthCraft v1.0.0 with real players. 

## Solo Play Matrix
*Objective: Verify the single-player experience and bot interaction.*

- [ ] **1 Human vs 3 Bots**: Verify AI difficulty, pacing, and humanization.
  - Test bot trading behavior (do they accept reasonable trades?).
  - Test audit responsiveness (do bots catch you cheating?).

## Multiplayer Matrix
*Objective: Verify network synchronization, latency, and multiplayer edge cases.*

- [ ] **4 Humans**: Full organic gameplay.
  - Test simultaneous UI interactions.
  - Test player disconnection and reconnection.
- [ ] **3 Humans + 1 Bot**: Mixed lobbies.
  - Verify that the bot takes its turn seamlessly between human turns.
- [ ] **2 Humans + 2 Bots**: Verify game balance when bots and humans are evenly split.
- [ ] **1 Human + 3 Bots (Networked)**: Ensure the host network connection doesn't stall rapid bot execution.

## Core Mechanics Verification Checklist
During the playtests, ensure players execute and validate the following actions:
- [ ] **Joining**: Smooth lobby creation, invite code sharing, and game start.
- [ ] **Reconnects**: Refreshing the browser mid-game restores exact state.
- [ ] **Turn Flow**: Dice rolling, moving, and phase transitions feel snappy.
- [ ] **Trading**: Counter-offers, acceptances, rejections, and cash transfers.
- [ ] **Audits**: Triggering an audit on an opponent, and getting audited yourself.
- [ ] **Auctions**: Bidding mechanics and timeout triggers.
- [ ] **Year End**: Income payouts, rebalances, and tax raids.
- [ ] **Victory**: Bankruptcy cascades and the endgame win screen.

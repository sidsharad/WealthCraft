# WealthCraft AI Architecture Decisions

This document captures the historical design decisions and reasoning behind the current structure of the AI engine.

## Why Bots Use Probabilistic Belief Models (Bayesian Inference)
Instead of assigning bots static absolute numbers for an opponent's cash and assets, WealthCraft stores opponent models as a `mean`, `variance`, and `confidence` interval.
- **Why?** It perfectly emulates human gameplay. A human knows that an opponent received exactly `5L` of income, but they might not know exactly how much the opponent lost in a hidden penalty.
- **Trade-off:** Mathematical complexity is higher. We have to maintain FSM boundaries around the uncertainty curves.

## Why Hidden Information Widens Confidence Instead of Revealing Values
During events like `REBALANCE_COMPLETED`, the game does not broadcast the `penalty` variable to the bots. Instead, the `bot-engine.ts` increases the `variance` of the bot's belief model by a scalar (`1.5x`).
- **Why?** A core design pillar is that **Bots must never cheat.** If we fed the exact penalty into their memory, they would be omniscient, completely destroying the psychological meta of bluffing and auditing. Expanding the variance perfectly models human uncertainty—"I know they rebalanced, but I don't know exactly what it cost them."

## Why Semantic ObservationEvents Exist
Earlier versions of the engine tried to derive intent from abstract cash changes. The latest version utilizes strict events like `LOTTERY_PURCHASE` and `HOUSE_AUCTION_WIN`.
- **Why?** The abstract approach led to massive "Model Drift." Bots were combining multiple small FSM mutations (like paying a fee and receiving a bonus simultaneously) and misattributing them, resulting in a completely destroyed model. Explicit, semantic events guarantee perfect Bayesian updates for public actions.

## Why the Universal Bot Executor Was Introduced
The AI pipeline originally existed inside fragmented phases in `dispatcher.ts` (e.g. `handleTradePhase`, `handleRollPhase`). 
- **Why?** Centralizing all logic inside the `bot.ts` `getBotDecision` executor decoupled AI logic from the Dispatcher. Now, the Dispatcher simply treats the Bot as a standard generic player returning an Action Payload, allowing FSM simulations and certification testing to run extremely fast without mocking.

## Why Regression Scripts Are Archived Instead of Deleted
RC utilities like `verify-v6-behavior.ts` and `rc-bot-tournament.ts` have been moved to `scripts/archive/` instead of `rm -rf`.
- **Why?** These scripts encapsulate hours of intricate E2E testing logic tailored to specific subsystems (like Humanization Mistake Rates). While not necessary for standard CI/CD, if we ever rewrite the Humanization engine in the future, retaining these harnesses saves immense engineering overhead.

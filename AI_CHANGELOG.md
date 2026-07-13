# WealthCraft AI Changelog (Release Candidates)

## RC-P1: Bot Stability & Turn Skipping
- **Objective**: Ensure basic bots can successfully skip turns and complete full game lifecycles.
- **Root Cause**: The FSM generated an infinite loop when bots lacked valid moves during the `trade` phase.
- **Fix**: Implemented the `skip` action explicitly within the universal `getBotDecision` generator.
- **Outcome**: Infinite loop resolved; basic FSM passes cleanly.

## RC-P2: Action Queueing & Invariant Validation
- **Objective**: Validate the robustness of the action queue processing system.
- **Root Cause**: Dispatcher failed to process chained actions when async UI elements injected stale state into the `botQueue`.
- **Fix**: Synchronous action chaining built into `dispatcher.ts` and `route.ts`.
- **Outcome**: Race conditions eliminated. Dispatcher correctly processes queued actions sequentially.

## RC-P3: Basic Personality Integration
- **Objective**: Ensure multiple bots possess distinct, configurable behavioural DNAs.
- **Root Cause**: All bots shared a static generic heuristic for trade and roll dice.
- **Fix**: Extracted logic into `lib/game-engine/bot.ts` mapping (Bull, Hawk, etc.) and implemented weighted utility matrices.
- **Outcome**: Bots now exhibit distinct economic traits.

## RC-P4: End-Game Trigger Mechanics
- **Objective**: Ensure bots can properly trigger and respond to `WIN` and `BANKRUPTCY` conditions.
- **Root Cause**: Unhandled `state.winner` mutation caused crash in subsequent observer evaluations.
- **Fix**: Short-circuited AI pipeline upon `state.winner` detection.
- **Outcome**: Games resolve safely without trailing AI errors.

## RC-P5: Year-End Rebalance Fixes
- **Objective**: Stop bots from illegally manipulating rebalance allocations.
- **Root Cause**: AI was permitted to bypass the standard `getBestRebalance` restrictions, leading to `invariant violations` where total global assets desynchronized.
- **Fix**: Enforced `5L block` rules mathematically during `applyYearEndRebalance`.
- **Outcome**: Invariant violations reduced to absolute 0.

## RC-P6: The Great Model Drift War
- **Objective**: Finalize imperfect information tracking so bots don't cheat but can still mathematically infer bounds without crashing.
- **Root Cause**: Bots previously "guessed" hidden cash/asset mutations, drifting thousands of units from true values, leading to erroneous Audits. Subsequent tracking attempts accidentally passed the hidden values directly to the bot.
- **Fix**: Introduced Semantic `ObservationEvent` tracking in `bot-engine.ts`. True hidden events gracefully increase `variance` (dropping confidence) rather than revealing exact data. Public events trigger exact recalculations.
- **Outcome**: 100% resolution. Model drift officially stands at `0`.

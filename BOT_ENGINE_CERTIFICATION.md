# WealthCraft Bot Engine Certification

## Architecture Overview
The Bot Engine provides autonomous decision-making for AI opponents in WealthCraft. It operates entirely on a decoupled architecture, simulating "fog of war." Bots do not have direct read access to other players' private financial state (cash, bonds, stocks). Instead, they maintain a probabilistic `worldModel` built exclusively from public `ObservationEvent`s broadcast by the core game dispatcher.

## Observation Model
Every state mutation inside the game engine that affects a player's assets (Cash, Bonds, Stocks, Houses) must emit a corresponding `ObservationEvent` via `notifyBotsOfEvent`. The bot engine (`bot-engine.ts`) intercepts these events and updates its internal bounds (`lowerBound`, `upperBound`, `confidence`, `mean`).

If a bot observes an exact transaction (e.g., public trade or penalty), it executes a `mutateExact` operation to keep its bounds tightly synchronized. If an opponent takes a hidden action, the bot's confidence in that opponent's wealth drops, widening the estimated bounds.

## Mandatory Decision Flow
Bots must autonomously resolve every game interaction without triggering human-facing UI modals. 
The dispatcher orchestration logic intercepts events like `Emergency`, `IPO`, and `Hostile Takeover`, forcing bots to evaluate and resolve them inline. Bots will evaluate their internal utility heuristics (such as `hardCashFloor` and strategic classification) to pick the most optimal candidate action, bypassing the need for a UI.

## Certification Methodology
The production certification script (`verify-production-certification.ts`) executes fully automated, headless games (100+ turns per game) with exclusively AI players. It validates that:
1. The game completes successfully.
2. Bots maintain exact sync with the actual game state (`Model Drift: 0`).
3. The engine does not encounter deadlocks.
4. The dispatcher successfully falls back if a bot generates an invalid candidate.
5. All tile events are processed correctly without a skipped turn.

## Regression Guarantees
A permanent regression test suite (`tests/bot-engine-regression.test.ts`) has been introduced. It runs 5 full games continuously in a vitest environment to enforce:
- **0 Model Drift**
- **0 Deadlocks**
- **0 Dispatcher Failures**
- **0 UI Modals rendered for bots**
- **0 Skipped Turns**

## Known Assumptions
- Bots rely exclusively on deterministic bounds logic; probabilistic distributions are assumed to maintain strict boundary caps.
- Trading heuristics heavily depend on perceived wealth; if bounds are wide, bots become more conservative.
- "Fog of war" is asymmetric; humans currently see full public tables, whereas bots track changes intrinsically.

## Future Extension Guidelines
To safely extend the Bot Engine without breaking certification:
1. **New Tiles**: Any new tile that modifies assets must explicitly emit an `ObservationEvent`.
2. **New Penalties**: Any automated rebalance deductions must emit the appropriate `cashDiff/bondDiff/stockDiff`.
3. **AI Logic**: Avoid hardcoding state assumptions in `evaluateAllCandidates`. Rely strictly on `bot.botState.worldModel`.

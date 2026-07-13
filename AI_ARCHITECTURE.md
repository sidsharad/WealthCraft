# WealthCraft AI Architecture

## 1. Bot Lifecycle
Bots in WealthCraft do not run as independent background daemons; they execute strictly in response to the core game loop controlled by `dispatcher.ts`. When a human player ends their turn, the dispatcher advances the turn queue. If the active player is a bot, the dispatcher invokes `getBotDecision` (via the Universal Bot Executor pipeline in `bot.ts`) synchronously. The bot calculates its move and returns an action payload, which the dispatcher applies identically to a human action.

## 2. Observation Model
Bots are intentionally designed with "imperfect knowledge." They do not peak into hidden game state. Instead, they rely on a semantic observation pipeline (`ObservationEvent` defined in `bot-engine.ts`) to track public information, such as:
- `INCOME`: Exact public income payouts.
- `LOTTERY_PURCHASE`: Publicly visible cash deductions.
- `REBALANCE_COMPLETED`: Notification that a rebalance occurred (but the exact hidden penalty is mathematically obfuscated).

## 3. Belief Model
Opponent state is modeled using a probabilistic framework (Bayesian inference) stored in `botState.playerModels`. 
Each tracked asset (cash, bonds, stocks) is represented by:
- `mean`: The estimated value.
- `variance`: The degree of uncertainty.
- `confidence`: Calculated dynamically (typically `100 - variance`), representing how tightly the bounds constrain the mean.

Hidden mechanics (like Year-End Rebalances) degrade confidence without revealing exact numbers.

## 4. Decision Pipeline
The decision engine (`actions.ts` / `bot.ts`) relies on a robust scoring algorithm:
1. **Candidate Generation**: The bot enumerates all valid permutations of moves (e.g., to audit or pass).
2. **Hard Rule Filtering**: Impossible or explicitly banned actions are stripped.
3. **Utility Evaluation**: Each candidate is scored via a weighted utility function, maximizing expected value based on their current belief model.
4. **Action Selection**: The candidate with the highest Utility Score is chosen.

## 5. Humanization
Bots utilize a "Mistakes Engine" to simulate human error and tilt.
- **Fatigue & Tilt**: Bad RNG or repeated losses increase a bot's `tilt`, causing irrational utility perturbations.
- **Defensive Play**: Significant losses trigger defensive/survival overrides, prioritizing cash hoarding over growth regardless of personality.

## 6. Certification Architecture
The AI layer is secured by a highly resilient test framework (`scripts/verify-production-certification.ts`):
- FSM telemetry executes high-speed automated matches.
- A "Model Drift" validator strictly asserts that true opponent values never fall outside a bot's `100%` confidence boundary.
- An Invariant Validator ensures total global assets mathematically match expected emissions.

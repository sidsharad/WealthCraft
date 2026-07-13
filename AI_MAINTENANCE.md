# WealthCraft AI Maintenance Guide

## Adding a Personality
1. **Define DNA:** Open `lib/game-engine/bot.ts` and add a new constant object (e.g. `NEW_PERSONALITY`).
2. **Assign Traits:** Configure its `hardCashFloor`, `auditBudget`, `riskTolerance`, and `urgencyWeights` (property, survival, growth, audit).
3. **Registration:** Add the new type string to the `BotProfile` mapping in `schema.ts`.
4. **Initialization:** Add a matching case in `createInitialBotState()` in `bot.ts` to define its initial psychological states (fear, aggression, etc).

## Adding ObservationEvents
1. **Define the Event:** In `lib/game-engine/bot-engine.ts`, add the new event signature to the `ObservationEvent` discriminated union type.
2. **Process the Event:** Add a `case` for the new event inside the `switch (event.type)` block in `updatePlayerModel()`. Define exactly how `mean`, `variance`, and `confidence` are updated. 
3. **Emit the Event:** Locate the core mechanic execution in `lib/game-engine/dispatcher.ts` and wrap it with `notifyBotsOfEvent(pre, post, { type: "YOUR_EVENT", ... })`.

## Running Certification
To validate AI behaviour against production standards, run:
```bash
npx tsx scripts/verify-production-certification.ts 1000
```
This executes 1,000 automated FSM matches. The final JSON report (`ai-production-certification-report.json`) will be deposited in the `artifacts/` folder, detailing audit violations, model drift, and personality regression metrics.

## Replay Seeds
The certification harness captures exact pseudorandom state parameters when an invariant fails or a deadlock occurs.
- Find the `seed` string inside the generated `drift-events.json` or certification report.
- Inject this string manually into `seedRand("YOUR_SEED")` inside `dispatcher.ts` (or your chosen scratch script) to perfectly replay the entire game sequence up to the exact crash.

## Debugging Workflow
1. Start with the **FSM Trace**: Examine `ai-production-certification-report.json` to isolate the failure phase (e.g. `Rebalance`, `Audit`).
2. **Replay the Seed**: Feed the failing seed into a minimal runner.
3. **Enable Trace Logs**: Set `ENABLE_AI_TRACE="true"` to unlock full `ACTION_TRACE` and `LOCK_TRACE` `console.log` output.
4. **Inspect Beliefs**: Check `botState.playerModels` immediately before the crash to verify that the bot's Bayesian estimation hasn't drifted wildly from reality.

## Regression Testing
Historical regression utilities are stored in `scripts/archive/`.
- `verify-v6-behavior.ts`: For humanization/strategy-mode tweaks.
- `rc-bot-tournament.ts`: For balancing win-rates across personalities. 
These scripts do not run in standard CI but remain critical when executing deep refactors.

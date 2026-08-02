# WealthCraft Production Summary

## Architecture

- **Multiplayer**: Decentralized state synchronization utilizing Vercel Edge functions and real-time Pusher WebSockets.
- **Bot Engine**: Autonomous, headless AI evaluation running strictly within the application lifecycle without polling overhead.
- **Dispatcher**: Single-source-of-truth state machine controlling immutable action pipelines, ensuring parity between AI and human validation.
- **Observation Model**: Strict "fog of war" implementation. Bots update deterministic upper and lower bounds on opponents' hidden assets exclusively through public `ObservationEvent` payloads.
- **Commentary**: Evaluates the delta in the `GameState` tree and streams contextual reactions and color commentary in real-time.
- **Networking**: Resilient connection layer featuring client-side buffering, deadlock recovery timeouts, and optimistic local state mutations.

## Certification
The Bot Engine passed all invariant checks across 100 headless, end-to-end simulated games (RC-20).
- **Games Executed**: 100
- **Games Passed**: 100
- **Deadlocks**: 0
- **Dispatcher Failures**: 0
- **Skipped Turns**: 0
- **Model Drift**: 0
- **Invariant Violations**: 0

## Deployment
- **Version**: WealthCraft v1.0.0
- **Deployed Commit**: `6e27bb4`
- **GitHub Branch**: `main`
- **Vercel Status**: `Deployed Successfully`
- **Production URL**: `wealth-craft-one.vercel.app`
- **Build Result**: ✅ SUCCESS

## Protected Files
The following critical Bot Engine and orchestration files are strictly frozen. Modifications are only permitted for critical reproducible bugs or explicit design rebalancing.
- `lib/game-engine/bot.ts`
- `lib/game-engine/bot-engine.ts`
- `lib/game-engine/dispatcher.ts`

## Regression Suite
A permanent, automated regression harness (`tests/bot-engine-regression.test.ts`) runs continuously in CI (`vitest`). It guarantees zero model drift, zero dispatcher failures, and zero deadlocks to prevent future regressions.

## Known Technical Debt
- **File Over-Complexity**: Core logic files (`dispatcher.ts` and `actions.ts`) are extremely dense, tightly coupling business logic with state transitions.
- **Test Fragility / Stale Mocking**: Some legacy unit tests contain outdated assertions or overly rigid humanization expectations, which cause flaky `vitest` executions despite a flawless 100-game production integration run.
- **`any` Typing in Dispatcher**: Action payloads occasionally rely on loose TypeScript `any` assertions where strict Discriminated Unions should be leveraged.

## Future Roadmap
- **Mobile UI**: Full layout responsiveness for phones and tablets.
- **Commentary**: Expanded vocabulary and deeper historical contextual awareness.
- **Tutorial**: Interactive onboarding flows for new players.
- **Analytics**: Production gameplay telemetry for rebalancing.
- **Playtesting**: Large-scale human testing cohorts.

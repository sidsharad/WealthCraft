# WealthCraft RC Archive

This directory contains historical Release Candidate (RC) scripts and utilities. 
These scripts are no longer part of the daily compilation or execution pipeline, but they are preserved as valuable regression assets.

## Scripts

### `rc-bot-tournament.ts`
- **Original Phase**: RC-P4 / RC-P5
- **Purpose**: Pit bots against each other in automated 100-game series to analyze win rates and personality balance.
- **When to Use**: If fundamental utility weights are tweaked and you need to ensure no personality strictly dominates.
- **Superseded?**: No, but no longer executed on every CI run.

### `rc-p5-repro.ts`
- **Original Phase**: RC-P5
- **Purpose**: Minimal reproduction script for the rebalance bug and invariant assertion violations.
- **When to Use**: Reference for how invariant errors surface during year-end rebalances.
- **Superseded?**: Yes, `verify-production-certification.ts` catches invariant violations.

### `rc-playwright-validation.ts`
- **Original Phase**: RC-3
- **Purpose**: E2E browser automation to validate UI and network sync.
- **When to Use**: When validating UI refactors.
- **Superseded?**: Partially superseded by unit tests, but still valuable for true end-to-end frontend tests.

### `test-endgame.ts`
- **Original Phase**: RC-P4
- **Purpose**: Specifically validates the end-game trigger mechanics, bankruptcy, and UI cancellation flow.
- **When to Use**: If the `win-game` logic is ever modified.
- **Superseded?**: No, it remains the canonical end-game flow validation.

### `validate-bots.ts`
- **Original Phase**: RC-P3
- **Purpose**: An early FSM harness to validate bot turn-taking, skips, and trade responses.
- **When to Use**: If the core `dispatcher.ts` state machine is fundamentally rewritten.
- **Superseded?**: Yes, superseded by `verify-production-certification.ts`.

### `verify-v6-behavior.ts`
- **Original Phase**: RC-P6
- **Purpose**: Behavioural regression test focusing on bot strategy modes, humanization engine (mistakes), and explanation engine.
- **When to Use**: If `humanization` or `strategicMode` logic is modified.
- **Superseded?**: Partially, but still useful for specific humanization metric extraction.

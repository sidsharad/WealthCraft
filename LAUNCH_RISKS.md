# WealthCraft Launch Risks

This document outlines the primary risks associated with the v1.0.0 public launch and provides mitigation strategies for each.

## Technical Risks

### 1. Synchronous Node Thread Stalling
- **Likelihood**: Medium
- **Impact**: High
- **Description**: The AI `getBotDecision` pipeline executes synchronously. Candidate generation (especially calculating hundreds of trade permutations) is computationally heavy. Under high load (e.g., 50+ concurrent games), bot turns may block the Node event loop, causing latency spikes for human players across the entire server.
- **Mitigation**: Move AI computation to an asynchronous WebWorker thread or external queue (e.g. BullMQ) in v1.1. In the short term, monitor server CPU metrics heavily.

### 2. State Desynchronization via Browser Tabs
- **Likelihood**: High
- **Impact**: Medium
- **Description**: Players keeping multiple tabs open on the same game, or locking their mobile screen during an active websocket stream, may experience visual state drift requiring a page refresh.
- **Mitigation**: The `GET /api/rooms` polling fallback should eventually be replaced with strict websocket acknowledgment sequences.

## Gameplay Risks

### 1. Property Dominance (The "Snowball" Effect)
- **Likelihood**: High
- **Impact**: High
- **Description**: Telemetry from bots indicates that aggressively buying houses (`PROPERTY_BUILDER`) yields a disproportionate win rate (65%). Humans may rapidly discover that scaling rents is strictly optimal, leading to boring, highly deterministic late-game phases.
- **Mitigation**: Monitor the "Most Landed Tile" and "Average Net Worth" metrics. If property is mathematically dominant, v1.1 should aggressively scale Year-End Taxes based on property tiers, or increase property maintenance fees.

### 2. 5L Block Confusion
- **Likelihood**: High
- **Impact**: Medium
- **Description**: The mathematical requirement that stocks and bonds be adjusted in `5L blocks` during the year-end rebalance is strictly enforced to prevent invariant violations. Humans who do not read instructions may find themselves perpetually audited and penalized by bots who perfectly track their bounds.
- **Mitigation**: Introduce a strict UI toggle that snaps all inputs to `5` during the rebalance modal, preventing the human from making an illegal move entirely.

## Operational Risks

### 1. Database Connection Exhaustion
- **Likelihood**: Medium
- **Impact**: Critical
- **Description**: WealthCraft relies on frequent polling/commits during the game state loop. High concurrent player counts could exhaust the connection pool.
- **Mitigation**: Ensure database connection pooling (PgBouncer or similar) is robustly configured prior to scaling up marketing efforts.

## Support Risks

### 1. "Cheating AI" Complaints
- **Likelihood**: High
- **Impact**: Low
- **Description**: Because bots maintain perfect Bayesian inference boundaries on human players, their audits will be highly accurate when humans make genuine rebalance mistakes. Players will accuse the AI of omnisciently reading their hidden penalty data.
- **Mitigation**: Add a "Hint" or "Audit Explanation" tooltip to the UI when a human gets audited, showing them *why* the bot knew they were cheating (e.g., "The bot tracked your income to exactly 25L, but you only reported 15L!").

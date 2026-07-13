# WealthCraft Release Checklist

## Production Ready
- [x] **AI Certification**: Bots fully distinct, behaving according to personality metrics.
- [x] **Production Certification**: 1,000 game simulation passed perfectly.
  - Games Failed: 0
  - Dispatcher Failures: 0
  - Model Drift: 0
  - Audit Violations: 0
- [x] **Regression Suite**: Scripts moved to `scripts/archive/` and successfully validated.
- [x] **Documentation**: Complete architectural and maintenance playbooks generated.
- [x] **Logging Review**: Developer traces securely gated behind `process.env.NODE_ENV !== "production"`.

## Remaining Technical Debt
- **File Over-Complexity**: `dispatcher.ts` and `actions.ts` are immense, housing overlapping layers of business logic, state mutation, and event observation.
- **Any Assertions**: Action payloads in `bot.ts` loosely use `any` due to differing generic structures. A strict Discriminated Union generic should replace this.
- **Magic Numbers**: The `humanization` mistakes engine uses arbitrary dice-roll probability thresholds (`Math.random() < 0.15`). These should be normalized into external constants.
- **Test Fragility**: Lifetime audits (`hawkAudits < bullAudits`) are evaluated on total volume rather than situational probability, breaking when system health reaches perfection.

## Known Limitations
- The AI currently executes synchronously inside the Node thread. Massive concurrency (100+ active human games) could stall event loops during `Candidate Generation`.
- The bot cannot currently propose multi-party (3+) trades, limiting advanced diplomacy.

## Future Enhancements
- **Asynchronous Bot Worker**: Move `getBotDecision` into a background queue (e.g. Redis/BullMQ) for horizontal scalability.
- **Advanced Sentiment Analysis**: Enable bots to track opponent "betrayals" during broken trade promises for advanced vendettas.

---

## Rollback Strategy

- **Current Release Tag**: `v1.0.0`
- **Previous Stable Tag**: *(Initial Release - N/A)*
- **Certification Command**:
  ```bash
  npx tsx scripts/verify-production-certification.ts 1000
  ```
- **Regression Command**:
  ```bash
  npx tsx scripts/archive/verify-v6-behavior.ts
  ```
- **Recovery Steps**:
  1. Trigger Git revert to the previous verified stable tag.
  2. Rerun `verify-production-certification.ts 100` to confirm FSM invariants.
  3. Deploy the reverted container image immediately to stop corrupted database states.

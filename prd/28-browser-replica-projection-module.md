# PRD 28: Browser replica projection module

Status: planned
Current chunk: BRP-01 ready
Last updated: 2026-05-12

## Goal

Separate browser replica state from browser replica projections, so query results, counts, options, aggregates, and reference counts have one testable module boundary.

This should usually ship after PRD 26. Pull it forward only if PRD 26 preview or publish work exposes projection bugs that block shipping.

## Problem

`src/client/store.ts` owns too many responsibilities:

- Browser replica state shape and hydration.
- Local record merge and delete reconciliation.
- Query-matching selectors.
- Count, option, aggregate, and reference-count selectors.
- React hooks and memoized selector adapters.
- Readiness and warning projections.

That coupling makes derived browser data harder to test without React store setup, and makes publish/preview work riskier because projection behavior is mixed with replica mutation behavior.

## Source Map

- `src/client/store.ts`: browser replica state, hooks, selectors, reconciliation, projection logic.
- `src/client/views.ts`: query and view helpers used by generated UI.
- `src/shared/query.ts`: query matching semantics.
- `src/shared/read-model.ts`: aggregate/read-model evaluation semantics.
- `src/app/generated/collection.tsx`: consumers of query ids, options, counts, aggregates.
- Existing client store and generated app tests.

## Requirements

- Keep browser replica mutation, hydration, merge, and delete behavior in the store.
- Move read-only projection logic behind a dedicated module.
- Projection inputs must be plain browser replica snapshots and projection requests.
- Projection outputs must preserve stable identity behavior where the current store relies on reuse.
- Keep existing React hook names unless callers are intentionally migrated in the same chunk.
- Preserve query context cache semantics.
- Preserve aggregate and computed read behavior against local browser records.
- Preserve reference option and reference count behavior.
- Do not add new indexes until a measured use case needs them.
- Keep tests focused on projection behavior without requiring a rendered app.

## Non-Goals

- Do not change query language semantics.
- Do not change sync, broadcast, or local DB persistence behavior.
- Do not introduce authority/read-model storage.
- Do not change generated UI behavior.
- Do not update `doc/current.md` or `doc/roadmap.md` in normal PRD work.

## Decisions

- The projection module is read-only over a browser replica snapshot.
- `src/client/store.ts` remains the owner of mutation, hydration, and reconciliation.
- Store hooks become adapters over projection selectors.
- The selector interface is a public internal test surface.
- Performance should be no worse than today; identity reuse tests stand in for broad performance claims.

## Chunks

### BRP-01: Characterize current projections

Status: ready

Tasks:

- Map every projection selector and hook in `src/client/store.ts`.
- Add or confirm tests for query ids, options, counts, aggregates, and reference counts.
- Record current identity reuse and fallback behavior in this PRD.
- Identify any projection behavior used by PRD 26 preview or publish flows.

Acceptance:

- The projection surface is listed in this PRD.
- Characterization tests fail on accidental behavior changes.
- No production behavior changes in this chunk.

### BRP-02: Extract query, option, count, and reference projections

Status: planned

Tasks:

- Add a browser replica projection module.
- Move query id selection into the projection module.
- Move option, count, and reference-count selectors into the projection module.
- Keep store hooks as thin wrappers.

Acceptance:

- Store hooks return the same values as before.
- Projection tests cover entity filters, context filters, empty states, and deleted records.
- Stable arrays are reused when projection inputs have not changed.

### BRP-03: Extract aggregate and readiness projections

Status: planned

Tasks:

- Move aggregate projection into the projection module.
- Move readiness and warning projection logic if it is read-only over replica state.
- Keep read-model semantics source-faithful to existing shared evaluators.

Acceptance:

- Aggregate values match previous behavior.
- Readiness warnings match previous behavior.
- Projection tests do not require React rendering.

### BRP-04: Store cleanup and adapter pass

Status: planned

Tasks:

- Remove projection-specific helpers that remain in `src/client/store.ts`.
- Keep store file focused on state, mutation, reconciliation, and hooks.
- Update imports and tests.

Acceptance:

- `src/client/store.ts` has clear mutation and adapter responsibilities.
- Projection behavior is traceable through the new module.
- `devstate check` is green.

### BRP-05: Closeout and promotion notes

Status: planned

Tasks:

- Update this PRD with shipped facts, decisions, and remaining follow-ups.
- Add global-doc promotion notes only under this PRD's `Promote after ship` section.

Acceptance:

- PRD status reflects shipped chunks.
- Promotion notes point to code and tests.

## Tests

- Projection unit tests for query ids, options, counts, reference counts, aggregates, and readiness warnings.
- Hook adapter tests only where adapter wiring is not already covered.
- Regression coverage for identity reuse where current selectors preserve stable results.
- `devstate check` is green.

## Blockers

- None hard.
- Prefer shipping after PRD 26 unless preview or publish work exposes projection bugs.

## Promote after ship

- `doc/current.md`: browser replica projection module and store responsibility split, once shipped.
- `doc/roadmap.md`: only if this changes first-release scope wording.

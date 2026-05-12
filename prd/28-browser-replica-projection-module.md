# PRD 28: Browser replica projection module

Status: in progress
Current chunk: BRP-03 ready
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
- BRP-01 exported `createEntityRecordIdsMatchingQuerySelector` and `createRecordReadinessWarningsSelector` from `src/client/store.ts` for characterization and later extraction tests.
- BRP-02 makes `src/client/projections.ts` the module boundary for query ids, query options, query counts, reference options, and reference counts.
- BRP-02 keeps aggregate and readiness selectors in `src/client/store.ts`; BRP-03 owns their extraction.

## BRP-01 Characterization

Projection hook surface in `src/client/store.ts`:

- State passthrough hooks: `useHydrated`, `useActiveSchemaKey`, `useSchema`, `useCursor`, `useLastSyncedAt`.
- Record passthrough hooks: `useEntityRecordIds`, `useRecord`, `useRecordsById`, `useRecordCreatedAt`, `useRecordField`.
- Derived projection hooks: `useReferenceOptions`, `useEntityRecordIdsMatchingQuery`, `useEntityRecordOptionsMatchingQuery`, `useEntityRecordCountMatchingQuery`, `useAggregateValueMatchingQuery`, `useEntityRecordCountReferencingField`, `useRecordReadinessWarnings`.

Projection selector surface in `src/client/store.ts`:

- `createEntityRecordIdsMatchingQuerySelector`: returns active entity ids for `all` queries and filtered ids through `matchesQuery`.
- `createEntityRecordOptionsMatchingQuerySelector`: returns matching ids and labels for query-filtered reference pickers.
- `createEntityRecordCountMatchingQuerySelector`: counts active entity records matching a query.
- `createAggregateValueMatchingQuerySelector`: evaluates aggregate read-model values over local query-matching records.
- `createEntityRecordCountReferencingFieldSelector`: counts active entity records whose field equals a referenced record id.
- `createReferenceOptionsSelector`: returns active entity ids and display labels for reference editors.
- `createRecordReadinessWarningsSelector`: returns generated readiness warnings for one local record.

Current identity and fallback behavior:

- `recordIdsByEntity` excludes tombstoned records before projection selectors run.
- Query-id selectors return the stored entity id array for `all` queries.
- Filtered query-id selectors reuse the same result array when ids are unchanged after unrelated record patches.
- Filtered query and option selectors include `today` and sorted context values in the cache key.
- Empty query-id results reuse the shared empty id array.
- Reference options use `displayField` only when the field value is a non-blank string; otherwise the label falls back to record id.
- Reference option arrays reuse prior arrays when ids and labels are unchanged.
- Aggregate selectors cache by entity id array, `recordsById` identity, and context key, then delegate values to `evaluateAggregate`.
- Readiness warning selectors reuse warning arrays when warning code and message output is unchanged.

PRD 26 dependency check:

- PRD 26 preview routes use public tree reads and push-sync invalidation, not browser store projection selectors.
- PRD 26 publish builds restore data from source schema and source seed records, not browser store projection selectors.
- Generated Site editor screens still consume the store projection hooks listed above.
- No PRD 26 preview or publish blocker was found in BRP-01.

## Chunks

### BRP-01: Characterize current projections

Status: shipped

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

Status: shipped

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

Status: ready

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
- BRP-01 added `src/client/store.test.ts` coverage for query-id selection, context-sensitive query ids, reference option label fallback, reference counts, and readiness warning selector reuse.
- BRP-01 confirmed existing `src/client/store.test.ts` coverage for query options, query counts, aggregate values, context changes, tombstoned records, and selector notifications.
- BRP-02 added `src/client/projections.test.ts` coverage for entity filters, context filters, missing-entity empty results, tombstoned snapshot records, reference counts, and stable array reuse.

## Blockers

- None hard.
- Prefer shipping after PRD 26 unless preview or publish work exposes projection bugs.
- BRP-01 blocker check: none found.
- BRP-02 blocker check: none found.

## Promote after ship

- `doc/current.md`: browser replica projection module `src/client/projections.ts` owns query ids, query options, query counts, reference options, and reference counts.
- `doc/current.md`: store hooks in `src/client/store.ts` adapt to projection selectors while store mutation, hydration, and reconciliation stay in the store.
- `doc/roadmap.md`: only if this changes first-release scope wording.

## Status Log

- 2026-05-12: BRP-01 shipped. Projection hooks and selector factories are mapped above.
- 2026-05-12: BRP-01 evidence: `.devstate/status.md` reports checks ok, web service ready at `https://28-browser-replica-projection-module.formless.local`, and watcher tests passing.
- 2026-05-12: BRP-01 test evidence: `.devstate/logs/service-test.txt` reports `src/client/store.test.ts` passed with 28 tests.
- 2026-05-12: BRP-01 check evidence: `.devstate/logs/check-vite.txt` reports formatting complete and no warnings, lint errors, or type errors across 209 files.
- 2026-05-12: BRP-01 browser smoke skipped because this chunk only exported selector factories and added characterization tests; rendered app behavior did not change.
- 2026-05-12: BRP-02 shipped. Added `src/client/projections.ts`; moved query id, query option, query count, reference option, and reference-count selectors behind the projection module; kept store hooks as adapters.
- 2026-05-12: BRP-02 test evidence: `.devstate/logs/service-test.txt` reports `src/client/projections.test.ts` reran and passed 5 tests; earlier watcher run reported all 196 tests passing.
- 2026-05-12: BRP-02 check evidence: `.devstate/logs/check-vite.txt` reports formatting complete and no warnings, lint errors, or type errors across 211 files.
- 2026-05-12: BRP-02 loop evidence: `tmp/devstate.json`, `tmp/test.txt`, and `tmp/check.txt` were absent in this checkout; `.devstate/status.md` reports checks ok and services running.
- 2026-05-12: BRP-02 browser smoke: `bun browser --session brp-02 --ignore-https-errors batch --bail` opened `/tasks`, `/rates` (current redirect to `/estii`), and `/site`; `bun browser --session brp-02 errors` returned no page errors.

## 1. Write-Log Boundary

- [x] 1.1 Extract focused write-log helpers for mutation replay lookup, action replay lookup, change-row append, action execution persistence, cursor reads, and change readback from `src/worker/storage.ts`.
- [x] 1.2 Route create, patch, and delete mutation writes through the write-log helpers while preserving current mutation response shape, change payloads, and replay responses.
- [x] 1.3 Route action-created records, action tombstones, empty action responses, and action replay through the write-log helpers while preserving current action response shape.
- [x] 1.4 Add storage tests for source seed change rows, mutation replay, action replay, committed/replayed outcomes, change ordering, cursor calculation, and `GET /sync` readback.

## 2. Record Materialization

- [x] 2.1 Separate create, patch, and delete record materialization from change-row append behavior while keeping stored records flat.
- [x] 2.2 Separate action record materialization for create sets and tombstone sets from action execution and change-row persistence.
- [x] 2.3 Keep source schema reset, seed reset, and snapshot restore plans explicit while sharing write-log helpers only for committed change facts and cursors.
- [x] 2.4 Preserve archive app data restore through installed app storage identity and current reset/snapshot response shapes.
- [x] 2.5 Add storage, action, snapshot, and archive tests for patched records, tombstones, action effects, reset table clearing, schema reset pruning, restore validation, action execution clearing, and monotonic cursors.

## 3. Authority And Sync Adapters

- [x] 3.1 Adapt Authority operation execution to consume the deeper storage write outcome interface without changing operation selection.
- [x] 3.2 Preserve HTTP response bodies, statuses, headers, cache policy, bootstrap shape, mutation shape, action shape, reset shape, restore shape, and sync shape.
- [x] 3.3 Preserve push sync policy so committed writes notify connected sockets, replayed writes do not notify, validation failures do not notify, and stale sockets do not block other sockets.
- [x] 3.4 Add Authority and Authority-operation tests for committed write notification, replay suppression, validation failure suppression, operation response compatibility, and cache headers.
- [x] 3.5 Add sync/client tests for HTTP catch-up, WebSocket hello catch-up, delete reconciliation, cursor updates, and schema timestamp behavior after the storage refactor.

## 4. Verification And Promotion Notes

- [x] 4.1 Run `openspec status --change deepen-storage-write-log` and confirm the change remains apply-ready before implementation starts.
- [x] 4.2 Run `devstate check` and read `./.devstate/status.md`; fix any red status before finishing each implementation chunk.
- [x] 4.3 Run browser smoke with `bun browser ...` only if visible app behavior changes, and record why it was or was not required.
- [x] 4.4 Record promotion notes for the final write-log owner, record materialization owner, reset/restore owner, and Authority broadcast policy before finalization.
- [x] 4.5 Do not promote global specs until implementation is reviewed and finalization is requested.

## Evidence

- 2026-05-28 olga 1.1:
  - Files: `src/worker/storage-write-log.ts`, `src/worker/storage.ts`.
  - Checks: `devstate check` passed; `./.devstate/status.md` shows checks ok.
  - Smoke: not run; helper extraction is storage-internal and changes no visible app behavior.
- 2026-05-28 olga 1.2:
  - Files: `src/worker/storage-write-log.ts`, `src/worker/storage.ts`.
  - Checks: `openspec status --change deepen-storage-write-log --json` showed apply artifacts done; `devstate check` passed; `./.devstate/status.md` shows checks ok.
  - Smoke: not run; mutation write-log routing is storage-internal and changes no visible app behavior.
- 2026-05-28 olga 1.3:
  - Files: `src/worker/storage-write-log.ts`, `src/worker/storage.ts`.
  - Checks: `devstate check` passed; `./.devstate/status.md` shows checks ok.
  - Smoke: not run; action write-log routing is storage-internal and changes no visible app behavior.
- 2026-05-28 olga 1.4:
  - Files: `src/worker/storage.test.ts`.
  - Checks: `openspec status --change deepen-storage-write-log --json` showed apply artifacts done; `devstate check` passed; `./.devstate/status.md` shows checks ok.
  - Smoke: not run; storage write-log test coverage changes no visible app behavior.
- 2026-05-28 olga 2.1:
  - Files: `src/worker/storage.ts`.
  - Decision: create, patch, and delete mutation paths now materialize flat stored records or tombstones before appending mutation write-log changes.
  - Checks: `openspec status --change deepen-storage-write-log --json` showed apply artifacts done; `devstate check` passed; `./.devstate/status.md` shows checks ok.
  - Smoke: not run; mutation storage refactor is storage-internal and changes no visible app behavior.
- 2026-05-28 olga 2.2:
  - Files: `src/worker/storage.ts`.
  - Decision: action create and tombstone paths now materialize flat stored records or tombstones before appending action write-log changes and persisting action execution rows.
  - Checks: `openspec status --change deepen-storage-write-log --json` showed apply artifacts done; `devstate check` passed; `./.devstate/status.md` shows checks ok.
  - Smoke: not run; action storage refactor is storage-internal and changes no visible app behavior.
- 2026-05-28 olga 2.3:
  - Files: `src/worker/storage.ts`.
  - Decision: source data writes, source schema reset pruning, and snapshot restore now build explicit plans, materialize record rows, then append committed write-log changes; reset/restore still use write-log helpers only for change facts and cursor readback.
  - Checks: `openspec status --change deepen-storage-write-log --json` showed apply artifacts done; `devstate check` passed; `./.devstate/status.md` shows checks ok.
  - Smoke: not run; reset/restore storage refactor is storage-internal and changes no visible app behavior.
- 2026-05-28 olga 2.4:
  - Files: `src/worker/archive-restore.ts`, `src/worker/archive-api.ts`, `src/worker/authority.ts`.
  - Decision: archive app data restore now requires an installed app storage identity, plans source-record and snapshot restores before durable mutation, and returns the underlying storage write outcome so reset and snapshot bootstrap response shapes remain unchanged.
  - Checks: `openspec status --change deepen-storage-write-log --json` showed apply artifacts done; `devstate check` passed; `./.devstate/status.md` shows checks ok.
  - Smoke: not run; archive app data restore routing is storage-internal and changes no visible app behavior.
- 2026-05-28 olga 2.5:
  - Files: `src/worker/storage.test.ts`, `src/worker/archive-api.test.ts`.
  - Coverage: patched record payloads keep full flat values; source seed reset clears records, changes, and action execution rows; source schema reset prunes retired values through patch rows; action-created records persist before action replay state; snapshot restore keeps cursor ordering monotonic; archive replacement restore advances installed app cursors and clears stale action replay.
  - Checks: `openspec status --change deepen-storage-write-log --json` showed apply artifacts done; `devstate check` passed; `./.devstate/status.md` shows checks ok.
  - Smoke: not run; test-only coverage changes no visible app behavior.
- 2026-05-28 olga 3.1:
  - Files: `src/worker/authority-operations.ts`, `src/worker/authority.ts`, `src/worker/archive-api.ts`.
  - Decision: Authority write adapters now receive the full `WriteOutcome`, unwrap `outcome.response` for protocol bodies, and keep committed/replay classification available to the write notifier without changing operation selection.
  - Checks: `openspec status --change deepen-storage-write-log --json` showed apply artifacts done; `devstate check` passed; `./.devstate/status.md` shows checks ok.
  - Smoke: not run; Authority write adapter refactor is internal and changes no visible app behavior.
- 2026-05-28 olga 3.2:
  - Files: `src/worker/authority-operations.ts`, `src/worker/archive-api.ts`.
  - Decision: Authority operation results now use a protocol response body union and write-result unwrapping only accepts protocol-shaped bodies, so `WriteOutcome` metadata remains internal while bootstrap, mutation, action, reset, restore, and sync response bodies stay unchanged; archive app data restore explicitly unwraps to `BootstrapResponse`.
  - Checks: `devstate check` passed; `./.devstate/status.md` shows checks ok.
  - Smoke: not run; response boundary typing is internal and changes no visible app behavior.
- 2026-05-28 olga 3.3:
  - Files: `openspec/changes/deepen-storage-write-log/tasks.md`; verified implementation in `src/worker/authority.ts`, `src/worker/authority-operations.ts`, and `src/worker/archive-api.ts`.
  - Decision: committed/replayed notification policy remains driven by `WriteOutcome.kind`: `AuthorityWriteModule.apply` broadcasts only committed outcomes, replay outcomes return without notifying, validation failures occur before a write outcome is applied, and each WebSocket notification is isolated so a stale socket cannot stop later sockets.
  - Checks: `devstate check` passed; `./.devstate/status.md` shows checks ok.
  - Smoke: not run; Authority push sync policy was verified as behavior-preserving and changes no visible app behavior.
- 2026-05-28 olga 3.4:
  - Files: `src/worker/authority.test.ts`, `src/worker/authority-operations.test.ts`.
  - Coverage: Authority HTTP write tests now assert committed mutation broadcasts, replay suppression, validation failure suppression, protocol-shaped bodies without write outcome metadata, and `Cache-Control: no-store`; Authority-operation tests now assert committed/replayed outcome response unwrapping, validation-before-notifier behavior, and operation-level Site tree cache headers/status preservation.
  - Checks: `openspec status --change deepen-storage-write-log --json` showed apply artifacts done; `devstate check` passed; `./.devstate/status.md` shows checks ok.
  - Smoke: not run; test-only coverage changes no visible app behavior.
- 2026-05-28 olga 3.5:
  - Files: `src/client/sync.test.ts`, `src/worker/authority.test.ts`.
  - Coverage: HTTP sync catch-up now asserts write-log delete tombstones, cursor advancement, current-schema omission, and matching WebSocket hello catch-up from Authority; client sync now asserts WebSocket hello catch-up applies schema timestamps and cursor updates, and HTTP tombstone catch-up reconciles active records without replacing current schema metadata.
  - Checks: `openspec status --change deepen-storage-write-log --json` showed apply artifacts done; `devstate check` passed; `./.devstate/status.md` shows checks ok.
  - Smoke: not run; test-only sync/client coverage changes no visible app behavior.
- 2026-05-28 olga 4.1-4.5:
  - Files: `openspec/changes/deepen-storage-write-log/tasks.md`.
  - Checks: `openspec status --change "deepen-storage-write-log" --json` showed apply artifacts done before the slice; `devstate check` passed; `./.devstate/status.md` shows checks ok.
  - Smoke: not run; this slice updates only the change task artifact and changes no visible app behavior.
  - Promotion notes:
    - Write-log owner: `src/worker/storage-write-log.ts` owns mutation replay lookup, action replay lookup, change-row append/readback, cursor reads, and action execution persistence.
    - Record materialization owner: `src/worker/storage.ts` materializes flat create, patch, delete, action-created, and action tombstone record rows before write-log append.
    - Reset/restore owner: `src/worker/storage.ts` keeps source data, source schema reset, source seed reset, and snapshot restore plans explicit; archive app data restore enters storage through installed app identity handling in `src/worker/archive-api.ts`.
    - Authority broadcast policy: `src/worker/authority.ts` notifies sockets only when `WriteOutcome.kind` is `committed`; replayed writes and validation failures do not broadcast, and stale socket send failures are isolated.
  - Global specs: not promoted; `openspec/specs/*` remains unchanged until review and finalization are requested.
- 2026-05-28 olga finalization:
  - Status: finalization re-verified; global specs promoted and change left unarchived for review.
  - Rebase: `git rebase main` completed with branch already up to date.
  - Specs promoted: `openspec/specs/authority-storage/spec.md`, `openspec/specs/sync-replica/spec.md`.
  - Checks: `openspec validate deepen-storage-write-log --strict` passed; `devstate start` initially surfaced a stale red watcher in `src/worker/custom-domain-routing.test.ts`, then `devstate stop` and `devstate start` restarted services cleanly. Final `devstate check` passed and `./.devstate/status.md` showed checks ok, services running, and test watcher pass.

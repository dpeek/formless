## 1. Write-Log Boundary

- [ ] 1.1 Extract focused write-log helpers for mutation replay lookup, action replay lookup, change-row append, action execution persistence, cursor reads, and change readback from `src/worker/storage.ts`.
- [ ] 1.2 Route create, patch, and delete mutation writes through the write-log helpers while preserving current mutation response shape, change payloads, and replay responses.
- [ ] 1.3 Route action-created records, action tombstones, empty action responses, and action replay through the write-log helpers while preserving current action response shape.
- [ ] 1.4 Add storage tests for source seed change rows, mutation replay, action replay, committed/replayed outcomes, change ordering, cursor calculation, and `GET /sync` readback.

## 2. Record Materialization

- [ ] 2.1 Separate create, patch, and delete record materialization from change-row append behavior while keeping stored records flat.
- [ ] 2.2 Separate action record materialization for create sets and tombstone sets from action execution and change-row persistence.
- [ ] 2.3 Keep source schema reset, seed reset, and snapshot restore plans explicit while sharing write-log helpers only for committed change facts and cursors.
- [ ] 2.4 Preserve archive app data restore through installed app storage identity and current reset/snapshot response shapes.
- [ ] 2.5 Add storage, action, snapshot, and archive tests for patched records, tombstones, action effects, reset table clearing, schema reset pruning, restore validation, action execution clearing, and monotonic cursors.

## 3. Authority And Sync Adapters

- [ ] 3.1 Adapt Authority operation execution to consume the deeper storage write outcome interface without changing operation selection.
- [ ] 3.2 Preserve HTTP response bodies, statuses, headers, cache policy, bootstrap shape, mutation shape, action shape, reset shape, restore shape, and sync shape.
- [ ] 3.3 Preserve push sync policy so committed writes notify connected sockets, replayed writes do not notify, validation failures do not notify, and stale sockets do not block other sockets.
- [ ] 3.4 Add Authority and Authority-operation tests for committed write notification, replay suppression, validation failure suppression, operation response compatibility, and cache headers.
- [ ] 3.5 Add sync/client tests for HTTP catch-up, WebSocket hello catch-up, delete reconciliation, cursor updates, and schema timestamp behavior after the storage refactor.

## 4. Verification And Promotion Notes

- [ ] 4.1 Run `openspec status --change deepen-storage-write-log` and confirm the change remains apply-ready before implementation starts.
- [ ] 4.2 Run `devstate check` and read `./.devstate/status.md`; fix any red status before finishing each implementation chunk.
- [ ] 4.3 Run browser smoke with `bun browser ...` only if visible app behavior changes, and record why it was or was not required.
- [ ] 4.4 Record promotion notes for the final write-log owner, record materialization owner, reset/restore owner, and Authority broadcast policy before finalization.
- [ ] 4.5 Do not promote global specs until implementation is reviewed and finalization is requested.

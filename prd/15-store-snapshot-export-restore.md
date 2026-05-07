# PRD 15: Store snapshot export and restore

Status: planned
Current chunk: SNP-02
Last updated: 2026-05-07

## Goal

Let a developer export and restore one schema app store as JSON.

The first slice should:

- protect hand-authored schema and record work while schemas evolve;
- export from the authoritative Durable Object store;
- restore into the same schema-keyed authority instance;
- keep records flat;
- keep browser IndexedDB as a replica, not the export source;
- keep restore writes compatible with current push sync;
- avoid a general product import/export system.

This PRD is about developer store snapshots. It is not about app marketplace export, cross-app import, multi-tenant backup, or general import/export UI.

## Problem

Schema evolution can make local work fragile.

Current behavior:

- The authority owns schema and records.
- Browser storage is only a schema-keyed local replica.
- Fresh bootstrap seeds from source files only when storage is empty.
- Reset schema restores source schema and preserves records.
- Reset seed restores source schema and source records, but deletes user-created work.
- Schema compatibility checks can reject a schema update when existing records no longer satisfy the new schema.
- There is no durable JSON artifact a developer can save before changing schema shape.

That means useful local authoring work can be lost during schema experiments, source seed cleanup, reset flows, or local development environment churn.

## Source map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Protocol types: `src/shared/protocol.ts`.
- Authority routes: `src/worker/authority.ts`.
- Authority dispatch: `src/worker/index.ts`.
- Storage tables and writes: `src/worker/storage.ts`.
- Worker source app registry: `src/worker/schema-apps.ts`.
- Shared app registry: `src/shared/schema-apps.ts`.
- Client sync calls: `src/client/sync.ts`.
- Client local DB: `src/client/db.ts`.
- Client store: `src/client/store.ts`.
- Route reset controls: `src/app/dev-actions.tsx`.
- Schema route: `src/app/routes/schema.tsx`.
- Storage tests: `src/worker/storage.test.ts`.
- Authority tests: `src/worker/authority.test.ts`.
- Protocol tests: `src/shared/protocol.test.ts`.
- Sync tests: `src/client/sync.test.ts`.
- App tests: `src/app.test.tsx`.

Owned files:

- `prd/15-store-snapshot-export-restore.md`.

Likely changed files:

- `src/shared/protocol.ts`.
- `src/worker/storage.ts`.
- `src/worker/authority.ts`.
- `src/client/sync.ts`.
- `src/app/dev-actions.tsx`.
- `src/app/routes/schema.tsx` only if control placement requires route wiring.
- `src/shared/protocol.test.ts`.
- `src/worker/storage.test.ts`.
- `src/worker/authority.test.ts`.
- `src/client/sync.test.ts`.
- `src/app.test.tsx`.

Possible extracted modules:

- Store snapshot protocol parser.
- Store snapshot restore validator.
- Storage snapshot writer.
- Snapshot file UI helper.

## Requirements

### Runtime behavior

- A developer can export the active schema app store as JSON.
- A developer can restore a previously exported snapshot into the same schema app.
- Export and restore are schema-keyed.
- `/tasks` snapshots cannot restore into `/rates` or `/site`.
- `/rates` snapshots cannot restore into `/tasks` or `/site`.
- `/site` snapshots cannot restore into `/tasks` or `/rates`.
- Export reads the authority store, not IndexedDB.
- Restore writes the authority store, not IndexedDB directly.
- Restore response gives the client a full post-restore bootstrap payload.
- The restoring browser updates its selected local replica from the restore response.
- Other open browser replicas receive restore changes through existing push sync.
- Restore is one atomic authority write.
- Failed restore validation does not change schema, records, cursor, or action execution rows.
- Failed restore validation does not broadcast push sync.
- Committed restore broadcasts push sync.
- Restore keeps one authority instance per schema key.
- Restore keeps current storage tables unless implementation proves a small metadata table is needed.
- Restore does not require manual `bun stop` or Durable Object deletion.

### Snapshot JSON behavior

- Snapshot JSON is versioned.
- Snapshot JSON includes a fixed kind string.
- Snapshot JSON includes the schema key.
- Snapshot JSON includes an export timestamp.
- Snapshot JSON includes the active schema.
- Snapshot JSON includes the active schema updated timestamp as source metadata.
- Snapshot JSON includes stored records.
- Snapshot JSON includes tombstoned records when they exist.
- Snapshot JSON includes the source cursor as metadata.
- Snapshot JSON does not include raw change rows.
- Snapshot JSON does not include action execution rows.
- Snapshot JSON does not include read-model values.
- Snapshot JSON does not include normalized client store state.
- Snapshot JSON does not include IndexedDB metadata such as `lastSyncedAt`.
- Snapshot JSON should be stable enough to review in git diffs.

### Restore validation behavior

- Restore rejects malformed JSON.
- Restore rejects unknown snapshot kinds.
- Restore rejects unsupported snapshot versions.
- Restore rejects schema-key mismatch.
- Restore parses the snapshot schema through the existing schema parser.
- Restore validates every snapshot record as `StoredRecord`.
- Restore validates flat record values.
- Restore rejects records whose entity is missing from the snapshot schema.
- Restore rejects record fields missing from the snapshot schema.
- Restore validates stored field values against field behavior rules that apply to existing records.
- Restore validates reference fields against snapshot records.
- Restore rejects references to missing records.
- Restore rejects references to records of the wrong entity.
- Restore rejects references to tombstoned records.
- Restore validates unique constraints against the restored active records.
- Restore rejects duplicate record IDs.
- Restore rejects invalid `createdAt` and `deletedAt` shapes.
- Restore rejects `deletedAt` values older than `createdAt` only if the project already has a date ordering helper that makes this check cheap and source-faithful.
- Restore may ignore unknown top-level fields only if version parsing says they are extension metadata.

### Storage behavior

- Restore sets the active schema to the snapshot schema.
- Restore gives the active schema a new `schemaUpdatedAt` timestamp for the committed restore.
- Restore preserves record IDs from the snapshot.
- Restore preserves record `createdAt` values from the snapshot.
- Restore preserves record `deletedAt` values from the snapshot.
- Restore upserts records present in the snapshot.
- Restore tombstones current records absent from the snapshot.
- Restore appends synthetic restore changes for records that need replicas to update.
- Restore does not reset the `changes` autoincrement cursor.
- Restore keeps sync cursors monotonic.
- Restore does not rely on clients noticing a cursor rollback.
- Restore clears action replay history only if keeping it would make restored state inconsistent.
- If restore clears action replay history, that happens in the same transaction as the restore.
- Restore response cursor is the latest post-restore cursor.
- A fresh bootstrap after restore returns the restored schema, restored records, and post-restore cursor.
- HTTP sync from a pre-restore cursor returns enough changes to converge another replica.
- WebSocket sync from a pre-restore cursor returns enough changes to converge another replica.

### API behavior

- Add `GET /api/:schemaKey/snapshot`.
- Add `POST /api/:schemaKey/snapshot/restore`.
- Snapshot export returns JSON.
- Snapshot restore accepts JSON.
- Snapshot restore returns a bootstrap-shaped response.
- Snapshot restore uses HTTP as the write path.
- Snapshot restore uses the same committed-write notification path as schema, mutation, action, and reset writes.
- Existing API paths stay unchanged.
- Existing reset schema behavior stays unchanged.
- Existing reset seed behavior stays unchanged.
- Existing mutation and action replay behavior stays unchanged except where restore explicitly clears replay state.

### UI behavior

- Add developer snapshot controls to the active app's schema route or existing dev action area.
- Export downloads or opens a JSON file for the active schema app.
- Restore accepts a JSON file.
- Restore asks for explicit confirmation before posting.
- Restore shows route-scoped copy so the active app is clear.
- Restore success refreshes the visible schema and records.
- Restore failure shows the server error.
- Snapshot controls should not look like a general product import/export feature.
- Snapshot controls should not appear on public page routes.

### Future fit

- Snapshot protocol can later support migration metadata.
- Snapshot protocol can later support dry-run restore.
- Snapshot protocol can later support partial record restore.
- Snapshot protocol can later support source seed replacement tooling.
- Snapshot protocol can later support command-line export and restore.

## Proposed snapshot shape

Initial snapshot envelope:

```json
{
  "kind": "formless.storeSnapshot",
  "version": 1,
  "schemaKey": "site",
  "exportedAt": "2026-05-07T00:00:00.000Z",
  "schemaUpdatedAt": "2026-05-07T00:00:00.000Z",
  "sourceCursor": 42,
  "schema": {},
  "records": []
}
```

Notes:

- `schema` is a parsed `AppSchema` serialized as JSON.
- `records` are `StoredRecord[]`.
- `sourceCursor` is metadata only; restore must not set the active cursor back to this value.
- Exact field names can change during implementation if tests show a clearer shape.

## Decisions

| ID      | Decision                                          | Reason                                                                                  | Evidence                                          |
| ------- | ------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------- |
| SNP-D1  | Export from the authority store.                  | Browser IndexedDB is a local replica, not authoritative state.                          | `doc/overview.md`, `src/client/db.ts`             |
| SNP-D2  | Keep snapshots schema-keyed.                      | One schema key maps to one authority instance and one browser DB.                       | `doc/current.md`, `src/worker/index.ts`           |
| SNP-D3  | Version the snapshot envelope.                    | Snapshot compatibility needs an explicit contract as storage and schema semantics grow. | `src/shared/protocol.ts`                          |
| SNP-D4  | Do not export raw changes.                        | Changes are sync transport history, not the portable store state.                       | `src/worker/storage.ts`                           |
| SNP-D5  | Do not export action execution rows.              | Action replay rows are authority implementation detail.                                 | `src/worker/storage.ts`                           |
| SNP-D6  | Restore by appending sync-visible changes.        | Cursor rollback can leave existing replicas stale.                                      | `src/client/sync.ts`, `src/worker/storage.ts`     |
| SNP-D7  | Restore sets a fresh schema update timestamp.     | Restore is a new committed schema state even when imported schema text is old.          | `src/worker/authority.ts`                         |
| SNP-D8  | Restore validates against the snapshot schema.    | The snapshot should be internally consistent before it becomes authoritative state.     | `src/shared/schema.ts`, `src/worker/authority.ts` |
| SNP-D9  | Keep UI scoped to developer controls.             | Roadmap excludes general import/export UI from first release.                           | `doc/roadmap.md`                                  |
| SNP-D10 | Return a bootstrap-shaped response after restore. | The restoring browser can replace its local replica in one existing path.               | `src/client/sync.ts`, `src/client/db.ts`          |

## Chunks

| ID     | Status  | Depends on | Main files                     | Acceptance                                                                                                |
| ------ | ------- | ---------- | ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| SNP-01 | shipped | none       | PRD                            | PRD captures scope, decisions, chunks, blockers, and promote notes.                                       |
| SNP-02 | planned | SNP-01     | protocol, tests                | Snapshot envelope parses, rejects bad kind/version/schema key shape, and preserves supported JSON shape.  |
| SNP-03 | planned | SNP-02     | storage, storage tests         | Storage can export and restore snapshots atomically with monotonic cursor behavior.                       |
| SNP-04 | planned | SNP-03     | authority, authority tests     | Snapshot export and restore routes are schema-keyed, validate input, and broadcast only on commit.        |
| SNP-05 | planned | SNP-04     | client sync, app UI, app tests | Schema route exposes developer export/restore controls and refreshes the local replica after restore.     |
| SNP-06 | planned | SNP-05     | browser smoke, PRD             | Browser smoke covers export/restore flow; PRD status, decisions, blockers, and promote notes are current. |

## Non-goals

- Do not build general import/export UI.
- Do not build app marketplace packaging.
- Do not support cross-schema-key restore.
- Do not support cross-app references.
- Do not support partial restore.
- Do not support merge conflict UI.
- Do not support user-facing backups.
- Do not add users, permissions, sessions, or auth.
- Do not change the flat record model.
- Do not store read-model output.
- Do not add a new sync protocol.
- Do not make WebSocket a write path.
- Do not change source seed file format.

## Parallel shipping

Can ship in parallel with:

- PRD 14 if snapshot work avoids generated table files and site schema table changes.
- Docs steward work if it does not edit this PRD.

Should not ship in parallel with:

- Authority write-module changes that touch the same restore and committed-write paths.
- Any storage table rewrite without explicit coordination.
- Any sync protocol rewrite without explicit coordination.

Recommended order:

1. Ship protocol and storage first.
2. Add authority routes after storage restore semantics are tested.
3. Add client UI after route behavior is stable.

## Promote after ship

- `doc/current.md`: note snapshot export and restore API paths if shipped.
- `doc/current.md`: note that snapshot restore is an authority write and preserves monotonic sync cursors if shipped.
- `doc/current.md`: note developer snapshot controls on schema routes if shipped.
- `doc/roadmap.md`: add snapshot export and restore only if it becomes first-release scope.
- SNP-01: no global doc promotion. PRD only.
- SNP-02: no global doc promotion. Protocol only.
- SNP-03: promote storage snapshot restore behavior if shipped.
- SNP-04: promote API paths and authority write semantics if shipped.
- SNP-05: promote client controls if shipped.
- SNP-06: no global doc promotion beyond final shipped facts above.

## Evidence

- 2026-05-07 SNP-01: PRD drafted from user request and checked against `doc/overview.md`, `doc/current.md`, `doc/roadmap.md`, `src/shared/protocol.ts`, `src/worker/authority.ts`, `src/worker/storage.ts`, `src/client/db.ts`, and `src/client/sync.ts`.
- 2026-05-07 SNP-01: `bun start` reports `testStatus: pass` and `checkStatus: pass`.
- 2026-05-07 SNP-01: shipped PRD-only chunk; `./tmp/test.txt` reports 29 files and 506 tests passing, and `./tmp/check.txt` reports formatting plus lint/type check passing for 166 files.

## PRD status notes

- PRD drafted 2026-05-07.
- SNP-01 shipped 2026-05-07.
- Current chunk: SNP-02.
- Current blocker: none.
- Main risk: restore must not reset sync cursors, because existing replicas use cursor catch-up.
- Main implementation note: use a small, tested restore module rather than putting restore diff logic directly in the route branch.

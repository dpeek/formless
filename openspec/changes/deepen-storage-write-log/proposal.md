## Why

Authority storage is the durable core for records, schemas, changes, action
executions, cursors, resets, restores, and idempotent replay. Its current broad
interface makes committed write invariants harder to see just as permissions,
audit trails, jobs, backup/restore UX, and observability are about to depend on
those invariants.

## What Changes

- Deepen the Authority storage write-log contract so committed/replayed write
  outcomes, mutation and action idempotency, change-row insertion, cursor
  calculation, and change readback have a focused, testable interface.
- Separate record materialization from change-log append behavior for create,
  patch, delete, action-created records, action tombstones, schema reset
  pruning, seed reset, and snapshot restore.
- Adapt Authority operation handling to consume storage write outcomes while
  preserving broadcast policy: committed writes notify push sync sockets,
  replayed writes do not, and failed validation does not.
- Preserve current Durable Object SQL tables, HTTP routes, protocol shapes,
  sync behavior, schema compatibility rules, reset semantics, snapshot restore
  semantics, installed-app storage identity, and public Site tree behavior.
- Keep validation before mutation; schema validation, auth/admin guards,
  reference checks, unique constraints, delete blockers, and snapshot
  validation remain outside the write-log append boundary.
- Add focused storage, Authority, action, archive, and sync coverage around the
  preserved behavior.
- Defer permissions, audit tables, background jobs, observability exports,
  archive format changes, browser replica redesign, and storage table redesign.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `authority-storage`: Authority storage names the write-log boundary as the
  owner of committed/replayed outcomes, idempotency, change rows, cursors, and
  replay readback while record materialization remains explicit.
- `sync-replica`: Push sync and HTTP catch-up continue to consume committed
  write facts from Authority storage so committed writes broadcast and replayed
  or failed writes do not.

## Impact

- Affects `src/worker/storage.ts`, `src/worker/authority.ts`,
  `src/worker/authority-operations.ts`, `src/worker/authority-validation.ts`,
  `src/worker/actions.ts`, `src/worker/archive-restore.ts`, `src/client/sync.ts`,
  and related tests.
- No API, protocol, route, table, archive envelope, schema, seed record, or
  browser IndexedDB shape changes are intended.
- Browser smoke is not required unless implementation changes visible app
  behavior.

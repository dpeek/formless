## Context

Authority storage currently owns table setup, source bootstrap, source reset,
snapshot restore, create/patch/delete writes, action effects, action replay,
mutation replay, change serialization, and cursor reads. `WriteOutcome` already
distinguishes committed writes from replayed writes, and Authority notification
already uses that outcome to notify only committed writes.

The broad part is still inside the storage module: record materialization,
change-row append, replay lookup, cursor readback, reset, restore, and action
execution persistence live close together. This change keeps the existing
protocol and table behavior, but makes the storage write-log boundary explicit
enough for later permissions, audit, jobs, backup/restore UX, and observability.

## Goals / Non-Goals

**Goals:**

- Make committed/replayed write outcomes the small interface consumed by
  Authority operation adapters.
- Isolate mutation/action idempotency, change-row append, cursor calculation,
  and change readback behind a focused write-log boundary.
- Keep record materialization explicit for create, patch, delete, action
  effects, schema reset pruning, seed reset, and snapshot restore.
- Preserve current SQL tables, route selection, API response shapes, cache
  headers, push sync behavior, reset behavior, snapshot behavior, archive
  restore behavior, and installed-app storage identity.
- Strengthen behavior-preserving tests around storage, Authority operations,
  push sync, actions, archives, and browser replica catch-up.

**Non-Goals:**

- No storage table redesign.
- No protocol, route, archive envelope, schema, or seed record shape changes.
- No new sync protocol or polling fallback.
- No permissions, audit log, jobs, queues, workflows, metrics, or tracing
  feature.
- No browser replica storage redesign.

## Decisions

### Keep `WriteOutcome` as the Authority boundary

Authority operations should continue to receive a `WriteOutcome<T>` from writes.
Committed outcomes notify push sync sockets; replayed outcomes return the stored
response without a second notification. Validation failures stay outside the
write outcome path because they do not mutate storage.

Alternative: make Authority infer notification behavior from response payloads
or change counts. That would couple notification policy to protocol shapes and
make replay behavior harder to review.

### Split write-log facts from record materialization

Create a focused write-log layer responsible for:

- client mutation and action replay lookup;
- change-row insertion;
- action execution persistence;
- cursor calculation;
- change lookup by mutation/action identity;
- `GET /sync` change readback.

Record materializers remain responsible for building stored records, patched
values, tombstones, action-created records, action tombstones, reset plans, and
restore records before they cross the write-log append boundary.

Alternative: extract one large storage service class. That would move code but
keep the same mixed responsibilities hidden behind a new object.

### Keep validation before mutation

Schema compatibility, value parsing, reference checks, unique constraints,
delete blockers, source schema reset validation, snapshot validation, and
owner/admin guards remain before any write-log append. The write log records
committed facts; it does not decide whether a write is allowed.

Alternative: centralize validation inside the write log. That would make the
write log know schema and auth concerns that currently belong to Authority
operation selection and validators.

### Keep reset and restore explicit

Seed reset and snapshot/archive restore are destructive operations, so they
should stay visibly planned and tested. They may share write-log helpers for
change rows and cursors, but the clear/reset/restore ordering remains explicit:
validate first, clear intended tables, restore schema and records, clear action
executions, and preserve monotonic sync cursors.

Alternative: express reset and restore as generic mutation batches. That would
reuse more code, but it would hide the destructive operation semantics reviewers
need to inspect.

### Migrate in reviewable slices

Land the cleanup in three slices: write-log primitives, record materializers,
then Authority adapters. Each slice must preserve protocol-visible behavior and
record `devstate check` evidence.

Alternative: refactor storage and Authority in one large pass. That would reduce
temporary adapters, but it would make replay, cursor, reset, restore, and push
sync regressions harder to isolate.

## Risks / Trade-offs

- Boundary churn could rename helpers without reducing coupling -> mitigate by
  assigning each extracted function one owner: replay, append, cursor, readback,
  or materialization.
- Replay regressions can create duplicate changes or duplicate broadcasts ->
  mitigate with mutation/action replay tests that assert response, change rows,
  action executions, cursor, and notification behavior.
- Reset and restore refactors can hide destructive ordering -> mitigate with
  tests for schema reset pruning, seed reset table clearing, snapshot restore,
  archive restore, action execution clearing, and monotonic cursor behavior.
- Tests can overfit private helper names -> mitigate by asserting durable
  storage behavior and protocol responses instead of internal function layout.
- Splitting storage can create circular imports with actions and archives ->
  mitigate by moving pure plan/materialization types downward and keeping
  Authority route/adaptor concerns out of storage helpers.

## Migration Plan

1. Extract write-log helpers for replay lookup, change append, cursor reads,
   change readback, and action execution persistence inside the storage
   ownership area.
2. Adapt create/patch/delete mutation writers and action effect writers to
   consume the write-log helpers without changing response shapes.
3. Adapt schema reset, seed reset, snapshot restore, and archive restore paths
   to keep explicit plans while sharing write-log append/cursor helpers.
4. Keep `WriteOutcome` as the Authority operation adapter interface and update
   Authority notification tests around committed, replayed, and failed writes.
5. Run `devstate check`; run browser smoke only if implementation changes
   visible app behavior.

Rollback is normal code rollback. No persisted storage migration is required
because table shapes and protocol data stay unchanged.

## Open Questions

- None.

---
name: Atomic authority writes
description: "Plan to make multi-record authority writes commit or fail as one unit."
last_updated: 2026-05-04
---

# Atomic authority writes

Status: proposed

## Must read

- `doc/overview.md`
- `src/worker/authority.ts`
- `src/worker/storage.ts`
- `src/worker/actions.ts`
- `src/worker/authority.test.ts`
- `src/worker/storage.test.ts`
- `src/shared/protocol.ts`
- `src/client/sync.ts`

## Goal

Make every authority write that returns a cursor commit as one durable unit.

The important case is `create` plus `create.afterCreate` hooks. A create that causes join records should either persist the primary record and all caused records, or persist none of them. Replay by mutation ID must return the same full change set without duplicating records.

## Approach

Move orchestration for create-time caused changes into one storage transaction.

Today the authority route creates the primary record, then executes after-create hooks through a second storage path. That works for the current prototype but is the wrong foundation for lifecycle behavior.

Add a storage-level helper that:

- checks existing mutation replay inside the transaction
- validates or receives already validated create values
- inserts the primary record
- evaluates supported after-create hooks against the same transaction state
- inserts caused records with the same mutation ID
- returns all change rows and the final cursor

Keep action replay semantics separate. Normal named actions should still replay through `action_executions`; lifecycle-caused rows can remain tied to the create mutation ID.

## Rules

- Do not add optimistic client behavior in this slice.
- Do not add a general lifecycle/rules engine.
- Do not change the public mutation response shape unless a test proves it is necessary.
- Keep action-created records and mutation-created records on the same change-log path.
- Avoid nested `transactionSync` calls. There should be one transaction boundary for a multi-record authority write.

## Open questions

- Should lifecycle-created change rows keep `op: "action"` or gain a narrower operation name later?
- Should hook execution record a separate audit row, or is the shared mutation ID enough for now?

## Success criteria

- Creating a resource or card returns the primary record plus caused rate records in one mutation response.
- Replaying the original create mutation returns the same full change set.
- A failed lifecycle write cannot leave only the primary record committed.
- Existing action replay still works.
- `bun run test` passes.
- `bun run check` passes.

## Tasks

1. Add a single-transaction storage helper for creates with caused records.
   - Files: `src/worker/storage.ts`, `src/worker/storage.test.ts`
   - Preserve the current `MutationResponse` shape.
   - Return changes ordered by change sequence.

2. Move after-create execution out of route-level orchestration.
   - Files: `src/worker/authority.ts`, `src/worker/actions.ts`
   - Keep schema validation in the authority layer.
   - Keep action-specific target selection reusable for `create-missing-join-records`.

3. Cover replay and failure behavior.
   - Files: `src/worker/authority.test.ts`, `src/worker/storage.test.ts`
   - Verify replay returns primary and caused changes.
   - Add a focused rollback test at the storage boundary if route-level failure is hard to trigger through valid schemas.

4. Verify client assumptions.
   - Files: `src/client/sync.ts`, `src/client/sync.test.ts`
   - Confirm the client still merges all response changes before advancing the cursor.

## Non-goals

- No delete mutation implementation.
- No general transaction API for arbitrary app code.
- No optimistic UI.
- No constraint framework; that is covered by `plan-schema-constraints.md`.

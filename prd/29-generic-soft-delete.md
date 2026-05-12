# PRD 29: Generic soft delete

Status: planned
Current chunk: GSD-01 ready
Last updated: 2026-05-12

Start before PRD 26 if Site authoring cleanup needs block/post/page deletion.

## Goal

Add proper generic soft delete mutations and generated delete UI.

This PRD owns:

- `delete` as a first-class generic mutation op;
- authority validation for soft deletes;
- storage tombstone writes through the mutation path;
- client submit helpers for delete mutations;
- generated delete controls where schema policy enables them;
- Site schema enablement only where deletion is safe.

This PRD does not add hard deletes, cascade deletes, trash restore, batch delete, or a visual page-builder workflow.

## Problem

The runtime already has tombstones, but authors cannot delete ordinary records through generic mutation UI.

Current behavior:

- Stored records can carry `deletedAt`.
- Query and selector paths hide tombstoned records.
- Snapshot restore can preserve tombstones and tombstone absent records.
- Entity actions can tombstone records.
- Site tree remove tombstones a `blockPlacement` edge.
- Generic mutation policy includes `delete`, but schema parsing rejects `delete.enabled: true`.
- Generic mutation requests only accept `create` and `patch`.
- Generated UI has create, patch, action, table edit, ordering, and tree placement remove controls.
- Generated UI has no generic delete control for records.

That leaves the Site editor with two confusing gaps:

- removing a child from a tree detaches the placement but does not delete the child block;
- accidental blocks, posts, pages, links, and other records have no normal delete path.

Authors need a safe delete command for records they created by mistake. The command should soft-delete the record and sync that tombstone to browser replicas. It should not physically remove storage rows.

## Source Map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Site authoring simplification PRD: `prd/23-site-authoring-simplification.md`.
- Authority operation module PRD: `prd/25-authority-operation-module.md`.
- Site publish workflow PRD: `prd/26-site-editing-publish-workflow.md`.
- Mutation policy parser: `src/shared/schema-mutations.ts`.
- Schema types: `src/shared/schema-types.ts`.
- Protocol mutation types: `src/shared/protocol.ts`.
- Authority mutation validation: `src/worker/authority-validation.ts`.
- Authority mutation execution: `src/worker/authority-operations.ts`.
- Storage tombstone helper for actions: `src/worker/storage.ts`.
- Client mutation submit helpers: `src/client/sync.ts`.
- Generated collection renderer: `src/app/generated/collection.tsx`.
- Generated table renderer: `src/app/generated/table.tsx`.
- Generated tree renderer: `src/app/generated/tree.tsx`.
- Site source schema: `schema/apps/site/schema.json`.
- Task source schema: `schema/apps/tasks/schema.json`.
- Estii source schema: `schema/apps/estii/schema.json`.
- Existing tests: `src/shared/schema.test.ts`, `src/worker/authority.test.ts`, `src/worker/storage.test.ts`, `src/client/sync.test.ts`, `src/app.test.tsx`.

Owned files:

- `prd/29-generic-soft-delete.md`.

Likely changed files:

- `src/shared/schema-types.ts`.
- `src/shared/schema-mutations.ts`.
- `src/shared/protocol.ts`.
- `src/worker/authority-validation.ts`.
- `src/worker/authority-operations.ts`.
- `src/worker/storage.ts`.
- `src/client/sync.ts`.
- `src/app/generated/collection.tsx`.
- `src/app/generated/table.tsx`.
- `src/app/generated/tree.tsx`.
- `schema/apps/site/schema.json`.
- Tests near changed modules.

Possible changed files:

- `src/client/store.ts` only if delete response merging needs characterization.
- `src/app/generated/actions.tsx` only if delete controls are shared with action chrome.
- `lib/ui/src/alert-dialog.tsx` only if existing confirmation primitives need a small adapter.

## Requirements

### Mutation Behavior

- Generic mutation requests accept `op: "delete"`.
- Delete mutation requests include `mutationId`, `entity`, `op`, and `recordId`.
- Delete mutation requests do not include record field values.
- Delete mutation responses keep the existing mutation response shape.
- Delete mutations are idempotent by `mutationId`, like create and patch.
- Replayed delete mutations return the stored response without push notification.
- Committed delete mutations broadcast through the existing write notifier.
- Failed delete validation does not write storage and does not broadcast.
- Delete mutations set `deletedAt` on the stored record.
- Delete mutations append a sync-visible change row with the tombstoned record payload.
- Delete mutations leave `id`, `entity`, `values`, and `createdAt` intact.
- Delete mutations do not physically delete records or change rows.
- Delete mutations reject unknown records.
- Delete mutations reject records whose stored entity does not match the requested entity.
- Delete mutations reject already tombstoned records.
- Delete mutations reject entities whose `mutations.delete.enabled` is false.

### Reference Safety

- The first delete policy is restrictive.
- A record cannot be deleted while any active record references it through a reference field.
- Reference checks ignore tombstoned records.
- Reference checks use the active schema field definitions.
- Reference checks return a clear error that names the referencing entity, field, and record when practical.
- No cascade delete policy ships in this PRD.
- No orphan-producing generic delete ships in this PRD.
- Tree placement removal stays the command for detaching a child from one parent.
- Deleting a block is a separate command from removing one placement edge.

### Schema Behavior

- `delete.enabled` can parse as `true`.
- Existing schemas with `delete.enabled: false` keep parsing unchanged.
- Missing `delete` policy remains invalid because mutation policy shape already requires create, patch, and delete.
- `stringifySchema` preserves delete policy.
- Site source schema can enable delete only for entities where restrictive reference checks make sense.
- Task and Estii source schemas do not need delete enabled unless a chunk explicitly decides to expose it.

### Generated UI Behavior

- Generated delete controls render only when the entity has `mutations.delete.enabled`.
- Generated delete controls use a destructive confirmation flow before submitting.
- Generated delete controls use the existing shared alert-dialog primitive.
- Generated delete controls show a clear record label using existing display facts where available.
- Generated delete controls disable or surface an error while a delete is in flight.
- Successful delete closes any associated confirmation UI.
- Failed delete leaves the record visible and shows the authority error through existing sync/status behavior.
- Generated collection list/detail can delete the selected context record when enabled.
- Generated table rows can delete the row record when enabled.
- Generated tree nodes can delete the child block when enabled, distinct from removing the placement.
- Tree UI labels distinguish `Remove` from `Delete`.
- Tree remove continues to tombstone only `blockPlacement`.
- Tree delete tombstones the child block only if reference safety allows it.
- UI placement should stay compact and use destructive styling.

### Site Authoring Behavior

- Site authors can delete accidental blocks when no active placements or other records still reference them.
- Site authors can remove a block from a tree without deleting the block.
- Site authors cannot delete a block that is still placed under an active parent.
- Site authors cannot delete Header or Footer roots while they are active frame roots if active references or schema policy block it.
- Site authors can delete accidental posts or pages only after active placement references are removed.
- Public pages, `/blog`, and post routes omit tombstoned blocks through existing query/tree behavior.
- Source seed promotion in PRD 26 should omit tombstoned records by default through its own seed adapter.

### Future Fit

- Delete policy can later grow cascade, archive, restore, or trash semantics.
- Hard delete can later exist as an admin compaction operation, not author-facing delete.
- Batch delete can later submit multiple delete mutations or a batch endpoint.
- Destructive action confirmation can reuse the same confirmation pattern after this PRD.

## Implementation Decisions

| ID     | Decision                                                              | Reason                                                                                     | Evidence                                                                                                   |
| ------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| GSD-D1 | Generic delete means soft delete.                                     | Storage, sync, snapshots, and queries already use `deletedAt` tombstones.                  | `src/shared/protocol.ts`, `src/worker/storage.ts`, `src/shared/query.ts`                                   |
| GSD-D2 | Do not hard-delete rows from `records` or `changes`.                  | Browser replicas and sync cursors need a durable delete fact.                              | `src/client/sync.ts`, `src/worker/storage.ts`                                                              |
| GSD-D3 | Add `op: "delete"` to the generic mutation path.                      | The schema already models `mutations.delete`; the missing piece is mutation execution.     | `src/shared/schema-mutations.ts`, `src/worker/authority-validation.ts`                                     |
| GSD-D4 | Use restrictive reference checks for the first generic delete policy. | Cascades are too broad for first release and accidental orphaning would damage trees.      | `schema/apps/site/schema.json`, `src/site/tree.ts`, `prd/23-site-authoring-simplification.md`              |
| GSD-D5 | Keep tree remove separate from record delete.                         | A placement edge is not the child block; blocks can be reused.                             | `blockPlacement.removeTreePlacement`, `prd/23-site-authoring-simplification.md`                            |
| GSD-D6 | Generated delete controls are schema-policy driven.                   | Existing generated create and patch controls already respect entity mutation policy.       | `src/app/generated/create.tsx`, `src/app/generated/record-field-editor.tsx`, `src/app/generated/table.tsx` |
| GSD-D7 | Delete confirmation is mandatory in generated UI.                     | Delete is destructive from the author perspective even though storage keeps tombstone.     | Existing reset confirmation in `src/app/dev-actions.tsx`                                                   |
| GSD-D8 | Enable Site delete narrowly after generic behavior is proven.         | The immediate user problem is Site editor cleanup, but runtime behavior should be generic. | User direction 2026-05-12                                                                                  |
| GSD-D9 | Treat hard delete as storage compaction, not authoring behavior.      | Physical removal would complicate sync, replay, snapshots, and references.                 | Existing change-log storage model                                                                          |

### Deep Modules

- **Delete mutation validator:** validates delete requests, entity policy, target record state, and active inbound references before storage writes.
- **Storage delete mutation writer:** tombstones one stored record and records one mutation change through the same write outcome contract as create and patch.
- **Generated delete action UI:** small renderer/adapter for destructive confirmation, submit state, status messages, and record labels, reused by table, collection, and tree surfaces.

## Testing Decisions

- Parser tests should cover `delete.enabled: true`, `delete.enabled: false`, bad delete policy shapes, and stringify preservation.
- Protocol tests should cover delete mutation parsing or type guards if protocol helpers are extended.
- Authority tests should cover successful delete, disabled policy, unknown record, wrong entity, already tombstoned record, inbound reference rejection, replay, and broadcast behavior.
- Storage tests should cover tombstone write shape, change row shape, replay by mutation id, and no physical row removal.
- Client sync tests should cover submit delete helper and local merge of tombstone changes.
- Generated UI tests should cover delete control visibility by policy, confirmation requirement, successful disappearance from active results, and authority error display for blocked deletes.
- Site app tests should cover remove placement versus delete block as different controls.
- Tests should assert external behavior and response shape, not private helper order.
- Browser smoke should reset Site schema and seed, create a disposable child, delete it when unreferenced, attempt a blocked delete while referenced, remove a placement, and confirm public pages still render.

## Chunks

| ID     | Status  | Depends on | Main files                                    | Acceptance                                                                                                                       |
| ------ | ------- | ---------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| GSD-01 | ready   | none       | tests, PRD                                    | Current tombstone, mutation-policy, and tree-remove behavior is characterized; delete mutation contract is locked.               |
| GSD-02 | planned | GSD-01     | schema parser, protocol, authority validation | `delete.enabled: true` parses and `op: "delete"` validates with disabled, unknown, wrong-entity, tombstone, and replay coverage. |
| GSD-03 | planned | GSD-02     | storage, authority operations, tests          | Delete mutation commits a tombstone change, broadcasts only on commit, and preserves replay semantics.                           |
| GSD-04 | planned | GSD-03     | authority validation, storage/query tests     | Active inbound references block generic delete; tombstoned referencing records do not block delete.                              |
| GSD-05 | planned | GSD-04     | client sync, generated delete UI, app tests   | Generated collection/table/tree surfaces render confirmed delete controls only when schema policy enables them.                  |
| GSD-06 | planned | GSD-05     | Site source schema, app/browser smoke, PRD    | Site enables safe deletes, remove-vs-delete behavior is clear, browser smoke passes, and PRD evidence is current.                |

## Parallel Shipping

Can ship in parallel with:

- docs steward work that does not edit this PRD;
- public renderer polish that avoids mutation, generated tree, and Site schema files;
- browser replica projection work after delete response behavior is characterized.

Should coordinate with:

- PRD 26 Site publish workflow, because seed promotion should omit tombstones by default;
- PRD 27 generated authoring primitives, because delete UI should not deepen scattered generated UI policy if that extraction is active;
- PRD 28 browser replica projection module, because active selector behavior around tombstones is shared evidence.

Should not ship in parallel with:

- Authority mutation route rewrites;
- storage table rewrites;
- broad generated table/tree action refactors;
- Site schema simplification that changes `block` or `blockPlacement` reference semantics.

## Blockers

- None hard.
- GSD-05 should wait until the delete mutation contract is stable.
- GSD-06 should wait until reference-blocking behavior is proven in authority tests.

## Out of Scope

- Do not hard-delete records.
- Do not hard-delete change rows.
- Do not add cascade delete.
- Do not add trash restore.
- Do not add archive semantics.
- Do not add batch delete.
- Do not add undo.
- Do not add draft edit sessions.
- Do not add permissions.
- Do not add production write guards.
- Do not add a visual page builder.
- Do not delete child blocks when removing a placement.
- Do not update `doc/current.md` or `doc/roadmap.md` in normal PRD work.

## Promote after ship

- `doc/current.md`: generic delete mutations can soft-delete records through `deletedAt`.
- `doc/current.md`: delete mutation validation blocks active inbound references.
- `doc/current.md`: generated delete controls render only when entity delete policy is enabled.
- `doc/current.md`: Site tree remove detaches placement edges; Site delete tombstones block records when reference safety allows it.
- `doc/roadmap.md`: move proper delete mutations and generated delete UI out of Not First Release if shipped before release.
- PRD 26: note seed promotion omits tombstoned records by default after GSD ships.

## Evidence

- 2026-05-12: PRD created from user direction that soft delete already exists as tombstone behavior, but generic delete mutations and tree-editor delete controls do not.
- 2026-05-12: `devstate start` reported checks ok and services running at `https://formless.local`; command returned exit code 1 despite ready status.
- 2026-05-12: `.devstate/status.md` reports checks ok, web service ready, and test watcher passing.

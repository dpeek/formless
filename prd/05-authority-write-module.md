# PRD 05: Authority write module

Status: in progress
Current chunk: AW-02 shipped
Last updated: 2026-05-06

## Goal

Deepen authority write behavior into one module.

The first version should:

- keep current HTTP write paths;
- keep one authority instance per schema key;
- keep storage tables unchanged;
- keep records flat;
- commit writes atomically;
- broadcast push sync only after committed writes;
- keep replayed mutations and actions from broadcasting;
- make authority write behavior easier to test through one module.

This PRD is about authority write locality, not about new schema behavior.

## Problem

Authority write behavior is spread across the route handler.

Current write paths each reassemble:

- source schema initialization;
- request body parsing;
- mutation or action validation;
- schema compatibility validation;
- storage writes;
- unique constraint checks;
- caused records;
- bootstrap or mutation response shape;
- push-sync broadcast.

This makes the write module shallow.
The route interface exposes too much implementation knowledge.
Future changes to write semantics must touch many branches.

The most important repeated rule is:

- committed writes broadcast;
- failed validation does not broadcast;
- mutation replay does not broadcast;
- writes stay atomic across primary and caused records.

That rule should have one home.

## Source map

Existing anchors:

- Authority routes: `src/worker/authority.ts`.
- Storage writes: `src/worker/storage.ts`.
- Entity action execution: `src/worker/actions.ts`.
- Unique constraints: `src/worker/constraints.ts`.
- Authority tests: `src/worker/authority.test.ts`.
- Storage tests: `src/worker/storage.test.ts`.
- Push-sync protocol: `src/shared/protocol.ts`.
- Worker app source registry: `src/worker/schema-apps.ts`.

Owned files:

- `prd/05-authority-write-module.md`.

Likely changed files:

- `src/worker/authority.ts`.
- `src/worker/storage.ts`.
- `src/worker/actions.ts`.
- `src/worker/authority.test.ts`.
- `src/worker/storage.test.ts`.

## Requirements

### Runtime behavior

- Keep `/api/:schemaKey/bootstrap`.
- Keep `/api/:schemaKey/schema`.
- Keep `/api/:schemaKey/sync`.
- Keep `/api/:schemaKey/sync/ws`.
- Keep `/api/:schemaKey/mutations`.
- Keep `/api/:schemaKey/actions`.
- Keep `/api/:schemaKey/reset/schema`.
- Keep `/api/:schemaKey/reset/seed`.
- Keep writes on HTTP.
- Keep WebSocket push sync as notification only.
- Keep one Durable Object authority per schema key.
- Keep current storage tables.
- Keep current response shapes.
- Keep current status codes.

### Write semantics

- Schema writes broadcast after `app_schema` commit.
- Create mutations broadcast after record and caused-record commits.
- Patch mutations broadcast after record commit.
- Entity actions broadcast after action commits.
- Reset schema broadcasts after schema reset commit.
- Reset seed broadcasts after source seed commit.
- Failed validation does not broadcast.
- Mutation replay returns the stored response without broadcasting.
- Action replay returns the stored response without broadcasting.
- Unique constraints remain authority enforced.
- Reference integrity remains authority enforced.
- Schema compatibility checks remain authority enforced.

### Module depth

- Route branches should delegate write semantics.
- The write module should hide when to broadcast.
- The write module should hide response assembly for committed writes.
- The write module should preserve error modes visible to callers.
- Tests should cross the write module seam instead of asserting private branch order.

## Decisions

| ID    | Decision                                                      | Reason                                                              | Evidence                                                |
| ----- | ------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| AW-D1 | Keep HTTP as the write interface.                             | WebSocket push sync is notification only.                           | `doc/roadmap.md`, `prd/02-websocket-push-sync.md`       |
| AW-D2 | Keep storage shape unchanged.                                 | This PRD improves locality only.                                    | `src/worker/storage.ts`                                 |
| AW-D3 | Move committed-write notification behind the write module.    | Push-sync notification is a write invariant, not route boilerplate. | `src/worker/authority.ts`                               |
| AW-D4 | Keep request parsing close to the authority route for now.    | The route still owns HTTP shape and status codes.                   | `src/worker/authority.ts`                               |
| AW-D5 | Keep entity action internals outside this PRD.                | PRD 08 owns action-kind depth.                                      | `prd/08-entity-action-module.md`                        |
| AW-D6 | Preserve mutation and action replay behavior exactly.         | Replay is an authority idempotency invariant.                       | `src/worker/storage.ts`, `src/worker/authority.test.ts` |
| AW-D7 | Test committed write outcomes, not private helper call order. | The interface is the test surface.                                  | `src/worker/authority.test.ts`                          |
| AW-D8 | Route committed writes through `AuthorityWriteModule`.        | Notification belongs to committed-write handling.                   | `src/worker/authority.ts`                               |

## Chunks

| ID    | Status  | Depends on | Main files                                       | Acceptance                                                                                                   |
| ----- | ------- | ---------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| AW-01 | shipped | none       | tests                                            | Current committed, failed, and replayed write behavior is characterized.                                     |
| AW-02 | shipped | AW-01      | `src/worker/authority.ts`                        | Route write branches delegate committed-write notification.                                                  |
| AW-03 | draft   | AW-02      | `src/worker/storage.ts`, `src/worker/actions.ts` | Mutation, action, schema, and reset writes share one outcome path where useful.                              |
| AW-04 | draft   | AW-03      | tests                                            | Authority tests prove no broadcast on failed validation or replay, and broadcast after each committed write. |
| AW-05 | draft   | AW-04      | `prd/05-authority-write-module.md`               | PRD status and promote notes reflect shipped behavior.                                                       |

## Non-goals

- Do not add new API paths.
- Do not remove HTTP writes.
- Do not change sync protocol.
- Do not change storage table shape.
- Do not change schema syntax.
- Do not change field validation semantics.
- Do not refactor entity action kinds beyond what write orchestration needs.
- Do not add users, permissions, sessions, or auth.

## Parallel shipping

Can ship in parallel with:

- PRD 06 if PRD 06 owns generated home view model files only.
- PRD 07 if PRD 07 owns field behavior and generated field editor files only.

Should not ship in parallel with:

- PRD 08 without coordination, because both PRDs touch `src/worker/authority.ts`, `src/worker/actions.ts`, and action response flow.

Recommended order:

1. Ship PRD 05 before PRD 08.
2. Let PRD 06 and PRD 07 proceed in parallel if their chunks keep disjoint file ownership.

## Promote after ship

- `doc/current.md`: note that authority write behavior is routed through a write module; committed writes notify push sync; failed validation and replay do not notify.
- `doc/roadmap.md`: no change unless this becomes first-release release scope.
- AW-01: no global doc promotion. Tests only characterize existing write behavior.
- AW-02: promote that `src/worker/authority.ts` routes committed schema, mutation, action, and reset writes through `AuthorityWriteModule.committed`; action replay returns before notification.

## Evidence

- 2026-05-06 AW-01: `bun run test -- src/worker/authority.test.ts`.
- 2026-05-06 AW-01: `bun run check`; `bun run test`.
- 2026-05-06 AW-02: `bun run test -- src/worker/authority.test.ts`.
- 2026-05-06 AW-02: `bun run check`.
- 2026-05-06 AW-02: `bun run test`.

## PRD status notes

- PRD drafted 2026-05-06 from architecture review.
- AW-01 shipped 2026-05-06: added authority tests for caused-record create broadcasts, reset schema/seed broadcasts, failed schema/action validation without broadcasts, and existing mutation replay no-broadcast coverage.
- AW-02 shipped 2026-05-06: added `AuthorityWriteModule.committed` in `src/worker/authority.ts`; schema, create, patch, action, reset schema, and reset seed branches delegate committed-write notification; mutation and action replay return before notification.
- No blockers.

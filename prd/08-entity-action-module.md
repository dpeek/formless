# PRD 08: Entity action module

Status: draft
Current chunk: none
Last updated: 2026-05-06

## Goal

Deepen entity action behavior.

The first version should:

- keep existing action schema syntax;
- keep existing action request and response shapes;
- keep current action outcomes;
- make action kind parsing, request input validation, execution, and generated UI facts more local;
- make future named actions easier to add.

This PRD is about action module locality, not about adding a new action kind.

## Problem

Entity action behavior is spread across several modules.

Current action kind behavior spans:

- schema action parsing;
- schema action validation;
- create hook validation;
- authority request input validation;
- action execution;
- action replay;
- generated action button modeling;
- generated action button rendering.

REL-05 added selected join actions.
Those actions are generic and relationship-backed, but the behavior still spreads across parser, authority, executor, and generated UI.

The module is shallow because adding one action kind requires coordinated edits across many files.
The action kind itself should be the seam.

The deepened module should let each action kind own:

- schema shape;
- request input shape;
- execution rules;
- target count facts;
- generated UI needs.

## Source map

Existing anchors:

- Action schema types: `src/shared/schema-types.ts`.
- Action parser: `src/shared/schema-actions.ts`.
- Authority action request validation: `src/worker/authority.ts`.
- Action executor: `src/worker/actions.ts`.
- Storage action replay: `src/worker/storage.ts`.
- Generated action model selection: `src/client/views.ts`.
- Generated action renderer: `src/app/generated/actions.tsx`.
- Protocol types: `src/shared/protocol.ts`.
- Schema tests: `src/shared/schema.test.ts`.
- Authority tests: `src/worker/authority.test.ts`.
- View model tests: `src/client/views.test.ts`.
- App tests: `src/app.test.tsx`.

Owned files:

- `prd/08-entity-action-module.md`.

Likely changed files:

- `src/shared/schema-types.ts`.
- `src/shared/schema-actions.ts`.
- `src/shared/schema.test.ts`.
- `src/shared/protocol.ts`.
- `src/worker/authority.ts`.
- `src/worker/actions.ts`.
- `src/worker/authority.test.ts`.
- `src/client/views.ts`.
- `src/client/views.test.ts`.
- `src/client/sync.ts`.
- `src/app/generated/actions.tsx`.
- `src/app.test.tsx`.

## Requirements

### Runtime behavior

- `clearCompletedTasks` keeps working.
- `create-missing-join-records` keeps working.
- `create-selected-join-record` keeps working.
- `remove-selected-join-records` keeps working.
- Action replay keeps returning stored responses.
- Failed action validation does not commit.
- Failed action validation does not broadcast.
- Successful actions broadcast through authority write behavior.
- Existing action request shapes remain valid.
- Existing action response shapes remain valid.
- Existing source schemas parse unchanged.

### Module behavior

- Action kind schema parsing should live near action kind behavior.
- Action request input validation should live near action kind behavior.
- Action execution should dispatch through action kind behavior.
- Create hooks should validate against action kind capabilities.
- Generated UI facts should come from action model selection, not renderer-specific checks.
- Action replay should remain storage-backed.

### Future fit

- A future workflow action should add one action kind module.
- A future selected relationship action should not add route-specific authority branches.
- A future confirmation action should expose generated UI needs through action facts.
- A future action with typed input should validate input without bloating authority route code.

## Decisions

| ID    | Decision                                                   | Reason                                                          | Evidence                                           |
| ----- | ---------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| EA-D1 | Keep existing action syntax in the first pass.             | This PRD deepens action kind locality before adding behavior.   | `src/shared/schema-types.ts`                       |
| EA-D2 | Keep authority as the action write caller.                 | The authority owns invariants, commits, and push notification.  | `src/worker/authority.ts`                          |
| EA-D3 | Move request input validation out of authority route code. | Input shape belongs to the action kind interface.               | `src/worker/authority.ts`, `src/worker/actions.ts` |
| EA-D4 | Keep action replay storage-backed.                         | Idempotency is an authority/storage invariant.                  | `src/worker/storage.ts`                            |
| EA-D5 | Keep generated action UI generic.                          | Schema-declared actions should not become app-specific UI code. | `src/app/generated/actions.tsx`                    |
| EA-D6 | Ship after PRD 05 or coordinate tightly with it.           | PRD 05 owns authority write orchestration.                      | `prd/05-authority-write-module.md`                 |

## Chunks

| ID    | Status | Depends on | Main files                                                   | Acceptance                                                                                  |
| ----- | ------ | ---------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| EA-01 | draft  | none       | tests                                                        | Current action parse, validation, execution, replay, and UI behavior is characterized.      |
| EA-02 | draft  | EA-01      | `src/shared/schema-actions.ts`, `src/shared/schema-types.ts` | Action kind schema parsing and capabilities are represented through a deeper action module. |
| EA-03 | draft  | EA-02      | `src/worker/authority.ts`, `src/worker/actions.ts`           | Action request input validation and execution dispatch move behind action behavior.         |
| EA-04 | draft  | EA-03      | `src/client/views.ts`, `src/app/generated/actions.tsx`       | Generated action buttons consume action UI facts instead of branching on action kinds.      |
| EA-05 | draft  | EA-04      | tests, Browser Use if UI behavior changes                    | Tasks and rates action flows still pass.                                                    |
| EA-06 | draft  | EA-05      | `prd/08-entity-action-module.md`                             | PRD status and promote notes reflect shipped behavior.                                      |

## Non-goals

- Do not add a new action kind.
- Do not change action request or response shapes.
- Do not change storage table shape.
- Do not add workflows.
- Do not add permissions.
- Do not add confirmation schema.
- Do not change create, patch, or reset endpoints.
- Do not change field behavior.

## Parallel shipping

Should wait for or coordinate with:

- PRD 05, because both PRDs touch authority write and action execution flow.

Can ship in parallel with:

- PRD 07 if PRD 07 avoids action-related protocol and generated action files.

Can ship in limited parallel with:

- PRD 06 if PRD 06 avoids action model and generated action renderer changes.

Recommended order:

1. Ship PRD 05 or freeze its authority write module shape.
2. Ship EA-01 characterization.
3. Move parser and executor behavior.
4. Move generated action UI facts after PRD 06 home model changes settle.

## Promote after ship

- `doc/current.md`: note that action kind behavior is selected through a deeper action module; schema parsing, input validation, execution, and generated UI facts are concentrated by action kind.
- `doc/roadmap.md`: no change unless new release-scope action behavior is added.

## PRD status notes

- PRD drafted 2026-05-06 from architecture review.
- No code shipped yet.
- No blockers.

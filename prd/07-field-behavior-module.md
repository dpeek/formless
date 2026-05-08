# PRD 07: Field behavior module

Status: shipped
Current chunk: complete
Last updated: 2026-05-06

## Goal

Deepen field type behavior.

The first version should:

- keep existing field schema syntax;
- keep existing stored values;
- keep existing field editors;
- keep existing authority validation outcomes;
- concentrate per-field parse, validation, display, editor, and form value behavior;
- make adding future field types local.

This PRD is about field behavior locality, not about adding a new field type.

## Problem

The project memory says field types own validation, editing, and display behavior.

Current code only partly matches that bet.

Field behavior is spread across:

- field schema parsing;
- field type behavior tables;
- authority value validation;
- existing stored value validation;
- generated create form value extraction;
- generated inline editor rendering;
- generated display formatting;
- reference option rendering;
- number input conversion.

The field behavior module is shallow because adding or changing one field type requires edits in many places.

Examples:

- `text` format hints parse in schema fields but editor behavior lives in generated UI.
- `number` defaults and constraints parse in schema fields, validate in field behavior, and convert form values in generated create code.
- `reference` value shape validates in field behavior, but reference existence belongs to authority invariants.

The deepened module should make the distinction explicit:

- field type owns scalar value behavior;
- authority owns cross-record invariants;
- generated UI consumes field behavior instead of branching on every field type.

## Source map

Existing anchors:

- Field schema types: `src/shared/schema-types.ts`.
- Field parser: `src/shared/schema-fields.ts`.
- Field behavior: `src/shared/field-types.ts`.
- Field formatting helpers: `src/app/generated/format.ts`.
- Generated editor adapter: `src/app/generated/field-ui-adapters.ts`.
- Generated create renderer: `src/app/generated/create.tsx`.
- Generated inline editor: `src/app/generated/record-field-editor.tsx`.
- Generated display: `src/app/generated/record-field-display.tsx`.
- Field behavior tests: `src/shared/field-types.test.ts`.
- Schema parser tests: `src/shared/schema.test.ts`.
- App tests: `src/app.test.tsx`.

Owned files:

- `prd/07-field-behavior-module.md`.

Likely changed files:

- `src/shared/field-types.ts`.
- `src/shared/field-types.test.ts`.
- `src/shared/schema-fields.ts`.
- `src/shared/schema.test.ts`.
- `src/app/generated/field-ui-adapters.ts`.
- `src/app/generated/format.ts`.
- `src/app/generated/create.tsx`.
- `src/app/generated/record-field-editor.tsx`.
- `src/app/generated/record-field-display.tsx`.
- `src/app.test.tsx`.

## Requirements

### Runtime behavior

- Existing schemas parse unchanged.
- Existing seed records parse unchanged.
- Existing local records merge unchanged.
- Existing create forms submit the same values.
- Existing inline editors patch the same values.
- Existing display values remain equivalent.
- Existing authority validation messages stay stable where tests assert them.
- Reference existence checks remain authority invariants.
- No storage shape changes.

### Module behavior

- Field type behavior should own scalar default behavior.
- Field type behavior should own scalar create value encoding where possible.
- Field type behavior should own scalar input value decoding where possible.
- Field type behavior should own display formatting.
- Generated UI adapters should consume field behavior facts.
- React rendering may stay in generated UI.
- Cross-record validation must stay out of field type behavior.

### Future fit

- A future currency field should not require unrelated generated UI rewrites.
- A future media field should have one behavior seam for display and editor metadata.
- A future rich text field should not force authority code to know editor details.
- A future relationship-aware reference editor should build on the reference behavior seam.

## Decisions

| ID    | Decision                                                  | Reason                                                                  | Evidence                                    |
| ----- | --------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------- |
| FB-D1 | Keep current field schema syntax in the first pass.       | This PRD deepens behavior before broadening field types.                | `src/shared/schema-types.ts`                |
| FB-D2 | Keep React components in generated UI.                    | Shared field behavior should stay runtime-safe and non-React.           | `src/app/generated/record-field-editor.tsx` |
| FB-D3 | Keep reference existence validation in the authority.     | Reference existence is a cross-record invariant.                        | `src/worker/authority.ts`                   |
| FB-D4 | Keep text formats as editor hints.                        | PRD 03 decided markdown, href, slug, color, and icon still store text.  | `prd/03-personal-site-authoring.md`         |
| FB-D5 | Prefer behavior tests over renderer branch tests.         | The interface is the test surface.                                      | `src/shared/field-types.test.ts`            |
| FB-D6 | Preserve generated UI behavior before adding new editors. | Refactor should not change user workflows.                              | `src/app.test.tsx`                          |
| FB-D7 | Keep table column formats as field display options.       | Column formats are view hints; field behavior still owns scalar output. | `src/shared/field-types.ts`                 |

## Chunks

| ID    | Status  | Depends on | Main files                                                  | Acceptance                                                                             |
| ----- | ------- | ---------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| FB-01 | shipped | none       | tests                                                       | Current field parse, validation, create, patch, and display behavior is characterized. |
| FB-02 | shipped | FB-01      | `src/shared/field-types.ts`, `src/app/generated/format.ts`  | Scalar value conversion and display behavior move behind field behavior helpers.       |
| FB-03 | shipped | FB-02      | `src/app/generated/field-ui-adapters.ts`, generated editors | Generated create and inline editors consume field behavior facts with equivalent UI.   |
| FB-04 | shipped | FB-03      | tests, Browser Use if UI behavior changes                   | Tasks, rates, and site create/edit flows still pass.                                   |
| FB-05 | shipped | FB-04      | `prd/07-field-behavior-module.md`                           | PRD status and promote notes reflect shipped behavior.                                 |

## Non-goals

- Do not add new field types.
- Do not change stored field value shapes.
- Do not add rich text rendering.
- Do not add media upload.
- Do not add computed fields.
- Do not move React components into shared code.
- Do not change query syntax.
- Do not change authority reference existence checks.

## Parallel shipping

Can ship in parallel with:

- PRD 05 if PRD 05 does not move field validation code.
- PRD 08 if PRD 08 stays on action modules and does not edit generated field forms.

Can ship in limited parallel with:

- PRD 06 if PRD 06 avoids `src/app/generated/create.tsx`, `src/app/generated/field-ui-adapters.ts`, and field config shape changes.

Recommended order:

1. Ship FB-01 characterization first.
2. Allow PRD 06 to own home model files while PRD 07 owns field behavior files.
3. Integrate generated create/editor changes after any PRD 06 collection-renderer changes land.

## Promote after ship

- FB-01: no global doc promotion. Test-only characterization; runtime behavior unchanged.
- FB-02: `doc/current.md`: note that `src/shared/field-types.ts` owns scalar validation, default, create input conversion, inline input conversion, number input attributes, and display helpers; generated format/create/editor paths call those helpers.
- FB-03: `doc/current.md`: note that `src/shared/field-types.ts` owns generated editor control metadata, and `src/app/generated/field-ui-adapters.ts` exposes control/default/required/input-attribute facts for create and inline editors.
- FB-04: no global doc promotion. Regression-test coverage only; runtime behavior unchanged.
- FB-05: no global doc promotion. PRD closeout only; FB-02 and FB-03 promote notes remain ready for a doc/steward pass.
- `doc/roadmap.md`: no change unless a new release-scope field type is added.

## PRD status notes

- PRD drafted 2026-05-06 from architecture review.
- FB-01 shipped 2026-05-06.
- Existing parse and authority validation characterization remains in `src/shared/schema.test.ts` and `src/shared/field-types.test.ts`.
- Added create value characterization in `src/app.test.tsx`.
- Added patch input conversion, number input attribute, and display formatting characterization in `src/app/generated/format.test.ts`.
- Evidence: `bun run test src/app/generated/format.test.ts src/app.test.tsx`; `bun run test`; `bun run check`.
- FB-02 shipped 2026-05-06.
- Field behavior now exposes scalar create input conversion, inline input conversion, input attributes, and display formatting helpers in `src/shared/field-types.ts`.
- Generated format/create/editor code delegates scalar conversion and display to field behavior helpers.
- FB-02 evidence: `bun run test src/shared/field-types.test.ts src/app/generated/format.test.ts src/app.test.tsx`; `bun run test`; `bun run check`.
- FB-03 shipped 2026-05-06.
- Field behavior now exposes generated editor control metadata in `src/shared/field-types.ts`.
- Generated field UI adapters now expose control, create default, required, and input-attribute facts for create and inline editors.
- Generated create and inline editors consume adapter facts and field behavior conversion helpers with equivalent UI.
- FB-03 evidence: `bun run test src/shared/field-types.test.ts src/app/generated/field-ui-adapters.test.ts src/app/generated/format.test.ts src/app.test.tsx`; `bun run check`; `bun run test src/client/sync.test.ts`; `bun run test`.
- Browser Use not run; no intended app behavior change.
- No blockers.
- FB-04 shipped 2026-05-06.
- Added source-app create/edit flow regression coverage for tasks, rates, and site in `src/app.test.tsx`.
- Coverage uses source schema create actions, generated create value resolution, generated list editors, and generated table editors.
- FB-04 evidence: `bun run test src/app.test.tsx`; `bun run check`; `bun run test`.
- Browser Use not run; test-only change with no app behavior change.
- No blockers.
- FB-05 shipped 2026-05-06.
- PRD status is `shipped`.
- Current chunk is `complete`.
- Chunk table marks FB-01 through FB-05 shipped.
- Promote notes keep global doc changes limited to the shipped field behavior ownership facts from FB-02 and FB-03.
- FB-05 evidence: `bun run check`.
- Browser Use not run; PRD-only change with no app behavior change.
- No blockers.

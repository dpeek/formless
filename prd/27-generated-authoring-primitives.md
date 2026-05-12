# PRD 27: Generated authoring primitives

Status: in progress
Current chunk: GAP-02 ready
Last updated: 2026-05-12

## Goal

Make generated authoring behavior easier to extend by moving repeated create defaults, context selection, and generated navigation rules into explicit primitives.

This is a follow-on to PRD 23. PRD 23 should finish the visible authoring simplification first. This PRD deepens the implementation after that behavior is known and tested.

## Problem

Generated authoring behavior currently lives across schema parsing, generated views, app navigation, and store-facing UI code.

The pressure points are:

- Create defaults are parsed in `src/shared/schema-views.ts` and resolved in `src/app/generated/create.tsx`.
- Only context defaults are currently represented in `src/shared/schema-types.ts`.
- Context selection and fallback behavior sits in generated collection UI.
- Root navigation still contains generated record navigation rules in `src/app.tsx`.
- PRD 23 adds Site authoring behavior that will increase the amount of generated UI policy.

That makes future generated authoring changes feel like UI edits, even when they are really view-model rules.

## Source Map

- `src/shared/schema-types.ts`: create default schema shape.
- `src/shared/schema-views.ts`: view parser, create defaults parser, generated view model.
- `src/app/generated/create.tsx`: generated create form default resolution and submit behavior.
- `src/app/generated/collection.tsx`: generated collection tabs, context selector, list/detail authoring shell.
- `src/app.tsx`: root record navigation behavior.
- `src/client/views.ts`: client-side view model helpers, if PRD 23 moves behavior there.
- Existing parser and app tests around generated views and create flows.

## Requirements

- Keep PRD 23 behavior unchanged.
- Support the create-default behavior that exists after PRD 23, including context defaults and any literal defaults PRD 23 ships.
- Put create default parsing, validation, resolution, and submit shaping behind one small module boundary.
- Put generated context selection state, option fallback, and root navigation facts behind one small module boundary.
- Keep generated React components as renderers and adapters, not policy owners.
- Preserve the flat data model. Compose behavior in the view/query layer.
- Preserve existing route shapes and generated view schema unless a PRD 23 decision already changed them.
- Keep tests at the primitive boundary and at least one generated UI integration path.

## Non-Goals

- Do not add new authoring features beyond behavior already planned or shipped by PRD 23.
- Do not change storage schema.
- Do not change publish behavior.
- Do not update `doc/current.md` or `doc/roadmap.md` in normal PRD work.

## Decisions

- Ship after PRD 23, because PRD 23 is in flight and should keep ownership of the visible authoring simplification.
- Treat this as a behavior-preserving extraction unless PRD 23 leaves a small planned behavior gap that belongs to the primitive.
- Keep generated create defaults independent from React so they can be tested without rendering the app.
- Keep context selection independent from root app navigation so collection views and root routes can share the same facts without importing each other.
- Use existing schema parsers and view-model types. Add a new abstraction only where it removes repeated policy.
- GAP-01 confirmed PRD 23 is complete. GAP-02 can preserve shipped PRD 23 behavior.
- GAP-01 module names: `src/shared/create-defaults.ts` should own create-default parsing, validation, resolution, and submitted value shaping; `src/client/generated-authoring.ts` should own context fallback and root-navigation facts.

## Characterized Behavior

- Create defaults parse in `src/shared/schema-views.ts` and resolve in `src/app/generated/create.tsx`.
- Create defaults support context defaults and scalar literal defaults.
- Literal defaults are validated against target scalar field types.
- A defaulted create field is hidden from the create form and cannot also be visible.
- Fixed discriminator creates use a literal default to choose the active union variant.
- `resolveCreateValues` converts visible form values by field type, keeps only active union fields, fills missing defaulted fields, includes literal defaults, and throws when a required context default is unresolved.
- Collection context options come from the context query in `src/app/generated/collection.tsx`.
- A selected context id is preserved only when it still exists in the current option set.
- A missing or stale selected context id falls back to the first current context option.
- Empty context option sets keep active context null and render the empty context state.
- Scoped query context includes `today` plus `{ [context.name]: activeContextRecordId }` when an active context exists.
- List/detail context presentation renders the selected context record fields and hides the local selector for singleton or sidebar-navigation contexts.
- Context create actions select the created context record on success.
- Root generated navigation lives in `src/app.tsx`.
- Root navigation uses the first active screen collection section whose context has `navigation`.
- Root navigation replaces normal screen links with navigation groups from `context.navigation.groups`.
- Root navigation computes active record from route selection if still valid, otherwise from the first context option.
- Root navigation group options use each group's query and related count badges use `context.relatedCollection`.
- Site root navigation is not routed as `/site/navigation`, `/site/header`, or `/site/footer`.

## Chunks

### GAP-01: Characterize post-PRD 23 authoring behavior

Status: shipped

Tasks:

- Read the final PRD 23 implementation.
- List every create-default, context-selection, and generated-navigation rule now living outside a primitive.
- Add or confirm characterization tests for current behavior before extraction.
- Decide the narrow module names and ownership.

Acceptance:

- The PRD notes the exact behavior being preserved.
- Tests fail if create default resolution or context selector fallback changes accidentally.
- No production behavior changes in this chunk.

### GAP-02: Extract create default primitive

Status: ready

Tasks:

- Move create default parsing and validation into a focused shared module.
- Move create default resolution out of generated React components.
- Keep submit shaping for defaulted fields in one place.
- Cover context defaults, literal defaults if present, unsupported field errors, and missing context cases.

Acceptance:

- Generated create UI delegates to the primitive.
- Existing create flows keep the same saved values.
- Parser errors stay clear and source-faithful.

### GAP-03: Extract context selection and generated navigation primitive

Status: planned

Tasks:

- Model context selector options, selected value fallback, empty states, and tab/sidebar facts outside React.
- Move root generated record navigation rules into a reusable view-model helper.
- Keep UI components responsible for rendering only.

Acceptance:

- Collection UI and root navigation consume shared generated authoring facts.
- Context fallback behavior is covered by tests.
- Route and tab behavior remain unchanged.

### GAP-04: Replace scattered policy with primitive calls

Status: planned

Tasks:

- Remove duplicated generated authoring rules from React components.
- Keep names short and domain-specific.
- Add integration coverage for one Site create flow and one non-Site generated collection flow.

Acceptance:

- Generated authoring behavior is covered at primitive and UI adapter levels.
- The app still passes `devstate check`.
- The code path for a generated create default is traceable from schema to submitted record.

### GAP-05: Closeout and promotion notes

Status: planned

Tasks:

- Update this PRD with shipped facts, decisions, and remaining follow-ups.
- Add global-doc promotion notes only under this PRD's `Promote after ship` section.

Acceptance:

- PRD status reflects shipped chunks.
- Promotion notes point to code and tests.

## Tests

- Parser tests for create default schema and invalid default shapes.
- Primitive tests for default resolution and submit value shaping.
- Primitive tests for context selector fallback.
- Generated UI tests for create behavior and collection context switching.
- `devstate check` is green.

## Blockers

- None. PRD 23 is complete.

## Status Notes

- 2026-05-12: GAP-01 shipped as characterization only. PRD 23 is complete, and the preserved create-default, context-selection, and generated root-navigation rules are listed in this PRD.
- 2026-05-12: Existing create default characterization stays in `src/shared/schema.test.ts` and `src/app.test.tsx`: literal and context defaults parse, fixed-discriminator creates hide and submit literal defaults, scoped defaults submit selected context values, and unresolved context defaults throw.
- 2026-05-12: Added `src/app.test.tsx` coverage for stale scoped context selection falling back to the first available context option.
- 2026-05-12: No production behavior changed in GAP-01.

## Evidence

- `devstate start`: checks ok; web service ready at `https://27-generated-authoring-primitives.formless.local`; test watcher passing.
- `.devstate/status.md`: checks ok; services running.
- `.devstate/logs/service-test.txt`: latest rerun passed `src/app.test.tsx`; 119 tests passed.
- `.devstate/logs/check-vite.txt`: formatting completed; no warnings, lint errors, or type errors in 193 files.
- `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt`: absent in this repo; devstate evidence is under `.devstate/`.

## Promote after ship

- GAP-01: no global doc promotion. Characterization only; no runtime behavior changed.
- `doc/current.md`: generated authoring primitives and their file locations, once shipped.
- `doc/roadmap.md`: only if this changes first-release scope wording.

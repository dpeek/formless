---
name: Generated runtime modules
description: "Plan to split the generated React runtime out of a single app file."
last_updated: 2026-05-04
---

# Generated runtime modules

Status: proposed

## Must read

- `src/app.tsx`
- `src/app.test.tsx`
- `src/client/views.ts`
- `src/client/store.ts`
- `src/client/sync.ts`
- `lib/ui/doc/browser-primitives.md`

## Goal

Reduce `src/app.tsx` from a feature accumulation point into a small route shell plus generated runtime modules.

This should be a behavior-preserving refactor. The point is to make the next UI features easier to add without mixing routing, schema editing, collection rendering, field editing, table formatting, and dev reset controls in one file.

## Approach

Extract by responsibility, not by visual component size.

Suggested module shape:

- `src/app/routes/home.tsx`
- `src/app/routes/schema.tsx`
- `src/app/routes/not-found.tsx`
- `src/app/dev-actions.tsx`
- `src/app/generated/create.tsx`
- `src/app/generated/collection.tsx`
- `src/app/generated/actions.tsx`
- `src/app/generated/record-field-editor.tsx`
- `src/app/generated/record-field-display.tsx`
- `src/app/generated/table.tsx`
- `src/app/generated/format.ts`

Keep `src/app.tsx` as the public app entrypoint that wires routes and imports these modules.

## Rules

- Preserve behavior first; do not add new schema features in this refactor.
- Preserve exported symbols used by tests, or update tests intentionally.
- Keep generated runtime code independent from sample-specific rate-card assumptions.
- Use existing `@formless/ui` primitives.
- Do not introduce a component framework or registry in this slice.

## Open questions

- Should generated runtime modules live under `src/app/generated` or `src/client/generated-ui`?
- Should dev-only controls stay in the app shell or move behind a development route later?

## Success criteria

- `src/app.tsx` only handles top-level routing and layout.
- Create forms, collection rendering, table rendering, field editors, and action buttons are in separate modules.
- Existing app tests pass with minimal assertion changes.
- `bun run test` passes.
- `bun run check` passes.
- A browser smoke test still reaches the home route.

## Tasks

1. Extract generated create forms.
   - Move `GeneratedCreateForm`, `GeneratedCreateDialog`, `GeneratedCreateDialogForm`, create field inputs, and create value resolution helpers.
   - Preserve tests around default resolution.

2. Extract record field editing and display.
   - Move `RecordFieldEditor`, `RecordReferenceEditor`, `RecordFieldDisplay`, display formatting, and input conversion helpers.
   - Keep patch submission behavior unchanged.

3. Extract collection, table, and action rendering.
   - Move `HomeCollection`, scoped collection handling, result rendering, `RecordList`, `RecordTable`, and action row components.
   - Keep context selection behavior unchanged.

4. Extract routes and dev controls.
   - Move `HomeRoute`, `SchemaRoute`, `NotFoundRoute`, and `DevActions`.
   - Keep schema editor behavior unchanged.

5. Clean imports and tests.
   - Update `src/app.test.tsx` imports.
   - Avoid circular imports between generated modules.

## Non-goals

- No UI redesign.
- No new generated view types.
- No field type adapter registry; that is covered by `plan-field-type-adapters.md`.
- No routing changes beyond module movement.

# Generated UI

Last updated: 2026-05-19

## Current Facts

- App shell: `src/app.tsx`.
- Runtime profile resolver: `src/app/runtime-profile.ts`.
- Dev profile mounts Tasks, Estii, Site, schema editors, legacy Rates redirects, and public Site preview.
- App profile mounts one selected schema app at `/`, app-relative screen subpaths, and `/schema`.
- Site authoring profile mounts public Site preview at `/` and generated admin at `/admin`.
- Published Site profile mounts public Site rendering at `/`.
- Current dev browser routes include `/`, `/tasks`, `/estii`, `/site`, `/tasks/schema`, `/estii/schema`, `/site/schema`, `/pages`, `/pages/*`.
- Legacy dev redirects map `/rates` to `/estii` and `/rates/schema` to `/estii/schema`.
- Home route: `src/app/routes/home.tsx`.
- Schema editor route: `src/app/routes/schema.tsx`.
- Route reset controls: `src/app/dev-actions.tsx`.

## Screen And Collection Rendering

- Generated screen renderer: `src/app/generated/screen.tsx`.
- Generated collection renderer: `src/app/generated/collection.tsx`.
- View and screen model selection: `src/client/views.ts`.
- Home route renders through screen models.
- One-section screens render like the old home workspace.
- Multi-section stack screens render sections in schema order.
- Section query and context state is keyed by screen and section.
- Collection rendering consumes model facts, not raw schema.
- Collection rendering supports query tabs, context selection, summaries, actions, and result rendering.
- Collection rendering supports aggregate summary slots.

## Tables

- Generated table renderer: `src/app/generated/table.tsx`.
- Generated table actions: `src/app/generated/table-actions.tsx`.
- Generated result ordering UI: `src/app/generated/ordering-ui.ts`.
- Table model selection: `src/client/table-model.ts`.
- Table rendering supports field, reference-field, computed, invoke-action, and ordering-handle columns.
- Table rendering supports table-local row actions.
- Table rendering supports generated edit dialogs.
- Table rendering supports table-local ordering with sparse numeric ranks.
- Table drag reorder uses `@dnd-kit/react` in generated app code.
- Table rendering supports aggregate footer slots.

## Generated Authoring

- Generated create renderer: `src/app/generated/create.tsx`.
- Generated actions consume selected `action.ui` facts in `src/app/generated/actions.tsx`.
- Generated field UI adapters: `src/app/generated/field-ui-adapters.ts`.
- Generated field display: `src/app/generated/record-field-display.tsx`.
- Generated inline editor: `src/app/generated/record-field-editor.tsx`.
- Generated delete control: `src/app/generated/record-delete.tsx`.
- Generated tree renderer: `src/app/generated/tree.tsx`.
- Generated union presentation helpers: `src/app/generated/union-presentation.ts`.
- Generated authoring primitives: `src/client/generated-authoring.ts`.
- Shared UI primitives live under `lib/ui/src/`.
- Markdown editor uses shared UI markdown primitives.
- Markdown read-only display can use the shared markdown renderer.
- Color editor uses shared color input and swatch display.
- Text editors can render title-like autosizing editable text.
- Number editors can use formatted number input and still store numbers.
- Value/unit table editing patches multiple flat scalar fields.

## Key Tests

- App tests: `src/app.test.tsx`.
- Runtime profile tests: `src/app/runtime-profile.test.ts`.
- View model tests: `src/client/views.test.ts`.
- Table model tests: `src/client/table-model.test.ts`.
- Generated table tests: `src/app/generated/table.test.tsx`.
- Generated ordering tests: `src/app/generated/ordering-ui.test.ts`.
- Generated format tests: `src/app/generated/format.test.ts`.
- Generated field UI adapter tests: `src/app/generated/field-ui-adapters.test.ts`.
- Generated authoring tests: `src/client/generated-authoring.test.ts`.
- UI primitive package docs: `lib/ui/README.md`, `lib/ui/doc/browser-primitives.md`.

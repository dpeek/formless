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
- Current dev screen subpaths include `/estii/setup` and `/site/settings`.
- Legacy dev redirects map `/rates` to `/estii` and `/rates/schema` to `/estii/schema`.
- Home route: `src/app/routes/home.tsx`.
- Schema editor route: `src/app/routes/schema.tsx`.
- Workbench action controls: `src/app/dev-actions.tsx`.

## Workbench And App Frame

- Dev profile wraps generated apps in workbench chrome.
- Workbench toolbar source: `src/app.tsx`.
- Workbench toolbar sits below generated app chrome.
- Workbench app nav switches Tasks, Estii, and Site.
- Workbench actions are Schema, Export, Restore, and Reset for the active world.
- Schema route renders as a workbench tool outside the generated app frame.
- Reset is one active-world control with destructive confirmation.
- Snapshot Restore imports after JSON file selection.
- Sync status control source: `src/app/routes/status-line.tsx`.
- Sync status details include world key, schema version, cursor, push sync state, and last sync time.
- App profile renders generated app chrome without workbench app/actions toolbar.
- Published Site profile renders without workbench chrome and without generated admin chrome.

## Screen And Collection Rendering

- Generated screen renderer: `src/app/generated/screen.tsx`.
- Generated collection renderer: `src/app/generated/collection.tsx`.
- View and screen model selection: `src/client/views.ts`.
- Home collection model: `HomeViewModel.collection` / `HomeCollectionConfig` in `src/client/views.ts`.
- Home collection model selects entity, context, query tabs, default query, result, actions, and summaries before rendering.
- Home route renders through screen models.
- One-section screens render like the old home workspace.
- Multi-section stack screens render sections in schema order.
- Section query and context state is keyed by screen and section.
- Collection rendering consumes model facts, not raw schema.
- Collection rendering supports query tabs, context selection, summaries, actions, and result rendering.
- Collection rendering supports aggregate summary slots.
- Collection rendering supports result ordering for list, table, and tree results.
- Collection context rendering supports tab selection and list/detail presentation.
- List/detail context rendering keeps selected context state and renders selected context fields plus related results.
- List result rendering can order records and use generated drag handles.
- Generated app sidebar lists app screens from primary screen models.
- Generated app sidebar title is the app label.
- Generated app chrome owns the active screen `h1`.
- Generated screen bodies do not repeat the active screen heading.
- Collection context navigation can render root records in the app sidebar.
- Generated workspaces use wide content layout.
- Compact context record forms stack fields vertically above related results.

## Tables

- Generated table renderer: `src/app/generated/table.tsx`.
- Generated table actions: `src/app/generated/table-actions.tsx`.
- Generated result ordering UI: `src/app/generated/ordering-ui.ts`.
- Table model selection: `src/client/table-model.ts`.
- Table rendering supports field, reference-field, computed, invoke-action, and ordering-handle columns.
- Table rendering supports table-local row actions.
- Table rendering supports generated edit dialogs.
- Generated edit dialogs live-patch through field editors and close with Done.
- Table rendering supports table-local ordering with sparse numeric ranks.
- Table move menus and drag drops patch ordering ranks through generic patch writes.
- Table drag reorder uses `@dnd-kit/react` in generated app code.
- Table rendering supports aggregate footer slots.
- Table edit dialogs can render active union variant fields.
- Reference-field item dialogs can render active union variant fields.
- Estii source rate table renders computed `Margin`.
- Estii source rate table renders average cost, price, and margin in table footer aggregate slots.
- Estii source rate table pairs `cost` with `costUnit` value/unit editing.
- Estii source rate table renders `price` as currency without a table unit selector.

## Generated Authoring

- Generated create renderer: `src/app/generated/create.tsx`.
- Generated actions consume selected `action.ui` facts in `src/app/generated/actions.tsx`.
- Generated field UI adapters: `src/app/generated/field-ui-adapters.ts`.
- Generated field display: `src/app/generated/record-field-display.tsx`.
- Generated inline editor: `src/app/generated/record-field-editor.tsx`.
- Generated delete control: `src/app/generated/record-delete.tsx`.
- Generated tree renderer: `src/app/generated/tree.tsx`.
- Generated union presentation helpers: `src/app/generated/union-presentation.ts`.
- Union presentation model selection: `src/client/union-presentation-model.ts`.
- Generated authoring primitives: `src/client/generated-authoring.ts`.
- Create default primitive: `src/shared/create-defaults.ts`.
- Shared UI primitives live under `lib/ui/src/`.
- Markdown editor uses shared UI markdown primitives.
- Markdown read-only display can use the shared markdown renderer.
- Color editor uses shared color input and swatch display.
- Icon display uses `SvgIcon` from `@dpeek/formless-ui/svg-icon`.
- Generated icon fields show a compact SVG preview or empty well instead of raw SVG text.
- Generated inline icon editing uses the icon preview or empty well as the edit trigger.
- Generated icon editing uses a textarea dialog and patches one flat text field.
- Image upload editing is selected by text field `editor: "image"`.
- Generated image fields show the current image preview or empty well.
- Generated image preview and empty well open file selection.
- Successful generated image upload patches `href` and, when schema fields exist, numeric `width` and `height`.
- Generated image fields keep manual URL editing as a fallback.
- Text editors can render title-like autosizing editable text.
- Number editors can use formatted number input and still store numbers.
- Value/unit table editing patches multiple flat scalar fields.
- Generated create forms submit hidden literal defaults.
- Generated view fields can declare `visibleWhen` conditions.
- Generated create, edit, and tree renderers hide fields whose `visibleWhen` condition does not match.
- Generated create forms do not submit hidden `visibleWhen` fields.
- Generated delete controls render only when the entity delete policy is enabled.
- Generated delete controls use destructive confirmation before `submitDeleteMutation`.
- Generated delete controls appear in collection contexts, list rows, table rows, and tree child nodes.
- Tree placement remove stays separate from child record delete.
- Create default primitive owns create-default parsing, validation, context readiness, field selection, and submitted value shaping.
- Generated create and action renderers call the create default primitive for create-default readiness and value resolution.
- Generated authoring primitive owns context option fallback, query context facts, action query context facts, local selector visibility, root navigation selection, active-root fallback, and root group item facts.
- Item, edit, and create renderers can select active union variant fields.
- Create forms choose variant fields from draft discriminator values.
- Generated tree results render relationship-backed recursive editors.
- Tree branch leaf policy renders the child node and skips descendant rendering.
- Selected tree roots are outside child branch leaf policy.
- Tree child nodes can render active union fields.
- Tree child nodes can render context links that select existing collection context records.
- Tree child add controls use one `+` menu from allowed child variants.
- Tree child add controls can pass literal placement values for named-slot creation.
- Tree add-child dialogs use literal discriminator defaults.
- Tree add composition creates a child record plus placement edge.
- Tree remove composition tombstones placement edges.
- Tree placement cards show slot badges when placement records carry `slot`.
- Tree placement cards render remove-placement controls without child delete controls.
- Estii primary rate workspace exposes `Create Resource` as its primary collection action.
- Estii primary card tabs omit related-rate count badges.

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
- Shared SVG icon tests: `lib/ui/src/svg-icon.test.tsx`.
- Client media upload tests: `src/client/media.test.ts`.
- UI primitive package docs: `lib/ui/README.md`, `lib/ui/doc/browser-primitives.md`.

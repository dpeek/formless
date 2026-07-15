# Astryx Generated Workspace

## Outcome

Finish the renderer-neutral boundary for the generated admin workspace after
create, operation, table, record-field, and list contracts exist.

The completed change should:

- close the remaining existing-record field paths that bypass
  `FormlessUiField`, especially icon, media, and state-machine behavior;
- project complete record-result containers instead of composing their fields,
  actions, warnings, and empty state directly in React;
- project non-tree screen and collection workspace chrome, including sections,
  query tabs, context selection, counts, summaries, operations, and
  list-detail composition;
- make the production legacy renderer consume those contracts;
- provide package-local Astryx renderers and data-only fixtures for the same
  contracts; and
- leave production renderer selection unchanged.

This is contract preparation, not the Astryx cutover.

## Preconditions

- `astryx-generated-list` is complete and landed on `main`.
- Generated create, operation-control, record-field, table, and list contracts
  remain canonical and available for composition.
- Production remains on dedicated legacy renderers for the migrated surfaces.
- `@dpeek/formless-astryx` remains free of imports from `src/*`, browser
  replica APIs, storage, sync, operation execution, and media clients.

At exploration time, inspect the completed list change rather than relying on
the names or shapes anticipated here.

## Current Baseline

The baseline observed while writing this plan is:

- `FormlessUiField` already carries icon options and picker state, media
  presentation and upload facts, color facts, value-unit drafts, temporal
  display, state-machine facts, and semantic intents.
- `src/app/generated/formless-ui-projection.ts` already projects those facts
  from generated runtime state.
- `lib/astryx/src/components/fields/` already contains Astryx icon, media,
  color, date, number/value-unit, and state-machine implementations plus
  package-local fixtures.
- production `RecordFieldEditor` still bypasses the canonical legacy adapter
  for icon and media authoring and returns a separate state-machine path.
- record-result composition in `RecordDetail` still performs record selection,
  union visibility, field layout, transition controls, deletion, readiness
  warnings, and empty-state rendering directly.
- screen and collection composition still passes React nodes, reads counts and
  aggregate values during rendering, and renders tabs, context selectors,
  summaries, list-detail layout, and result dispatch directly.
- the in-flight list change is expected to project list results and route the
  production list through a legacy contract renderer while leaving collection
  chrome outside its scope.

Future exploration must treat these as observations, not guaranteed facts.

## Scope

### In scope

- Existing-record icon, media, color, date, value-unit, Markdown, enum
  presentation, and state-machine contract gaps needed by record, detail,
  list, and table composition.
- Complete record-result contract, projection, intents, legacy renderer,
  Astryx renderer, and fixtures.
- Screen section and non-tree collection workspace contracts.
- Query tabs and counts, selected query, context choices and counts, selected
  context, context detail, list-detail composition, summary display values,
  collection operations, create controls, empty/unselected states, and result
  composition.
- Composition of existing create, operation, field, table, list, and new
  record-result contracts.
- Focused projection, intent, legacy-renderer, and Astryx-renderer coverage.
- Canonical `generated-ui` spec changes required by the resulting behavior.

### Out of scope

- Site tree-builder contract or renderer.
- Any temporary tree placeholder, opaque tree slot, React-node escape hatch, or
  compatibility wrapper in the workspace contract.
- Public Site rendering.
- App shell, instance shell, authentication, account, invitation, or access
  management surfaces.
- Production Astryx renderer selection, global CSS or theme activation, and
  Tailwind removal.
- Removal of `@dpeek/formless-ui`, legacy field controls, or legacy renderer
  modules still required before the atomic cutover.
- Changing icon storage from SVG source to ids or adding a custom icon storage
  model.
- Moving media upload, asset loading, operation execution, query evaluation,
  aggregate evaluation, sync feedback, or local auto-save into `lib/astryx`.
- One-to-one legacy markup, drag interaction, spacing, or test parity.

Tree-backed collection sections may remain on their current production path in
this change. `astryx-site-tree-builder` must later extend the final workspace
result composition without introducing an interim renderer shim.

## Contract Direction

### Specialized fields

Use the existing `FormlessUiField` family unless current-state exploration
finds a concrete missing display fact or intent.

Runtime owns:

- record and system-field reads;
- draft sessions and invalid draft preservation;
- active union and `visibleWhen` selection;
- reference and media option loading;
- SVG catalog resolution and parse validation;
- media upload effects and patch resolution;
- state-machine transition binding and execution;
- pending, failure, sync, and auto-save behavior.

The renderer receives display-safe projected facts and controlled intents. It
must not infer availability, parse schema, read a catalog, upload media, select
an operation, or patch a record.

### Record result

The record-result contract should carry only renderer-facing facts, including:

- stable result and record identity;
- accessible label and layout density;
- ready, empty, unavailable, and editing-disabled states;
- ordered projected fields with explicit label and presentation facts;
- projected state-transition and delete controls;
- readiness warnings;
- display-safe operation feedback; and
- field and action intents composed from existing contracts.

Generated runtime retains query evaluation, first-record selection, record
reads, active-union selection, field sessions, operation controllers, warning
selection, writes, and effects.

### Generated workspace

The workspace contract should represent screen and collection presentation as
data:

- screen identity and ordered sections;
- section identity, label, and projected operation controls;
- collection identity and accessible label;
- query tabs with selected state, count text, availability, and selection
  intents;
- context options with selected state, related-count text, create control, and
  selection intents;
- ordinary context and list-detail presentation;
- projected context record result where applicable;
- summary labels, formatted values, suffixes, and availability;
- collection-level create and command controls;
- explicit empty and unselected states; and
- canonical list, table, or record result contracts.

Runtime retains schema model selection, query expressions, query contexts,
record-option reads, automatic context fallback, related-record counts,
aggregate and computed-value evaluation, selected route state, result dispatch,
operation execution, and storage effects.

Do not carry `ReactNode`, schema models, query expressions, raw records,
aggregate definitions, operation bindings, runtime callbacks, legacy component
props, Astryx component props, Tailwind classes, or renderer classes through
the contract.

## Migration Rules

- Formalise or adapt the contract before changing the production renderer
  boundary.
- Route production through a dedicated legacy adapter that consumes only the
  canonical contract and dispatches canonical intents.
- Keep direct `@dpeek/formless-ui` imports for migrated surfaces inside the
  owned legacy seam modules identified by the change. Foundation, projection,
  runtime, and canonical contract modules contain none.
- Implement the Astryx renderer package-locally without activating it in
  production.
- Add package-local layouts and data-only fixtures using the production
  contract shapes.
- Prefer Astryx component behavior and interaction patterns over recreating the
  old UX.
- Use the Astryx documentation CLI when component choice or interaction
  guidance is unclear.
- Replace obsolete legacy markup assertions with projection, intent, and
  user-visible behavior coverage. Do not add compatibility behavior to satisfy
  replaced tests.
- Do not introduce meaningful Tailwind and Astryx coexistence in production.
- Do not add the renderer switch to this change.

## Implementation Tasks

Each numbered heading is intended to become one ready task section in the
future change metadata. Exploration may merge, split, remove, or rename a
section when current code shows a better boundary.

### 1. Reconcile specialized record-field contract coverage

- Audit current projection and renderer behavior for icon, media, color,
  value-unit, quiet date, Markdown, rich enum presentation, and state machines.
- Add only missing renderer-neutral facts and intents required by supported
  existing-record surfaces.
- Make density, label visibility, display fallback, transition invocation
  source, disabled reason, pending state, and invalid or missing values explicit
  where the renderer would otherwise infer them.
- Preserve source-backed SVG values; id-based icon storage remains separate.
- Add focused projection and intent coverage for every changed fact.

### 2. Migrate legacy specialized fields behind `FormlessUiField`

- Route icon and media existing-record authoring through the canonical field
  projection and legacy adapter.
- Route state-machine display and transition interaction through canonical
  field and operation contracts instead of a separate renderer-owned model.
- Retain icon dialog state, SVG validation, media loading/upload, transition
  controllers, writes, sync feedback, and auto-save in generated runtime.
- Keep legacy media and field controls available only inside the legacy seam
  until cutover.
- Replace direct-control and markup-characterization assertions with intent and
  visible-behavior coverage.

### 3. Close Astryx specialized-field renderer gaps

- Validate the existing Astryx field components against the production
  projections established by tasks 1 and 2.
- Fill concrete behavior gaps rather than replacing working components.
- Preserve invalid and alpha color text, missing media ids, custom SVG drafts,
  undeclared enum and state values, pending transitions, commit boundaries, and
  accessible hidden labels.
- Compose existing Astryx operation controls for transitions where the contract
  requires them.
- Keep the renderer free of generated runtime and legacy imports.

### 4. Expand canonical specialized-field fixtures

- Extend package-local aggregate fixtures to cover the production icon, media,
  color, value-unit, quiet-date, rich-enum, Markdown, and state-machine shapes
  that remain relevant after exploration.
- Cover record, compact table-cell, and labeled detail contexts where behavior
  differs.
- Use minimal local state to simulate canonical intents.
- Keep fixtures data-only and focused on product UX, without proof labels,
  legacy comparison scaffolding, or runtime imports.

### 5. Project the canonical record-result contract

- Define the record-result, empty/unavailable state, warning, action, and intent
  contracts by composing existing field and operation contracts.
- Add a generated record-result foundation that owns query selection, record
  reads, active unions, visible fields, authoring sessions, actions, warnings,
  and runtime plans outside the renderer payload.
- Project complete editable, read-only, empty, unavailable, warning, transition,
  delete, pending, and editing-disabled states.
- Add focused projection and intent-resolution coverage.

### 6. Move production record results behind the legacy renderer seam

- Add a dedicated legacy record-result renderer that consumes only the
  canonical result and nested contracts.
- Route the production `record` result path through the foundation and legacy
  renderer.
- Keep query evaluation, record subscriptions, drafts, media effects,
  operation controllers, writes, warning reads, sync feedback, and success
  behavior in runtime modules.
- Preserve capability and accessible behavior, not the current section, grid,
  spacing, or markup structure.

### 7. Implement the Astryx record-result renderer

- Add an unexported package-local renderer for ready, empty, unavailable,
  editing-disabled, warning, and pending record-result states.
- Compose the existing Astryx field, operation, confirmation, status, and
  warning primitives.
- Follow Astryx layout and action hierarchy guidance instead of copying the
  legacy detail layout.
- Add focused renderer coverage for nested intent dispatch, labels, actions,
  warnings, empty state, unavailable state, and async behavior.

### 8. Add canonical record-result fixtures and layout

- Add data-only record-result fixtures using the production contract.
- Include editable and read-only detail, active union, visible-field changes,
  specialized fields, transitions, destructive confirmation, warnings,
  editing-disabled, unavailable, and empty states.
- Add a focused prototype layout with minimal local intent simulation.
- Do not add collection tabs, screen chrome, tree composition, or production
  exports to this task.

### 9. Project the generated workspace contract

- Define renderer-neutral screen, section, collection, query-tab, context,
  list-detail, summary, empty-state, and selection-intent contracts.
- Compose canonical create, operation, list, table, and record-result contracts.
- Add a generated workspace foundation that selects and resolves all runtime
  facts before rendering.
- Project formatted count and summary display values; do not expose queries,
  aggregates, computed schemas, or raw numeric evaluation inputs to Astryx.
- Keep tree results outside the contract until the tree-builder change can add
  them completely.
- Add focused coverage for unscoped, context-scoped, list-detail, single- and
  multi-section, empty, unavailable, and selection-fallback states.

### 10. Move non-tree production workspaces behind the legacy renderer seam

- Add legacy screen and collection renderers that consume only canonical
  workspace contracts and dispatch canonical selection, field, create, and
  operation intents.
- Route list-, table-, and record-backed production screen sections through the
  new foundation and legacy adapters.
- Keep tree-backed sections on their existing path without adding a temporary
  tree member or React-node slot to the contract.
- Retain route selection, query state, automatic context fallback, replica
  reads, counts, aggregates, operation execution, sync feedback, and effects in
  runtime modules.
- Replace tabs, badge, list-detail, and summary markup assertions with
  contract, intent, and user-visible behavior coverage.

### 11. Implement the Astryx generated workspace renderer

- Add unexported package-local screen and collection renderers for the canonical
  non-tree workspace contracts.
- Use Astryx navigation, tabs or selectors, section, stack, grid, card, status,
  badge, empty-state, and action primitives according to component guidance.
- Compose the existing Astryx create, operation, list, table, field, and
  record-result renderers.
- Keep selected state controlled by the contract and emit intents without
  evaluating queries or changing runtime state locally.
- Add focused renderer coverage for section hierarchy, query and context
  selection, list-detail composition, summaries, actions, empty states, and
  each supported result kind.

### 12. Add canonical generated-workspace fixtures and layout

- Add package-local data-only fixtures for an unscoped collection, tabbed
  queries, ordinary context selection, list-detail context, a multi-section
  screen, summaries, operations, empty and unavailable states, and list, table,
  and record results.
- Use the production contracts and existing canonical nested fixtures rather
  than private prototype view models.
- Add a focused Generated Workspace layout with minimal controlled selection
  and intent simulation.
- Exclude tree results, runtime imports, proof UI, legacy visual comparison, and
  production renderer activation.

## Expected Evidence

Each task section should leave evidence appropriate to its scope:

- contract and projection tests for data shape, fallbacks, and availability;
- runtime intent tests for field, selection, create, operation, confirmation,
  and failure behavior;
- legacy renderer tests for canonical intent dispatch and visible behavior;
- Astryx renderer tests for hierarchy, accessibility, controlled state, and
  action behavior;
- package-local data-only fixtures using production contract shapes;
- import-boundary evidence that `lib/astryx` does not import runtime modules;
- import-confinement evidence that migrated production surfaces have no direct
  `@dpeek/formless-ui` imports outside their owned legacy seam modules;
- current `devstate check` evidence before completing each task section; and
- `bun browser` smoke for production legacy-path behavior changes.

For package-only UX iteration, follow `lib/astryx/AGENTS.md`: use Astryx
components, prefer component props over custom styling, use StyleX with Astryx
tokens when styling is necessary, do not start another dev server, and rely on
the user for prototype visual feedback.

## Proposal-Time Spec Work

The future proposal should update `openspec/specs/generated-ui/spec.md` to
describe current desired behavior for:

- complete specialized existing-record field contract adoption;
- a generated record-result renderer contract;
- renderer-neutral screen and non-tree collection workspace contracts;
- legacy adapters consuming those contracts;
- unactivated Astryx renderers and canonical fixtures; and
- explicit deferral of tree workspace composition and production renderer
  selection.

Reconcile the completed list change with the existing Collection Rendering
requirements. Delete or rewrite superseded drag, direct renderer handoff,
React-node, or legacy-structure facts rather than preserving compatibility.

## Completion Gate

The change is complete when:

- supported existing-record specialized fields no longer bypass the canonical
  contract before reaching the legacy renderer;
- production record results consume a complete canonical contract;
- production non-tree screen and collection workspaces consume complete
  canonical contracts;
- runtime behavior remains outside `lib/astryx`;
- Astryx can render every new contract from data-only fixtures;
- production still selects only the legacy renderer;
- tree-backed workspaces remain explicitly deferred without a shim;
- all direct `@dpeek/formless-ui` imports for these surfaces are confined to the
  owned legacy seam modules identified by the change;
- canonical specs describe the shipped boundary; and
- checks and required browser smoke pass.

The renderer switch, global style switch, legacy package removal, and deletion
of now-dormant legacy renderers remain owned by `astryx-cutover`.

# Formless UI Contract Switch-Over Plan

Purpose: plan the remaining move from runtime-owned generated UI behavior to a
canonical Formless UI renderer contract.

Status: design note. This is not shipped behavior. Shipped behavior lives in
`openspec/specs/*/spec.md`.

## Why

Formless generated UI should have one data and intent boundary between runtime
state and renderers.

Runtime code keeps schema parsing, storage, sync, draft sessions, validation,
reference and media loading, operation execution, route selection, and write
status. Renderer code receives projected display data and intent callbacks.

The canonical contract should be runtime and presentation-boundary shaped. It
must not be shaped around the old `@dpeek/formless-ui` components, the current
Astryx prototype components, or browser form implementation details.

The migration should separate semantic contract adoption from visual renderer
adoption. First, generated runtime surfaces should project into canonical
`FormlessUi*` contracts. Those contracts should render through dedicated legacy
`@dpeek/formless-ui` adapter modules. After runtime wiring is stable, replacing
the legacy adapter implementation with Astryx should be mechanical: same
contracts, different renderer implementation.

This avoids making Tailwind and Astryx coexistence the first blocker for the
runtime semantic migration.

## Current Anchors

- `lib/astryx/src/formless-ui-contract.ts`: canonical field contract and early
  placeholder surface contracts.
- `lib/astryx/src/components/fields/renderer.tsx`: Astryx-backed
  `FormlessUiFieldRenderer`.
- `lib/astryx/src/components/fields/*.fixtures.ts`: package-local
  `FormlessUiField` fixtures by field kind.
- `lib/astryx/src/components/generated-fields.tsx`: package-local generated
  field fixture/prototype coverage for create, record, table-cell, detail, and
  public-action field workflows.
- `src/app/generated/formless-ui-projection.ts`: generated runtime/session state
  to `FormlessUiField` projection.
- `src/app/generated/formless-ui-intents.ts`: `FormlessUiFieldIntent` adapter
  back to generated draft/session/commit behavior.
- `src/app/generated/create.tsx`, `create-field-control.tsx`,
  `record-field-control.tsx`, `table.tsx`, and `collection.tsx`: current
  generated surfaces that still render largely through direct
  `@dpeek/formless-ui` imports.
- `src/app/routes/instance-shell.tsx` and `src/app/instance-rail.tsx`: current
  runtime shell and instance rail.
- `lib/astryx/src/components/shell.tsx` and `side-nav.tsx`: directional Astryx
  shell/navigation prototype.
- `lib/media/src/react.tsx`: current media React control. It lives in the media
  package but imports `@dpeek/formless-ui` primitives and Tailwind classes.
- `src/shared/icon-catalog.ts`, `src/app/generated/field-control-primitives.tsx`,
  and `lib/ui/src/icons.ts`: current authored icon catalog, generated icon
  picker, and renderer-specific semantic icon map.
- `src/main.tsx`, `src/public-site-main.tsx`, `src/runtime/vite-config.ts`, and
  `lib/ui/src/global.css`: current app-wide Tailwind/global-style wiring.
- `lib/site-app/src/react/*` and `lib/site-app/src/site-icon-source.ts`: public
  Site rendering still depends on `@dpeek/formless-ui` Markdown, SVG icon, and
  semantic theme icon utilities.

## Progress So Far

The canonical `FormlessUiField` contract exists. It carries field surface,
mode, access, control, metadata, options, errors, pending state, draft values,
formatting, media authoring, state-machine facts, and field intents.

Astryx has a field renderer for the canonical field contract. It routes by field
mode, control kind, renderer kind, and state-machine facts. It also has a submit
form adapter for submit-boundary hidden inputs.

Package-local field migration is largely complete. Field modules and fixtures
live under `lib/astryx/src/components/fields/`, fixtures import
`FormlessUiField`, and no `lib/astryx/src/field-contract.ts` file appears in the
current tree.

Package-local fixtures prove much of the field contract across field kinds and
surfaces. This is prototype evidence, not production runtime adoption.

Runtime field projection and intent adapter modules already exist in
`src/app/generated`. Their tests cover generated create, record, display, and
operation field projection and intent adaptation.

Generated production surfaces still largely render directly with
`@dpeek/formless-ui`. Create forms, create fields, record fields, record display,
tables, collections, operation controls, state-machine controls, delete dialogs,
tree builder, and route/auth shell surfaces still contain scattered legacy UI
imports.

The broad surface contracts are not finished. `formless-ui-contract.ts` has
early placeholder types for operation controls, field sets, tables, create
dialogs, item detail, and action forms, but they are not yet durable contracts
for generated runtime switch-over.

Shell/navigation is unresolved. Current runtime UX is a separate instance rail
plus generated app screens. The Astryx prototype points toward unified
navigation, but it is not canonical behavior.

Media is partly resolved at the contract level and unresolved at the package
boundary. `FormlessUiField` already carries media asset options, preview facts,
upload enablement, upload patch fields, and media select/file intents. The
remaining risk is that the reusable media React control is exported from
`@dpeek/formless-media/react` while depending on Formless UI primitives and
Tailwind.

Icon fields are less resolved than media. Current generated icon controls store
and edit SVG source strings. The contract can carry SVG presentation for enum
values, but it has no icon option catalog for icon editor fields. The current
semantic control icon map also lives inside `@dpeek/formless-ui`.

Tailwind is still structural. Browser entrypoints import
`@dpeek/formless-ui/global.css`, runtime Vite installs the Tailwind plugin, and
many runtime, shell, generated, media, and public Site modules contain Tailwind
utility classes directly.

## Remaining Phases

### 0. Reconcile Specs And Package Boundary

Do this before production runtime wiring.

Specs:

- update canonical specs before shipping behavior that changes generated UI,
  media, public Site, shell, or package boundaries;
- replace Astryx-specific spec wording with renderer-neutral `FormlessUi*`
  contract wording where the legacy seam is the first production renderer;
- update the Media spec before treating `@dpeek/formless-media/react` as legacy
  UI rather than the future renderer boundary;
- update the Generated UI spec before replacing the current minimal instance
  rail with unified shell/navigation behavior.

Package boundary:

- choose the production import path for the canonical contract before any new
  runtime import is added;
- do not import production contract types from `../../../lib/astryx/src/*`;
- if the contract stays in `@dpeek/formless-astryx`, export it from a package
  subpath with no renderer side effects;
- do not put the legacy `@dpeek/formless-ui` renderer seam inside `lib/astryx`.

Contract payload:

- decide whether raw schema fragments such as `FieldSchema` and
  `StateMachineSchema` remain allowed contract facts;
- if they remain, state that renderers treat them as readonly projection facts,
  not as permission to parse schema, select fields, run validation, or resolve
  operations;
- if they do not remain, narrow the field contract before broad runtime
  adoption.

### 1. Define Minimal Common Contract Foundation

Do not design every surface contract up front. Define only the reusable facts
needed by the first migration slices, then let table, collection, tree, public
Site, and shell contracts be defined by their own slices.

Define common contract shapes for:

- buttons, action triggers, menus, confirmation prompts, and compact status;
- form field sets and submit-boundary hidden input adapters;
- semantic renderer icon identifiers for controls and actions;
- media and image picker facts;
- icon picker facts.

Keep these contracts semantic. They should carry labels, ids, disabled and
pending state, display-safe errors, accessibility labels, selected state,
operation invocation sources, projected fields, option facts, and intent
callbacks. They should not carry legacy component prop names, Astryx component
props, storage handles, browser replica hooks, sync functions, Tailwind classes,
React components, or raw records.

Media/image option facts:

- selected asset id;
- selected URL;
- preview href;
- missing selected asset projected by runtime as an option or missing fact;
- upload availability;
- file-select intent routing.

Icon option facts:

- add `FormlessUiIconOption` and `iconOptions`;
- project the default runtime icon catalog into options;
- preserve current SVG-source stored values during this switch-over;
- when values are SVG sources, selection is by matching option `source`, not by
  option id;
- custom SVG drafts, parse errors, open/cancel/save state, empty value, and
  source-backed preview are explicit contract facts;
- id-based custom icon storage, import/export behavior, and SVG-source-free
  field contracts remain separate icon data-model work.

Shell/navigation, table, collection, public Site, and tree-builder contracts
should not be frozen in this phase.

### 2. Resolve Media, Icon, And Styling Boundaries

Make package ownership explicit before switching broad runtime surfaces.

Media boundary:

- keep `lib/media` as the home for media contracts, pure helpers, client upload
  and list adapters, worker routing, and provider storage adapters;
- do not move the media client, upload orchestration, or worker behavior into
  `lib/astryx`;
- treat `@dpeek/formless-media/react` as current legacy UI once the Media spec is
  updated for that direction;
- adapt existing `MediaFieldControl` only inside legacy contract renderer seam
  modules while `@dpeek/formless-ui` is still active;
- use the existing Astryx `ImageInput` path when the seam implementation swaps
  to Astryx;
- remove the `./react` export or replace it with a renderer-independent shape
  only when no production runtime imports depend on the legacy control.

Icon boundary:

- keep authored icon catalog facts runtime-readable and renderer-neutral;
- move reusable SVG parsing/sanitizing needed by public Site and generated icon
  presentation out of `@dpeek/formless-ui` before retiring that package;
- keep semantic control icons as semantic ids in contracts, not React component
  imports;
- map semantic ids to `@dpeek/formless-ui/icons` in the legacy seam and to
  Astryx icon components in the Astryx seam;
- share the same default icon catalog between enum presentation resolution and
  icon editor options where possible;
- keep generated icon field storage source-backed until a separate data-model
  slice changes storage to ids.

Styling boundary:

- keep Tailwind available while the legacy seam and existing `@dpeek/formless-ui`
  surfaces are still rendered;
- move app-wide theme/reset responsibilities to the replacement renderer/runtime
  style entrypoint before deleting Formless UI global CSS;
- remove or isolate direct Tailwind utility classes outside legacy or explicitly
  Tailwind-owned packages before claiming a clean switch-over;
- keep Tailwind cleanup from reshaping the `FormlessUi*` data contracts.

Tailwind exit requires all of these to be gone from production runtime paths:

- `@tailwindcss/vite`;
- `tailwindcss`;
- `@dpeek/formless-ui/global.css`;
- Tailwind-specific global CSS;
- direct Tailwind utility classes outside approved legacy or isolated package
  paths.

### 3. Add Legacy Contract Renderer Seam

Add dedicated seam modules that consume `FormlessUi*` contracts and render with
`@dpeek/formless-ui` internally.

Generated runtime seam:

- place generated seam modules under `src/app/generated/formless-ui-legacy/`;
- allow those modules to import `@dpeek/formless-ui`,
  `@dpeek/formless-media/react`, and canonical contract types;
- do not let those modules own draft sessions, browser replica reads, reference
  loading, media loading/upload, operation execution, route selection, sync
  status, or validation;
- pass runtime facts and intent callbacks in from existing foundation modules.

Import boundaries:

- runtime surfaces import contract-facing seam modules, not scattered
  `@dpeek/formless-ui` components;
- `lib/astryx` does not import the legacy seam;
- the seam is an implementation adapter, not a compatibility layer for removed
  behavior;
- do not add aliases, re-exports, deprecated paths, or compatibility wrappers;
- add an import-boundary test or script check that fails when migrated generated
  surfaces import `@dpeek/formless-ui` directly.

First seam areas:

- legacy field renderer;
- legacy media and icon field renderers;
- legacy button and operation-control renderer;
- legacy create form renderer.

Later seam areas:

- legacy create dialog renderer;
- legacy record form/detail renderer;
- legacy collection/list/table renderer.

### 4. Switch The Inline Create Form Slice

First production slice: `GeneratedCreateForm`, not `GeneratedCreateDialog`.

Move the inline generated create form path to canonical contracts through the
legacy seam. Keep modal open/close, cancel, `onSuccess`, and custom
`submitValues` behavior on the existing direct implementation until the create
dialog slice owns those semantics.

Use generated draft sessions, defaults, validation, visible-field selection,
submit resolution, sync status, and operation execution from
`src/app/generated` and `src/client`. Project the surface into
`FormlessUiCreate*` contracts and pass intent callbacks into the legacy seam.

This phase should not introduce Astryx into the production generated create
surface. Success means runtime semantics flow through the canonical contract
while the visual output still comes from `@dpeek/formless-ui` via the seam.

Acceptance:

- inline create fields render from projected `FormlessUiCreate*` data;
- hidden field errors, visible fields, defaults, required validation, disabled
  create, pending submit, reset after success, and submit operation feedback are
  preserved;
- no direct `@dpeek/formless-ui` import remains in the migrated inline create
  surface;
- media upload and full icon picker behavior are not considered proven by this
  slice unless the selected create path actually exercises them.

### 5. Expand Generated Runtime Surfaces By Slice

After the inline create slice is stable, expand one reviewable surface at a
time. Each slice may add or split contract facts discovered by that surface.

Recommended order:

1. Create dialog.
2. Record scalar edit fields and detail display.
3. Record media and icon fields.
4. Operation controls and operation status.
5. Table cells, headers, footers, readiness warnings, operation cells, and
   ordering handles.
6. Collection tabs, summaries, list/detail, record lists, and empty states.
7. Referenced-record edit dialogs, delete dialogs, and state-transition
   controls.

Operation controls:

- project from `GeneratedOperationControlBinding` and execution state into a
  renderer contract;
- do not pass `GeneratedOperationControlBinding` raw to renderers unless the
  contract explicitly narrows which fields are renderer-facing;
- keep input adapters, operation controllers, idempotency policy, sync status,
  route targets, workspace facts, and public proof facts in foundation modules.

Tables and collections:

- reuse existing `src/client` result models and generated presentation models as
  foundation inputs;
- do not duplicate query selection, ordering plan calculation, readiness
  calculation, or aggregate summary selection in renderer modules;
- renderers receive table/list rows, cells, headers, footers, summaries, empty
  states, ordering affordance facts, and intents.

Keep browser replica reads, reference option loading, media asset loading and
upload, operation controllers, ordering plan calculation, state-machine
availability, and sync status in runtime modules. Renderers receive projected
facts and intents only.

Tree builder stays on the existing implementation until a projected tree-builder
contract is explicitly designed.

### 6. Migrate Public Site Rendering And Site Utilities

Public Site work is required before retiring `@dpeek/formless-ui`; it is not
covered by generated admin field migration.

Keep these in `lib/site-app`:

- `SitePageTree`;
- public operation request helpers;
- Site link rendering rules;
- initial tree hydration;
- metadata and Worker SSR contracts.

Move or replace these before retiring the legacy UI package:

- Markdown display used by public Site;
- source SVG icon rendering used by Site links and settings;
- SVG parsing/sanitizing currently depended on through Formless UI utilities;
- theme icon controls.

Public Site renderers may use Astryx presentation primitives after package
boundaries are ready, but they should continue to consume Site-owned projected
tree facts rather than raw storage records or generated admin modules.

### 7. Resolve Shell, Auth, And Navigation

Do not prematurely define durable `FormlessUiShellNavigation`.

Current runtime UX and target UX differ materially. Current code uses an
instance rail and generated app screens; the target direction is unified
navigation with app switching, app screen links, management links, instance
settings, account/user actions, and theme control.

Before changing shell behavior:

- update the Generated UI spec away from the current minimal instance rail facts;
- treat `lib/astryx/src/components/shell.tsx` and
  `lib/astryx/src/components/side-nav.tsx` as directional prototypes, not
  canonical behavior;
- decide whether the shell first renders through a legacy seam or moves directly
  to the replacement renderer after the contract is designed.

Discovery/prototype must map:

- installed app launch links and current route selection;
- app screen/query navigation;
- public Site links;
- instance settings and access management;
- workspace gateway controls and status;
- owner/account/session actions;
- theme mode controls;
- mobile and narrow viewport behavior.

Then define a shell/navigation contract that keeps route policy, install reads,
session state, workspace status, provider redaction, local workspace behavior,
and schema facts in runtime code.

This phase owns app shell, app surface, instance rail, dev actions,
auth/account, owner setup, owner login, invitation, and local-session routes.

### 8. Swap Seam Implementations To Astryx

Once contracts and runtime wiring are stable, replace legacy seam internals with
Astryx-backed renderers.

The runtime side should keep using the same `FormlessUi*` contracts. Astryx
renderers should not receive schema parsing, storage, sync, browser replica
hooks, operation execution, media client calls, or route policy.

The Astryx media renderer should use Astryx-owned components such as
`ImageInput`, not a moved copy of `@dpeek/formless-media/react`. The Astryx icon
renderer should render from icon options and semantic icon ids, not from direct
`@dpeek/formless-ui` icon components or generated picker internals.

Tailwind/Astryx coexistence work belongs here or in the prerequisite package
boundary slice. It should not reshape the runtime contract.

### 9. Retire `@dpeek/formless-ui`

After all production surfaces render through canonical contracts or replacement
renderer primitives, seam implementations no longer use `@dpeek/formless-ui`,
and non-generated imports are removed, delete the legacy package dependency and
source.

Retirement is not complete until these areas are clear:

- generated create, record, table, collection, operation, state-machine, delete,
  and tree surfaces;
- app shell, app surface, instance rail, dev actions, auth/account, owner setup,
  owner login, invitation, and local-session routes;
- public Site React rendering, Markdown display, SVG icon rendering, theme icon
  controls, and Site icon sanitization;
- `@dpeek/formless-media/react` or any replacement export that still imports
  `@dpeek/formless-ui`;
- browser entrypoints and router/global CSS imports;
- root and package dependency entries, Tailwind Vite plugin usage, Tailwind
  runtime dependencies, and legacy UI package tests.

Run an import/dependency audit before claiming retirement:

- no production import of `@dpeek/formless-ui`;
- no production import of `@dpeek/formless-media/react` if it still imports
  `@dpeek/formless-ui`;
- no runtime dependency on `@tailwindcss/vite` or `tailwindcss`;
- no browser entrypoint import of `@dpeek/formless-ui/global.css`;
- no compatibility re-exports, aliases, deprecated paths, or explicit
  old-behavior rejection code.

## Slice Evidence

Each implementation slice should record:

- focused projection or adapter tests for changed contract facts;
- React render tests for the migrated surface;
- import-boundary evidence for the migrated files;
- current `devstate check` output;
- `bun browser ...` smoke evidence when app behavior changes.

## Contract Rules

Allowed:

- add runtime facts discovered while migrating generated surfaces;
- rename awkward fields when generated runtime names are clearer;
- split contract shapes when one generic shape becomes lossy;
- add icon, media, and semantic-control option facts needed by runtime
  projection;
- add placeholder types only when they record a known platform boundary;
- use browser `File` objects only as immediate file-select intent payloads, not
  as stored or renderer-owned media state.

Not allowed:

- React imports in the contract module;
- storage, sync, or browser replica internals in renderer contracts;
- component props as contract facts;
- contracts shaped around `@dpeek/formless-ui` or Astryx component APIs;
- Tailwind utility classes or renderer style props as contract facts;
- media upload/list client calls in renderer contracts;
- raw generated operation bindings as renderer contracts unless a slice
  explicitly narrows their renderer-facing fields;
- raw schema fragments in new contracts until phase 0 records whether schema
  fragments remain allowed projection facts;
- renderer migration that changes generated runtime semantics;
- compatibility shims for removed behavior.

Native `FormData`, field names, and hidden inputs are submit-adapter concerns.
They should not become the source of truth for generated runtime state.

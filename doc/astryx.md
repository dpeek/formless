# Astryx Migration Design

Purpose: design the move from `@dpeek/formless-ui` to
`@dpeek/formless-astryx` without moving runtime data behavior into the
presentation package.

This is not shipped behavior. Shipped behavior lives in
`openspec/specs/*/spec.md`.

## Current Anchors

- `lib/astryx` is a private Vite prototype package.
- `lib/astryx/src/field-contract.ts` defines projected field-shaped data and
  intent callbacks for Astryx field rendering.
- `lib/astryx/src/components/field-renderer.tsx` renders that field contract
  with Astryx primitives.
- `lib/astryx/src/components/generated-fields.tsx` proves create, record,
  table-cell, detail, and public-action field workflows against package-local
  fixture state.
- `lib/astryx/src/components/site.tsx` proves public Site rendering from a
  projected public tree fixture.
- `src/app/generated/astryx-field-projection.ts` already projects generated
  create, record, and public operation draft sessions into the Astryx field
  contract.
- `openspec/specs/generated-ui/spec.md` already defines the Astryx field
  primitive boundary, field coverage, generated-field vertical slice, and public
  Site vertical slice.
- `openspec/specs/site-runtime/spec.md` already requires public Site renderers
  to consume projected `SitePageTree` input rather than raw storage.
- `src/shared/public-site-client-import-boundary.test.ts` is the existing model
  for guarding a browser presentation bundle from generated admin and client
  data imports.

## End State

`@dpeek/formless-astryx` is the canonical browser presentation package for
Formless. It replaces `@dpeek/formless-ui` as the shared UI package.

The package owns:

- Astryx theme and reset CSS for Formless browser surfaces.
- Reusable Astryx-backed field primitives.
- The `AstryxFieldData` contract and controlled field renderer.
- Submit-form adapters that convert projected field data into HTML names and
  hidden inputs only at native form boundaries.
- App shell, auth, operation feedback, table, navigation, dialog, status, and
  layout primitives that are free of Formless storage behavior.
- Prototype routes and fixtures as package-local, unexported development
  harnesses.

The package does not own:

- App schema parsing.
- Stored records.
- Browser replica state.
- Query, view, read model, or screen selection.
- Operation execution.
- Sync status.
- Media client calls.
- Route target selection.
- Site public tree projection.

Production Site rendering stays owned by `@dpeek/formless-site-app` because
that package owns `SitePageTree`, Site public operation helpers, Site link
rules, and public document behavior. The Site renderer may use Astryx
presentation primitives, but Site projection facts stay in `lib/site-app`.

The prototyped Astryx app shell and navigation are the desired product
direction. The target instance/app shell is a unified navigation surface, not
the current narrow instance rail plus separate generated app sidebar. The
prototype in `lib/astryx/src/components/shell.tsx` and
`lib/astryx/src/components/side-nav.tsx` proves the intended shape: one Astryx
shell with app switching, app screen links, management links, instance settings,
user/account affordances, and theme control in a single navigation model.

## Runtime Interface

Runtime code in `src` remains the foundation layer.

`src/shared` and package slices own schema contracts, operation contracts, and
runtime-neutral helpers.

`src/client` owns browser replica reads, query/view/screen selection, reference
options, and generated view models.

`src/app/generated` owns generated UI foundation behavior:

- draft sessions;
- visible field selection;
- union and `visibleWhen` selection;
- create defaults;
- state-machine field ownership;
- field value coercion;
- validation and display-safe field errors;
- reference option loading and missing reference fallbacks;
- media asset option loading and upload intent wiring;
- operation binding, submission, status, and sync feedback;
- route profile and app storage identity facts.

`src/app/generated` passes only projected data and intent callbacks to
`@dpeek/formless-astryx`.

The presentation layer receives data shaped like this:

- field data: `AstryxFieldData`;
- field intents: draft change, commit, revert, picker open, upload file;
- operation controls: projected operation binding state plus execute intents;
- shell/navigation: labels, hrefs, selected state, profile display facts, and
  route intents;
- public Site rendering: `SitePageTree` and route facts from `lib/site-app`;
- form submission: submit-boundary adapters receive projected field data and
  never read back browser form controls as the source of truth.

For shell/navigation projections, runtime code still decides which installs,
routes, app screens, settings links, public Site links, and owner/account
actions are visible. Astryx receives a unified navigation model and renders it;
it does not query installs, sessions, route policy, or app schemas.

## Package Shape

`lib/astryx` should become a normal workspace package with explicit exports.

Required exports:

- `@dpeek/formless-astryx/global.css`
- `@dpeek/formless-astryx/field-contract`
- `@dpeek/formless-astryx/fields`
- `@dpeek/formless-astryx/layout`
- `@dpeek/formless-astryx/navigation`
- `@dpeek/formless-astryx/dialog`
- `@dpeek/formless-astryx/operations`
- `@dpeek/formless-astryx/auth`
- `@dpeek/formless-astryx/theme`
- `@dpeek/formless-astryx/markdown`
- `@dpeek/formless-astryx/source-icon`

Prototype-only files stay unexported. Runtime code must import package
subpaths, not `../../../lib/astryx/src/*`.

The root package should depend on `@dpeek/formless-astryx` before any generated
runtime import uses it as a package. The old `@dpeek/formless-ui` dependency is
removed only after all production imports are gone.

## Tailwind And Theme Coexistence

The `astryx` branch has a reference implementation for running Tailwind and
Astryx together:

- `src/global.css` imports Astryx reset/theme CSS and a Tailwind alias layer.
- `src/astryx-tailwind-theme.css` maps Astryx token values into prefixed
  Tailwind aliases such as `astryx-primary`, `astryx-card`, and
  `astryx-border`.
- `src/main.tsx` wraps the app in Astryx `Theme`.

Use that branch as a reference, not as a direct patch. The migration target is:

- `@dpeek/formless-astryx/global.css` owns Astryx reset, Astryx base CSS,
  neutral theme CSS, and any Tailwind alias layer needed while legacy Tailwind
  classes remain.
- Tailwind aliases stay prefixed so existing Formless semantic utilities such
  as `text-primary` and `bg-primary` keep their current meaning until their
  surfaces migrate.
- Runtime entrypoints import the Astryx package global CSS rather than
  `@astryxdesign/*` CSS directly.
- Runtime app trees are wrapped in a Formless-owned ThemeProvider exported from
  `@dpeek/formless-astryx/theme`.
- The provider owns mode persistence, `system`/`light`/`dark` resolution, fixed
  mode policies for surfaces that need them, and the mode-switch actions used
  by the unified navigation.
- Runtime code may render a mode switch through an Astryx package primitive, but
  it should not reach directly into `@astryxdesign/core/theme` or local Astryx
  prototype files.

## Migration Order

1. Package boundary.
   - Add explicit `@dpeek/formless-astryx` exports.
   - Move prototype routes under an unexported prototype namespace.
   - Replace the relative `field-contract` import in
     `src/app/generated/astryx-field-projection.ts` with a package import.
   - Add import-boundary tests for `lib/astryx`.
   - Adapt the Tailwind/Astryx coexistence reference from the `astryx` branch
     into package-owned global CSS and a package-owned ThemeProvider.

2. Generated field renderer.
   - Wire one production generated field surface through
     `projectGeneratedCreateAstryxFields` and `AstryxFieldRenderer`.
   - Keep draft sessions and submit resolution in `src/app/generated`.
   - Skip the full icon picker until the icon input adapter is designed.
   - Expand to record edit fields, table cells, detail fields, and public
     operation forms after the first surface is green.

3. Generated collection and table chrome.
   - Move list, table, tabs, badges, empty states, operation cells, dialogs, and
     ordering controls to Astryx primitives.
   - Keep collection result selection, ordering rank patches, and operation
     execution in `src/client` and `src/app/generated`.

4. App shell and instance shell.
   - Replace the split rail plus generated app sidebar with the unified Astryx
     shell direction from the prototype.
   - Keep app switching, app screen navigation, instance management links, app
     settings, user/account affordances, and theme control in one coherent
     navigation model.
   - Keep route guards, owner session state, app install reads, local workspace
     save status, and provider redaction in runtime modules.
   - Update `openspec/specs/generated-ui/spec.md` before shipping this slice
     because the current spec still requires a minimal instance rail before the
     generated app sidebar.

4a. Site admin tree builder.

- Design and prototype the Astryx tree-builder interface before replacing
  `src/app/generated/tree.tsx`.
- Keep tree composition operations, ordering plans, records, readiness, and
  generated create/edit behavior in runtime foundation code.

5. Public Site renderer.
   - Move the Site renderer implementation in `lib/site-app/src/react` to
     Astryx primitives.
   - Keep `SitePageTree`, public operation request helpers, link rendering,
     initial tree hydration, metadata, and Worker SSR contracts in
     `lib/site-app`.
   - Keep the public Site client import-boundary test green.

6. Package removal.
   - Remove `@dpeek/formless-ui` imports, dependency entries, tests, and source
     files after production code no longer imports the package.
   - Do not leave compatibility re-exports or aliases.

## Unprototyped Surfaces

Not every current `@dpeek/formless-ui` surface has an Astryx prototype. These
surfaces should be classified before a worker touches them.

Proceed now:

- Ordinary create, record, table-cell, detail, and public operation scalar
  fields that fit `AstryxFieldData`.
- Generated operation buttons, status, menus, dialogs, collection chrome, table
  chrome, auth screens, and unified shell/navigation where the prototype has a
  clear Astryx direction.

Resolve the adapter before migrating:

- Site admin tree builder in `src/app/generated/tree.tsx`. It currently mixes
  tree result projection, record lookup, placement ordering, drag/drop, allowed
  child variants, create dialogs, remove confirmation, readiness warnings, and
  nested record field editing. This needs a dedicated projected tree-builder
  view model plus Astryx tree-builder presentation interface before migration.
  Do not move raw records, `useRecordsById`, `setSyncStatus`, operation
  controllers, or DnD ordering plans into `lib/astryx`.
- Icon input for text fields with icon/source SVG behavior. The desired
  authoring surface is "select existing catalog icon or paste SVG". Keep icon
  catalog search, SVG source parsing, source preview, validation,
  commit/revert, and save/cancel state in generated foundation or a narrow
  adapter. Astryx should receive display-safe icon options, current SVG source,
  draft source, mode, validation status, and intents.

Can migrate late without blocking early slices:

- Media field visuals in `@dpeek/formless-media/react`. Media upload, asset
  list loading, and patch field resolution already belong outside
  presentation. The package can later replace its visual controls with Astryx
  while preserving the existing media adapter contract.
- Advanced color picker internals. The field projection already preserves
  invalid, alpha, unknown, and draft color text. Astryx can initially render a
  simpler color input as long as it does not coerce unsupported stored values.
- Value-unit number editing and compact date interaction details. These should
  migrate after the scalar field path is proven, using the same generated draft
  session source of truth.
- Public Site renderer visual polish. Site projection and public operation
  helpers are already separate; visual replacement can happen after admin
  generated field and shell migration.

Do not delete `@dpeek/formless-ui` while any deferred surface still imports it.
Early migration slices should reduce the import set but may leave specialized
legacy controls in place until their adapter is designed.

## Rules

- Data stays flat. Astryx receives projections, not stored records.
- Runtime hooks do not enter `lib/astryx`.
- `lib/astryx` does not import from `src/*`.
- `lib/astryx` does not import `@dpeek/formless-schema`,
  `@dpeek/formless-storage`, browser replica modules, `submitOperation`, sync
  status hooks, app target selectors, or media client modules.
- `src/app/generated` should not import `@astryxdesign/core` directly once the
  matching Astryx package primitive exists.
- Field authoring state stays controlled by generated draft sessions.
- Invalid draft values remain visible. Astryx must not coerce them away.
- Missing reference ids remain visible as display-safe fallback options.
- Hidden fields are omitted before projection unless they are foundation-owned
  literal defaults.
- Media upload and asset selection effects stay in generated or media adapter
  code. Astryx renders projected media options and upload intents.
- Native `FormData`, browser field names, and hidden inputs are adapter-only
  concerns at submit boundaries.
- Each migration slice removes the old `@dpeek/formless-ui` imports for the
  surface it replaces.
- Do not add shims, aliases, deprecated exports, or compatibility wrappers.
- Delete old behavior and old tests when the behavior is replaced.
- Keep specs current when shipped behavior changes.

## Tests And Evidence

Each slice should have focused evidence:

- Projection tests for value coercion, errors, hidden fields, reference
  fallbacks, media metadata, and intent adapters.
- React render tests for the migrated surface.
- Import-boundary tests that prove `lib/astryx` stays presentation-only.
- Public Site import-boundary tests when the public renderer changes.
- `devstate check` before marking a slice complete.
- `bun browser ...` smoke when app behavior changes.

## First Changes To Ship

Ship these before starting a broad migration goal:

1. Make `lib/astryx` importable as `@dpeek/formless-astryx`.
2. Export `field-contract`, `fields`, `theme`, and `global.css`.
3. Move prototype-only entrypoints behind unexported files.
4. Add a dependency from the root package to `@dpeek/formless-astryx`.
5. Replace the relative Astryx field-contract import in generated UI with the
   package subpath.
6. Add an import-boundary test that fails if `lib/astryx` imports runtime data
   modules.
7. Add an import-boundary test or lint target that fails if migrated generated
   surfaces import `@astryxdesign/core` directly instead of the Astryx package.
8. Update the generated UI spec to record the unified Astryx shell/navigation
   direction before starting the shell migration slice.
9. Record the deferred specialty surfaces in the goal prompt so the worker does
   not attempt to delete `@dpeek/formless-ui` while tree builder, icon input,
   media visuals, or other specialized controls still depend on it.
10. Adapt the `astryx` branch Tailwind coexistence files into the package
    boundary and wrap runtime entrypoints with the exported Formless
    ThemeProvider before migrating shell/navigation.

After that, the safest first production migration slice is generated field
rendering because the projection module and tests already exist.

## Tonight Agent Goal

Goal: prepare and begin the Astryx migration without breaking the data and
presentation split.

Start with the first changes to ship. Then migrate generated field rendering
surface by surface through `src/app/generated/astryx-field-projection.ts` and
`@dpeek/formless-astryx/fields`.

Do not spend the first goal designing every missing specialty surface. Leave
unprototyped surfaces on the existing implementation unless a slice explicitly
owns their adapter. The first goal should not delete `@dpeek/formless-ui`.

Stop rules:

- Stop if `lib/astryx` needs runtime data imports.
- Stop if a surface cannot be rendered from projected data and intent callbacks.
- Stop before migrating the Site admin tree builder unless a projected
  tree-builder interface has been designed.
- Stop before replacing the full icon picker unless the catalog-or-SVG adapter
  is explicit.
- Stop if public Site rendering would require importing generated admin,
  browser replica, or raw storage modules into the public client bundle.
- Stop before deleting `lib/ui` unless all production imports are gone and
  `devstate check` is green.

# Astryx Cutover

## Outcome

Make Astryx the only Formless browser presentation stack.

The completed change should:

- prove that every production app, shell, auth, management, access, generated
  workspace, and Site tree-builder surface has a complete renderer-neutral
  contract and complete Astryx renderer;
- close small residual presentation gaps that were not naturally owned by the
  earlier contract changes;
- expose only production-ready package subpaths from
  `@dpeek/formless-astryx` and integrate the Astryx StyleX build in the root
  runtime;
- prepare the root ThemeProvider, router bridge, global CSS, renderer
  assembly, and import-boundary guards while production still uses the legacy
  renderer;
- switch all remaining production application surfaces to Astryx in one
  mechanical change;
- delete the dormant legacy renderers, `@dpeek/formless-ui`, Tailwind runtime
  tooling, obsolete tests, and compatibility declarations in that same task;
  and
- verify all runtime profiles and browser entrypoints with no mixed renderer
  or styling fallback.

The public Site renderer is expected to have switched atomically during
`astryx-public-site`. This change verifies that boundary but does not perform a
second public Site migration.

## Preconditions

- `astryx-generated-workspace` is complete and landed on `main`.
- `astryx-shell-auth` is complete and landed on `main`.
- `astryx-public-site` is complete and landed on `main`, including its atomic
  public renderer and stylesheet switch.
- `astryx-site-tree-builder` is complete and landed on `main`.
- Production app surfaces select legacy renderers only through explicit seams.
- Astryx renderers support the complete contracts used by those seams.
- No renderer contract contains records, schema models, browser replica hooks,
  storage clients, sync setters, operation controllers, route authorities,
  secrets, Tailwind classes, React nodes, or renderer-specific props.

If exploration finds a missing material contract or an incomplete Astryx
renderer, update or extend the owning pre-cutover change. Do not hide the gap
inside renderer selection, a compatibility adapter, or a mixed-renderer
fallback.

## Current Baseline

The baseline observed while writing this plan is:

- `@dpeek/formless-astryx` currently exports only `./contract`; its prototype
  source and theme are not yet a production package surface.
- `lib/astryx/vite.config.ts` applies `astryxStylex()`, while the root runtime
  Vite config applies React, Tailwind, Cloudflare, and runtime-extension
  plugins but not the Astryx StyleX build plugin.
- `src/main.tsx` imports the legacy router provider and
  `@dpeek/formless-ui/global.css`.
- `src/public-site-main.tsx` also imports legacy global CSS, although the public
  Site change is expected to replace that path before cutover.
- the root package depends on `@dpeek/formless-ui`, `@tailwindcss/vite`, and
  `tailwindcss`; the runtime Vite config invokes the Tailwind plugin.
- `lib/ui/src/global.css` owns the Tailwind import, Typography plugin, React
  Aria plugin, semantic utilities, and the legacy light/dark theme.
- current direct legacy package consumers span generated controls, app and
  instance chrome, auth routes, developer reset actions, Site presentation,
  the Media React adapter, the root entrypoints, and SVG/icon tests.
- `@dpeek/formless-media/react` still renders a Tailwind and legacy
  `NativeSelect` media control even though media projection and upload effects
  already live outside presentation.
- small runtime-owned views still render Tailwind markup directly, including
  sync status, local-session state, schema loading and empty state, readiness
  warnings, and source-reset feedback.
- the legacy router provider is a small navigation context used only by the
  root runtime bridge.
- Site icon sanitization and shared icon-catalog validation still import the
  legacy SVG parser even though they are not legacy visual components.
- current import-boundary tests already provide models for guarding Astryx
  package imports and the public Site client graph.

The four pre-cutover changes should remove most of this inventory. Future
exploration must inspect the landed result and treat these observations as a
subtraction list, not guaranteed remaining work.

## Scope

### In scope

- A current-state cutover inventory covering production entrypoints, runtime
  profiles, renderer selectors, legacy package imports, Tailwind utilities,
  CSS imports, package dependencies, Vite plugins, virtual declarations,
  tests, and source helpers.
- Residual application state presentation needed for loading, empty, missing,
  status, readiness, failure, confirmation, and developer-only actions when
  not already owned by earlier contracts.
- Removal or replacement of the legacy visual control in
  `@dpeek/formless-media/react` without moving media reads, uploads, patch
  planning, or client effects into Astryx.
- Explicit ownership for safe SVG parsing, Site icon serialization, source
  icon display, and icon-catalog validation after `lib/ui` disappears.
- Production Astryx package exports for contracts, renderers, layout,
  navigation, dialogs, operations, auth, theme, Markdown, source icons, and
  global CSS actually required by the landed runtime.
- Root runtime integration for Astryx StyleX compilation and emitted CSS.
- Root ThemeProvider, router/navigation bridge, toast, portal, dialog, and
  other global presentation hosts required by the complete Astryx app.
- One centralized production renderer assembly and one application-level
  selection point.
- Contract conformance, import-boundary, dependency, and client-bundle guards
  required to make the switch mechanical.
- Atomic activation of Astryx across all remaining application surfaces.
- Deletion of legacy renderers, Tailwind markup, `lib/ui`, root legacy
  dependencies, obsolete declarations, and tests coupled to removed behavior.
- Canonical spec reconciliation and browser smoke across every supported
  runtime profile.

### Out of scope

- Reworking the public Site contract or renderer after its completed atomic
  migration.
- Recreating legacy markup, spacing, responsive breakpoints, narrow rail,
  drag behavior, dialog structure, or exact test selectors.
- Introducing user-selectable, route-selectable, surface-selectable, feature
  flag, environment, or fallback renderer switching.
- Keeping Tailwind as a general utility layer after the cutover.
- Compatibility re-exports, package aliases, legacy CSS aliases, deprecated
  subpaths, or a placeholder `lib/ui` package.
- Moving storage, schema parsing, query evaluation, route policy, auth
  ceremony, operation execution, sync, media clients, or public projection
  into `lib/astryx`.
- Opportunistic contract cleanup that is not required to remove the legacy
  presentation stack. Record later hygiene separately.
- Merging or reviewing a partially activated cutover.

## Cutover Direction

### Readiness gate

The cutover gate is all-or-nothing. Before production selection changes:

- every production presentation surface is named in a cutover inventory;
- each surface points to a renderer-neutral contract, runtime projection and
  intent adapter, legacy renderer seam, complete Astryx renderer, and fixture
  or focused evidence;
- all direct `@dpeek/formless-ui` imports are either inside dormant legacy
  renderer modules scheduled for deletion or are explicitly assigned to a
  preparation task;
- all remaining Tailwind classes are inside the same deletion set;
- the root can compile and bundle every production Astryx export;
- the Astryx candidate app can render all supported route/profile states
  without selecting legacy components; and
- no fallback can silently cross from Astryx to the legacy renderer.

A failed item blocks activation. It does not justify a temporary mixed path.

### Production presentation assembly

Runtime code should select one complete application presentation assembly, not
choose renderers independently inside fields, collections, workspaces, routes,
or dialogs.

The assembly should compose the landed Astryx implementations for:

- root providers and global presentation hosts;
- unified shell and navigation;
- instance and workspace management;
- owner auth, account, invitation, and access management;
- generated fields, create forms, operations, records, lists, tables, screens,
  and non-tree workspaces;
- Site tree-builder workspaces; and
- application loading, empty, missing, status, readiness, and failure states.

Runtime modules continue to own route matching, state reads, projection,
effects, and navigation. The presentation assembly receives only contract data
and intent callbacks.

Before activation, production selects the complete legacy assembly and tests
may select the complete Astryx assembly. The final task changes that single
selection and deletes the legacy alternative. It does not leave a permanent
renderer selector behind.

### Residual surface ownership

Earlier change boundaries take precedence. At exploration time:

- fold sync and reset presentation into the shell or management contracts if
  `astryx-shell-auth` already owns those facts;
- fold readiness, loading, empty, and result warnings into generated workspace
  contracts if `astryx-generated-workspace` or
  `astryx-site-tree-builder` already owns them;
- remove `@dpeek/formless-media/react` visual usage when the canonical
  `FormlessUiField` media contract and Astryx field renderer already replace
  it; keep only Media package adapters that still own real media behavior;
- keep Site icon sanitization in the Site package or another runtime-neutral
  owner, while Astryx owns source-icon presentation; and
- replace the root legacy router context with a narrow Astryx navigation
  bridge only if landed renderer intents still require it.

Do not create duplicate cutover-only contracts for facts already projected by
an earlier change.

### Theme, CSS, and build

The root application should import package-owned Astryx CSS and use the
Formless-owned Astryx ThemeProvider. Runtime code should not import
`@astryxdesign/*` theme or CSS modules directly.

The root build must apply the supported Astryx StyleX integration to production
application and public entrypoints, preserve Cloudflare and runtime extension
behavior, and emit the CSS required for SSR and hydration. The public Site
entrypoint keeps its public-only asset graph and fixed or public theme policy
established by `astryx-public-site`.

Tailwind may remain installed while preparation tasks run and production still
selects only legacy renderers. The final activation task removes the Tailwind
plugin, packages, global CSS, semantic utility assumptions, virtual module
declarations, and all remaining utility classes together.

### Package and import boundaries

Production runtime code imports only explicit `@dpeek/formless-astryx/*`
subpaths. It does not deep-import `lib/astryx/src`, import the prototype root,
or import `@astryxdesign/core` directly when a Formless package surface owns
the role.

`lib/astryx` remains presentation-only. Package-boundary evidence should reject
imports from runtime `src/*`, storage, browser replica, sync, gateway, auth
secrets, operation execution, Media clients, or legacy UI.

After activation:

- no source, test, declaration, package manifest, or lockfile references
  `@dpeek/formless-ui` or `lib/ui`;
- no production runtime source contains Tailwind utility markup;
- no package retains an unused Tailwind dependency;
- `lib/site-app` does not gain a reverse dependency on
  `@dpeek/formless-astryx`; and
- the public Site browser graph remains isolated from generated admin,
  shell/auth, replica, and private runtime modules.

## Migration Rules

- Complete every contract and Astryx renderer before changing production
  selection.
- Keep production entirely legacy during preparation tasks.
- Use one application-level activation task for renderer selection, theme,
  global CSS, legacy renderer deletion, Tailwind removal, and `lib/ui`
  deletion.
- Treat that activation task as indivisible and not review-ready until its
  checks pass.
- Do not add runtime renderer flags or fallback branches to make the cutover
  easier.
- Do not preserve exact legacy DOM, CSS classes, test ids, or snapshots unless
  they are a real external behavior contract.
- Prefer Astryx component composition and accessibility behavior over legacy
  UX parity.
- Keep StyleX styling in `lib/astryx` and use Astryx tokens.
- Keep runtime data, effects, and authority outside presentation.
- Preserve invalid drafts, missing references, pending state, display-safe
  failures, and semantic intent behavior through the existing contracts.
- Delete obsolete tests with the implementation they constrain; replace only
  behavior, contract, security, route, and accessibility evidence that still
  matters.
- Do not leave compatibility files, empty packages, aliases, re-exports, or
  commented legacy code.

## Implementation Tasks

Each heading is intended to become one task section in the future change
metadata. `change-explore` should remove headings made obsolete by landed work
and split only when the atomic activation invariant remains intact.

### 1. Audit the landed cutover gate

- Enumerate every production browser entrypoint, runtime profile, route family,
  application presentation surface, public renderer path, renderer selector,
  CSS entrypoint, build plugin, and global provider.
- Map each application surface to its canonical contract, runtime projection,
  intent adapter, legacy seam, Astryx renderer, fixtures, and focused tests.
- Enumerate every remaining `@dpeek/formless-ui`, `lib/ui`, Tailwind,
  `@tailwindcss/vite`, direct `@astryxdesign/*`, deep Astryx source, and legacy
  CSS reference across source, tests, manifests, declarations, scripts, and
  lockfile.
- Classify each reference as dormant legacy deletion, residual contract work,
  pure helper ownership, build integration, or obsolete test evidence.
- Block the change if a material generated, shell, auth, public Site, or tree
  contract is incomplete; do not defer that gap to activation.

### 2. Reconcile residual application-state contracts

- Inspect loading, empty, missing-route, sync status, readiness, failure,
  confirmation, local-session, and developer reset states left after the four
  prerequisite changes.
- Reuse and extend the landed shell, management, auth, generated workspace, or
  tree contracts where they already own the facts.
- Add only missing display-safe data, availability, action, and status intents;
  keep replica reads, sync effects, reset effects, route transitions, and
  retry behavior in runtime modules.
- Remove direct React-node, class-name, legacy control, and exact-markup inputs
  from those boundaries.
- Add projection and intent evidence for every residual state needed in the
  cutover route matrix.

### 3. Move residual legacy application states behind their owned seams

- Make the production legacy shell, management, auth, workspace, and tree
  renderers consume the reconciled residual contracts.
- Move any remaining direct Tailwind markup for those states into the dormant
  legacy renderer modules scheduled for atomic deletion.
- Remove duplicated status, warning, fallback, and action composition from
  runtime route modules.
- Keep production renderer selection and legacy global CSS unchanged.
- Browser smoke the changed legacy paths before proceeding.

### 4. Complete Astryx residual states and fixtures

- Implement the residual application states with Astryx components and
  controlled contract input.
- Compose status, failure, confirmation, warning, empty, and loading behavior
  into their owning Astryx shell or workspace renderers rather than creating a
  parallel cutover shell.
- Follow Astryx hierarchy and responsive behavior without recreating legacy
  markup.
- Add package-local data-only fixtures for representative pending, success,
  disabled, empty, missing, blocked, warning, and failure states.
- Verify accessibility names, live status, focus, dialog, retry, and disabled
  behavior where applicable.

### 5. Remove residual Media presentation coupling

- Reconcile `@dpeek/formless-media/react` against the landed canonical media
  field contract and Astryx renderer.
- Route create, record, table, detail, and operation media fields through the
  canonical field renderer without calling the legacy Media visual control.
- Retain Media package client helpers and React adapters only when they own real
  upload, preview, asset-option, or browser behavior not already owned by the
  generated runtime.
- Delete the legacy `NativeSelect` and Tailwind media control when it is no
  longer consumed; do not move fetch, upload, or patch planning into Astryx.
- Update package boundaries, exports, dependencies, and focused media behavior
  tests to match the resulting ownership.

### 6. Resolve SVG and source-icon helper ownership

- Separate safe SVG parsing and serialization from legacy visual component
  ownership.
- Keep public Site icon sanitization in `lib/site-app` or another
  runtime-neutral owner without adding a Site-to-Astryx dependency.
- Export Astryx source-icon presentation through its production package
  subpath for generated authoring and display.
- Update icon catalog validation to exercise the canonical safe parser rather
  than importing `@dpeek/formless-ui/svg-icon`.
- Preserve the existing safe element and attribute policy; do not retain the
  UI package solely as a pure-helper container.

### 7. Publish the production Astryx package surface

- Reconcile the landed package exports with actual runtime needs and expose
  explicit subpaths for contracts, renderers, layout, navigation, dialogs,
  operations, auth, theme, Markdown, source icons, and global CSS as needed.
- Keep prototype roots, fixture controls, scenario switchers, and exploratory
  layouts unexported.
- Move or rename prototype modules only where needed to establish a clear
  production boundary.
- Ensure every runtime import uses package subpaths and no consumer deep-imports
  `lib/astryx/src/*`.
- Add export and import-boundary evidence for browser-only, runtime-neutral,
  and public-only entrypoint expectations.

### 8. Integrate Astryx StyleX into the root runtime build

- Apply the supported Astryx StyleX Vite integration to the root runtime
  without losing React, Cloudflare, workspace renderer extension, or existing
  build behavior.
- Reconcile plugin order and package dependencies with the package-local Astryx
  Vite setup.
- Verify app, public Site, development, SSR, hydration, and production build
  paths emit and load required StyleX output.
- Preserve the public Site client asset boundary and workspace renderer
  extension behavior.
- Add focused runtime Vite configuration and asset-manifest coverage.

### 9. Prepare the Astryx root provider and CSS assembly

- Export and compose the Formless Astryx ThemeProvider, theme mode policy,
  navigation bridge, toast viewport, portal roots, dialog host, and any other
  complete-app presentation providers required by landed renderers.
- Keep route navigation in the runtime bridge and pass only navigation intents
  through presentation contracts.
- Provide separate package-owned app and public CSS entrypoints only if the
  landed public renderer requires distinct asset graphs.
- Verify light, dark, system, and fixed policies use the Astryx neutral theme
  without reading legacy `.light` or `.dark` classes.
- Keep `src/main.tsx` on the legacy provider and CSS until the atomic task.

### 10. Centralize complete application renderer assembly

- Compose the full legacy application presentation behind one temporary
  application-level assembly used by production.
- Compose the full Astryx application presentation behind the same canonical
  runtime inputs for tests and cutover preparation.
- Remove lower-level renderer selection from fields, records, collections,
  workspaces, tree results, routes, dialogs, and shell modules.
- Reject per-surface fallbacks and ensure a missing renderer is a preparation
  failure rather than a reason to cross presentation stacks.
- Keep production selection fixed to the complete legacy assembly.

### 11. Add cutover conformance and static guards

- Build a route/profile conformance matrix covering dev workbench, product
  instance, installed app admin, instance management, owner auth, account,
  invitation, access management, Site tree authoring, missing routes, local
  session, and public Site isolation.
- Exercise the complete legacy and Astryx application assemblies against the
  same canonical contracts where dual-renderer behavior still matters.
- Assert semantic intent dispatch, controlled state, accessibility, secret
  exclusion, and display-safe failure behavior rather than exact DOM parity.
- Add static guards for direct legacy imports, deep Astryx imports, direct
  runtime imports from `lib/astryx`, per-surface renderer selection, and
  unclassified Tailwind markup.
- Keep the public Site import-boundary test green and update its allowlist only
  for landed public Astryx modules.

### 12. Exercise the complete Astryx candidate without activating it

- Render the complete Astryx application assembly through test-only or fixture
  entrypoints using representative contracts from every route/profile matrix
  row.
- Verify nested generated workspaces, tree workspaces, shell navigation,
  management, auth, access, global dialogs, toasts, theme switching, media,
  Markdown, icons, loading, and failures coexist under one provider tree.
- Build production client and SSR assets to expose StyleX, chunking, CSS,
  hydration, portal, and package-export faults before production selection
  changes.
- Confirm the candidate imports no dormant legacy renderer or legacy CSS.
- Keep production runtime selection on the legacy assembly.

### 13. Freeze the mechanical cutover manifest

- Record the exact selector, root provider, CSS imports, renderer modules,
  package directory, dependency entries, Vite plugins, declarations, tests,
  scripts, and lockfile references changed or deleted by activation.
- Prove each deleted renderer has a complete Astryx counterpart and each
  deleted helper has an explicit current owner.
- Prove all non-deletion edits are limited to application-level selection,
  root provider assembly, CSS selection, dependency removal, and current spec
  wording.
- Ensure the atomic task has no unresolved UX, contract, runtime, security, or
  package-design decision.
- Do not begin activation while any manifest item remains conditional.

### 14. Activate Astryx and delete the legacy stack atomically

- Switch the single application presentation assembly from legacy to Astryx.
- Switch `src/main.tsx` to the Astryx root provider, navigation bridge, global
  hosts, and app CSS.
- Delete all dormant legacy generated, tree, shell, management, auth, access,
  status, fallback, media, and helper renderer modules.
- Delete obsolete exact-DOM, Tailwind-class, legacy-renderer, and compatibility
  tests while retaining current contract, behavior, security, route, and
  accessibility coverage.
- Delete `lib/ui` and remove every `@dpeek/formless-ui` dependency, import,
  declaration, boundary exception, package entry, and lockfile reference.
- Remove all remaining Tailwind utility markup, `@tailwindcss/vite`,
  `tailwindcss`, Tailwind plugins, runtime Vite integration, CSS aliases, and
  lockfile entries.
- Remove the temporary legacy/Astryx selector so only the production Astryx
  assembly remains.
- Update canonical specs to describe Astryx as current presentation behavior
  and delete deferred-switch and legacy-renderer facts.
- Run current devstate checks before the task is complete. Do not split or
  publish this task in a mixed state.

### 15. Verify the Astryx-only runtime

- Re-run import, dependency, package export, client boundary, build asset,
  contract, route, auth security, SSR, hydration, and current devstate checks.
- Browser smoke dev workbench and product instance profiles across generated
  list, table, record, create, operation, non-tree workspace, Site tree,
  management, auth, account, invitation, access, loading, empty, missing,
  pending, warning, and failure states.
- Browser smoke representative desktop and narrow layouts, light and dark
  modes, navigation, dialogs, focus return, toasts, media, Markdown, and source
  icons.
- Verify the already-migrated public Site still renders and hydrates through
  its public-only client graph with workspace renderer precedence intact.
- Confirm searches find no legacy UI package, Tailwind stack, mixed renderer,
  compatibility alias, deep Astryx import, or obsolete future-cutover wording.
- Fix Astryx-only defects directly; do not restore a legacy fallback.

## Expected Evidence

The proposed change should collect evidence for:

- a complete surface-to-contract-to-renderer cutover inventory;
- zero material contract or Astryx renderer gaps before activation;
- residual application states projected without runtime data entering Astryx;
- Media upload and asset behavior remaining outside presentation;
- safe SVG and Site icon behavior without a reverse Site-to-Astryx dependency;
- explicit production Astryx exports and no prototype or deep imports;
- root StyleX build, CSS emission, SSR, and hydration behavior;
- one complete application presentation assembly and no per-surface fallback;
- legacy and Astryx conformance before activation;
- secret-safe auth and access presentation contracts;
- public Site client graph isolation and workspace renderer precedence;
- one atomic production activation and deletion task;
- zero `@dpeek/formless-ui`, `lib/ui`, Tailwind, or compatibility references
  after activation;
- current canonical specs with no deferred production-switch facts;
- current `devstate check` evidence; and
- browser smoke across supported runtime profiles and representative responsive
  states.

For package-only UX iteration before activation, follow
`lib/astryx/AGENTS.md`: use Astryx components, prefer component props over
custom styling, use StyleX with Astryx tokens when styling is necessary, do not
start another dev server, and rely on the user for prototype visual feedback.

## Proposal-Time Spec Work

`change-propose` should reconcile the smallest applicable canonical specs:

- `openspec/specs/generated-ui/spec.md` for Astryx as the current application
  presentation assembly, root provider behavior, complete renderer selection,
  residual application states, and deletion of legacy/deferred-switch facts;
- `openspec/specs/site-runtime/spec.md` only to describe the already-landed
  Astryx public renderer and verify its isolated asset boundary remains
  current;
- `openspec/specs/package-slices/spec.md` for the production Astryx package
  exports, presentation-only boundary, Media and Site dependency direction,
  and removal of the legacy UI package where those are canonical package
  rules;
- `openspec/specs/instance-auth/spec.md` and the applicable identity spec only
  where their renderer-neutral presentation boundaries still describe a
  deferred or legacy renderer; and
- `openspec/specs/runtime-topology/spec.md` only where the unified Astryx shell
  or root provider changes current route/profile presentation facts.

Delete or rewrite legacy-renderer, deferred-selection, Tailwind, split-shell,
and future-Astryx statements. Do not edit storage, authority, route, auth,
identity, public action, media, or Site projection semantics merely because the
presentation implementation changed.

## Completion Gate

The Astryx contract migration is complete when:

- every production browser surface consumes renderer-neutral data and intents;
- one complete Astryx application assembly renders all supported app, shell,
  management, auth, access, generated workspace, and tree states;
- production entrypoints use the Formless Astryx ThemeProvider, global hosts,
  navigation bridge, CSS, and StyleX build path;
- the public Site remains on its Astryx renderer and public-only client graph;
- runtime storage, projection, route policy, auth, sync, operation, and media
  behavior remain outside `lib/astryx`;
- `lib/astryx` exposes only explicit production subpaths and imports no runtime
  or legacy UI modules;
- production has no renderer flag, per-surface selection, legacy fallback, or
  mixed styling path;
- `@dpeek/formless-ui`, `lib/ui`, Tailwind tooling, Tailwind utility markup,
  compatibility declarations, and obsolete legacy tests are deleted;
- canonical specs describe Astryx as current behavior rather than a future
  renderer;
- current devstate checks and required browser smoke pass; and
- the final activation was a mechanical selection-and-deletion task performed
  only after all contract and renderer work was complete.

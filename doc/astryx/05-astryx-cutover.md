# Astryx Cutover

## Outcome

Make Astryx the only Formless browser presentation stack.

The completed change should:

- prove that every production app, shell, auth, management, access, generated
  workspace, and Site tree-builder surface has a complete renderer-neutral
  contract-host reference path and complete subscribed Astryx renderer;
- prove that the public Site has complete canonical page and system-state
  renderer seams plus complete unselected Astryx implementations;
- close small residual presentation gaps that were not naturally owned by the
  earlier contract changes;
- expose only runtime-consumed package subpaths from
  `@dpeek/formless-astryx` and integrate the Astryx StyleX build in the root
  runtime;
- prepare the root ThemeProvider, router bridge, global CSS, renderer
  assembly, and import-boundary guards while production still uses the legacy
  renderer;
- switch all remaining production application surfaces and the public Site to
  Astryx in one mechanical activation change;
- leave the legacy renderers, `@dpeek/formless-ui`, Tailwind runtime tooling,
  and obsolete tests dormant and unreachable after activation so they can be
  removed through independently shippable cleanup tasks; and
- verify all runtime profiles and browser entrypoints with no mixed renderer
  or styling fallback.

The public Site renderer remains explicitly legacy after
`astryx-public-site`. This change switches its page renderer, system-state
renderer, provider, and CSS through the prepared seams in the atomic activation
task. Legacy public presentation is deleted after cutover without changing the
selected renderer again.

## Preconditions

- `astryx-generated-workspace` is complete and landed on `main`.
- `astryx-shell-auth` is complete and landed on `main`.
- `astryx-public-site` is complete and landed on `main`, including explicit
  legacy page and system-state selection, complete unselected Astryx
  implementations, package-owned public provider and CSS boundaries, and an
  exact mechanical cutover manifest.
- `astryx-site-tree-builder` is complete and landed on `main`.
- Production app and public Site surfaces select legacy renderers only through
  explicit seams.
- Runtime presentation roots own stable contract hosts and publish complete
  immutable node sets through typed references.
- Legacy and Astryx subscribed renderers support the same references and pure
  complete-snapshot renderers remain available for focused tests.
- No renderer contract contains records, schema models, browser replica hooks,
  storage clients, sync setters, operation controllers, route authorities,
  secrets, Tailwind classes, React nodes, or renderer-specific props.

If the landed audit finds a missing material contract or an incomplete Astryx
renderer, treat it as blocking preparation work before assembly and activation.
Do not hide the gap inside renderer selection, a compatibility adapter, or a
mixed-renderer fallback.

## Current Baseline

The baseline after the four pre-cutover changes landed is:

- generated workspaces, the application shell, instance management, owner
  auth, account, invitation, access management, and the Site tree-builder use
  renderer-neutral contracts, stable host references, subscribed legacy
  renderers, and complete unselected Astryx renderers;
- production application selection remains distributed across the shell
  runtime, generated workspace runtime, management route, auth and access
  routes, and their nested legacy renderers rather than one application-level
  assembly;
- the public Site browser entrypoint, application preview routes, and Worker
  SSR assembly explicitly select the legacy page and system-state renderers,
  while the complete Astryx candidate remains unselected;
- `@dpeek/formless-astryx` exports the contract, contract host, React host
  provider, and public Site renderer, provider, and CSS subpaths. Application
  renderers, the application provider, and application CSS are not production
  exports;
- `lib/astryx/vite.config.ts` applies `astryxStylex()`, while the root runtime
  Vite config applies React, Tailwind, Cloudflare, and runtime-extension
  plugins but not the Astryx StyleX build plugin;
- `src/main.tsx` imports the legacy router provider and legacy global CSS, and
  `src/public-site-main.tsx` imports the same CSS;
- the root package depends on `@dpeek/formless-ui`, `@tailwindcss/vite`, and
  `tailwindcss`; `lib/site-app` also depends on `@dpeek/formless-ui` for its
  dormant legacy public renderer;
- `lib/ui/src/global.css` owns the Tailwind import, Typography plugin, React
  Aria plugin, semantic utilities, and the legacy light/dark theme;
- generated workspace eligibility is complete, but `screen.tsx` still retains
  the superseded direct-rendering fallback and therefore keeps old generated
  controls in the application graph;
- live runtime helpers remain colocated with legacy React presentation in
  modules such as generated create, record delete, and state-machine UI. Those
  modules are not yet a safe deletion set;
- residual top-level views still render presentation directly for route
  loading, owner checks, unsupported public packages, schema loading and empty
  state, missing routes, and local-session state;
- sync, reset, readiness, generated operation, Media, Markdown, source-icon,
  and field presentation already cross the landed renderer contracts where
  they are part of generated, shell, management, auth, access, or tree
  surfaces;
- `@dpeek/formless-media/react` is now a legacy visual adapter consumed by old
  generated controls. Media reads, asset options, uploads, patch planning, and
  the complete Astryx media field remain outside that adapter;
- safe SVG parsing already belongs to `@dpeek/formless-source-svg`; Site icon
  serialization and Astryx source-icon presentation use that package. Shared
  icon-catalog validation still imports the legacy UI parser;
- document-theme contracts, legacy and Astryx renderers, and fixtures exist,
  but production runtime does not yet publish or pass an application theme
  reference or settle application preference, system-mode, document marker,
  client bootstrap, and document effects. There is no current application SSR
  producer;
- the legacy router provider intercepts same-origin links from the legacy
  sidebar. Astryx navigation currently renders ordinary `href` links, so the
  application root still needs an explicit SPA navigation policy; and
- package import-boundary and public Site client-graph tests provide the base
  for the final Astryx-only guards.

## Scope

### In scope

- A current-state cutover inventory covering production entrypoints, runtime
  profiles, renderer selectors, legacy package imports, Tailwind utilities,
  CSS imports, package dependencies, Vite plugins, virtual declarations,
  tests, and source helpers.
- Residual top-level application state presentation needed for loading, empty,
  missing, unavailable, blocked, and failure states that are not already owned
  by earlier contracts.
- Removal of the superseded direct generated fallback and separation of live
  runtime helpers from dormant legacy React modules before freezing the
  deletion set.
- Deletion of `@dpeek/formless-media/react` with the legacy presentation stack
  after proving that no non-legacy consumer remains.
- Preservation of existing `@dpeek/formless-source-svg` ownership for safe SVG
  parsing, Site icon serialization, Astryx source-icon presentation, and
  icon-catalog validation after `lib/ui` disappears.
- A minimal runtime Astryx package surface for the complete application
  assembly, root provider, and application CSS in addition to the existing
  contract and public Site exports.
- Production contract-host exports, typed references, subscribed renderers, and
  provider hooks required by the complete application assembly.
- Root runtime integration for Astryx StyleX compilation and emitted CSS.
- Root ThemeProvider, explicit application theme behavior, same-origin SPA
  navigation bridge, toast viewport, and only the other global presentation
  hosts demonstrably required by the complete Astryx app.
- One centralized production renderer assembly and one application-level
  selection point.
- One explicit public Site built-in page and system-state selection seam with
  workspace page-renderer precedence unchanged.
- Contract conformance, import-boundary, dependency, and client-bundle guards
  required to make the switch mechanical.
- Atomic activation of Astryx across all remaining application surfaces without
  deleting the dormant legacy stack in the activation task.
- Independently shippable post-cutover deletion of legacy renderers, Tailwind
  markup, `lib/ui`, root legacy dependencies, obsolete declarations, and tests
  coupled to removed behavior.
- Canonical spec reconciliation and browser smoke across every supported
  runtime profile.

### Out of scope

- Reworking the settled public Site contracts or complete Astryx candidate;
  this change owns only root selection, build/provider/CSS integration, and
  legacy deletion for that surface.
- Recreating legacy markup, spacing, responsive breakpoints, narrow rail,
  drag behavior, dialog structure, or exact test selectors.
- Introducing user-selectable, route-selectable, surface-selectable, feature
  flag, environment, or fallback renderer switching.
- Keeping Tailwind as a general utility layer after the cutover.
- Compatibility re-exports, package aliases, legacy CSS aliases, deprecated
  subpaths, or a placeholder `lib/ui` package.
- Publishing or versioning packages, publishing a Formless release, deploying
  the cutover, coordinating rollout, or defining rollback behavior.
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
  host publication adapter, canonical intent dispatch, subscribed legacy seam,
  complete subscribed Astryx renderer, and memory-host fixture or focused
  evidence;
- all direct `@dpeek/formless-ui` imports are either inside dormant legacy
  renderer modules scheduled for deletion or are explicitly assigned to a
  preparation task;
- no live runtime helper is owned by a module in the dormant legacy deletion
  set, and the superseded direct generated fallback is gone;
- no Tailwind class, legacy CSS assumption, or legacy UI import is reachable
  from the Astryx application or public Site candidate graphs; dormant legacy
  markup may remain for post-cutover cleanup;
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
effects, and navigation. Each mounted presentation root keeps one stable host,
publishes its complete next node set in the commit phase, and passes only the
host plus stable root references to the subscribed application assembly.
Canonical intents dispatch through the host; runtime callbacks, selectors, and
changing complete snapshots do not cross the renderer boundary.

Before activation, production selects the complete legacy assembly and tests
may select the complete Astryx assembly. The activation task changes that
single selection and leaves the legacy alternative unreachable. It does not
leave a permanent renderer selector behind. Later cleanup deletes the dormant
legacy assembly without changing production selection.

### Contract-host continuity

The renderer switch must not replace the runtime host or introduce an
Astryx-specific state path.

- React Context carries the same stable host before and after activation.
- The legacy and Astryx assemblies start from the same shell, management, auth,
  access, workspace, and tree root references.
- Runtime adapters keep atomic publication, semantic identity reuse, removal,
  server snapshots, hydration, and scoped notification behavior unchanged.
- The selected route outlet remains separate React composition rather than a
  host snapshot or `ReactNode` field.
- The public Site stays on its Site-owned `SitePublicRendererProps` boundary and
  public-only graph; it does not join the application contract host.

Activation changes subscribed presentation and root styling only. It does not
reproject data, translate host nodes, pass complete snapshots through Context,
or add an application-wide rerendering wrapper.

### Residual surface ownership

Earlier change boundaries take precedence. Current ownership is:

- keep sync and reset presentation in the landed shell or management
  contracts;
- keep readiness, result warnings, generated loading and empty states in the
  landed workspace and tree nodes that already own them;
- add a small application system-state contract only for top-level loading,
  missing, unavailable, blocked, and failure states that do not have a current
  shell, management, auth, workspace, tree, or public Site owner;
- treat `@dpeek/formless-media/react` as dormant legacy presentation. Do not
  build a transitional replacement or move Media reads, uploads, patch
  planning, or effects into Astryx;
- keep safe SVG parsing in `@dpeek/formless-source-svg`, Site icon
  serialization in the Site package, and source-icon presentation internal to
  the Astryx assembly unless a real external consumer requires an export; and
- replace the root legacy router context with a narrow same-origin navigation
  bridge because the Astryx assembly emits ordinary internal `href` links.

Do not create duplicate cutover-only contracts for facts already projected by
an earlier change.

### Theme, CSS, and build

The root application should import package-owned Astryx CSS and use the
Formless-owned Astryx ThemeProvider exactly once above application routes.
Runtime code should not import `@astryxdesign/*` theme or CSS modules directly.

Preparation must settle one application theme policy before activation. The
runtime owns preference persistence, system-mode resolution, document markers,
client document bootstrap, hydration alignment where hydration input exists,
and document effects; the renderer receives only the existing document-theme
contract. The application has no current SSR producer, so application SSR is
not introduced by this change. Fixed public Site Worker SSR and theme behavior
remain Site-owned.

The application theme runtime owns the contract snapshot and stable reference,
wraps the complete application once, and publishes the theme node into the
existing shell host for theme-control presentation. The Astryx shell consumes
the reference to render the control but does not mount a second ThemeProvider.
No-shell routes inherit the root application provider.

The application root navigation bridge intercepts only unmodified same-origin
links that target the current browsing context. External links, downloads, new
tabs, modified clicks, same-document anchors, prevented events, and explicit
native-navigation subtrees keep normal browser behavior. Public Site and
workspace renderer roots can opt out where document navigation is their current
contract. Route matching and navigation remain runtime concerns rather than
Astryx contract data.

The root build must apply the supported Astryx StyleX integration to production
application and public entrypoints, preserve Cloudflare and runtime extension
behavior, and emit the CSS required for SSR and hydration. The public Site
entrypoint keeps its public-only asset graph and fixed or public theme policy
established by `astryx-public-site`.

Tailwind may remain installed during preparation, activation, and post-cutover
cleanup. Activation removes legacy global CSS from production entrypoints and
makes Astryx CSS the only active production styling path. Later cleanup removes
the dormant Tailwind plugin, packages, semantic utility assumptions, virtual
module declarations, and remaining legacy utility classes.

### Package and import boundaries

Production runtime code imports only explicit `@dpeek/formless-astryx/*`
subpaths. It does not deep-import `lib/astryx/src`, import the prototype root,
or import `@astryxdesign/core` directly when a Formless package surface owns
the role.

The production export map should remain smaller than the internal component
graph. Runtime consumers need the existing contract and public Site subpaths,
one complete application assembly, one root application provider, and
application CSS. Individual field, layout, navigation, dialog, operation,
auth, Markdown, and source-icon implementations remain internal unless an
independent production consumer proves the need for another subpath.

`lib/astryx` remains presentation-only. Package-boundary evidence should reject
imports from runtime `src/*`, storage, browser replica, sync, gateway, auth
secrets, operation execution, Media clients, or legacy UI.

After activation, production entrypoint and Worker graphs:

- do not reach `@dpeek/formless-ui`, `lib/ui`, legacy renderer modules, or legacy
  global CSS;
- do not reach Tailwind utility markup from the selected Astryx application or
  public Site renderers;
- `lib/site-app` does not gain a reverse dependency on
  `@dpeek/formless-astryx`; and
- the public Site browser graph remains isolated from generated admin,
  shell/auth, replica, and private runtime modules.

After post-cutover cleanup, no source, test, declaration, package manifest,
agent instruction, current documentation, or lockfile retains an obsolete
legacy renderer, `@dpeek/formless-ui`, `lib/ui`, Tailwind tooling, or Media
React reference.

## Migration Rules

- Complete every contract and Astryx renderer before changing production
  selection.
- Keep production entirely legacy during preparation tasks.
- Use one root activation task for application and public Site renderer
  selection, theme, global and public CSS, StyleX integration, and canonical
  current-behavior spec wording.
- Treat that activation task as indivisible and not review-ready until its
  checks pass.
- Keep legacy deletion, `lib/ui` deletion, Tailwind removal, obsolete-test
  deletion for dormant modules, and documentation cleanup in independently
  shippable tasks after activation.
- Update or delete tests in the cutover change when their expectation changes
  because production renderer selection, root providers, navigation, CSS, or
  public assembly changed. Add replacement behavior evidence in the same
  change.
- Leave tests that exclusively exercise still-present dormant legacy modules
  for the cleanup change that deletes those modules.
- Do not add runtime renderer flags or fallback branches to make the cutover
  easier.
- Do not preserve exact legacy DOM, CSS classes, test ids, or snapshots unless
  they are a real external behavior contract.
- Prefer Astryx component composition and accessibility behavior over legacy
  UX parity.
- Keep StyleX styling in `lib/astryx` and use Astryx tokens.
- Keep runtime data, effects, and authority outside presentation.
- Keep the stable host, reference identities, atomic publication, server
  snapshots, hydration, and canonical dispatch behavior unchanged during
  renderer activation.
- Preserve invalid drafts, missing references, pending state, display-safe
  failures, and semantic intent behavior through the existing contracts.
- Delete obsolete tests with the implementation they constrain; replace only
  behavior, contract, security, route, and accessibility evidence that still
  matters.
- Do not leave compatibility files, empty packages, aliases, re-exports, or
  commented legacy code.

## Change Boundaries

Propose this plan as two Git-backed changes.

### Change 1: Astryx runtime cutover

This change owns preparation, activation, and verification through Task 15. It
is complete only when Astryx is the sole selected and reachable production
renderer.

It includes:

- residual contract and Astryx renderer completion required to activate;
- centralized application and public renderer selection;
- root theme, navigation, CSS, StyleX, and provider ownership;
- production dependency-graph guards and current canonical renderer specs;
- updates or deletion of tests coupled to production renderer selection,
  provider composition, navigation, styling, selected DOM, or public Site SSR
  and hydration; and
- replacement contract, behavior, security, route, accessibility, build, and
  browser evidence required for a green cutover.

It does not delete dormant legacy runtime source, `lib/ui`, dormant Tailwind
dependencies, or tests whose only subject is a still-present legacy module.

### Change 2: Legacy presentation cleanup

This change begins after the cutover change is complete and owns Tasks 16-22.
Its task sections remain independently shippable within the change.

It includes:

- deletion of dormant legacy renderers and mixed-ownership presentation
  modules after extracting any live helpers;
- deletion of tests that exclusively exercise the deleted legacy source;
- removal of Media React, `lib/ui`, Tailwind, declarations, scripts,
  dependencies, and lockfile entries; and
- final repository-wide guards, package-boundary specs, documentation,
  devstate checks, and browser smoke.

The cleanup change never changes production renderer selection and never
restores a legacy fallback.

## Implementation Tasks

These headings capture the required dependency order and evidence boundaries.
`change-propose` may consolidate or split preparation headings when that makes
the work independently shippable; it does not need to copy this plan verbatim.
The activation heading remains one indivisible task.

### 1. Audit the landed cutover gate

- Enumerate every production browser entrypoint, runtime profile, route family,
  application presentation surface, public renderer path, renderer selector,
  CSS entrypoint, build plugin, and global provider.
- Map each application surface to its canonical contract, runtime projection,
  host reference and node, publication adapter, canonical intent dispatch,
  subscribed legacy seam, subscribed Astryx renderer, memory-host fixtures, and
  focused tests.
- Enumerate every remaining `@dpeek/formless-ui`, `lib/ui`, Tailwind,
  `@tailwindcss/vite`, direct `@astryxdesign/*`, deep Astryx source, and legacy
  CSS reference across source, tests, manifests, declarations, scripts, and
  lockfile.
- Classify each reference as dormant legacy deletion, residual contract work,
  pure helper ownership, build integration, or obsolete test evidence.
- Block the change if a material generated, shell, auth, public Site, or tree
  contract is incomplete; do not defer that gap to activation.

### 2. Reconcile residual application-state contracts

- Inspect the remaining top-level route loading, owner-check, unsupported public
  package, schema loading and empty, missing-route, and local-session states.
- Reuse and extend the landed shell, management, auth, generated workspace, or
  tree references and nodes where they already own the facts.
- Add one renderer-neutral application system-state contract and host reference
  only for states without an existing presentation owner.
- Add only missing display-safe data, availability, action, and status intents;
  keep route registry reads, owner checks, replica reads, local-session reset,
  route transitions, and retry behavior in runtime modules.
- Remove direct React-node, class-name, legacy control, and exact-markup inputs
  from those boundaries.
- Add projection and intent evidence for every residual state needed in the
  cutover route matrix.

### 3. Move residual legacy application states behind their owned seams

- Make existing production subscribed legacy renderers consume any reconciled
  facts added to their owned references, and add one subscribed legacy
  application system-state renderer for the new top-level reference.
- Move any remaining direct Tailwind markup for those states into the dormant
  legacy application system-state or other owned legacy renderer modules
  scheduled for post-cutover cleanup.
- Remove duplicated status, warning, fallback, and action composition from
  runtime route modules.
- Keep production renderer selection and legacy global CSS unchanged.
- Browser smoke the changed legacy paths before proceeding.

### 4. Complete Astryx residual states and fixtures

- Implement the residual application states with Astryx components and
  controlled contract input.
- Compose status, failure, confirmation, warning, empty, and loading behavior
  into their owning Astryx renderer or the application system-state renderer
  rather than creating a parallel cutover shell.
- Follow Astryx hierarchy and responsive behavior without recreating legacy
  markup.
- Add package-local data-only fixtures for representative pending, success,
  disabled, empty, missing, blocked, warning, and failure states.
- Publish those fixture snapshots through the reusable memory host and exercise
  the subscribed Astryx entrypoints.
- Verify accessibility names, live status, focus, dialog, retry, and disabled
  behavior where applicable.

### 5. Isolate the dormant legacy deletion set

- Delete the superseded direct generated screen and collection fallback after
  proving every production screen uses the generated workspace runtime.
- Split live projection, operation execution, selection, and other runtime
  helpers out of modules that also own legacy React presentation, including
  generated create, record delete, and state-machine UI.
- Classify non-`legacy-*` generated components and tests as live runtime,
  dormant legacy presentation, or obsolete fallback evidence; rename only when
  needed to make that ownership enforceable.
- Ensure no live runtime, contract, projection, or intent path imports a module
  scheduled for post-cutover cleanup.
- Keep the subscribed legacy application renderers active and preserve current
  behavior while making their eventual deletion mechanical.

### 6. Retire residual legacy Media and SVG coupling

- Prove the landed canonical media field contract and Astryx field renderer
  cover create, record, table, detail, tree, and operation-owned media fields
  while Media reads, asset options, uploads, preview resolution, patch
  planning, and effects remain runtime-owned.
- Keep `@dpeek/formless-media/react` only as part of the dormant legacy
  deletion set. Do not build a transitional media control merely to remove the
  package subpath earlier.
- Move type-only consumers to `@dpeek/formless-media/client` where they are not
  deleted with legacy presentation.
- Update shared icon-catalog validation to use
  `@dpeek/formless-source-svg`, matching existing Site and Astryx ownership.
- Preserve the safe SVG element and attribute policy, keep the Site package
  independent from Astryx, and keep Astryx source-icon presentation internal
  unless the complete application assembly requires a public export.
- Delete the Media React adapter and legacy SVG presentation in an independent
  post-cutover cleanup task once static guards prove no live consumer remains.

### 7. Centralize complete application renderer assembly

- Define one runtime-owned application presentation assembly covering shell,
  management, auth, access, generated workspaces, tree workspaces, and residual
  application system states.
- Compose the full legacy application presentation behind that assembly and use
  it for production during preparation.
- Compose the full Astryx application presentation against the same canonical
  hosts and stable root references for tests and cutover preparation.
- Remove renderer choice from individual route, shell, workspace, field,
  record, collection, tree, dialog, and status modules. Those modules may
  consume a renderer supplied by the assembly but do not select a stack.
- Reject per-surface fallbacks and ensure a missing renderer is a preparation
  failure rather than a reason to cross presentation stacks.
- Keep explicit legacy public Site built-ins separate from the application
  assembly and unchanged until activation.

### 8. Expose the minimal runtime Astryx package surface

- Reconcile the landed exports after the application assembly is defined.
- Preserve the existing contract, contract-host, React host-provider, and
  public Site subpaths; add only one complete application assembly subpath, one
  root application provider subpath, and application CSS as required by the
  runtime.
- Keep individual layout, navigation, dialog, operation, auth, Markdown,
  source-icon, fixture, scenario, and exploratory modules internal unless an
  independent production consumer requires a documented subpath.
- Keep prototype roots, fixture controls, scenario switchers, and exploratory
  layouts unexported.
- Ensure every runtime import uses package subpaths and no consumer deep-imports
  `lib/astryx/src/*`.
- Add export and import-boundary evidence for browser-only, runtime-neutral,
  application, and public-only entrypoint expectations.
- Keep package registry publication, package versioning, release packaging, and
  deployment outside this plan. The runtime may continue consuming Astryx as a
  private workspace package.

### 9. Integrate Astryx StyleX into the root runtime build

- Apply the supported Astryx StyleX Vite integration to the root runtime
  without losing React, Cloudflare, workspace renderer extension, or existing
  build behavior.
- Reconcile plugin order and package dependencies with the package-local Astryx
  Vite setup.
- Verify the application browser development and production builds plus public
  Site Worker SSR and browser hydration emit and load required StyleX output.
- Preserve the public Site client asset boundary and workspace renderer
  extension behavior.
- Add focused runtime Vite configuration and asset-manifest coverage.

### 10. Prepare the Astryx root provider, navigation, and CSS

- Make one runtime-owned application theme controller responsible for
  preference persistence, system-mode resolution, document markers and
  effects, and client bootstrap through `index.html`.
- Have that controller publish the existing renderer-neutral document-theme
  snapshot and stable reference consumed by application presentation. Keep
  persistence, browser APIs, and document mutation outside Astryx.
- Compose the Formless Astryx ThemeProvider exactly once at the application
  root above all shell and no-shell routes, together with the stable
  contract-host provider, toast viewport, and only the other global hosts
  required by the complete application assembly.
- Publish the theme contract node into the shell host. Let the Astryx shell use
  its stable reference for theme controls without wrapping a second theme
  provider; no-shell routes inherit the same root provider.
- Do not introduce an application SSR theme path. There is no current
  application SSR producer; public Site Worker SSR remains Site-owned.
- Add a runtime-owned navigation bridge that performs SPA navigation for
  unmodified same-origin links targeting the current browsing context while
  preserving external links, downloads, new tabs, modified clicks, prevented
  events, and explicitly native or public navigation subtrees.
- Provide package-owned application CSS and retain the existing public Site CSS
  boundary; split them further only if build evidence requires distinct asset
  graphs.
- Verify user-controlled system, light, and dark modes plus fixed light and
  dark policies use the Astryx neutral theme without depending on legacy
  `.light` or `.dark` CSS classes.
- Keep public provider ownership renderer-local: the built-in Astryx page
  renderer owns its Site palette provider, the Astryx public system-state
  renderer wraps only the provider state it needs, and workspace page-renderer
  overrides remain outside both. Browser and Worker roots select renderers and
  CSS but do not blanket-wrap all public output in `SitePageRoute`.
- Replace the live Tailwind utility in the public Turnstile renderer and any
  live public document-shell utility classes with inline or Site-owned
  non-Tailwind styling before activation.
- Keep `src/main.tsx`, `src/public-site-main.tsx`, and production renderer
  selection on their legacy providers and CSS until the atomic task.

### 11. Add cutover conformance and static guards

- Build a route/profile conformance matrix covering dev workbench, product
  instance, installed app admin, instance management, owner auth, account,
  invitation, access management, Site tree authoring, missing routes, local
  session, and public Site isolation.
- Exercise the complete legacy and Astryx application assemblies against the
  same stable host references where dual-renderer behavior still matters.
- Assert atomic publication, unchanged-node identity, scoped notification,
  removal, server snapshots, and hydration across the complete node union.
- Assert semantic intent dispatch, controlled state, accessibility, secret
  exclusion, and display-safe failure behavior rather than exact DOM parity.
- Add production entrypoint and Worker dependency-graph guards for legacy UI,
  legacy renderer, legacy CSS, private Astryx source imports, per-surface
  renderer selection, and Tailwind-dependent markup. Track dormant source as a
  separate cleanup inventory instead of requiring repository-wide zeroes at
  activation.
- Keep the public Site production import-boundary test green during preparation
  and freeze the exact Astryx public modules added by atomic activation.

### 12. Exercise the complete Astryx candidate without activating it

- Render the complete Astryx application assembly through test-only or fixture
  entrypoints using representative contracts from every route/profile matrix
  row.
- Verify nested generated workspaces, tree workspaces, shell navigation,
  management, auth, access, global dialogs, toasts, theme switching, media,
  Markdown, icons, loading, and failures coexist under one provider tree.
- Verify a result-only publication does not rerender unrelated shell,
  management, auth, access, section, or sibling result subtrees.
- Build application client assets and public Site Worker SSR and browser
  hydration assets to expose StyleX, chunking, CSS, global-host, navigation,
  and package-export faults before production selection changes.
- Confirm the candidate imports no dormant legacy renderer or legacy CSS.
- Exercise the public Site page and system-state renderers through focused
  browser, Worker SSR, hydration, provider, and CSS harnesses without changing
  production root imports.
- Keep production application and public Site selection on the legacy
  renderers.

### 13. Freeze the mechanical cutover manifest

- Record the exact application and public selectors, root provider assembly,
  CSS imports, StyleX integration, production dependency-graph guards, and
  current spec wording changed by activation.
- Prove every selected legacy renderer has a complete Astryx counterpart and
  every runtime helper used by that counterpart has an explicit current owner.
- Prove activation edits are limited to application and public Site root
  selection, provider assembly, CSS selection, StyleX integration, graph
  guards, and current renderer spec wording.
- Record a separate cleanup inventory for dormant renderers, tests, packages,
  declarations, scripts, dependencies, and lockfile entries. Do not make that
  inventory an activation transaction.
- Include the exact test updates, replacements, and deletions required by the
  renderer selection change. Defer only tests whose sole subject remains a
  dormant legacy module.
- Ensure the atomic task has no unresolved UX, contract, runtime, security, or
  package-design decision.
- Do not begin activation while any manifest item remains conditional.

### 14. Activate Astryx atomically

- Switch the single application presentation assembly from legacy to Astryx.
- Switch the public Site page and system-state built-ins from the explicit
  legacy implementations to the prepared Astryx implementations while keeping
  workspace page-renderer precedence unchanged.
- Keep the existing stable runtime hosts and root references; switch only the
  subscribed renderer assembly.
- Switch `src/main.tsx` to the Astryx root provider, navigation bridge, global
  hosts, and app CSS.
- Switch `src/public-site-main.tsx` and Worker public document assembly to the
  selected public Astryx renderers and CSS boundary while preserving each
  renderer's local provider ownership.
- Remove the temporary legacy/Astryx selector so only the production Astryx
  assembly remains.
- Update canonical specs to describe Astryx as current presentation behavior
  and delete deferred-switch facts. Defer package-removal and source-deletion
  facts to their cleanup tasks.
- Update or delete selection-coupled tests and land their replacement behavior,
  security, route, accessibility, build, and browser evidence with the
  activation.
- Prove the selected application and public Worker dependency graphs no longer
  reach a legacy renderer, `@dpeek/formless-ui`, legacy global CSS, or
  Tailwind-dependent presentation. Dormant source and dependencies may remain
  until cleanup.
- Run current devstate checks before the task is complete. Do not leave
  production selection in a mixed state.

### 15. Verify the Astryx-only runtime

- Re-run import, dependency, package export, client boundary, build asset,
  contract, route, auth security, SSR, hydration, and current devstate checks.
- Re-run contract-host publication, identity, scoped notification, removal,
  dispatch, server snapshot, and hydration checks against the Astryx-only
  assembly.
- Browser smoke dev workbench and product instance profiles across generated
  list, table, record, create, operation, non-tree workspace, Site tree,
  management, auth, account, invitation, access, loading, empty, missing,
  pending, warning, and failure states.
- Browser smoke representative desktop and narrow layouts, light and dark
  modes, navigation, dialogs, focus return, toasts, media, Markdown, and source
  icons.
- Verify the newly selected Astryx public Site renders and hydrates through its
  public-only client graph with workspace renderer precedence intact.
- Confirm production application and public Worker dependency graphs contain no
  legacy UI package, legacy renderer, legacy CSS, Tailwind-dependent markup,
  mixed renderer, compatibility alias, or deep Astryx import. Repository-wide
  dormant references remain governed by the cleanup inventory.
- Fix Astryx-only defects directly; do not restore a legacy fallback.

## Post-Cutover Cleanup Tasks

Each cleanup task is independently shippable after activation. Astryx remains
the only production selection throughout; none restores a legacy fallback.

### 16. Delete dormant generated legacy presentation

- Delete superseded generated screen, collection, record, create, field,
  operation, dialog, status, and fallback renderer modules.
- Preserve runtime-owned projection, mutation, operation, selection, and
  subscription helpers that Astryx still consumes; move them before deleting a
  mixed-ownership module.
- Delete obsolete exact-markup and legacy-renderer tests while retaining
  current contract, behavior, security, and accessibility coverage.
- Keep Astryx as the only production selection throughout the task.

### 17. Delete dormant application chrome and tree presentation

- Delete legacy shell, navigation, management, auth, account, invitation,
  access, Site tree, and application system-state presentation.
- Remove legacy theme, navigation, toast, dialog, and root-provider composition
  that no production entrypoint consumes.
- Retain renderer-neutral route, auth, access, tree, and intent behavior.

### 18. Delete dormant public Site presentation

- Delete explicit legacy public page and system-state renderers plus obsolete
  provider, hydration, CSS, and exact-DOM evidence.
- Retain workspace page-renderer precedence, public projection, Worker document
  assembly, security behavior, and public-only client boundaries.

### 19. Remove residual legacy Media and SVG presentation

- Delete the unused `@dpeek/formless-media/react` adapter and legacy Media
  controls after confirming no runtime graph consumes them.
- Delete legacy SVG presentation while retaining the shared source-SVG catalog,
  safe element and attribute policy, and Site-to-source-SVG dependency
  direction.

### 20. Remove the legacy UI package

- Delete `lib/ui` after prior cleanup tasks remove every live consumer.
- Remove every `@dpeek/formless-ui` import, dependency, declaration, boundary
  exception, package entry, script reference, and lockfile entry.
- Reconcile current package documentation and package-boundary guards.

### 21. Remove Tailwind and legacy global styling

- Delete remaining dormant Tailwind utility markup and obsolete legacy global
  CSS.
- Remove `@tailwindcss/vite`, `tailwindcss`, Tailwind plugins, runtime Vite
  integration, CSS aliases, declarations, scripts, and lockfile entries.
- Prove application and public Site styling still comes only from their Astryx
  StyleX and Site-owned CSS boundaries.

### 22. Reconcile final source, tests, specs, and documentation

- Delete obsolete compatibility tests, declarations, migration notes, and repo
  maps that describe the removed presentation stack.
- Update canonical package-slice facts only when the corresponding packages and
  dependencies are actually gone.
- Run repository-wide guards for legacy renderers, `lib/ui`,
  `@dpeek/formless-ui`, Tailwind tooling and utilities, compatibility aliases,
  deep Astryx imports, and obsolete future-cutover wording.
- Run current devstate checks and representative browser smoke. Fix cleanup
  defects in Astryx; do not restore a legacy fallback.

## Expected Evidence

The proposed change should collect evidence for:

- a complete surface-to-contract-to-renderer cutover inventory;
- stable contract-host continuity and scoped render evidence across the
  renderer switch;
- zero material contract or Astryx renderer gaps before activation;
- residual application states projected without runtime data entering Astryx;
- no production dependency graph reaching the dormant legacy deletion set;
- Media upload and asset behavior remaining outside presentation;
- safe SVG and Site icon behavior remaining on
  `@dpeek/formless-source-svg` without a reverse Site-to-Astryx dependency;
- a minimal runtime Astryx export map with no prototype, per-component, or
  deep imports;
- application build and public Site Worker SSR and browser hydration StyleX
  and CSS emission behavior;
- explicit application theme persistence, system-mode, document-marker, and
  client-bootstrap behavior with one root theme provider;
- renderer-local public provider ownership for built-in page and system-state
  output without wrapping workspace overrides;
- same-origin SPA navigation with normal external, download, new-tab, and
  modified-click behavior;
- one complete application presentation assembly and no per-surface fallback;
- legacy and Astryx conformance before activation;
- secret-safe auth and access presentation contracts;
- public Site client graph isolation and workspace renderer precedence;
- one atomic production activation task with dormant legacy source unreachable;
- independently shippable post-cutover cleanup evidence;
- cutover-owned test updates or deletions plus replacement evidence for every
  expectation changed by renderer selection;
- zero production-graph `@dpeek/formless-ui`, legacy renderer, legacy CSS,
  Tailwind-dependent, or compatibility references after activation;
- zero repository-wide `@dpeek/formless-ui`, `lib/ui`, legacy renderer,
  Tailwind, or compatibility references after final cleanup;
- current canonical specs with no deferred production-switch facts;
- current `devstate check` evidence; and
- browser smoke across supported runtime profiles and representative responsive
  states.

For package-only UX iteration before activation, follow
`lib/astryx/AGENTS.md`: use Astryx components, prefer component props over
custom styling, use StyleX with Astryx tokens when styling is necessary, do not
start another dev server, and rely on the user for prototype visual feedback.

## Proposal-Time Spec Work

The runtime-cutover proposal should reconcile the smallest applicable
canonical specs:

- `openspec/specs/generated-ui/spec.md` for Astryx as the current application
  subscribed presentation assembly, stable contract-host continuity, root
  provider behavior, complete renderer selection, residual application states,
  and deletion of deferred-switch facts at activation;
- `openspec/specs/site-runtime/spec.md` for Astryx as the current built-in page
  and system-state renderer, workspace page-renderer precedence, public
  provider and CSS integration, isolated asset boundaries, and current renderer
  selection at activation;
- `openspec/specs/package-slices/spec.md` for the runtime Astryx package
  exports, presentation-only boundary, existing Media and source-SVG ownership,
  and Site dependency direction;
- `openspec/specs/instance-auth/spec.md` and the applicable identity spec only
  where their renderer-neutral presentation boundaries still describe a
  deferred or legacy renderer; and
- `openspec/specs/runtime-topology/spec.md` only where the unified Astryx shell
  or root provider changes current route/profile presentation facts.

At activation, delete or rewrite deferred-selection, split-shell, and
future-Astryx statements that are no longer current.

The legacy-presentation-cleanup proposal should update
`openspec/specs/package-slices/spec.md` when it removes the legacy UI package,
Media React adapter, Tailwind dependencies, or other canonical package
boundaries. It should edit other canonical specs only where they still contain
legacy-renderer, Tailwind, or removed-package facts that cease to be current in
that cleanup task.

Neither proposal should edit storage, authority, route, auth, identity, public
action, media, or Site projection semantics merely because the presentation
implementation changed.

## Cutover Completion Gate

The production cutover is complete when:

- every production application surface consumes stable renderer-neutral host
  references and dispatches canonical intents through the host;
- one complete Astryx application assembly renders all supported app, shell,
  management, auth, access, generated workspace, and tree states;
- production entrypoints use the Formless Astryx ThemeProvider, global hosts,
  navigation bridge, CSS, and StyleX build path;
- application theme preference, system-mode resolution, document markers,
  client bootstrap, and document effects remain runtime-owned and behave
  consistently across shell and no-shell routes under one root theme provider;
- renderer activation preserves host identity, reference keys, atomic
  publication, semantic identity reuse, scoped notification, removal, server
  snapshots, and hydration;
- the public Site uses its Astryx page and system-state renderers, renderer-local
  providers, package-owned CSS, public-only client graph, and unchanged
  workspace renderer precedence;
- runtime storage, projection, route policy, auth, sync, operation, and media
  behavior remain outside `lib/astryx`;
- `lib/astryx` exposes only the minimal explicit production subpaths and
  imports no runtime or legacy UI modules;
- production has no renderer flag, per-surface selection, legacy fallback, or
  mixed styling path;
- production application and public Worker dependency graphs do not reach
  `@dpeek/formless-ui`, legacy renderers, legacy global CSS,
  Tailwind-dependent presentation, compatibility aliases, or private Astryx
  source imports;
- dormant legacy source, tests, packages, and dependencies are recorded in the
  cleanup inventory and may still exist outside production graphs;
- canonical specs describe Astryx as current behavior rather than a future
  renderer;
- current devstate checks and required browser smoke pass; and
- activation was a mechanical selection task performed only after all contract
  and renderer work was complete.

## Cleanup Completion Gate

Post-cutover cleanup is complete when:

- dormant legacy generated, application chrome, tree, public Site, Media React,
  and SVG presentation modules are deleted;
- `lib/ui`, `@dpeek/formless-ui`, and their imports, dependencies,
  declarations, boundary exceptions, scripts, and lockfile entries are gone;
- Tailwind tooling, plugins, utility markup, legacy global CSS, aliases,
  declarations, scripts, and lockfile entries are gone;
- obsolete exact-markup, legacy-renderer, compatibility, and migration tests and
  documentation are deleted or reconciled;
- repository-wide guards find no legacy renderer, legacy UI package, Tailwind,
  compatibility alias, deep Astryx import, or obsolete future-cutover wording;
- canonical specs describe the final package and presentation boundaries; and
- current devstate checks and representative browser smoke pass after the last
  cleanup task.

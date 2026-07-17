# Astryx Public Site

## Outcome

Prepare a complete Astryx public Site renderer behind an explicit built-in
presentation seam without changing the production renderer.

The completed change should:

- keep `SitePageTree`, `SitePublicRendererProps`, link rules, public operation
  helpers, route loading, initial-tree hydration, and Worker document behavior
  owned by `@dpeek/formless-site-app`;
- make `@dpeek/formless-astryx` implement the canonical Site renderer contract
  by importing it from `@dpeek/formless-site-app`;
- keep the Site package independent of Astryx and make root browser and Worker
  assembly select the legacy built-in renderer explicitly;
- replace the prototype's structurally equivalent private Site types with the
  canonical Site package types;
- cover frame navigation, page and post layouts, every shipped public block,
  media, source SVG icons, public links, fixed public forms, and generic public
  operation forms;
- preserve current production projection, public action, SSR, hydration,
  metadata, indexing, caching, icon, route, and presentation behavior;
- add canonical projected Site fixtures and focused Astryx layouts;
- isolate renderer-neutral link, theme, form, system-state, and public asset
  seams from the legacy presentation; and
- leave Astryx selection, root StyleX and provider integration, public CSS
  switching, and legacy renderer deletion to `astryx-cutover`.

The unselected Astryx renderer should follow Astryx layout, navigation,
typography, form, feedback, and responsive patterns. It should not reproduce
the old header, sticky footer, card treatments, spacing, or exact markup.

## Preconditions

- `@dpeek/formless-astryx` is an explicit workspace package with import
  boundaries and package-local build support for browser and Worker consumers.
  This change owns the public Site renderer export and the package-local CSS and
  provider surfaces needed to verify the unselected candidate. Root StyleX,
  provider, and public CSS integration remain owned by `astryx-cutover`.
- The application `FormlessUiContractHost` remains the reactive boundary for
  generated admin, shell, management, auth, and access presentation. It does not
  replace the Site-owned public renderer contract or become a dependency of
  `lib/site-app`.
- Canonical generated field and operation-control contracts remain available
  for reuse inside the Astryx package where their semantics fit public forms.
- `@dpeek/formless-site-app` remains the owner of the public Site projection and
  runtime adapter contracts.
- Production remains on the legacy Site renderer throughout this change.

The shell/auth dependency is primarily sequencing. At proposal time,
`change-explore` may reduce it to the completed Astryx package-boundary and
theme work if shell/auth behavior is otherwise unrelated.

## Current Baseline

The baseline observed while writing this plan is:

- `lib/site-app/src/types.ts` already defines the canonical `SitePageTree`,
  frame, block, placement, media, route, warning, and projected public operation
  types.
- `lib/site-app/src/public-renderer.ts` already defines
  `SitePublicRendererProps` from `SitePageTree`, `linkMode`, and `routeBase`.
- browser preview, installed routes, mapped hosts, published Worker SSR, and
  workspace renderer extensions already pass this projection-shaped renderer
  input.
- the default renderer in `lib/site-app/src/react` consumes the canonical tree,
  but mixes Tailwind markup, theme state, block dispatch, public form session
  state, and Site-owned browser submission helpers.
- the legacy renderer covers page, group, hero, feature, section, card grid,
  card, metric grid, metric, markdown, link, image, subscribe form, contact
  form, generic public operation form, post list, project list, post, project,
  profile, header, and footer block behavior.
- the Site package imports shared legacy markdown, source SVG icon, icon, and
  global CSS surfaces from `@dpeek/formless-ui`.
- `lib/astryx/src/components/site.tsx` proves an Astryx public Site direction,
  but it uses duplicate `AstryxProjectedSite*` types and prototype-only route
  and form state.
- the Astryx prototype renders frame navigation and a useful subset of content,
  link, media, and form states, but unsupported shipped block variants fall
  through a prototype fallback.
- the public Site browser entrypoint imports only public Site modules and has an
  import-boundary test excluding generated admin, replica, and rich editor
  modules.
- Worker SSR owns the HTTP response, successful document shell, metadata,
  initial-tree script, client assets, runtime hints, not-found documents, error
  documents, and caching.
- the public browser entrypoint and Worker adapter currently receive only an
  optional workspace renderer; the Site package resolves its legacy renderer as
  the fallback.
- current public theme persistence and Worker boot markup are Site-specific and
  separate from the Formless Astryx theme provider.

Future exploration must treat these as observations, not guaranteed facts.

## Package Direction

The dependency direction is deliberate:

- `@dpeek/formless-astryx` may import public contracts and helpers from
  `@dpeek/formless-site-app`.
- `@dpeek/formless-site-app` must not import `@dpeek/formless-astryx`.
- root browser and Worker assembly import the legacy Site renderer explicitly
  and pass it to the Site runtime adapter during this change;
- `astryx-cutover` later replaces only that root assembly selection with the
  Astryx renderer.

This avoids a package cycle while keeping Site projection and behavior in the
Site package. Do not solve the cycle with deep imports, runtime registration,
global mutable renderer state, compatibility re-exports, or a duplicate Site
contract in Astryx.

The workspace `site.publicRenderer` extension remains a page-renderer override.
It should take precedence over the explicitly selected legacy built-in renderer
now and the Astryx built-in renderer after cutover without moving workspace code
into either package.

## Scope

### In scope

- Canonical Site public page renderer and built-in presentation assembly
  contracts owned by `lib/site-app`.
- Explicit legacy built-in renderer selection for source preview, installed
  routes, mapped hosts, published profiles, browser hydration, and Worker SSR.
- Canonical projected Site fixtures imported into `lib/astryx` through public
  Site package exports.
- Astryx page shell, responsive header and footer navigation, theme control,
  page flow, and post detail layout.
- Every block type currently rendered by the canonical default Site renderer.
- Site-aware internal and external links, route-base behavior, route selection,
  source SVG icons, core media delivery facts, missing-media presentation,
  content lists, content summaries, and primary images.
- Subscribe, contact, and generic public operation form session contracts,
  unavailable, idle, submitting, success, failure, validation, and Turnstile
  states.
- Public Site theme persistence, SSR-safe initial mode, browser hydration, and
  a package-owned Astryx public CSS boundary ready for later root integration.
- Browser and Worker renderer conformance, candidate import boundaries, focused
  renderer tests, SSR tests, hydration tests, and fixture viewport coverage.
- Renderer-neutral browser and Worker loading, not-found, and failure contracts
  with legacy implementations kept selected in production.
- A precise `astryx-cutover` handoff for the built-in renderer import, root
  StyleX and provider integration, public CSS entrypoint, system-state
  presentation, and legacy deletion.
- Canonical spec changes required to settle renderer ownership and explicit
  assembly while keeping the legacy renderer current in production.

### Out of scope

- Site admin tree authoring or `src/app/generated/tree.tsx`.
- Changes to flat Site records, block placement storage, queries, public tree
  projection, route resolution, app install identity, or core media storage.
- New block types, new stored style fields, a general page-builder design
  system, or arbitrary per-block presentation configuration.
- Changes to workspace renderer extension entrypoint discovery or trusted-code
  policy except where required to compose the built-in renderer explicitly.
- Selecting Astryx as the production built-in renderer.
- Root Astryx StyleX compilation, provider assembly, or public CSS activation.
- Deleting legacy Site renderer files, Tailwind markup, legacy presentation
  tests, or Site package `@dpeek/formless-ui` dependencies.
- Moving metadata, sitemap, robots, favicon, ICO, cache, `HEAD`, HTTP response,
  runtime hint, client asset, initial-tree, or error-document ownership into
  Astryx.
- Moving public operation policy, target resolution, request envelope
  construction, validation, coercion, idempotency, Turnstile loading, or
  submission execution into Astryx.
- Exposing raw records, schemas, app installs, browser replicas, provider
  credentials, Turnstile secrets, submitted private values, created records,
  or notification delivery state to the renderer.
- Redesigning the selected legacy renderer, its Tailwind classes, DOM structure,
  sticky footer behavior, or legacy theme variables.
- Adding an Astryx production fallback, renderer flag, or dual-renderer runtime
  mode before cutover.

## Contract Direction

### Canonical public page input

`SitePublicRendererProps` in `lib/site-app` remains the canonical page renderer
input. It should carry only:

- the projected `SitePageTree`;
- the public link mode; and
- the installed or mounted route base when needed.

`SitePageTree` remains responsible for projected Site settings, frame roots,
page or post content, ordered placements, query output, public media facts,
public operation facts, route facts, and display-safe warnings.

This successful-page boundary deliberately remains component-shaped rather
than becoming a `FormlessUiContractHost` node. Public browser and Worker SSR
already share `SitePublicRendererProps`, initial-tree hydration, and workspace
renderer precedence owned by `lib/site-app`. Do not import the application
contract host into `lib/site-app`, wrap `SitePageTree` in an admin workspace
reference, or duplicate the public renderer input in `lib/astryx`.

Do not add raw storage records, schema objects, app targets, fetch clients,
request objects, browser location objects, private challenge facts, or runtime
route state. Add a contract fact only when both renderers need it and it cannot
be derived safely from the existing public projection and route facts.

The prototype-only `currentPath` is not automatically a canonical fact. Active
navigation can currently derive from `tree.route`, resolved public hrefs, and
`routeBase`.

### Built-in presentation assembly

The current optional-renderer fallback hides the dependency direction inside
`lib/site-app`. Replace it with explicit assembly:

- Site browser and Worker adapters receive a built-in renderer component;
- an optional workspace renderer overrides that built-in component;
- source preview, installed, mapped-host, and published paths use the same
  selection rule;
- root assembly passes the legacy implementation throughout this change; and
- Site adapter selection modules do not import either renderer implementation.

Define a separate renderer-neutral built-in system-state contract in
`lib/site-app` for browser loading, not-found, and failure states plus
Worker-owned not-found and error documents. Keep legacy system-state
presentation selected in this change. Keep the workspace extension scoped to
successful page rendering as required by the current Site runtime spec.

Do not widen `SitePublicRendererProps` with `ReactNode` slots or let a workspace
renderer return a complete document or `Response`.

### Renderer-neutral Site behavior

Keep presentation-independent behavior in `lib/site-app` and make both
renderers consume it during the migration:

- link-mode and route-base href resolution;
- route-aware link selection;
- placement ordering and Site-specific slot selection only where those are
  semantic Site rules rather than layout choices;
- safe source SVG handling requirements;
- public theme persistence and document bootstrap facts;
- public form draft, validation, coercion, submission, idempotency, challenge,
  and display-safe response behavior; and
- initial-tree, route loading, preview refresh, and hydration behavior.

Do not extract visual block grouping, spacing, card appearance, header layout,
footer layout, or responsive behavior into a shared foundation just to make the
renderers look alike.

### Public form sessions

Public form renderer contracts should expose display-safe controlled state and
intents while Site-owned foundations retain execution.

Public form sessions may use Site-owned local subscription or reducer mechanics
when needed, but they remain nested Site renderer state. Do not extend the
application contract-host reference union merely to move public form drafts
between the Site package and its renderer.

The form presentation facts may include:

- block identity, form kind, heading, body, labels, and submit label;
- unavailable, ready, submitting, success, and failed states;
- controlled draft values and display-safe field errors;
- projected public field labels, required state, scalar control, format,
  suggestions, and enum options;
- public Turnstile site key, readiness, reset signal, and token-change intent;
- submit availability and submit intent; and
- configured success copy or a display-safe failure message.

The foundation retains idempotency keys, `FormData` extraction where still
needed at a native boundary, scalar coercion, shared schema validation, request
envelopes, JSON calls, response validation, challenge reset behavior, and raw
errors.

The Astryx generic public operation form may adapt these Site-owned facts into
`FormlessUiField` inside `lib/astryx`. `lib/site-app` must not import the Astryx
field contract to perform that adaptation.

### Theme, SSR, and public assets

The public renderer must work in both React browser and Worker SSR builds.

- Worker rendering starts from a deterministic theme mode.
- Browser hydration must not produce structurally different output before the
  stored or system mode is applied.
- Site-specific public theme storage and boot behavior stay aligned with the
  Astryx provider used by the public renderer.
- projected Site accent and background colors may influence presentation only
  through a documented, contrast-safe mapping; do not introduce stored Astryx
  token names.
- the Astryx package exposes the public CSS boundary required by the candidate,
  but the production public entrypoint keeps importing legacy Formless UI global
  CSS throughout this change;
- root StyleX integration and the public CSS entrypoint switch remain atomic
  `astryx-cutover` work;
- Worker document asset injection remains responsible for emitted stylesheet
  links and browser scripts.
- the public browser graph must not pull in generated admin, shell/auth,
  replica, rich markdown editor, or private runtime modules.

## Migration Rules

- Keep the legacy page and system-state renderers selected in production for
  the entire change.
- Complete and export the unselected Astryx renderer without importing it from
  production root browser or Worker assembly.
- Leave a mechanical `astryx-cutover` manifest: replace the injected built-in
  renderers, integrate root StyleX and the public provider, update the public CSS
  entrypoint, and delete the legacy implementation and dependencies there.
- Do not make individual block types switchable in production.
- Do not add a renderer feature flag, environment toggle, compatibility alias,
  or long-lived dual-theme layer.
- Preserve selected legacy presentation and Site runtime behavior. Change
  legacy markup tests only where the renderer-neutral seam makes them obsolete;
  broad legacy presentation deletion belongs to `astryx-cutover`.
- Keep behavior tests for projection input, link resolution, public form
  safety, form state, SSR, hydration, route bases, extension precedence, asset
  boundaries, and public-only data.
- Keep the application contract host out of the public Site client and Worker
  renderer graphs.
- When Astryx component behavior is sufficient, use it directly. Add StyleX
  only for Site-specific composition that cannot be expressed by component
  props, using Astryx tokens.

## Implementation Tasks

Each numbered section is intended to become one task section in Git-backed
change metadata. `change-explore` and `change-propose` may merge or split a
section when current code makes the boundary materially different.

### 1. Reconcile the canonical Site renderer contract and dependency direction

- Confirm `SitePageTree`, `SitePublicRendererProps`, `SitePageLinkMode`, and
  route-base facts still cover preview, installed, mapped-host, published, and
  workspace renderer paths.
- Formalize any missing renderer-neutral public facts in `lib/site-app`, not
  `lib/astryx` or `src`.
- Record and guard the dependency rule that Astryx may import Site public
  exports while Site must not import Astryx.
- Guard that `lib/site-app` and its public client graph do not import
  `@dpeek/formless-astryx/contract-host` or its React provider.
- Keep the successful page renderer extension component-shaped and
  projection-only.
- Add focused type and boundary coverage for canonical imports and forbidden
  package cycles.

### 2. Put the legacy built-in renderer behind explicit presentation assembly

- Make the current legacy page renderer an explicit implementation of the
  canonical Site renderer component contract.
- Change browser and Worker Site adapter construction to receive an explicit
  built-in renderer while retaining an optional workspace override.
- Make selection precedence `workspace renderer` then `built-in renderer`
  without a package-global registry or hidden legacy import.
- Define renderer-neutral system-state input and built-in selection for browser
  loading, not-found, and failure states plus Worker not-found and error
  documents without widening the workspace renderer extension.
- Make legacy page and system-state renderers explicit implementations of their
  canonical contracts and keep all production assembly pointed at them.
- Add focused coverage for source preview, installed, mapped-host, published,
  browser, Worker, system-state, and workspace override selection.

### 3. Replace duplicate Astryx Site projection types with canonical Site types

- Add a public package dependency from `@dpeek/formless-astryx` to
  `@dpeek/formless-site-app` if it is not already present.
- Replace `AstryxProjectedSite*` duplicates with imports from the Site package
  public root or React subpath.
- Keep fixture-only route controls and transient scenario state separate from
  the canonical renderer props.
- Delete structurally equivalent duplicate tree, block, placement, media,
  route, warning, and public operation type declarations.
- Add compile-time coverage that the prototype renderer and fixtures satisfy
  the exact canonical public renderer contract.

### 4. Establish the canonical projected Site fixture foundation

- Convert the current Astryx public Site fixture into data that satisfies
  `SitePageTree` and `SitePublicRendererProps` directly.
- Add fixture builders for settings, frame roots, blocks, placements, query
  items, media, warnings, routes, and public operations without importing raw
  records or projection code.
- Keep route mode and route base as renderer props rather than embedding them
  into the tree.
- Use package-local minimal state only for renderer intents and viewport
  scenario selection.
- Remove duplicate ids, proof-oriented copy, and prototype-only contract facts.

### 5. Implement the Astryx public page shell, frame, and navigation

- Implement an unexported Astryx renderer for the canonical page props and use
  Astryx layout, top navigation, mobile navigation, typography, stack, link,
  icon, and theme controls.
- Implement an unselected Astryx system-state renderer for browser loading,
  not-found, and failure facts plus Worker not-found and error facts without
  widening the workspace successful-page extension.
- Render optional header and footer frame roots from ordered projected
  placements.
- Derive internal hrefs, external behavior, and active header state through
  Site package link helpers and canonical route facts.
- Support absent or partial frame roots without blocking page content.
- Add focused renderer coverage for desktop and mobile navigation, primary and
  secondary groups, footer sections, social links, active state, external
  targets, route bases, and every public system state.

### 6. Implement Astryx page flow and structural content blocks

- Implement page, group, hero, feature, section, card grid, card, metric grid,
  metric, and markdown block presentation from canonical nodes.
- Respect semantic placement slots such as feature media and actions without
  copying legacy grids or spacing.
- Render block labels, plain text, markdown, source icons, colors, alignment,
  and ordered default children only when projected.
- Ignore unknown block types safely without inventing public content or
  exposing warnings as visitor-facing proof UI.
- Add focused coverage for nesting, ordering, optional content, semantic slots,
  unknown blocks, and accessible heading structure.

### 7. Add structural content layouts and fixtures

- Add canonical fixture layouts for page flow, group nesting, hero with and
  without media, feature media on both sides, feature actions, section nesting,
  card grids, cards with and without icons, metric grids, metrics, and markdown.
- Include empty, minimal, dense, deeply nested, and unknown-block cases within
  current projection limits.
- Use realistic content labels without reproducing seed-record content or
  legacy DOM expectations.
- Keep fixtures free of stored records, schema parsing, projections, runtime
  queries, and fake proof badges.

### 8. Implement Astryx links, source icons, and public media

- Implement inline, action, navigation, footer, and social link presentation
  through Site-owned href resolution and external target rules.
- Render stored source SVG icons through the canonical safe Astryx source-icon
  surface and preserve fallback behavior for missing or unsafe source.
- Render projected core media hrefs, dimensions, aspect ratios, labels, and
  missing-media states without using manual block hrefs as image sources.
- Support primary image presentation for summaries and post detail without
  repeating the image in normal body flow.
- Use Astryx primitives and token-backed StyleX composition rather than legacy
  image and link Tailwind classes.

### 9. Add link, icon, and media layouts and fixtures

- Add canonical fixtures for preview, authoring, published, and installed link
  modes; route bases; selected and unselected internal links; fragments;
  external links; and missing hrefs.
- Add valid, missing, invalid, and unsafe source SVG cases using public-safe
  fixture values.
- Add delivered media, missing media, explicit dimensions, default aspect
  ratio, feature media, summary primary media, and post-detail primary media
  cases.
- Keep delivery hrefs synthetic and exclude media clients, asset records,
  provider URLs, upload state, and source storage records.

### 10. Implement Astryx content lists, summaries, and post detail routes

- Implement post list and project list blocks from projected query items.
- Implement post, project, and profile summaries with the route, date, body,
  link, and primary media facts already projected for each variant.
- Implement post detail layout from `tree.route.kind === "post"`, separating
  summary-only body copy from detail placements as current Site semantics
  require.
- Render empty list states from current public behavior without recreating old
  cards.
- Add focused renderer coverage for ordering, empty queries, dates, route-aware
  links, summary media, nested markdown links, and post detail body flow.

### 11. Add route, list, and content-detail layouts and fixtures

- Add canonical fixtures for a normal page, home page, post index, post detail,
  project index, populated and empty lists, summaries with and without media,
  and installed route bases.
- Exercise current route kinds and query shapes without inventing project
  detail routing or new content variants.
- Include nested links and body placements needed to verify interactive summary
  cards remain accessible.
- Keep fixtures independent of router objects, browser locations, records,
  query execution, and projection implementations.

### 12. Align the public Site theme, SSR bootstrap, and Astryx provider

- Formalize the Site-owned public theme mode, storage key, deterministic SSR
  default, browser bootstrap, and document marker behavior needed by any
  renderer.
- Adapt the Astryx public renderer wrapper to consume those facts without
  moving Worker document generation into Astryx.
- Keep the selected legacy theme controller, Worker bootstrap, document marker,
  and public CSS entrypoint behavior current throughout this change.
- Map projected Site accent and background colors through contrast-safe public
  presentation behavior only where Astryx supports it cleanly.
- Keep server output and the first hydrated tree structurally stable while
  stored or system preference resolves.
- Add focused coverage for light, dark, stored, system, storage-unavailable,
  custom-color, invalid-color, SSR, and hydration states.

### 13. Project renderer-neutral public form sessions in the Site package

- Define Site-owned presentation contracts and foundations for subscribe,
  contact, and generic public operation form state.
- Project controlled draft values, field errors, availability, pending state,
  public challenge facts, submit readiness, configured labels, success copy,
  display-safe failures, and renderer intents.
- Keep idempotency, coercion, validation, request construction, response
  validation, fetch execution, Turnstile integration, and reset behavior in
  Site-owned modules.
- Preserve the generic form's text, long text, boolean, date, number, enum,
  email, phone, suggestions, and free-text suggestion semantics.
- Add focused foundation tests for unavailable, ready, invalid, submitting,
  success, failed, retry, and challenge-reset behavior plus private-data
  exclusion.

### 14. Move legacy public forms behind the canonical form-session seam

- Refactor legacy subscribe, contact, and generic public operation form
  components to consume the canonical Site form sessions and dispatch their
  intents.
- Remove duplicated component-local validation, request, response, status, and
  challenge-reset orchestration now owned by the foundation.
- Keep current production output selected and preserve public operation request
  behavior during this task.
- Replace tests coupled to legacy form classes or markup with session, intent,
  browser request, validation, public-safe failure, and visible outcome
  coverage.
- Do not expose submitted values, created records, provider state, notification
  recipients, or private challenge facts through the session contract.

### 15. Implement Astryx subscribe and contact forms

- Implement Astryx subscribe and contact form renderers from canonical Site
  form sessions.
- Use Astryx form fields, buttons, cards or layout surfaces, status feedback,
  and accessibility behavior without copying legacy form structure.
- Compose the Site-owned Turnstile integration as an opaque challenge adapter
  and keep its public site key and token intent controlled by the session.
- Render unavailable, ready, submitting, success, failed, and retry states with
  only projected labels and display-safe messages.
- Add focused renderer coverage for labels, required fields, disabled state,
  challenge state, submit intent, configured success copy, errors, and retry.

### 16. Implement the Astryx generic public operation form

- Adapt canonical Site generic form session fields into `FormlessUiField`
  inside `lib/astryx` where the public scalar semantics match.
- Render text, long text, boolean, date, number, enum, email, phone, native
  suggestions, required state, controlled draft values, and field errors.
- Keep suggestions open to free text and preserve finite number, ISO date,
  boolean, and enum coercion in the Site foundation.
- Compose Astryx field, action, status, and challenge surfaces without importing
  operation executors, schemas, records, media clients, or runtime routes.
- Add focused renderer coverage for every projected control, invalid drafts,
  submit readiness, pending, success, failure, retry, and unavailable states.

### 17. Add canonical public form layouts and fixtures

- Add canonical Site fixtures and form-session scenarios for subscribe,
  contact, and generic public operation blocks.
- Cover no operation, no public site key, ready, invalid, submitting, success,
  configured success label, display-safe failure, retry, and challenge reset.
- Cover every generic scalar control, formats, suggestions, enum options,
  optional and required fields, and multiple forms on one page.
- Use minimal local state to simulate canonical intents without real fetches,
  Turnstile, idempotency material, submitted private data, or created records.
- Remove prototype-only form state types once canonical fixture sessions replace
  them.

### 18. Publish and verify the complete unselected Astryx renderer

- Export the production Astryx Site renderer through an explicit public
  package subpath that imports the canonical Site contract.
- Verify it can be supplied mechanically as the built-in page and system-state
  renderer in focused browser, Worker SSR, and hydration harnesses without
  changing root production assembly.
- Verify source preview, installed routes, mapped hosts, published profiles,
  workspace renderer precedence, SSR markup, initial-tree hydration, public
  route refresh, and browser interactivity use the same component contracts.
- Expose the package-owned public CSS and provider subpaths required by the
  candidate without importing them from the production public entrypoint or
  integrating root StyleX.
- Add a candidate import-boundary test that permits only required Astryx public
  renderer modules and excludes generated admin, contract host, shell/auth,
  replica, gateway, rich editor, and private runtime code.
- Record the exact root renderer imports and assignments, StyleX integration,
  provider and CSS entrypoints, legacy modules, tests, and dependency entries
  that `astryx-cutover` will switch or delete.
- Keep root browser and Worker assembly explicitly selecting the legacy page
  and system-state renderers when this task completes.

## Expected Evidence

The proposed change should collect evidence for:

- exact canonical renderer contract and package dependency boundaries;
- no `lib/site-app` import of `@dpeek/formless-astryx`;
- no duplicate Site projection contract in `lib/astryx`;
- legacy and Astryx renderer conformance before activation;
- all shipped block variants and route kinds;
- internal, external, active, preview, published, and installed links;
- safe source SVG and public media behavior;
- subscribe, contact, and generic public operation form states and request
  behavior;
- public-only error and success output with no private data;
- deterministic Worker SSR and clean browser hydration;
- workspace renderer precedence over the built-in renderer;
- explicit legacy page and system-state selection in root browser and Worker
  assembly;
- package-owned candidate CSS and provider boundaries without production root
  activation;
- production public client and candidate import-boundary exclusion of admin and
  private modules;
- no application contract-host dependency in `lib/site-app`, the public client,
  or Worker renderer graph;
- no production block-level renderer switching;
- no production import or selection of the Astryx renderer;
- a complete mechanical handoff for `astryx-cutover`, including legacy
  Tailwind/Formless UI dependency removal; and
- current devstate and browser smoke results.

## Proposal-Time Spec Work

`change-propose` should reconcile at least:

- `openspec/specs/site-runtime/spec.md` for canonical renderer ownership,
  explicit built-in and system-state assembly, the legacy renderer as the
  current built-in, public form sessions, theme/SSR behavior, and client asset
  ownership;
- `openspec/specs/generated-ui/spec.md` to replace the statement that public
  Site renderer contracts remain future work, record the complete unselected
  Astryx implementation, keep activation deferred to `astryx-cutover`, and keep
  Site admin authoring separate; and
- `openspec/specs/package-slices/spec.md` if the Site-to-Astryx dependency
  direction or public package exports require a canonical package rule.

Do not edit unrelated public action, media, route topology, archive, or custom
domain requirements unless current implementation reveals a real contract
change.

## Completion Gate

The change is complete when:

- the canonical public renderer contract still lives in `lib/site-app`;
- Astryx imports and implements that contract without a reverse package
  dependency;
- root browser and Worker assembly explicitly select the legacy page and
  system-state renderers;
- workspace renderers still override the built-in renderer through the same
  successful-page contract;
- every shipped public block, frame, route, media, link, and form state is
  supported by the Astryx renderer;
- preview, installed, mapped-host, and published rendering share the same
  component contract;
- SSR, hydration, theme, client assets, metadata, indexing, icons, cache, and
  public operation behavior remain current;
- the public browser import graph remains public-only;
- `lib/site-app` and the public renderer graph do not import the application
  contract host;
- the production public entrypoint does not import or select the Astryx
  renderer, provider, or CSS;
- legacy public Site presentation and its Tailwind/Formless UI dependencies
  remain selected and current; and
- `astryx-cutover` has an exact mechanical renderer, provider, StyleX, CSS,
  system-state, test, and dependency switch manifest with no missing renderer
  contract or Astryx layout work.

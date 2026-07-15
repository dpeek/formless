# Astryx Shell And Auth

## Outcome

Prepare all product shell, instance-management, auth-origin, and access
management presentation for an atomic Astryx cutover.

The completed change should:

- replace the narrow instance rail plus separate generated app sidebar contract
  with one unified navigation model;
- project app switching, app screens, root-record navigation, management links,
  app settings, session affordances, and display-safe status before rendering;
- project instance and workspace management state, dialogs, controls, and
  feedback before rendering;
- project owner setup, sign-in, account completion, signup, invitation
  acceptance, continuation, and failure states without exposing auth secrets;
- project dedicated access-management summaries, invitation authoring, grants,
  and revocation controls without exposing identity storage internals;
- make production legacy renderers consume those contracts;
- implement package-local Astryx renderers and data-only fixtures; and
- leave production renderer, theme, and global-style selection unchanged.

This change follows the intended Astryx UX. It does not recreate the old rail,
sidebar, auth cards, forms, or management layout one-for-one.

## Preconditions

- `astryx-generated-workspace` is complete and landed on `main`.
- Generated create, field, operation, table, list, record-result, and workspace
  contracts remain canonical and available for composition.
- Runtime route policy, owner/account sessions, WebAuthn ceremonies, identity
  authority, app install reads, and workspace gateway behavior remain outside
  `lib/astryx`.
- Production remains on legacy renderers during this change.

The generated-workspace dependency matters because instance settings currently
compose generated app-install and route collections through runtime-owned React
components. This change should consume their canonical workspace contracts
rather than introduce another management-only collection model.

## Current Baseline

The baseline observed while writing this plan is:

- `ActiveAppSurface` renders a generated app sidebar and header while reading
  screen, root-record, count, sync, and reset behavior during React rendering.
- `InstanceRail` independently renders instance settings, access, installed app
  admin, and public Site links from current path and install facts.
- `InstanceShellRoute` owns install loading, workspace gateway polling and
  execution, access-summary loading, invitation mutations, and route selection.
- `InstanceShellRouteView` mixes loading and failure frames, workspace push,
  app and route generated collections, install dialogs, access management, and
  legacy layout.
- generic operation-control contracts already cover compact status, progress,
  feedback, and destructive confirmation and should be composed rather than
  redefined.
- owner setup, owner login, account orchestration, signup, and invitation
  acceptance already use route-state unions and separate route-session helpers,
  but their view functions still receive runtime-shaped state and browser form
  events.
- owner setup route state may contain the setup token, account state may contain
  challenge ids, and workspace state may contain the CSRF token; none belongs
  in a renderer contract.
- access management already reads a purpose-built display-safe identity summary
  and grant options, but its React view still owns invitation draft state,
  option selection, revocation state, and legacy controls.
- `lib/astryx/src/components/shell.tsx` and `side-nav.tsx` prove the desired
  unified shell direction with hard-coded product data.
- `lib/astryx/src/components/auth.tsx` proves useful auth layouts but uses a
  private scenario model and includes prototype behavior that is not necessarily
  shipped runtime behavior.
- no canonical shell, management, auth, or access presentation contracts exist
  in `lib/astryx`.

Future exploration must treat these as observations, not guaranteed facts.

## Scope

### In scope

- Unified app and instance shell/navigation contracts.
- Workbench, installed app, mapped app, and instance profile presentation facts
  needed to show or omit shell chrome.
- App switching, installed admin and public links, screen links, root-record
  navigation, management links, app settings, sync/reset status, user/account
  actions, and theme affordance placement.
- Instance overview, app install management composition, route management
  composition, install dialog, local workspace push, compact progress and
  feedback, loading, failure, and unavailable states.
- Auth-origin presentation for owner setup and login, account completion gates,
  signup, email verification, passkey creation, invitation acceptance,
  continuation, destination choice when runtime supplies it, and display-safe
  failures.
- Dedicated access-management presentation for people, roles, registrations,
  memberships, organizations, groups, invitations, grant choices, invitation
  creation, and pending invitation revocation.
- Legacy contract renderers, package-local Astryx renderers, fixtures, focused
  tests, import boundaries, and canonical spec changes.

### Out of scope

- Changing runtime profiles, route access policy, redirect validation,
  cross-domain handoff rules, or auth-origin selection.
- WebAuthn option generation, browser credential creation, assertion or
  registration verification, challenge storage, session issuance, or logout
  semantics.
- Moving app install reads, package resolution, query/count reads, workspace
  gateway calls, identity reads, email delivery, or mutations into Astryx.
- Exposing setup tokens, raw invitation tokens, token hashes, challenge ids,
  credential material, session ids, CSRF tokens, handoff grant secrets,
  provider credentials, raw filesystem paths, admin bearer material, or private
  app profile values.
- Generic identity-control-plane record editing or first-pass destructive
  identity actions beyond pending invitation revocation.
- A standalone deployment, provider, workspace sync, schema editor, archive, or
  generated identity management destination.
- Production Astryx selection, theme-provider activation, global CSS changes,
  Tailwind removal, or deletion of `@dpeek/formless-ui`.
- Public Site rendering, Site tree authoring, or generated collection contract
  redesign.
- Compatibility shims or preservation of legacy markup and interaction tests.

## Contract Direction

### Unified shell and navigation

The shell contract should carry renderer-facing facts such as:

- stable shell, active app, and active destination identities;
- runtime profile presentation and whether shell chrome is available;
- instance label and display-safe app identity;
- installed app admin and public destinations with labels, hrefs, semantic
  icons, descriptions, selected state, and availability;
- active app screen links and selected state;
- projected root-record navigation groups, items, counts, create controls, and
  selection intents;
- instance settings, access management, app settings, and other allowed
  management destinations;
- display-safe sync and reset controls composed from canonical action,
  confirmation, and status contracts;
- display-safe session identity and account, logout, and user-menu actions; and
- accessible labels and responsive navigation facts.

Runtime retains install resolution, route matching, screen model selection,
root-record queries, counts, selected record state, sync reads, source reset
effects, session reads, logout execution, and navigation target policy.

The active route outlet is renderer composition, not part of the data contract.
Do not put `ReactNode`, route components, or route loaders in the canonical
shell contract. Legacy and Astryx shell hosts may receive the already-selected
content separately from the renderer-neutral shell data.

### Instance and workspace management

The management contract should carry only presentation state:

- loading, ready, failed, unavailable, and unauthorized states;
- instance overview heading and allowed section hierarchy;
- canonical generated workspace contracts for app installs and routes;
- install dialog open state, package choices, controlled install id and label
  fields, validation, pending state, and intents;
- local workspace push availability and canonical operation control, status,
  progress, authorization prompt, and feedback contracts;
- display-safe auto-save status only where current desired behavior still
  exposes it; and
- app-local sync/reset controls where supported.

Runtime retains app install and package reads, package capability policy, route
records, workspace gateway metadata, CSRF tokens, polling, authorization URLs,
operation input construction, install mutations, operation execution, sync,
and provider redaction.

Before projecting legacy management code, delete unreachable or superseded
branches rather than defining contracts for behavior canonical specs no longer
require.

### Auth-origin surfaces

Use a small discriminated auth presentation contract rather than exposing route
state unions directly or inventing a generic workflow engine.

The contract may compose:

- shared auth frame, brand, heading, message, severity, facts, and action
  contracts;
- controlled text, email, verification-code, and operation-input fields;
- passkey action availability and pending state;
- policy links and acceptance state;
- display-safe target, invitation, principal, session-expiry, and continuation
  facts; and
- explicit intents for draft changes, submit, retry, passkey start, logout, and
  runtime-approved continuation.

Reuse `FormlessUiField` or `FormlessUiOperationInputField` when their semantics
fit. Add narrow auth-specific facts only for behavior such as verification-code
entry or a passkey ceremony. Do not create a parallel generic field system.

Runtime retains setup and invitation tokens, challenge ids, passkey browser
calls, credential responses, form input coercion, account gate evaluation,
operation invocation, session state, redirect validation, handoff, and final
navigation. Successful views follow only runtime-approved continuation targets.

Auth views are transient. Do not turn the Astryx prototype into a durable
logged-in account dashboard when runtime behavior requires continuation.

### Access management

Project purpose-built identity summaries into renderer-neutral presentation
facts:

- people with display name, primary email, status, and role labels;
- invitations with display-safe target, status, scope, expiry, inviter, and
  revocation availability;
- display-safe organizations, groups, memberships, registrations, and counts
  required by the surface;
- controlled invitation draft fields;
- target-surface, app-install, organization, role, and membership options with
  selected state and disabled reasons;
- submission, success, failure, pending, empty, unauthorized, and loading
  states; and
- canonical create and destructive-confirmation intents.

Runtime retains identity summary types, active authority checks, allowed grant
selection, option keys, invitation request construction, token creation and
delivery, revocation, refresh, and error redaction.

Do not pass raw identity records, grant authority internals, storage ids not
needed for intent correlation, or private invitation state to Astryx.

## Migration Rules

- Update canonical behavior before implementing the unified shell because the
  current Generated UI spec still requires the legacy narrow rail.
- Formalise each presentation contract before moving its production view behind
  a legacy seam.
- Keep async sessions, effects, route policy, browser credential calls, and
  navigation in runtime foundation modules.
- Make legacy renderers consume only canonical contracts and dispatch canonical
  intents.
- Keep direct `@dpeek/formless-ui` imports for migrated surfaces inside the
  owned legacy seam modules identified by the change. Foundation, projection,
  runtime, and canonical contract modules contain none.
- Implement package-local Astryx renderers without production exports or
  activation.
- Replace hard-coded Astryx shell and auth prototype data with canonical
  contract fixtures.
- Follow Astryx navigation, form, dialog, status, responsive, and accessibility
  guidance. Do not reproduce legacy layout where Astryx has a clearer pattern.
- Do not invent labels, actions, destinations, grant choices, decline behavior,
  or account states absent from runtime facts or explicit desired behavior.
- Replace obsolete legacy structure tests with projection, intent, security,
  and user-visible behavior coverage.
- Do not introduce meaningful Tailwind and Astryx coexistence in production.
- Do not select the Astryx renderers in this change.

## Implementation Tasks

Each numbered heading is intended to become one ready task section in future
change metadata. Current-state exploration may merge, split, remove, or rename
a section.

### 1. Project the unified shell and navigation contract

- Define renderer-neutral shell, destination, app switcher, navigation section,
  navigation item, session action, settings action, and shell intent contracts.
- Add a runtime shell foundation that resolves profile chrome, installs,
  launch links, selected paths, app screens, management links, root-record
  groups, counts, session facts, and app settings before rendering.
- Compose existing create, action, confirmation, and status contracts.
- Keep route outlets and React components outside the contract.
- Add focused projection and intent coverage for workbench, instance, installed
  app, mapped app, public Site destination, anonymous, and no-shell states.

### 2. Move production app and instance navigation behind the legacy shell seam

- Add a dedicated legacy shell/navigation renderer that consumes only the
  canonical shell contract plus separately selected route content.
- Route current app sidebar, instance rail, root-record navigation, app
  settings, sync status, reset confirmation, and session actions through the
  shell foundation and legacy renderer.
- Keep package resolution, path selection, record reads, counts, sync, reset,
  session, logout, and navigation behavior in runtime modules.
- Remove direct data hooks and generated model selection from legacy navigation
  components.
- Replace rail/sidebar markup assertions with contract, selection, intent, and
  accessible-navigation coverage.

### 3. Implement the Astryx unified shell

- Replace the hard-coded shell prototype with an unexported renderer for the
  canonical shell contract.
- Use one Astryx shell/navigation surface for app switching, app screens,
  root-record navigation, management links, app settings, user actions, and
  theme control.
- Support responsive and collapsed navigation through Astryx behavior rather
  than rebuilding the old two-column rail and sidebar.
- Keep navigation controlled by projected selected state and canonical intents.
- Add focused renderer coverage for hierarchy, selection, accessibility,
  disabled destinations, counts, create controls, session actions, and route
  content composition.

### 4. Add canonical shell and navigation fixtures

- Add data-only fixtures for dev workbench, product instance, installed app,
  mapped app, multiple installed apps, admin and public destinations,
  multi-screen navigation, root-record groups, settings, sync states, session
  actions, and no-shell profiles.
- Replace hard-coded prototype labels and links with production contract shapes.
- Use minimal local state for selection, collapse, theme, and action intent
  simulation.
- Keep fixtures free of app schemas, route resolution, record reads, runtime
  imports, and proof-oriented UI.

### 5. Project the instance and workspace management contract

- Define renderer-neutral instance management, install dialog, workspace push,
  status, feedback, and management intent contracts.
- Compose canonical generated workspace contracts for app install and route
  management rather than accepting `homeRouteComponent` or section React nodes.
- Project install package choices, controlled drafts, validation, pending and
  failure states, and successful refresh intents.
- Project workspace push through existing operation-control contracts while
  retaining CSRF tokens, operation metadata, polling, and execution plans in
  runtime.
- Add focused projection and intent coverage for loading, unavailable, failed,
  ready, busy, install, push, authorization, and display-safe feedback states.

### 6. Move production instance and workspace management behind the legacy seam

- Add a dedicated legacy instance-management renderer that consumes the
  canonical management contract and nested generated workspace contracts.
- Route instance overview, app install and route collections, install dialog,
  workspace push, compact status, progress, and app-local management controls
  through runtime foundations and the legacy renderer.
- Keep reads, polling, installation, workspace calls, authorization handling,
  sync feedback, and refresh behavior in runtime modules.
- Delete dormant provider, deployment, onboarding, or workspace panels not
  required by current specs instead of adapting them.
- Replace legacy form and layout assertions with intent, security, and
  user-visible behavior coverage.

### 7. Implement Astryx instance and workspace management

- Add an unexported Astryx renderer for instance loading, failure, overview,
  install, route, workspace push, and feedback states.
- Compose existing Astryx generated workspace, operation, progress,
  confirmation, dialog, status, form, and empty-state renderers.
- Follow Astryx information hierarchy and form-dialog guidance instead of
  reproducing current management panels.
- Keep all controls driven by projected availability, pending state, and
  intents.
- Add focused renderer coverage for install validation, unavailable controls,
  push progress, authorization prompts, failures, and nested workspace
  composition.

### 8. Add canonical instance-management fixtures

- Add data-only fixtures for loading, failed, empty instance, installed apps,
  routes, install dialog states, workspace unavailable, push idle, pending,
  successful, failed, and authorization-required states.
- Include only display-safe provider or operation facts required by current
  behavior.
- Use minimal local state to simulate dialog, field, submit, operation, and
  feedback intents.
- Exclude real packages, gateway clients, CSRF tokens, provider credentials,
  deployment dashboards, runtime imports, and legacy parity scaffolding.

### 9. Project the auth-origin account surface contract

- Define shared auth frame, message, fact, action, passkey, verification-code,
  policy, field, destination, and auth intent contracts plus specific
  discriminated surface states.
- Add runtime projection for owner setup, owner login, account completion,
  signup, invitation acceptance, continuation, destination, loading, failure,
  unavailable, and passkey-unavailable states.
- Keep setup tokens, challenge ids, raw invitation tokens, credential material,
  sessions, handoff grants, and redirect policy outside the contract.
- Convert renderer input to controlled display values and intents; keep native
  form submission only as a boundary adapter where still required.
- Add focused projection and intent coverage for every shipped state and
  security exclusion.

### 10. Move owner setup and login behind the legacy auth seam

- Add legacy owner-auth renderers for canonical setup and login states.
- Route owner identity drafts, passkey start, pending, failure,
  passkey-unavailable, already-complete, logout, and continuation presentation
  through the auth foundation and legacy renderer.
- Keep passkey feature detection, browser credential calls, setup capability,
  login challenge, verification, session mutation, and navigation in runtime.
- Ensure renderer contracts never receive the setup token or authentication
  response.
- Replace legacy form and markup tests with controlled intent, retry,
  continuation, and security coverage.

### 11. Implement Astryx owner authentication

- Implement unexported Astryx owner setup and sign-in renderers using the
  canonical auth contract.
- Use Astryx form, card, action, status, and passkey patterns without copying
  legacy form structure.
- Keep successful setup and login transient and follow only projected
  runtime-approved continuation intents.
- Add focused renderer coverage for loading, ready, pending, failure,
  passkey-unavailable, setup-complete, login-complete, logout, and continuation
  states.

### 12. Move account orchestration and invitation acceptance behind the legacy auth seam

- Route account gates, signup, email verification, credential creation,
  profile completion, terms acceptance, invitation eligibility, acceptance,
  unavailable, accepted, and continuing states through canonical projections
  and legacy renderers.
- Reuse canonical operation input fields for profile completion where their
  semantics fit.
- Keep gate evaluation, challenge requests, token verification, operation
  execution, passkey registration, target resolution, handoff, and navigation
  in runtime.
- Remove browser `FormData` as presentation state where controlled contract
  drafts can replace it.
- Do not add invitation decline or other prototype-only actions without
  runtime behavior and canonical spec support.

### 13. Implement the Astryx account journey and invitation acceptance

- Replace private auth prototype scenarios with unexported renderers for the
  canonical account and invitation contracts.
- Implement email request and verification, passkey creation, app
  registration, profile completion, policy acceptance, blocked gates,
  invitation facts, acceptance, destination choice, and continuation only where
  current runtime contracts support them.
- Use Astryx OTP, form, action, status, list, and card guidance where practical.
- Keep policy links, target facts, available actions, and messages contract
  driven.
- Add focused renderer coverage for controlled drafts, accessibility, pending,
  retry, blocked, accepted, unavailable, and continuation states.

### 14. Add canonical auth layouts and fixtures

- Replace the private scenario model with data-only production contract
  fixtures for owner setup, sign-in, account details, email verification,
  passkey creation, supported account gates, signup, invitation acceptance,
  passkey unavailable, accepted invitation, continuation, destinations, and
  display-safe failures.
- Include only states and actions supported by current runtime and specs.
- Use minimal local state to simulate drafts and canonical intents without
  simulating WebAuthn, sessions, storage, handoff grants, or redirects.
- Keep fixtures focused on real account UX without proof labels or legacy
  comparison.

### 15. Project the access-management contract

- Define renderer-neutral access summary, person, role, registration,
  membership, organization, group, invitation, grant option, controlled draft,
  confirmation, feedback, and intent contracts.
- Project the purpose-built identity access summary into display-safe facts
  before rendering.
- Keep grant authority, option-key resolution, target validation, invitation
  request construction, token handling, delivery, revocation, and refresh in
  runtime.
- Project disabled grant reasons and revocation availability explicitly.
- Add focused projection and intent coverage for owner, instance-admin,
  unauthorized, empty, populated, pending, success, and failure states.

### 16. Move production access management behind the legacy renderer seam

- Add a dedicated legacy access-management renderer that consumes only the
  canonical access contract and dispatches draft, submit, confirmation, and
  revoke intents.
- Route people, roles, invitations, invitation form, grant selection, status,
  empty, unauthorized, loading, and failure states through runtime foundation
  and the legacy renderer.
- Keep identity reads, authority checks, invitation creation, delivery,
  revocation, refresh, and error redaction in runtime modules.
- Preserve only pending invitation revocation as the first-pass destructive
  action.
- Replace raw summary and legacy markup assertions with contract, authorization,
  intent, and visible-behavior coverage.

### 17. Implement Astryx access management

- Add an unexported Astryx renderer for the canonical access-management
  contract.
- Use Astryx list, card, badge, status, form, selector, checkbox, dialog,
  confirmation, and empty-state patterns according to component guidance.
- Render grant choices and disabled reasons exactly as projected; do not infer
  authority from role names or target kinds.
- Keep invite creation and revocation controlled by canonical intents and
  projected async state.
- Add focused renderer coverage for summaries, scopes, grant choices, empty and
  unauthorized states, validation, confirmation, pending, success, and failure.

### 18. Add canonical access-management fixtures

- Add data-only fixtures for owner and instance-admin authority, empty and
  populated summaries, people and roles, organizations and groups, app-scoped
  grants, invitation draft states, pending invitations, revocation,
  unauthorized, loading, success, and failure.
- Use minimal local state to simulate canonical drafts and intents.
- Exclude raw identity records, invitation tokens, email delivery, credential
  material, sessions, runtime clients, and destructive identity actions not in
  scope.
- Add a focused Access layout suitable for direct UX review.

## Expected Evidence

Each task section should leave evidence appropriate to its scope:

- projection tests for display-safe contract shape, availability, selection,
  and secret exclusion;
- runtime intent tests for navigation, reset, install, workspace push, auth,
  account gates, invitation creation, and revocation;
- legacy renderer tests for canonical intent dispatch and visible behavior;
- Astryx renderer tests for hierarchy, accessibility, controlled state,
  responsive behavior, async state, and action semantics;
- import-boundary evidence that `lib/astryx` does not import runtime, auth,
  identity storage, gateway, generated client, or legacy UI modules;
- import-confinement evidence that migrated production surfaces have no direct
  `@dpeek/formless-ui` imports outside their owned legacy seam modules;
- security coverage proving tokens, challenges, credentials, sessions, CSRF,
  handoff grants, provider secrets, and private profile data do not cross the
  renderer contract;
- current `devstate check` evidence before completing each task section; and
- `bun browser` smoke for changed production legacy paths, including protected
  route and continuation behavior where practical.

For package-only UX iteration, follow `lib/astryx/AGENTS.md`: use Astryx
components, prefer component props over custom styling, use StyleX with Astryx
tokens when styling is necessary, do not start another dev server, and rely on
the user for prototype visual feedback.

## Proposal-Time Spec Work

The future proposal should update the smallest applicable canonical specs:

- `openspec/specs/generated-ui/spec.md` for the unified shell/navigation
  direction, instance management presentation contracts, and removal of the
  narrow-rail requirement;
- `openspec/specs/instance-auth/spec.md` for renderer-neutral auth-origin
  presentation and secret-safe contract input;
- `openspec/specs/identity-control-plane/spec.md` for renderer-neutral dedicated
  access-management presentation; and
- `openspec/specs/runtime-topology/spec.md` only where shell visibility or route
  mount facts need reconciliation.

Do not change auth, route, identity authority, install, or workspace semantics
merely to support a renderer. Delete or rewrite superseded narrow-rail, direct
React composition, browser-form-source-of-truth, or legacy-structure facts
instead of preserving compatibility.

## Completion Gate

The change is complete when:

- production app and instance chrome consume one canonical shell/navigation
  model through a legacy renderer;
- root-record navigation, counts, app settings, sync/reset, and session actions
  are projected before rendering;
- instance and workspace management consume canonical contracts and nested
  generated workspace contracts;
- owner setup, login, account gates, signup, and invitation acceptance consume
  secret-safe canonical auth contracts;
- access management consumes a canonical display-safe contract;
- runtime sessions, secrets, ceremonies, route policy, authority, reads,
  mutations, polling, sync, and navigation remain outside `lib/astryx`;
- Astryx can render every new contract from data-only fixtures;
- production still selects only legacy renderers and legacy global styles;
- all direct `@dpeek/formless-ui` imports for these surfaces are confined to the
  owned legacy seam modules identified by the change;
- canonical specs describe the shipped boundary; and
- checks, security evidence, and required browser smoke pass.

The renderer switch, ThemeProvider and global CSS selection, dormant legacy
renderer deletion, Tailwind removal, and `@dpeek/formless-ui` package removal
remain owned by `astryx-cutover`.

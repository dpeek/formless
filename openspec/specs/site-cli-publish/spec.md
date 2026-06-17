# Site CLI Publish Specification

## Purpose

Site CLI publish behavior lets a local Formless workspace run, save, sync,
deploy, and manage selected instance access.

## Requirements

### Requirement: CLI Command Families

The package SHALL expose one top-level `formless` command spelling for each
normal workspace operation and SHALL keep raw archive movement, instance
aliases, status, check, refresh, init, reset, and domain repair commands out of
the public CLI surface.

#### Scenario: Local workspace commands

- **GIVEN** the package CLI is installed
- **WHEN** a user runs `formless dev`, `formless save`, `formless pull`,
  `formless push`, `formless deploy`, or `formless destroy`
- **THEN** the command operates on the local Formless workspace selected by
  `formless.json`
- **AND** `formless dev`, `formless save`, and `formless pull` do not mutate
  Cloudflare resources
- **AND** `formless push` mutates only deployed instance data through runtime
  APIs after explicit apply input
- **AND** `formless deploy` and `formless destroy` are explicit Cloudflare
  runtime and provider-resource boundaries

#### Scenario: Deploy dry-run

- **GIVEN** the package CLI is installed
- **WHEN** a user runs `formless deploy --dry-run`
- **THEN** the command plans workspace source freshness, target drift, upgrade
  requirements, deployment desired resources, and DNS and custom-domain
  reconciliation without mutating local source, remote data,
  Cloudflare resources, or Alchemy state

#### Scenario: Removed command families

- **GIVEN** the package CLI is installed
- **WHEN** a user runs a removed archive, instance alias, status, check,
  refresh, init, reset, or domain command
- **THEN** the command is handled by ordinary unsupported-command behavior
- **AND** provider, Authority, filesystem, deploy adapter, command, and state
  mutation code is not run for the removed command name

#### Scenario: Owner setup command

- **GIVEN** the package CLI is installed and a Formless instance workspace has a
  selected deployed target
- **WHEN** a user runs `formless owner setup ... [--open]`
- **THEN** the CLI reads the selected target owner setup status before minting a
  setup capability
- **AND** if owner setup is incomplete, the CLI uses the selected admin token
  source to create one owner setup capability and displays the intended
  `/setup?token=...` URL
- **AND** if `--open` is present, the CLI opens only that intended setup URL
  after capability creation succeeds
- **AND** if owner setup is already complete, the CLI reports the existing owner
  state without minting a setup token, creating a capability, or opening a
  browser
- **AND** the admin token is not displayed and the setup token is displayed only
  as part of the intended setup URL

#### Scenario: Token commands

- **GIVEN** an instance workspace needs automation write access
- **WHEN** a user runs `formless token adopt` or `formless token rotate`
- **THEN** ignored workspace secret state stores the automation admin token
- **AND** reviewable workspace source does not store the secret

### Requirement: Workspace Operation Definitions

The workspace package SHALL own runtime-neutral workspace operation definitions
that describe the operation contract before any CLI, browser gateway, runner, or
local execution binding handles it.

#### Scenario: Operation definition source

- **WHEN** the workspace package declares a workspace operation
- **THEN** the definition includes a target-prefixed canonical key, label, input
  fields, defaults, actor policy, read or write mode, bootstrap availability,
  display-safe input summary, CLI binding, gateway binding, and required
  execution capability
- **AND** the definition includes a stable execution handler key that may match
  the canonical operation key
- **AND** operation kind allowlists, browser-visible operation sets, gateway
  mutating intent, bootstrap intent, and display input summaries are derived from
  the definitions
- **AND** duplicated per-surface operation metadata is not maintained separately
  in CLI, gateway, or instance shell code

#### Scenario: Definition and handler boundary

- **WHEN** a workspace operation is executed locally or through a gateway actor
- **THEN** the operation definition remains the source of metadata, bindings,
  input shape, actor policy, mode, and required execution capability
- **AND** operation handler implementations remain grouped by execution domain
  such as workspace status, workspace source sync, credential setup, and
  deployment
- **AND** the first implementation does not require moving all operation bodies
  into one shared operation module

#### Scenario: CLI binding from operation definition

- **WHEN** the CLI exposes a workspace command for a defined operation
- **THEN** command arguments and defaults are selected from the operation input
  contract and CLI binding
- **AND** each public workspace operation has one CLI binding name
- **AND** the command invokes the operation through the local workspace
  operation runner with actor `cli`
- **AND** execution may continue to dispatch to existing local workspace
  functions while the operation definition remains the source of command shape,
  actor policy, and display-safe input facts

#### Scenario: Gateway binding from operation definition

- **WHEN** a browser or automation caller starts a workspace operation through
  the same-origin gateway API
- **THEN** the gateway parses allowed request fields, defaults, read/write mode,
  bootstrap eligibility, and required actor policy from the operation definition
- **AND** forbidden secret-looking, path-like, raw provider state, or shell
  command inputs remain rejected before execution
- **AND** unsupported operations are rejected because no browser gateway binding
  is declared, not because a separate gateway-only enum omits them

### Requirement: Local First Onboarding

The CLI SHALL start the local Formless workspace runtime through `formless dev`
before any Cloudflare account or deployment mutation, while the CLI owns fresh
workspace bootstrap and browser onboarding owns local session bootstrap,
optional first app install, credential setup, and deploy operations.

#### Scenario: Start local workspace runtime

- **WHEN** `formless dev` runs for an empty workspace root
- **THEN** the CLI writes a layout-only `formless.json`, prepares ignored
  `.formless/local` state, persists local dev secrets, and mints process-scoped
  local session, gateway proxy, gateway CSRF, and sidecar tokens before the
  product instance runtime starts
- **AND** the CLI does not create empty storage snapshot or media directories
- **AND** no app install, route, deployment config, Cloudflare resource,
  Alchemy resource, provider credential, or remote instance is created
- **AND** the workspace name defaults from the selected directory unless
  interactive confirmation supplies another valid name

#### Scenario: Start existing local workspace runtime

- **WHEN** `formless dev` runs for a layout-only workspace or workspace source
  with storage snapshots and media payloads
- **THEN** the product instance runtime starts with workspace-local persistence
- **AND** the CLI builds the active package resolver from bundled packages plus
  linked packages declared in `formless.packages.json` when present
- **AND** installable package lists shown before the workspace has installed
  apps come from that active resolver
- **AND** first-run local runtime state starts from workspace storage snapshots
  and media payloads when present
- **AND** the browser can complete onboarding before any Cloudflare deploy
- **AND** before a local owner session is established, the browser can only read
  gateway status through bootstrap authorization and exchange a CLI-minted local
  session bootstrap token for an owner session
- **AND** app install, save, credential setup, deploy plan, and deploy apply
  entry points are available through browser-owned local runtime flows
  after local session bootstrap

#### Scenario: Open authenticated local session

- **WHEN** a user runs `formless dev --open`
- **THEN** the CLI opens a same-origin local session bootstrap URL for the
  running local workspace runtime
- **AND** successful bootstrap issues an owner session cookie and redirects the
  browser to the instance shell
- **AND** the instance shell can install the first package app through the
  normal app install flow without passkey setup

#### Scenario: Install first app locally

- **WHEN** the user installs a package app through the local web UI
- **THEN** the local Authority records schema-owned `app-install` and `route`
  records and initializes install-scoped app state from the active package
  resolver
- **AND** no Cloudflare resource is mutated

#### Scenario: Install linked private app locally

- **GIVEN** `formless.packages.json` links a private local app package manifest
- **WHEN** `formless dev` starts and an owner opens the app install flow
- **THEN** the linked package appears in the installable package list for that
  workspace
- **AND** installing it initializes app storage from the linked source schema
  and seed records
- **AND** the generated `app-install` and `route` records do not store the
  package link path or package source repository facts

#### Scenario: Reject missing linked package source

- **GIVEN** `formless.packages.json` points at a missing or invalid package
  manifest, source schema, or seed record file
- **WHEN** `formless dev`, `formless push`, `formless deploy`, or a workspace
  operation builds the active package resolver
- **THEN** the command fails before starting local runtime mutation, remote
  mutation, deploy planning, or provider mutation
- **AND** the error identifies the invalid package link path and validation
  reason without exposing secrets

#### Scenario: Deploy before installing an app

- **WHEN** a local owner opens the deployment flow before any app install exists
- **THEN** credential setup, deploy plan, and deploy apply remain available
  through the browser-owned local runtime flow
- **AND** the deployment can publish the instance runtime with zero
  `app-install` records and no app storage snapshots
- **AND** app installation remains a separate optional local Authority write
  before or after the first deploy

### Requirement: Workspace Save From Local Authority

The CLI SHALL save local workspace runtime state from Authority-backed instance
state back to reviewable workspace storage snapshots and media payloads.

#### Scenario: Save local workspace state

- **WHEN** `formless save` runs for a local Formless workspace
- **THEN** active installed app records, media payloads, and schema-owned
  control-plane intent are written to deterministic workspace storage snapshots
- **AND** browser IndexedDB state is not used as the source of truth
- **AND** secrets are not written to `formless.json`, storage snapshots, or
  media files

#### Scenario: Auto-save local workspace state

- **WHEN** a local workspace runtime with a gateway sidecar receives a
  committed browser-originated local write
- **THEN** workspace auto-save writes the same deterministic storage snapshots
  and referenced media payloads as `formless save`
- **AND** browser IndexedDB state is not used as the source of truth
- **AND** `formless save` remains available as an explicit flush or retry
  action
- **AND** remote pull, push, deploy, and destroy remain explicit CLI or gateway
  operations

#### Scenario: Workspace operation state vocabulary

- **WHEN** CLI output, gateway operation state, browser workspace status, or
  tests report workspace save, check, pull, or push results
- **THEN** reviewable workspace source paths and counts are reported with
  workspace state, storage state, app state, instance state, storage snapshot,
  or media payload terminology
- **AND** archive terminology is used only when the operation exports, imports,
  restores, backs up, or composes a portable archive envelope

#### Scenario: Check workspace source

- **WHEN** a user runs `formless save --check` and local Authority state differs
  from the reviewable workspace source
- **THEN** the command fails and reports that workspace source must be refreshed
- **AND** it does not rewrite storage snapshot or media files

### Requirement: CLI Upgrade Planning

The Site CLI SHALL plan runtime and data upgrades before mutating remote
Formless instances.

#### Scenario: Plan instance upgrade

- WHEN a user runs an upgrade-aware CLI command against a target instance
- THEN the CLI compares local package metadata with deployed runtime metadata,
  app install package facts, archive state when relevant, and deployment status
- AND local package metadata comes from the active resolver built from bundled
  packages plus workspace-linked package manifests when present
- AND the CLI reports code deploy, SQL migration, package app migration, backup,
  and browser reload requirements
- AND older archive compatibility normalization is not part of upgrade planning

#### Scenario: Dry-run remains non-mutating

- WHEN an upgrade-aware CLI command runs without its required apply input
- THEN it performs planning and validation only
- AND remote runtime, app data, media, archives, and provider resources are not
  mutated

### Requirement: CLI Upgrade Apply Boundary

The Site CLI SHALL apply migrations only through deployed runtime or Authority
APIs.

#### Scenario: Apply data upgrade

- WHEN a CLI command applies an upgrade that requires storage or app data
  migration
- THEN it invokes deployed runtime or Authority APIs for the mutation
- AND it does not directly access Durable Object SQLite

#### Scenario: Backup before user-data migration

- WHEN an upgrade plan includes an `auto-with-backup` migration
- THEN CLI apply requires backup evidence before applying the migration
- AND the command reports the backup in its apply output
- AND backup evidence includes backup kind, scope, artifact path, completion
  timestamp, and target when available

#### Scenario: Manual approval before manual migration

- WHEN an upgrade plan includes a `manual-approval` migration
- THEN CLI apply requires approval evidence matching that migration approval key
  before applying the migration
- AND manual approval evidence includes approval kind, approval key, approval
  timestamp, and optional approver or reason

### Requirement: Deploy Verification Uses Upgrade Metadata

Instance deploy workflows SHALL verify upgrade metadata after code deploy.

#### Scenario: Verify deployed metadata

- WHEN `formless deploy` deploys runtime code
- THEN it verifies package version, runtime protocol, storage migration set, and
  package app revision/hash facts from deployed metadata
- AND verification failure stops subsequent data migration steps

### Requirement: Site CLI Media Package Boundary

The system SHALL keep Site CLI save, pull, push, and deploy behavior stable
while consuming Media contracts from public package subpaths.

#### Scenario: Archive workflows use Media contract

- GIVEN Site CLI save, pull, push, or deploy workflows validate or
  move core media payloads
- WHEN they need media asset, storage key, delivery, or restore result shapes
- THEN they use public Media package contracts

#### Scenario: Existing archive behavior remains stable

- GIVEN Site CLI workflows move referenced owned image media
- WHEN media is represented in workspace source or sync payloads
- THEN media is represented with core media objects and the `core-media-assets`
  capability
- AND records do not receive provider-specific URLs

### Requirement: Instance Workspace

The system SHALL manage reviewable Formless workspaces whose `formless.json`
manifests describe workspace layout and local configuration while instance
intent lives in schema-owned storage snapshots.

#### Scenario: Pull and deploy dry-run

- **WHEN** `formless pull` runs and then `formless deploy --dry-run` runs
  for a workspace targeting a remote Formless instance
- **THEN** target control-plane records, app storage snapshots, and media
  payloads are written into workspace source
- **AND** deploy dry-run reports storage-state, control-plane record, deployment,
  custom-domain, and DNS drift against the selected target
- **AND** app record drift compares records by identity rather than treating
  storage snapshot serialization order as drift
- **AND** redirect route drift is reported as route intent drift
- **AND** pull, push, deploy dry-run, and deploy select the remote HTTP origin
  from an enabled `deployment-config.targetUrl` record rather than
  `formless.json`

#### Scenario: Deploy apply refuses unacknowledged target drift

- **WHEN** `formless deploy` finds target drift before provider mutation
- **THEN** it refuses deploy before Cloudflare or Alchemy mutation
- **AND** the CLI prints a display-safe drift summary using the same drift
  counters reported by `formless deploy --dry-run`
- **AND** the refusal does not direct the user to removed check commands

#### Scenario: Push apply

- **WHEN** `formless push --apply` runs with ready workspace source and
  target drift acknowledged when needed
- **THEN** the workflow takes a fresh whole-instance backup
- **AND** dry-runs before applying the composed instance archive restore

### Requirement: Deploy Commands

The system SHALL keep deployment and destroy credential-scoped while making
projected deployment resource graphs the only normal provider mutation input
for workspace-controlled deploy intent.

#### Scenario: First workspace deploy

- **GIVEN** a local Formless workspace has saved workspace source and no remote
  target
- **WHEN** `formless deploy` runs with required provider credentials available
  to the CLI or trusted local deployer
- **THEN** the deployment uses the instance runtime profile
- **AND** the deployment does not require installed app records or app archives
- **AND** deploy metadata is verified after upload
- **AND** display-safe target facts are copied to ignored `.formless/` deploy
  state
- **AND** provider credentials, Alchemy secrets, automation admin tokens, and
  owner setup tokens are stored only under ignored secret state
- **AND** when the deploy creates an owner setup capability, CLI output displays
  the intended owner setup URL for passkey-backed first-owner setup
- **AND** workspace source is restored or pushed through runtime APIs before
  remote data mutation is considered complete
- **AND** Worker, Durable Object, R2, DNS, and custom-domain resources are
  reconciled through tracked Alchemy desired state in the generic deployment
  path
- **AND** redirect source hosts are reconciled as Worker custom-domain
  resources in the generic deployment path

#### Scenario: Route removal deploys provider deletion

- **GIVEN** workspace source no longer contains an enabled route that previously
  projected custom-domain or DNS provider resources
- **WHEN** `formless deploy` runs with required provider credentials and ignored
  deploy state available
- **THEN** the CLI or trusted local deployer omits those resources from tracked
  Alchemy desired state
- **AND** Alchemy removes the omitted tracked provider resources
- **AND** deploy may patch the target deployment config's latest observation
  cache with the exact desired-state hash and display-safe result summary

#### Scenario: Workspace destroy

- **GIVEN** a local Formless workspace targets a Cloudflare-backed instance
- **WHEN** `formless destroy --confirm <workerName>` runs with provider
  credentials and ignored deploy state available
- **THEN** the selected target's Worker, Durable Object namespace, R2 media
  bucket, Worker assets, Worker secrets, custom-domain provider resources, DNS
  provider resources, and Alchemy deploy state are
  destroyed through tracked selected deploy state
- **AND** `formless.json`, instance archives, and app archives remain in place
- **AND** ignored deploy state for the selected target is removed or marked
  destroyed only after provider destroy succeeds
- **AND** provider credentials and admin tokens remain outside workspace
  manifests, portable archives, browser responses, and spec artifacts

#### Scenario: Destroy confirmation

- **GIVEN** a workspace targets a Cloudflare-backed instance
- **WHEN** `formless destroy` runs without `--confirm <workerName>` matching the
  selected deployment Worker name
- **THEN** the command fails before Cloudflare or Alchemy mutation

#### Scenario: Authenticated instance target context

- **WHEN** CLI pull, push, deploy dry-run, deploy, or owner setup workflows
  contact a selected deployed instance target
- **THEN** the CLI resolves one target context containing the normalized target
  URL, ignored local secret state, environment overrides, and optional explicit
  admin token
- **AND** protected management reads and writes use that resolved admin bearer
  authorization consistently
- **AND** logs and reviewable workspace source do not include admin bearer
  tokens, owner setup tokens, provider credentials, or other runtime secrets

#### Scenario: Owner setup command uses focused bootstrap reads

- **WHEN** owner setup is incomplete and the CLI prepares an owner setup URL
- **THEN** the command reads only the selected target, owner setup status, and
  resolved admin bearer authorization needed to create the setup capability
- **AND** it does not require installed app registry, route, deployment status,
  archive, or browser owner session reads before the first owner passkey exists

### Requirement: Schema Control-Plane Protocol

The Site CLI SHALL use the instance protocol and local workspace operation layer
to query, write, save, and compare schema-owned `app-install`, `route`, and
deployment intent records.

#### Scenario: CLI reads deployment records

- **WHEN** CLI pull, push, deploy dry-run, or deploy workflows need instance
  control-plane state
- **THEN** they read allowed `app-install`, `route`, and
  `deployment-config` records through the instance control-plane protocol or
  workspace storage snapshots
- **AND** provider credentials remain in CLI, local gateway, or runner-held
  secret locations
- **AND** deployment observation, evidence, drift, cleanup, and status summaries
  are read through read-only deployment runtime projection or local gateway
  operation responses rather than control-plane storage snapshots
- **AND** latest persisted deployment status is read from display-safe
  deployment config observation cache fields

#### Scenario: CLI deploy writes latest observation

- **WHEN** a deployment command starts against a schema-owned target
- **THEN** it reads the current desired-state projection and applies the
  projected resource graph through the local deployment adapter
- **AND** after deploy or failure it patches the target deployment config's
  display-safe latest observation cache
- **AND** runner-held credentials remain outside browser, archive, record
  source, and workspace manifest responses

#### Scenario: Deploy dry-run remains read-only

- **WHEN** `formless deploy --dry-run` compares local workspace source, remote
  instance source, deployment projection, or provider state
- **THEN** it reports fresh deployment observations without patching deployment
  config observation cache fields

#### Scenario: CLI reads app routes

- **WHEN** an instance workspace needs installed app or public Site route state
- **THEN** the CLI reads `app-install` and `route` records
- **AND** route drift is reported by comparing route records rather than
  hand-derived install route strings or manifest route summaries

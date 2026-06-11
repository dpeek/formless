# Site CLI Publish Specification

## Purpose

Site CLI publish behavior lets a local Formless workspace initialize, run,
save, deploy, move data through portable archives, and manage instance and
custom-domain intent.

## Requirements

### Requirement: CLI Command Families

The package SHALL expose local workspace runtime, workspace operation, archive,
explicit cleanup, owner setup, token, and destroy command families from the
`formless` CLI while keeping top-level workspace commands as the normal product
path.

#### Scenario: Local workspace commands

- **GIVEN** the package CLI is installed
- **WHEN** a user runs `formless dev`, `formless save`, `formless check`,
  `formless deploy`, or `formless destroy`
- **THEN** the command operates on the local Formless workspace selected by
  `formless.json`
- **AND** `formless dev`, `formless save`, and `formless check` do not mutate
  Cloudflare resources
- **AND** `formless deploy` and `formless destroy` are explicit Cloudflare
  deployment boundaries

#### Scenario: Archive and import commands

- **GIVEN** the package CLI is installed
- **WHEN** a user runs archive export, restore, or `archive import-site`
- **THEN** portable archive and legacy standalone Site import behavior remains
  available
- **AND** those commands stay scoped to archive data movement

#### Scenario: Explicit cleanup commands

- **GIVEN** recorded provider evidence exists
- **WHEN** a user runs a supported explicit cleanup or delete command with the
  required host, resource kind, logical id, target, and authorization inputs
- **THEN** the command targets recorded provider evidence only
- **AND** route intent, workspace source, and app data are not mutated by the
  cleanup command

#### Scenario: Owner setup command

- **GIVEN** the package CLI is installed and a Formless instance workspace has a
  selected deployed target
- **WHEN** a user runs `formless instance owner setup ... [--open]`
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
- **AND** the CLI does not create empty app archive, control-plane record
  source, or media directories
- **AND** no app install, route, deployment config, Cloudflare resource,
  Alchemy resource, provider credential, or remote instance is created
- **AND** the workspace name defaults from the selected directory unless
  interactive confirmation supplies another valid name

#### Scenario: Start existing local workspace runtime

- **WHEN** `formless dev` runs for a layout-only workspace or workspace source
  with records and archives
- **THEN** the product instance runtime starts with workspace-local persistence
- **AND** first-run local runtime state starts from workspace control-plane
  record source and app archives when present
- **AND** the browser can complete onboarding before any Cloudflare deploy
- **AND** before a local owner session is established, the browser can only read
  gateway status through bootstrap authorization and exchange a CLI-minted local
  session bootstrap token for an owner session
- **AND** app install, save, check, credential setup, deploy plan, and deploy
  apply entry points are available through browser-owned local runtime flows
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
  records and initializes install-scoped app state
- **AND** no Cloudflare resource is mutated

#### Scenario: Deploy before installing an app

- **WHEN** a local owner opens the deployment flow before any app install exists
- **THEN** credential setup, deploy plan, and deploy apply remain available
  through the browser-owned local runtime flow
- **AND** the deployment can publish the instance runtime with zero
  `app-install` records and no app archive payloads
- **AND** app installation remains a separate optional local Authority write
  before or after the first deploy

### Requirement: Workspace Save From Local Authority

The CLI SHALL save local workspace runtime state from Authority-backed instance
state back to reviewable workspace record source and app archives.

#### Scenario: Save local workspace state

- **WHEN** `formless save` runs for a local Formless workspace
- **THEN** active installed app records, media payloads, and schema-owned
  control-plane intent are written to deterministic workspace record source and
  app archives
- **AND** browser IndexedDB state is not used as the source of truth
- **AND** secrets are not written to `formless.json`, record source, or archive
  files

#### Scenario: Check workspace source

- **WHEN** a user runs `formless save --check` and local Authority state differs
  from the reviewable workspace source
- **THEN** the command fails and reports that workspace source must be refreshed
- **AND** it does not rewrite record source or archive files

### Requirement: Seed Promotion

The system SHALL promote source Site seed data from local Site Authority state in deterministic form with referenced core media files.

#### Scenario: Pull seed

- GIVEN local Site Authority state contains active Site records
- WHEN `bun run site:pull-seed` runs
- THEN source seed records are written with stable record ids, created timestamps, deterministic order, and deterministic JSON formatting
- AND tombstoned records are omitted

#### Scenario: Seed check

- GIVEN source Site records or referenced source media files are stale
- WHEN `bun run site:pull-seed --check` runs
- THEN the command fails
- AND it reports that source output must be refreshed

### Requirement: CLI Upgrade Planning

The Site CLI SHALL plan runtime and data upgrades before mutating remote
Formless instances.

#### Scenario: Plan instance upgrade

- WHEN a user runs an upgrade-aware CLI command against a target instance
- THEN the CLI compares local package metadata with deployed runtime metadata,
  app install package facts, archive state when relevant, and deployment status
- AND the CLI reports code deploy, SQL migration, package app migration, archive
  normalization, backup, and browser reload requirements

#### Scenario: Report archive normalization evidence

- WHEN an archive restore dry-run reads an older supported archive envelope
- THEN the CLI normalizes the archive before posting the dry-run restore
- AND output reports the archive normalizer id and from/to archive versions

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

- WHEN `formless deploy` or `formless instance deploy` deploys runtime code
- THEN it verifies package version, runtime protocol, storage migration set, and
  package app revision/hash facts from deployed metadata
- AND verification failure stops subsequent data migration steps

### Requirement: Portable Archives

The system SHALL export, restore, and import Site and instance data as portable archive directories that include declared capabilities and referenced core media.

#### Scenario: Export app archive

- GIVEN a target Formless instance contains an installed Site app
- WHEN `formless archive export-app --target <url> --install <id> --out <dir>` runs
- THEN one app archive directory is written
- AND referenced core image media is included as archive media payloads

#### Scenario: Restore dry-run

- GIVEN a portable archive directory exists
- WHEN archive restore runs without `--apply`
- THEN the restore is a dry-run
- AND no remote app or instance data is mutated

### Requirement: Site CLI Media Package Boundary

The system SHALL keep Site CLI save, import, and archive behavior stable
while consuming Media contracts from public package subpaths.

#### Scenario: Archive workflows use Media contract

- GIVEN Site CLI save, import, export, or restore workflows validate or
  move core media payloads
- WHEN they need media asset, storage key, delivery, or restore result shapes
- THEN they use public Media package contracts

#### Scenario: Existing archive behavior remains stable

- GIVEN Site CLI workflows move referenced owned image media
- WHEN media is represented in an archive
- THEN media is represented with core media objects and the `core-media-assets`
  capability
- AND records do not receive provider-specific URLs

### Requirement: Site Project Import

The system SHALL import a standalone Site project as an installed Site app archive while preserving external URLs and representing owned image media as core media assets.

#### Scenario: Import project

- GIVEN a standalone Site project has records and project media
- WHEN `formless archive import-site --project <path> --install <id> --out <dir>` runs
- THEN an installed Site app archive is written
- AND project media is represented with core media objects and the `core-media-assets` capability

#### Scenario: Import rejects legacy media

- GIVEN the standalone Site project contains legacy same-origin Site media hrefs
- WHEN import-site validates the project
- THEN import fails with a migration error
- AND no app-scoped Site media archive is emitted

### Requirement: Instance Workspace

The system SHALL manage reviewable Formless workspaces whose `formless.json`
manifests describe workspace layout and local configuration while instance
intent lives in schema-owned record source.

#### Scenario: Pull and check

- **WHEN** `formless instance pull` runs and then `formless instance check` runs
  for a workspace targeting a remote Formless instance
- **THEN** target control-plane records, app archives, and media payloads are
  written into workspace source
- **AND** check reports archive and control-plane record drift against the
  selected target
- **AND** status, pull, check, and push select the remote HTTP origin from an
  enabled `deployment-config.targetUrl` record rather than `formless.json`

#### Scenario: Push apply

- **WHEN** `formless instance push --apply` runs with ready workspace source and
  target drift acknowledged when needed
- **THEN** the workflow takes a fresh whole-instance backup
- **AND** dry-runs before applying the composed instance archive restore

### Requirement: Domain And Deploy Commands

The system SHALL keep deployment, destroy, and explicit provider repair cleanup
credential-scoped while making projected deployment resource graphs the normal
provider mutation input for workspace-controlled deploy intent.

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
- **AND** Worker, Durable Object, R2, DNS, custom-domain, and redirect resources
  are reconciled through tracked Alchemy desired state in the generic deployment
  path

#### Scenario: Route removal deploys provider deletion

- **GIVEN** workspace source no longer contains an enabled route that previously
  projected custom-domain, DNS, or redirect provider resources
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
  provider resources, redirect provider resources, and Alchemy deploy state are
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

#### Scenario: Automation admin token

- **GIVEN** an instance workspace needs automation write access
- **WHEN** a supported token adopt or rotate command runs
- **THEN** ignored workspace secret state stores the automation admin token
- **AND** reviewable workspace source does not store the secret

#### Scenario: Authenticated instance target context

- **WHEN** CLI status, check, pull, push, deploy, owner setup, archive export,
  or domain workflows contact a selected deployed instance target
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

### Requirement: Provider Cleanup CLI

The Site CLI SHALL keep explicit provider repair cleanup available for recorded
evidence while route-derived provider resources reconcile through workspace
deploy reconciliation.

#### Scenario: Domain cleanup remains repair-only

- **GIVEN** recorded provider evidence exists for a host, resource kind, and
  logical id that cannot be reconciled through tracked Alchemy state
- **WHEN** a supported explicit provider delete or manual cleanup command runs
- **THEN** the command mutates only the selected provider evidence or selected
  recorded provider resource
- **AND** cleanup output includes the deployment or provider evidence ids needed
  for audit when available
- **AND** route removal during normal operation is handled by `formless deploy`
  reconciliation, not by explicit cleanup commands

### Requirement: Schema Control-Plane Protocol

The Site CLI SHALL use the instance protocol and local workspace operation layer
to query, write, save, and compare schema-owned `app-install`, `route`, and
deployment intent records.

#### Scenario: CLI reads deployment records

- **WHEN** CLI status, check, pull, push, plan, deploy, or domain workflows need
  instance control-plane state
- **THEN** they read allowed `app-install`, `route`, and
  `deployment-config` records through the instance control-plane protocol or
  workspace record source
- **AND** provider credentials remain in CLI, local gateway, or runner-held
  secret locations
- **AND** deployment observation, evidence, drift, cleanup, and status summaries
  are read through read-only deployment runtime projection or local gateway
  operation responses rather than control-plane record source
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

#### Scenario: CLI check remains read-only

- **WHEN** a check command compares local workspace source, remote instance
  source, deployment projection, or provider state
- **THEN** it reports fresh deployment observations without patching deployment
  config observation cache fields

#### Scenario: CLI refresh persists observation

- **WHEN** a refresh or status-write command explicitly persists latest
  deployment observation
- **THEN** it patches only deployment config observation cache fields
- **AND** deployment intent fields remain unchanged

#### Scenario: CLI reads app routes

- **WHEN** an instance workspace needs installed app or public Site route state
- **THEN** the CLI reads `app-install` and `route` records
- **AND** route drift is reported by comparing route records rather than
  hand-derived install route strings or manifest route summaries

### Requirement: Compatible Domain Commands

The Site CLI SHALL keep domain inspection and explicit cleanup command surfaces
available where they expose behavior not replaced by workspace deploy.

#### Scenario: Domain inspection output

- **GIVEN** users inspect domain, route, deployment, drift, or provider evidence
  state
- **WHEN** a supported non-mutating command executes
- **THEN** output may include schema-owned route ids, deployment config ids,
  desired-state hashes, latest observation summaries, and provider evidence ids
- **AND** the command does not mutate provider resources

#### Scenario: Removed direct fallback commands are unsupported

- **GIVEN** users run a removed direct fallback or domain apply command
- **WHEN** the command executes
- **THEN** the command is handled by ordinary unsupported-command behavior
- **AND** provider, Authority, filesystem, deploy adapter, command, and state
  mutation code is not run for the removed command name

# Site CLI Publish Specification

## Purpose

Site CLI publish behavior lets a local Formless workspace initialize, run,
save, deploy, move data through portable archives, and manage instance and
custom-domain intent.

## Requirements

### Requirement: CLI Command Families

The package SHALL expose local workspace onboarding, workspace operation,
archive, advanced instance, domain, token, and destroy command families from the
`formless` CLI.

#### Scenario: Local workspace commands

- GIVEN the package CLI is installed
- WHEN a user runs `formless onboard`, `formless dev`, `formless save`,
  `formless check`, `formless deploy`, or `formless destroy`
- THEN the command operates on the local Formless workspace selected by
  `formless.json`
- AND `formless onboard`, `formless dev`, `formless save`, and
  `formless check` do not mutate Cloudflare resources
- AND `formless deploy` and `formless destroy` are explicit Cloudflare
  deployment boundaries

#### Scenario: Instance commands

- GIVEN a Formless workspace exists
- WHEN a user runs `formless instance status`, `pull`, `check`, `push`, `dev`,
  `reset-local`, `deploy`, or `destroy`
- THEN the command operates on the selected instance workspace
- AND workspace-local runtime state stays separate from remote instance state

### Requirement: Local First Onboarding

The CLI SHALL start the local Formless workspace runtime through `formless dev`
before any Cloudflare account or deployment mutation, while browser onboarding
owns workspace initialization and first app install.

#### Scenario: Start local workspace runtime

- **WHEN** `formless dev` runs for an empty or layout-only workspace
- **THEN** the product instance runtime starts with workspace-local persistence
- **AND** first-run local runtime state starts from workspace control-plane
  record source and app archives
- **AND** the browser can complete onboarding before any Cloudflare deploy
- **AND** before owner setup is complete, the browser can use only the local
  bootstrap capability needed to read workspace status and initialize the
  resolved workspace root
- **AND** workspace initialization, first app install, save, check, credential
  setup, and deploy entry points are available through browser-owned local
  gateway operations

#### Scenario: Onboard command removed

- **WHEN** a user invokes `formless onboard`
- **THEN** the command is not exposed as a supported workspace command
- **AND** if a retained parser path sees the command during transition, it
  fails before filesystem, Authority, Cloudflare, Alchemy, or provider mutation
- **AND** output directs the user to run `formless dev` and complete setup in
  the browser

#### Scenario: Install first app locally

- **WHEN** the user installs a package app through the local web UI
- **THEN** the local Authority records schema-owned `app-install` and `route`
  records and initializes install-scoped app state
- **AND** no Cloudflare resource is mutated

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
  enabled `deploy-target.targetUrl` record rather than `formless.json`

#### Scenario: Push apply

- **WHEN** `formless instance push --apply` runs with ready workspace source and
  target drift acknowledged when needed
- **THEN** the workflow takes a fresh whole-instance backup
- **AND** dry-runs before applying the composed instance archive restore

### Requirement: Domain And Deploy Commands

The system SHALL keep deployment, remote provider apply, and fallback Cloudflare
domain mutations explicit and credential-scoped while using schema-owned
records for deploy and domain intent.

#### Scenario: First workspace deploy

- **WHEN** `formless deploy` runs with Cloudflare credentials available to the
  CLI or local workspace gateway
- **THEN** the deployment uses the instance runtime profile
- **AND** deploy metadata is verified after upload
- **AND** display-safe target and deploy intent are written to schema-owned
  control-plane record source, not `formless.json`
- **AND** first-deploy behavior is used only when no enabled deploy target
  exists in workspace record source
- **AND** display-safe Cloudflare target facts are copied to ignored
  `.formless/` deploy state when needed
- **AND** Cloudflare API tokens, Alchemy secrets, automation admin tokens, and
  owner setup tokens are stored only under ignored `.formless/` state
- **AND** saved workspace source is dry-run restored before remote data mutation
  is applied
- **AND** saved workspace source is pushed after deploy verification unless
  target identity or remote drift requires explicit acknowledgement

#### Scenario: Instance deploy

- **WHEN** `formless instance deploy` runs for a claimed instance workspace
- **THEN** the deployment uses the instance runtime profile
- **AND** deploy metadata is verified after upload

#### Scenario: Domain apply

- **WHEN** a domain apply command runs for enabled exact-host profile mapping
  records and Cloudflare credentials are available to the CLI, local gateway, or
  provider runner
- **THEN** preflight checks run before mutation
- **AND** browser clients, portable archives, record source, and workspace
  manifests do not receive Cloudflare API credentials

#### Scenario: Automation admin token

- **WHEN** `formless instance token adopt` or `rotate` runs for an instance
  workspace needing automation write access
- **THEN** ignored workspace secret state stores the automation admin token
- **AND** the reviewable workspace manifest and record source do not store the
  secret

### Requirement: Deployment-Aware Domain Runner CLI

The Site CLI SHALL keep existing instance domain runner commands while reporting
generic deployment protocol facts when the target supports them.

#### Scenario: Remote runner apply shows deployment attempt

- GIVEN a claimed instance workspace targets an instance with deployment runtime
  status
- WHEN `formless instance domains run-apply` starts an apply
- THEN CLI output includes the desired-state version, attempt id, target,
  resource counts, and writeback status
- AND the command uses runner-held provider credentials rather than browser,
  archive, or workspace manifest credentials

#### Scenario: Remote runner failure writes exact version

- GIVEN `formless instance domains run-apply` creates a deployment attempt
- WHEN provider apply fails before success writeback
- THEN the CLI writes failure details for the exact desired-state version
- AND the command exits with a failure after writeback is attempted

#### Scenario: Existing command surface remains stable

- GIVEN users run existing domain remote-plan, run-apply, run-delete,
  forget-route, forget-redirect, or mark-manually-removed commands
- WHEN those commands execute
- THEN the commands remain available with their existing credential boundary
- AND direct Cloudflare fallback plan/apply commands remain labeled fallback and
  explicit

### Requirement: Schema Control-Plane Protocol

The Site CLI SHALL use the instance protocol and local workspace operation layer
to query, write, save, and compare schema-owned `app-install`, `route`, and
deployment intent records.

#### Scenario: CLI reads deployment records

- **WHEN** CLI status, check, pull, push, plan, deploy, or domain workflows need
  instance control-plane state
- **THEN** they read allowed `app-install`, `route`, `deploy-target`,
  `provider-config-ref`, and `deploy-desired-resource` records through the
  instance control-plane protocol or workspace record source
- **AND** provider credentials remain in CLI, local gateway, or runner-held
  secret locations
- **AND** deployment attempt, evidence, drift, cleanup, and status summaries are
  read through deployment runtime or local gateway operation responses rather
  than control-plane record source

#### Scenario: CLI binds exact desired-state version

- **WHEN** `formless instance domains run-apply` or a deployment command starts
  against a schema-owned target
- **THEN** it binds deployment-runtime attempt and writeback calls to the exact
  desired-state version and idempotency key
- **AND** runner-held credentials remain outside browser, archive, record
  source, and workspace manifest responses

#### Scenario: CLI reads app routes

- **WHEN** an instance workspace needs installed app or public Site route state
- **THEN** the CLI reads `app-install` and `route` records
- **AND** route drift is reported by comparing route records rather than
  hand-derived install route strings or manifest route summaries

### Requirement: Compatible Domain Commands

The Site CLI SHALL keep existing domain command surfaces stable while domain
and redirect intent moves to `route` records.

#### Scenario: Existing command output

- **GIVEN** users run existing domain remote-plan, run-apply, run-delete,
  forget, manual cleanup, or direct fallback commands
- **WHEN** those commands execute
- **THEN** command names and credential boundaries remain stable
- **AND** output may include schema-owned route and deployment record ids when
  available

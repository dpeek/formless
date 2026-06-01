# Site CLI Publish Specification

## Purpose

Site CLI publish behavior lets a standalone Site project edit local Site records, save them back to source files, publish them to a Formless instance, move data through portable archives, and manage instance workspaces and custom-domain intent.

## Requirements

### Requirement: CLI Command Families

The package SHALL expose Site project, publish, archive, instance workspace,
domain, and token command families from the `formless` CLI.

#### Scenario: Site project commands

- GIVEN the package CLI is installed
- WHEN a user runs `formless init`, `formless dev`, `formless save`,
  `formless deploy setup`, or `formless publish`
- THEN the command operates on standalone Site project or publish state
- AND mutating remote publish requires explicit target and apply inputs

#### Scenario: Instance commands

- GIVEN a Formless instance workspace exists
- WHEN a user runs `formless instance status`, `pull`, `check`, `push`, `dev`,
  `reset-local`, or `deploy`
- THEN the command operates on the selected instance workspace
- AND workspace-local runtime state stays separate from remote instance state

### Requirement: Standalone Site Project

The system SHALL provide commands that create and run a standalone Site project with explicit project records and media roots.

#### Scenario: Project init

- GIVEN a target directory
- WHEN `formless init <dir>` runs
- THEN the project contains `formless.config.json` and `site.records.json`
- AND no starter media files or project media tree are written by default

#### Scenario: Project dev

- GIVEN a standalone Site project exists
- WHEN `formless dev` runs
- THEN the local public preview and `/admin` editor use the project identity and source files
- AND the Site project media root is the source for project media files

### Requirement: Save From Local Authority

The system SHALL save edited standalone Site records from local Authority state back to project source files instead of treating browser replica state as the source of truth.

#### Scenario: Save records

- GIVEN an author edits a standalone Site through local admin
- WHEN `formless save` runs
- THEN active Site records are written to the project source
- AND browser IndexedDB state is not used as the publish source of truth

#### Scenario: Save rejects legacy media

- GIVEN saved records contain legacy same-origin Site media hrefs
- WHEN the save workflow validates project source media
- THEN the workflow fails with a migration error
- AND it does not silently move legacy Site media files

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

### Requirement: Site Publish

The system SHALL publish source Site data only to an explicit target and require an apply flag for mutation.

#### Scenario: Dry-run by default

- GIVEN source Site records are valid
- WHEN `formless publish` or `bun run site:publish` runs without `--apply`
- THEN the workflow performs a dry-run
- AND no remote Site records or media are mutated

#### Scenario: Apply publish

- GIVEN a publish target and admin token are configured
- WHEN publish runs with `--apply`
- THEN live data is backed up before restore
- AND media is restored before records through a guarded snapshot restore

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

The system SHALL keep Site CLI save, publish, import, and archive behavior stable
while consuming Media contracts from public package subpaths.

#### Scenario: Archive workflows use Media contract

- GIVEN Site CLI publish, save, import, export, or restore workflows validate or
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

The system SHALL manage reviewable Formless instance workspaces whose manifests describe targets, archives, deploy settings, app policy, local state, and domain intent without storing secrets.

#### Scenario: Pull and check

- GIVEN an instance workspace targets a remote Formless instance
- WHEN `formless instance pull` runs and then `formless instance check` runs
- THEN target instance and app archives are written into the workspace
- AND check reports archive and desired-domain drift against the selected target

#### Scenario: Push apply

- GIVEN workspace archives are ready and target drift is acknowledged when needed
- WHEN `formless instance push --apply` runs
- THEN the workflow takes a fresh whole-instance backup
- AND dry-runs before applying the composed instance archive restore

### Requirement: Domain And Deploy Commands

The system SHALL keep deployment, remote provider apply, and fallback Cloudflare domain mutations explicit and credential-scoped.

#### Scenario: Instance deploy

- GIVEN a claimed instance workspace is configured
- WHEN `formless instance deploy` runs
- THEN the deployment uses the instance runtime profile
- AND deploy metadata is verified after upload

#### Scenario: Domain apply

- GIVEN workspace domain intent contains enabled exact-host profile mappings and Cloudflare credentials are available to the CLI or provider runner
- WHEN a domain apply command runs
- THEN preflight checks run before mutation
- AND browser clients, portable archives, and workspace manifests do not receive Cloudflare API credentials

#### Scenario: Automation admin token

- GIVEN an instance workspace needs automation write access
- WHEN `formless instance token adopt` or `rotate` runs
- THEN ignored workspace secret state stores the automation admin token
- AND the reviewable workspace manifest does not store the secret

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

The Site CLI SHALL use the instance protocol to query schema-owned app install,
route, and deployment records when the target supports them.

#### Scenario: CLI reads deployment records

- GIVEN a claimed instance workspace targets a runtime with schema-owned
  control-plane records
- WHEN CLI status, check, pull, push, plan, deploy, or domain workflows need
  instance control-plane state
- THEN they read allowed app install, route, domain, and deployment records
  through the instance control-plane protocol
- AND provider credentials remain in CLI or runner-held secret locations

#### Scenario: CLI binds exact desired-state version

- GIVEN `formless instance domains run-apply` or a deployment command starts
  against a schema-owned target
- WHEN the command reads desired deployment state
- THEN it binds existing deployment-runtime attempt and writeback calls to the
  exact desired-state version and idempotency key
- AND runner-held credentials remain outside browser, archive, and workspace
  manifest responses

#### Scenario: CLI reads app routes

- GIVEN an instance workspace needs installed app or public Site route state
- WHEN route state is available as schema-owned records
- THEN the CLI reads `appInstall` and `appRoute` records
- AND route drift is reported by comparing route records rather than
  hand-derived install route strings

### Requirement: Compatible Domain Commands

The Site CLI SHALL keep existing domain command surfaces stable while
deployment intent moves to schema-owned records.

#### Scenario: Existing command output

- GIVEN users run existing domain remote-plan, run-apply, run-delete, forget,
  manual cleanup, or direct fallback commands
- WHEN those commands execute
- THEN command names and credential boundaries remain stable
- AND output may include schema-owned deployment record ids when available

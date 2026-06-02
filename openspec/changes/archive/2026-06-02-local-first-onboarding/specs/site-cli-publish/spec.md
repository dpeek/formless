## ADDED Requirements

### Requirement: Local First Onboarding

The CLI SHALL initialize a local Formless workspace before any Cloudflare account or deployment mutation.

#### Scenario: Initialize local workspace

- GIVEN the current directory is empty enough to initialize
- WHEN a user runs `formless onboard`
- THEN the command writes a reviewable `formless.json` workspace manifest
- AND the manifest has no remote target, no declared apps, and `defaultAppPolicy: "none"`
- AND it creates empty reviewable archive roots without writing app archive source
- AND it ensures ignored `.formless/` state is available for local runtime caches and secrets
- AND it does not list Cloudflare accounts, deploy Cloudflare resources, create remote owner setup capability, open a remote setup URL, or write global instance state

#### Scenario: Explore locally after onboarding

- GIVEN a workspace was initialized by `formless onboard`
- WHEN a user runs `formless dev`
- THEN the product instance runtime starts with workspace-local persistence
- AND first-run local runtime state starts with no installed apps when no workspace archives exist
- AND the user can explore the instance before any Cloudflare deploy

#### Scenario: Install first app locally

- GIVEN a workspace initialized by `formless onboard` is running through `formless dev`
- WHEN the user installs a package app through the local web UI
- THEN the local Authority records the app install and initialized app state
- AND no Cloudflare resource is mutated

### Requirement: Workspace Save From Local Authority

The CLI SHALL save local workspace runtime state from Authority-backed instance state back to reviewable workspace source.

#### Scenario: Save local workspace state

- GIVEN a local Formless workspace is running through `formless dev`
- WHEN a user runs `formless save`
- THEN active installed app records, media payloads, and reviewable control-plane intent are written to deterministic workspace archives
- AND browser IndexedDB state is not used as the source of truth
- AND secrets are not written to `formless.json` or archive files

#### Scenario: Check workspace source

- GIVEN local Authority state differs from the reviewable workspace source
- WHEN a user runs `formless save --check`
- THEN the command fails and reports that workspace source must be refreshed
- AND it does not rewrite archive files

## MODIFIED Requirements

### Requirement: CLI Command Families

The package SHALL expose local workspace onboarding, workspace operation, archive, advanced instance, domain, and token command families from the `formless` CLI.

#### Scenario: Local workspace commands

- GIVEN the package CLI is installed
- WHEN a user runs `formless onboard`, `formless dev`, `formless save`, `formless check`, or `formless deploy`
- THEN the command operates on the local Formless workspace selected by `formless.json`
- AND `formless onboard`, `formless dev`, `formless save`, and `formless check` do not mutate Cloudflare resources
- AND `formless deploy` is the explicit Cloudflare deployment boundary

#### Scenario: Instance commands

- GIVEN a Formless workspace exists
- WHEN a user runs `formless instance status`, `pull`, `check`, `push`, `dev`, `reset-local`, or `deploy`
- THEN the command operates on the selected instance workspace
- AND workspace-local runtime state stays separate from remote instance state

### Requirement: Instance Workspace

The system SHALL manage reviewable Formless workspaces whose `formless.json` manifests describe targets, archives, deploy settings, app policy, local state, and domain intent without storing secrets.

#### Scenario: Pull and check

- GIVEN a Formless workspace targets a remote Formless instance
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

#### Scenario: First workspace deploy

- GIVEN a local Formless workspace has saved archive source and no remote target
- WHEN `formless deploy` runs with Cloudflare credentials available to the CLI
- THEN the deployment uses the instance runtime profile
- AND deploy metadata is verified after upload
- AND target and deploy intent are written to `formless.json`
- AND display-safe Cloudflare target facts are copied to ignored `.formless/` deploy state
- AND Cloudflare API tokens, Alchemy secrets, automation admin tokens, and owner setup tokens are stored only under ignored `.formless/` state
- AND saved workspace archives are dry-run restored before remote data mutation is applied
- AND saved workspace archives are pushed after deploy verification unless target identity or remote drift requires explicit acknowledgement

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

## REMOVED Requirements

### Requirement: Standalone Site Project

**Reason**: Local-first onboarding replaces the standalone single Site project as the default source format.
**Migration**: Use `formless onboard` to create a new Formless workspace, then install apps locally and save workspace archives. Legacy Site project import remains an explicit archive import operation if still supported.

### Requirement: Save From Local Authority

**Reason**: Saving now targets whole-workspace archive source instead of standalone Site record files.
**Migration**: Use `formless save` inside a workspace with `formless.json`; the command writes app archives and reviewable control-plane intent.

### Requirement: Site Publish

**Reason**: Workspace deployment replaces standalone Site publish.
**Migration**: Use `formless deploy` from a workspace to create or update the Cloudflare instance and push saved workspace archive source.

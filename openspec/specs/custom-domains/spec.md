# Custom Domains Specification

## Purpose

Custom domains bind exact hosts to Formless runtime profiles and manage provider
state through reviewable desired mappings, redirect intent, apply/delete jobs,
and cleanup evidence.

## Requirements

### Requirement: Desired Domain Mappings

The system SHALL store desired exact-host profile mappings as instance metadata.

#### Scenario: Create mapping

- GIVEN an authorized owner or admin creates a domain mapping
- WHEN the host and profile are valid
- THEN the host is normalized
- AND the mapping stores profile `instance`, `app`, or `publicSite`
- AND `app` and `publicSite` mappings require a target app install id

#### Scenario: Mapping uniqueness

- GIVEN a host already has an enabled profile mapping
- WHEN another enabled mapping for the same host would be created
- THEN the write is rejected
- AND one host cannot have more than one enabled profile mapping at a time

### Requirement: Mapping Reads And Route Policy

The system SHALL expose mapping reads publicly and apply enabled mappings before
ordinary host profile behavior.

#### Scenario: Public lookup

- GIVEN desired mappings exist
- WHEN mapping reads or enabled-host lookup runs
- THEN reads are public
- AND disabled desired mappings do not create mapped hosts

#### Scenario: Profile-specific target

- GIVEN an enabled mapping targets profile `publicSite`
- WHEN the mapped host receives public document requests
- THEN the target installed Site serves top-level public routes
- AND generated app and admin shell routes are blocked for that host

### Requirement: Applied Provider State

The system SHALL keep desired route state separate from current provider
evidence.

#### Scenario: Apply evidence

- GIVEN provider resources have been applied for a host/profile target
- WHEN apply evidence is recorded
- THEN current provider state is keyed by host, profile, and optional target
  install id
- AND audit events are append-only

#### Scenario: Disable desired route

- GIVEN a desired mapping has applied provider evidence
- WHEN the desired mapping is deleted
- THEN the desired row is disabled
- AND provider resources and audit events are not deleted by that route write

### Requirement: Provider Plan

The system SHALL plan provider changes from enabled mappings, redirects,
provider config facts, and applied provider state.

#### Scenario: Plan status

- GIVEN provider plan is requested
- WHEN config facts are available
- THEN the plan reports non-secret Worker job readiness
- AND runner mutation requirements are reported separately

#### Scenario: Provider credentials boundary

- GIVEN browser clients, portable archives, or workspace manifests consume
  domain state
- WHEN domain provider state is shown or exported
- THEN Cloudflare API credentials and Alchemy secret values are not included

### Requirement: Brokered Provider Jobs

The system SHALL mutate provider resources through reviewed apply and delete
jobs guarded by owner or admin writes.

#### Scenario: Apply job

- GIVEN an authorized request starts provider apply
- WHEN the job is created
- THEN the reviewed plan, status, result summary, and runner id are stored
- AND one instance apply lock serializes provider mutation

#### Scenario: Delete job

- GIVEN an authorized request starts provider delete
- WHEN recorded applied resources exist
- THEN the delete job targets recorded applied resources only
- AND successful delete removes current applied provider rows and appends
  `deleted` audit events

### Requirement: Redirect Intent

The system SHALL model provider redirects as desired control-plane state
separate from profile mappings.

#### Scenario: Redirect apply

- GIVEN redirect intent is enabled
- WHEN provider apply runs
- THEN the provider plan can create a redirect rule plus a proxied originless
  placeholder DNS record
- AND redirect intent does not target an app install

#### Scenario: Redirect disablement

- GIVEN redirect intent has applied provider evidence
- WHEN the redirect is disabled
- THEN provider resources are not deleted by disablement
- AND the disabled redirect remains visible until cleanup

### Requirement: Cleanup And Forget

The system SHALL make route cleanup and provider cleanup explicit.

#### Scenario: Forget unapplied desired state

- GIVEN a desired mapping or redirect intent is disabled and has no current
  provider evidence
- WHEN a forget command runs
- THEN the desired row is removed from normal reads
- AND cleanup audit state records the forgotten route or redirect

#### Scenario: Manual provider cleanup

- GIVEN a provider resource was removed out of band
- WHEN an authorized manual cleanup selects exact host, resource kind, and
  logical id
- THEN only current applied evidence is cleared
- AND a `manually-removed` audit event is appended

### Requirement: Domain CLI Workflows

The Site CLI SHALL expose remote-runner domain workflows and a direct
Cloudflare fallback.

#### Scenario: Remote runner apply

- GIVEN a claimed instance workspace has domain intent
- WHEN `formless instance domains run-apply` runs
- THEN the CLI creates a reviewed Worker-side apply job
- AND the Node runner mutates provider resources with runner-held credentials

#### Scenario: Direct fallback

- GIVEN direct Cloudflare credentials are available to the CLI
- WHEN `formless instance domains plan` or `apply` runs
- THEN the command is labeled fallback
- AND provider mutation requires an explicit apply command and preflight checks

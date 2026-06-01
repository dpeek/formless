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

### Requirement: Deployment Projection

The system SHALL project enabled custom-domain route and redirect intent into
the generic deployment runtime without changing custom-domain route semantics.

#### Scenario: Project enabled route mappings

- GIVEN enabled exact-host `instance`, `app`, or `publicSite` mappings exist
- WHEN deployment desired state is built for a target
- THEN enabled mappings are projected into deployment graph resources
- AND disabled mappings do not create desired provider resources

#### Scenario: Project redirect intent

- GIVEN enabled redirect intent exists
- WHEN deployment desired state is built for a target
- THEN enabled redirect intent is projected into redirect rule and redirect DNS
  graph resources
- AND disabled redirect intent does not create desired provider resources

### Requirement: Domain Provider Deployment Bridge

The system SHALL keep existing domain provider jobs compatible while recording
generic deployment attempt history.

#### Scenario: Apply job records deployment attempt

- GIVEN an authorized request starts an existing domain provider apply job
- WHEN the job is created
- THEN the runtime associates the job with a deployment attempt for the current
  desired-state version
- AND existing apply job responses continue to include the reviewed domain
  provider plan and job status

#### Scenario: Apply result records deployment evidence

- GIVEN an existing domain provider apply job has a deployment attempt link
- WHEN the job writes a successful result
- THEN custom-domain applied provider evidence and generic deployment resource
  evidence summaries are recorded
- AND current domain mapping route behavior remains unchanged

#### Scenario: Delete job remains explicit cleanup

- GIVEN an existing domain provider delete job removes recorded provider
  resources
- WHEN the job is created and completed
- THEN cleanup remains explicit and limited to selected recorded resources
- AND generic deployment attempt history records the cleanup result without
  deleting desired route intent

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

### Requirement: Domain Intent As Control-Plane Records

The system SHALL represent custom-domain mappings and redirect intent as
schema-owned control-plane records.

#### Scenario: Mapping record

- GIVEN an authorized owner or admin creates an exact-host mapping
- WHEN the mapping is accepted
- THEN the mapping is stored as a control-plane record with host, profile,
  optional target install id, optional target route id, enabled state, and
  timestamps
- AND route behavior matches existing custom-domain mapping semantics
- AND app and public Site mappings reference the target app install or app route
  record when available

#### Scenario: Redirect record

- GIVEN redirect intent is created or updated
- WHEN the redirect write is accepted
- THEN the redirect is stored as a control-plane record with source host,
  target, status code, path/query policy, enabled state, and timestamps
- AND provider resources are not mutated by the intent write

### Requirement: Custom-Domain Compatibility Surface

Existing custom-domain APIs SHALL remain compatible while reading and writing
schema-owned control-plane records.

#### Scenario: Existing API delegates to schema records

- GIVEN existing custom-domain mapping or redirect APIs are called during
  migration
- WHEN the API reads or writes domain intent
- THEN it reads or writes the corresponding control-plane records
- AND its response shape remains compatible for existing clients

#### Scenario: Cleanup evidence remains separate

- GIVEN provider cleanup, manual cleanup, or forget workflows run
- WHEN the workflow records its result
- THEN desired route records, provider evidence summaries, and cleanup history
  remain separate records or projections
- AND deleting desired route intent does not delete provider evidence unless an
  explicit cleanup action records that result

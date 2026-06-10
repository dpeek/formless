# Custom Domains Specification

## Purpose

Custom domains bind exact hosts to Formless runtime profiles and manage provider
state through reviewable desired routes, deployment reconciliation, provider
evidence, and repair cleanup evidence.

## Requirements

### Requirement: Desired Domain Mappings

The system SHALL store desired exact-host profile mappings as instance
`route` records.

#### Scenario: Create mapping

- **GIVEN** an authorized owner or admin creates a domain mapping through the
  compatibility API or route editor
- **WHEN** the host and profile are valid
- **THEN** the host is normalized
- **AND** an enabled mount `route` record stores the exact match host and
  target profile `instance`, `app`, or `public-site`
- **AND** `app` and `public-site` mappings require a target app install id

#### Scenario: Mapping uniqueness

- **GIVEN** a host already has an enabled profile mapping route
- **WHEN** another enabled mapping route for the same host would be created
- **THEN** the write is rejected
- **AND** one host cannot have more than one enabled profile mapping route at a
  time

### Requirement: Mapping Reads And Route Policy

The system SHALL expose mapping reads publicly and apply enabled exact-host
route records before ordinary host profile behavior.

#### Scenario: Public lookup

- **GIVEN** desired mapping routes exist
- **WHEN** mapping reads or enabled-host lookup runs
- **THEN** reads are public
- **AND** disabled desired routes do not create mapped hosts or desired
  provider resources

#### Scenario: Profile-specific target

- **GIVEN** an enabled mapping route targets profile `public-site`
- **WHEN** the mapped host receives public document requests
- **THEN** the target installed Site serves top-level public routes
- **AND** generated app and admin shell routes are blocked for that host

### Requirement: Provider Evidence

The system SHALL keep desired route state separate from deployment provider
evidence.

#### Scenario: Deployment evidence

- **GIVEN** provider resources have been applied for a host/profile target
- **WHEN** deployment evidence is recorded
- **THEN** current provider state is keyed by host, profile, optional target
  install id, and route-derived logical resource ids
- **AND** audit events are append-only

#### Scenario: Disable desired route

- **GIVEN** a desired route has applied provider evidence
- **WHEN** the desired route is disabled or deleted
- **THEN** the route write removes the route-derived resources from deployment
  desired state without directly mutating providers
- **AND** the next deploy reconciliation removes tracked provider resources
  from Alchemy or provider state
- **AND** audit events remain append-only

### Requirement: Provider Plan

The system SHALL plan provider changes from enabled routes, deployment config
facts, and applied provider state.

#### Scenario: Plan status

- **GIVEN** provider plan is requested
- **WHEN** config facts are available
- **THEN** the plan reports non-secret Worker job readiness
- **AND** runner mutation requirements are reported separately

#### Scenario: Provider credentials boundary

- **GIVEN** browser clients, portable archives, or workspace manifests consume
  domain state
- **WHEN** domain provider state is shown or exported
- **THEN** Cloudflare API credentials and Alchemy secret values are not
  included

### Requirement: Provider Cleanup Jobs

The system SHALL mutate recorded provider cleanup targets through reviewed
repair delete jobs guarded by owner or admin writes.

#### Scenario: Delete job targets recorded evidence

- **GIVEN** normal deploy reconciliation cannot remove a provider resource
  because tracked Alchemy state is missing, stale, manually changed, or
  out-of-band repair is required
- **AND** an authorized request starts provider delete
- **WHEN** recorded applied resources exist
- **THEN** the delete job targets recorded applied resources only
- **AND** successful delete removes current applied provider rows and appends
  `deleted` audit events

### Requirement: Redirect Intent

The system SHALL model provider redirects as desired route state.

#### Scenario: Redirect deployment projection

- **GIVEN** a redirect route is enabled
- **WHEN** deployment desired state is built for a target
- **THEN** the provider plan can create a redirect rule plus a proxied
  originless placeholder DNS record
- **AND** redirect routes do not require an app install target

#### Scenario: Redirect disablement

- **GIVEN** a redirect route has applied provider evidence
- **WHEN** the redirect route is disabled
- **THEN** redirect and redirect DNS resources are removed from deployment
  desired state
- **AND** the next deploy reconciliation removes tracked redirect provider
  resources from Alchemy or provider state
- **AND** repair cleanup remains available for recorded evidence that cannot be
  reconciled from tracked state

### Requirement: Deployment Projection

The system SHALL project enabled custom-domain mount routes and redirect routes
into the generic deployment runtime without changing custom-domain route
semantics.

#### Scenario: Project enabled route mappings

- **GIVEN** enabled exact-host `instance`, `app`, or `public-site` mount routes
  exist
- **WHEN** deployment desired state is built for a target
- **THEN** enabled mapping routes are projected into deployment graph resources
- **AND** disabled mapping routes do not create desired provider resources

#### Scenario: Project redirect intent

- **GIVEN** enabled redirect routes exist
- **WHEN** deployment desired state is built for a target
- **THEN** enabled redirect routes are projected into redirect rule and
  redirect DNS graph resources
- **AND** disabled redirect routes do not create desired provider resources

#### Scenario: Removed routes disappear from desired state

- **GIVEN** a custom-domain or redirect route was previously deployed
- **WHEN** that route is disabled or deleted
- **THEN** the next deployment desired state omits the route-derived provider
  resources
- **AND** normal deploy reconciliation, not the route write, removes the tracked
  provider resources

### Requirement: Provider Cleanup Deployment Bridge

The system SHALL record explicit provider repair cleanup in generic deployment
attempt history when a cleanup job removes recorded provider resources.

#### Scenario: Delete job remains explicit cleanup

- **GIVEN** a provider repair delete job removes recorded provider resources
- **WHEN** the job is created and completed
- **THEN** cleanup remains explicit, repair-scoped, and limited to selected
  recorded resources
- **AND** generic deployment attempt history records the cleanup result without
  deleting desired route intent

### Requirement: Cleanup And Forget

The system SHALL make route forgetting and provider repair cleanup explicit.

#### Scenario: Forget unapplied desired state

- **GIVEN** a desired route is disabled and has no current provider evidence
- **WHEN** a forget command runs
- **THEN** the desired route is removed from normal reads
- **AND** cleanup audit state records the forgotten route

#### Scenario: Manual provider cleanup

- **GIVEN** a provider resource was removed out of band
- **WHEN** an authorized manual cleanup selects exact host, resource kind, and
  logical id
- **THEN** only current applied evidence is cleared
- **AND** a `manually-removed` audit event is appended

### Requirement: Domain CLI Workflows

The system SHALL expose domain inspection and explicit provider repair cleanup
workflows while provider mutation for domain, DNS, and redirect projected
resources runs through generic deployment attempts.

#### Scenario: Domain resources deploy through workspace deploy

- **GIVEN** a claimed instance workspace has enabled route records that project
  DNS, custom-domain, or redirect resources
- **WHEN** `formless deploy` runs
- **THEN** the CLI or trusted deployer declares those resources in tracked
  Alchemy desired state through the generic deployment path
- **AND** deployment attempts, evidence, and status identify the applied
  resources
- **AND** route records remain desired intent rather than provider truth

#### Scenario: Route removal deploys deletion

- **GIVEN** tracked provider resources exist for a domain, DNS, or redirect
  route
- **AND** the route is disabled or deleted
- **WHEN** `formless deploy` runs
- **THEN** the CLI or trusted deployer omits those resources from tracked
  Alchemy desired state
- **AND** Alchemy removes the omitted tracked provider resources
- **AND** deployment evidence identifies the deleted resources

#### Scenario: Explicit cleanup remains for repair

- **GIVEN** recorded provider evidence exists for a domain, DNS, or redirect
  resource that cannot be reconciled through tracked Alchemy state
- **WHEN** an authorized explicit cleanup or delete workflow selects that
  recorded resource
- **THEN** cleanup is limited to the selected recorded provider resource or
  selected evidence row
- **AND** cleanup does not delete route intent or mutate app data

#### Scenario: Pure planning helper reuse

- **GIVEN** generic deployment, destroy, inspection, or explicit cleanup needs
  route-derived provider resource planning
- **WHEN** implementation reuses domain-provider planning helpers
- **THEN** those helpers remain pure projection or inspection code
- **AND** they do not mutate provider resources or define public mutation
  behavior

### Requirement: Domain Intent As Control-Plane Records

The system SHALL represent custom-domain mappings and redirects as
schema-owned `route` control-plane records.

#### Scenario: Mapping record

- **GIVEN** an authorized owner or admin creates an exact-host mapping
- **WHEN** the mapping is accepted
- **THEN** the mapping is stored as a `route` record with host, target profile,
  optional target install id, enabled state, and timestamps
- **AND** route behavior matches existing custom-domain mapping semantics
- **AND** app and public Site mappings reference the target app install record

#### Scenario: Redirect record

- **GIVEN** redirect intent is created or updated
- **WHEN** the redirect write is accepted
- **THEN** the redirect is stored as a `route` record with source host, target,
  status code, path/query policy, enabled state, and timestamps
- **AND** provider resources are not mutated by the intent write

### Requirement: Custom-Domain Compatibility Surface

Existing custom-domain APIs SHALL remain compatible while reading and writing
schema-owned route records.

#### Scenario: Existing API delegates to schema records

- **GIVEN** existing custom-domain mapping or redirect APIs are called during
  migration
- **WHEN** the API reads or writes domain intent
- **THEN** it reads or writes corresponding `route` records
- **AND** its response shape remains compatible for existing clients

#### Scenario: Cleanup evidence remains separate

- **GIVEN** provider cleanup, manual cleanup, or forget workflows run
- **WHEN** the workflow records its result
- **THEN** desired route records, provider evidence summaries, and cleanup
  history remain separate records or projections

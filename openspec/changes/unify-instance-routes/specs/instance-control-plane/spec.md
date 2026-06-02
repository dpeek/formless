## ADDED Requirements

### Requirement: Route Records

The system SHALL represent all desired route behavior as `route` control-plane
records.

#### Scenario: Route record shape

- **GIVEN** the instance control-plane schema is loaded
- **WHEN** the `route` entity is inspected
- **THEN** each route record can store enabled state, optional match host,
  match path, optional match prefix, kind, optional target profile, optional app
  install reference, optional surface, optional provider config reference,
  redirect target fields, redirect policy fields, created time, and updated
  time
- **AND** route records remain flat schema records

#### Scenario: Mount route

- **GIVEN** an owner or admin creates a mount route
- **WHEN** the route is accepted
- **THEN** `kind` is `mount`
- **AND** app and public Site mounts reference an `app-install` record
- **AND** the route records the selected target profile and surface without
  duplicating installed app data or storage state

#### Scenario: Redirect route

- **GIVEN** an owner or admin creates a redirect route
- **WHEN** the route is accepted
- **THEN** `kind` is `redirect`
- **AND** the route stores the source match, target host or URL, status code,
  preserve-path policy, and preserve-query-string policy
- **AND** the route does not require an app install target

#### Scenario: Desired route write

- **GIVEN** an owner or admin writes route intent
- **WHEN** the write commits
- **THEN** the write stores desired route state only
- **AND** no installed app data, provider resource, runtime secret, provider
  evidence, cleanup history, deployment attempt, or drift report is mutated by
  the route write itself

## MODIFIED Requirements

### Requirement: Schema-Owned Instance Control Plane

The system SHALL model instance management data as schema-owned control-plane
records.

#### Scenario: Control-plane records

- **GIVEN** the instance control-plane schema is loaded
- **WHEN** its storage identity is selected
- **THEN** it uses schema key `instance-control-plane`, storage identity
  `instance:control-plane`, and API prefix `/api/formless/control-plane`
- **AND** it defines flat records for app installs, routes, deploy targets,
  provider config references, desired resources, deployment attempts, evidence
  summaries, and drift reports
- **AND** desired app route, exact-host domain mapping, and redirect behavior is
  represented by `route` records
- **AND** relationships between those records are represented through normal
  reference fields

#### Scenario: User intent write

- **GIVEN** an owner or admin writes app install, route, domain, redirect, or
  deployment configuration
- **WHEN** the write is accepted
- **THEN** the write commits schema records through Authority validation
- **AND** no installed app data, provider resource, runtime secret, provider
  evidence, cleanup history, deployment attempt, or drift report is mutated by
  the configuration record write itself

### Requirement: Deployment Projection Boundary

The system SHALL build deployment runtime desired-state versions from
schema-owned control-plane intent records.

#### Scenario: Project desired state

- **GIVEN** desired deployment state is read for a supported target
- **WHEN** schema-owned control-plane records are available for that target
- **THEN** the resource graph is projected from the current control-plane
  records
- **AND** enabled `route` records provide app mount, custom-domain, DNS, and
  redirect desired route resources
- **AND** the desired-state hash is computed from canonical projected content

#### Scenario: Projection omits operational secrets

- **GIVEN** control-plane records are projected into desired state
- **WHEN** the projection is returned to clients or deployers
- **THEN** provider API tokens, Alchemy passwords, Alchemy state tokens, raw
  lease tokens, and runtime secrets are omitted
- **AND** display-safe secret references may be included when needed

## REMOVED Requirements

### Requirement: App Route Records

**Reason**: Separate app route records are replaced by the unified `route`
control-plane entity so app mounts, public Site routes, exact-host mappings,
and redirects share one desired-state source.

**Migration**: Existing app route records are backfilled to `route` records with
hostless mount matches that reference the same app install and preserve the
same admin, schema, public Site, path, prefix, enabled, created, and updated
facts.

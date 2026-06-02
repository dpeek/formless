## MODIFIED Requirements

### Requirement: Schema-Owned Instance Control Plane

The system SHALL model instance management data as schema-owned control-plane
records.

#### Scenario: Control-plane records

- GIVEN the instance control-plane schema is loaded
- WHEN its storage identity is selected
- THEN it uses schema key `instance-control-plane`, storage identity
  `instance:control-plane`, and API prefix `/api/formless/control-plane`
- AND its external qualified entity namespace is `instance`
- AND it defines flat records for app installs, app routes, deploy targets,
  provider config references, domain mappings, redirect intent, desired
  resources, deployment attempts, evidence summaries, and drift reports
- AND those records use local entity keys `app-install`, `app-route`,
  `deploy-target`, `provider-config-ref`, `domain-mapping`,
  `redirect-intent`, `deploy-desired-resource`, `deploy-attempt`,
  `deploy-evidence-summary`, and `deploy-drift-report`
- AND external boundaries identify those records with qualified entity names
  such as `instance:app-install` and `instance:deploy-target`
- AND relationships between those records are represented through normal
  reference fields

#### Scenario: User intent write

- GIVEN an owner or admin writes app install, route, domain, or deployment
  configuration
- WHEN the write is accepted
- THEN the write commits schema records through Authority validation
- AND no installed app data, provider resource, or runtime secret is mutated by
  the configuration record write itself

### Requirement: App Install Records

The system SHALL represent installed app metadata as `app-install`
control-plane records.

#### Scenario: App install identity record

- GIVEN an app install is created
- WHEN the control-plane write commits
- THEN the `app-install` record stores stable install identity, package app key,
  label, status, created time, and updated time
- AND install identity, package app key, and storage identity are immutable
  after creation
- AND the record stores display-safe storage identity such as `app:<installId>`
  without embedding installed app records

#### Scenario: Installed app data boundary

- GIVEN an `app-install` record exists
- WHEN installed app records, active schema, changes, action executions,
  snapshots, or sync state are read or written
- THEN those facts remain in that install's app storage identity
- AND the `app-install` record does not contain the installed app's data records

### Requirement: App Route Records

The system SHALL represent app route bindings as `app-route` control-plane
records that reference `app-install` records.

#### Scenario: Default route records

- GIVEN a package app install is created
- WHEN default routes are materialized
- THEN admin and schema route records are created for the `app-install` record
- AND a public Site route record is created only when the package supports
  public Site routes
- AND each route record stores route kind, path, optional prefix, surface,
  package capability, enabled state, created time, and updated time

#### Scenario: Route targets app install

- GIVEN route resolution, custom-domain mapping, deployment projection, archive
  export, or generated UI needs an installed app target
- WHEN it resolves the target
- THEN it uses an `app-route` record that references the `app-install` record
- AND the route does not duplicate installed app data or storage state

#### Scenario: Route validation

- GIVEN an owner or admin creates or edits an app route record
- WHEN the route path or prefix is validated
- THEN validation checks runtime topology, reserved paths, route kind, package
  capability, and enabled-route uniqueness
- AND invalid route records are rejected before route behavior changes

## ADDED Requirements

### Requirement: Schema-Owned App Install Registry

The system SHALL represent app install registry state as schema-owned instance
control-plane records.

#### Scenario: Install record creation

- **WHEN** an authorized owner or admin creates a package app install
- **THEN** the runtime creates an `appInstall` control-plane record with stable
  install identity, package app key, label, status, created time, and updated
  time
- **AND** the install is initialized from the package source schema and source
  seed records in the install-scoped app storage identity

#### Scenario: Immutable install identity

- **WHEN** an existing `appInstall` record is edited
- **THEN** label and supported display metadata can change
- **AND** install identity, package app key, and install-scoped storage identity
  cannot be patched

### Requirement: Schema-Owned App Routes

The system SHALL represent app admin, schema, and public Site routes as
schema-owned route records that target app install records.

#### Scenario: Site install route records

- **WHEN** a Site app install with install id `personal` is created
- **THEN** route records target the `personal` app install for admin route
  `/apps/personal`, schema route `/apps/personal/schema`, public route
  `/sites/personal`, and public route prefix `/sites/personal/`
- **AND** Site public route metadata is scoped to that app install record

#### Scenario: Non-Site install route records

- **WHEN** a Tasks or Estii app install is created
- **THEN** route records target the app install for admin and schema routes under
  `/apps/<installId>`
- **AND** no public Site route record is created for that install

#### Scenario: Route record target

- **WHEN** app routing, custom-domain targets, deployment graphs, archive export,
  or generated UI need to identify an app route
- **THEN** they reference an `appRoute` record that references an `appInstall`
  record
- **AND** the install id remains the storage identity for installed app data

### Requirement: App Install Compatibility

Existing app install API responses SHALL remain compatible while app installs
and routes are backed by control-plane records.

#### Scenario: Existing registry read

- **WHEN** `/api/formless/app-installs` is read during or after migration
- **THEN** the response includes the same app install metadata and route fields
  expected by existing clients
- **AND** the response is derived from schema-owned app install and route
  records when those records are available

#### Scenario: Existing create install request

- **WHEN** the existing create app install API is called
- **THEN** it creates schema-owned app install and route records
- **AND** unsupported packages, invalid install ids, duplicate install ids, and
  invalid labels are rejected before installed app storage is initialized

## MODIFIED Requirements

### Requirement: Schema-Owned App Install Registry

The system SHALL represent app install registry state as schema-owned instance
control-plane records.

#### Scenario: Install record creation

- GIVEN an authorized owner or admin creates a package app install
- WHEN the runtime accepts the install
- THEN it creates an `app-install` control-plane record with stable install
  identity, package app key, label, status, created time, and updated time
- AND the install is initialized from the package source schema and source seed
  records in the install-scoped app storage identity

#### Scenario: Immutable install identity

- GIVEN an existing `app-install` record is edited
- WHEN a patch is submitted
- THEN label and supported display metadata can change
- AND install identity, package app key, and install-scoped storage identity
  cannot be patched

### Requirement: Schema-Owned App Routes

The system SHALL represent app admin, schema, and public Site routes as
schema-owned route records that target app install records.

#### Scenario: Site install route records

- GIVEN a Site app install with install id `personal` is created
- WHEN default route records are created
- THEN route records target the `personal` app install for admin route
  `/apps/personal`, schema route `/apps/personal/schema`, public route
  `/sites/personal`, and public route prefix `/sites/personal/`
- AND Site public route metadata is scoped to that app install record

#### Scenario: Non-Site install route records

- GIVEN a Tasks or Estii app install is created
- WHEN default route records are created
- THEN route records target the app install for admin and schema routes under
  `/apps/<installId>`
- AND no public Site route record is created for that install

#### Scenario: Route record target

- GIVEN app routing, custom-domain targets, deployment graphs, archive export,
  or generated UI need to identify an app route
- WHEN a route target is selected
- THEN they reference an `app-route` record that references an `app-install`
  record
- AND the install id remains the storage identity for installed app data

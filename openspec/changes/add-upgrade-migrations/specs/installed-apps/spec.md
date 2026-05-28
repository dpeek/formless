## ADDED Requirements

### Requirement: Installed Package Revision
The system SHALL track package app revision and source schema hash for each
installed package app without changing install identity.

#### Scenario: Create install with package facts
- **WHEN** a bundled package app install is created
- **THEN** install metadata records the package app key, install id, package
  revision, and source schema hash used for initialization
- **AND** admin, schema, API, Authority, browser replica, and broadcast identity
  remain derived from the stable install id

#### Scenario: Upgrade installed package facts
- **WHEN** a package app migration completes for an installed app
- **THEN** the installed app metadata records the new package revision and
  source schema hash
- **AND** the install id and package app key remain immutable

### Requirement: Package Revision Drift
The system SHALL report installed package app revision drift to CLI upgrade
planning.

#### Scenario: Installed app behind bundled package
- **WHEN** a CLI reads app install metadata and local bundled package metadata
- **THEN** it can identify installed apps whose package revision or schema hash
  differs from the local package facts
- **AND** it can include required package app migrations in the upgrade plan

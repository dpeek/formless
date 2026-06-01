## ADDED Requirements

### Requirement: Schema-Owned App Route Resolution

The system SHALL resolve installed app browser routes and installed Site public
routes from enabled schema-owned app route records.

#### Scenario: Installed app browser route

- **WHEN** a browser requests an enabled admin or schema app route
- **THEN** runtime topology resolves the route record to its referenced
  `appInstall` record
- **AND** the selected installed app mounts with that app install identity

#### Scenario: Installed Site public route

- **WHEN** a browser requests an enabled public Site route
- **THEN** runtime topology resolves the route record to its referenced Site
  `appInstall` record
- **AND** public Site reads use the matching install-scoped app storage identity

#### Scenario: Disabled or conflicting route

- **WHEN** an app route record is disabled or conflicts with a reserved or
  already-enabled route
- **THEN** the route is not eligible for runtime mounting
- **AND** route validation prevents the conflict from becoming active

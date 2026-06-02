## MODIFIED Requirements

### Requirement: Schema-Owned App Route Resolution

The system SHALL resolve installed app browser routes and installed Site public
routes from enabled schema-owned app route records.

#### Scenario: Installed app browser route

- GIVEN a browser requests an enabled admin or schema app route
- WHEN runtime topology resolves the route
- THEN the route record resolves to its referenced `app-install` record
- AND the selected installed app mounts with that app install identity

#### Scenario: Installed Site public route

- GIVEN a browser requests an enabled public Site route
- WHEN runtime topology resolves the route
- THEN the route record resolves to its referenced Site `app-install` record
- AND public Site reads use the matching install-scoped app storage identity

#### Scenario: Disabled or conflicting route

- GIVEN an app route record is disabled or conflicts with a reserved or
  already-enabled route
- WHEN runtime topology selects mountable routes
- THEN the route is not eligible for runtime mounting
- AND route validation prevents the conflict from becoming active

## ADDED Requirements

### Requirement: Workspace App Installs From Records

The system SHALL derive workspace app install intent from schema-owned
`app-install` records rather than `formless.json` app declarations.

#### Scenario: Compose install from workspace source

- **WHEN** local dev, push, deploy, or archive restore composes installed app
  registry state from workspace source
- **THEN** each installed app comes from an `app-install` control-plane record
  and its matching app archive
- **AND** `formless.json` app declarations, labels, package app keys, and route
  summaries are not read as install source

#### Scenario: Missing app archive

- **WHEN** workspace source contains an active `app-install` record without the
  app archive needed for restore or push
- **THEN** the operation reports the missing archive before mutation
- **AND** target app install registry state is not changed

### Requirement: Browser-Created App Install Source

The system SHALL let browser onboarding create app install source through the
same install records used by CLI and archive workflows.

#### Scenario: Browser creates install

- **WHEN** a browser owner or admin creates a package app install during local
  onboarding
- **THEN** the runtime creates `app-install` and default `app-route` records in
  the instance control-plane identity
- **AND** the installed app storage identity is initialized from the package
  source schema and source seed records
- **AND** the next workspace save writes the install records and app archive to
  reviewable workspace source

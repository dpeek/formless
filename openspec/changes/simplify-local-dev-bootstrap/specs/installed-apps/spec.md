## ADDED Requirements

### Requirement: Blank Instances Stay App-Less

The system SHALL keep blank instances app-less until an authorized package app
install request succeeds.

#### Scenario: Blank local dev bootstrap

- **GIVEN** a local workspace runtime has no installed app metadata
- **WHEN** local dev owner session bootstrap succeeds
- **THEN** no app install metadata is created
- **AND** no route records are created
- **AND** the authenticated browser can create the first app through the normal
  package app install flow

## MODIFIED Requirements

### Requirement: Launch Fixtures

The system SHALL allow supported launch fixtures to select deterministic initial
installed app state without changing route shape.

#### Scenario: Empty fixture

- **GIVEN** `FORMLESS_LAUNCH_FIXTURE` selects `empty`
- **WHEN** fixture initialization runs
- **THEN** the product instance starts with no app installs

#### Scenario: Default Site fixture removed

- **GIVEN** `FORMLESS_LAUNCH_FIXTURE` selects `default-site`
- **WHEN** fixture initialization runs
- **THEN** fixture initialization is rejected
- **AND** no default Site install is created

#### Scenario: Multi-site fixture

- **GIVEN** `FORMLESS_LAUNCH_FIXTURE` selects `multi-site`
- **WHEN** fixture initialization runs
- **THEN** the initial install ids are `site`, `docs`, and `projects`
- **AND** each install uses Site source seed records and `/apps/<installId>` plus `/sites/<installId>` routes

#### Scenario: Mixed app fixture

- **GIVEN** `FORMLESS_LAUNCH_FIXTURE` selects `mixed-apps`
- **WHEN** fixture initialization runs
- **THEN** the initial installs are Site, Tasks, and Estii
- **AND** only the Site install receives Site public route metadata

#### Scenario: CRM fixture

- **GIVEN** `FORMLESS_LAUNCH_FIXTURE` selects `crm`
- **WHEN** fixture initialization runs
- **THEN** the initial install includes CRM with install id `crm`, label `CRM`, and package app key `crm`
- **AND** the CRM install receives admin and schema routes under `/apps/crm`
- **AND** the CRM install does not receive Site public route metadata

## REMOVED Requirements

### Requirement: Default Product Site Install

**Reason**: App installation should be explicit and use the normal package app
install flow. Owner/session bootstrap must not create app install metadata or
route records as a side effect.

**Migration**: Tests, fixtures, and onboarding flows that require a Site app
must create it through the authorized package app install action.

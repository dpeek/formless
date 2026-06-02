## MODIFIED Requirements

### Requirement: Bundled Package Apps

The system MUST expose bundled Site, Tasks, Estii, and CRM packages as installable package apps.

#### Scenario: Package metadata

- **GIVEN** the instance app install registry is read
- **WHEN** bundled packages are listed
- **THEN** Site, Tasks, Estii, and CRM packages are returned with package app keys `site`, `tasks`, `estii`, and `crm`
- **AND** each package declares its default install id, label, source schema key, seed records key, and admin route base

#### Scenario: Unsupported package

- **GIVEN** a create app install request names an unsupported package app key
- **WHEN** the request is processed
- **THEN** the request is rejected
- **AND** no app install metadata or initial app data is committed

### Requirement: Package Source Initialization

The system MUST initialize a created package app install from that package's source schema and source seed records.

#### Scenario: Tasks initialization

- **GIVEN** a Tasks app install is created with install id `tasks`
- **WHEN** `/api/app-installs/tasks/tasks/bootstrap` is read
- **THEN** the bootstrap response contains the bundled Tasks source schema and source seed records
- **AND** the bootstrap cursor reflects the seeded records

#### Scenario: Estii initialization

- **GIVEN** an Estii app install is created with install id `rates`
- **WHEN** `/api/app-installs/estii/rates/bootstrap` is read
- **THEN** the bootstrap response contains the bundled Estii source schema and source seed records
- **AND** the install metadata keeps label and route identity scoped to `rates`

#### Scenario: CRM initialization

- **GIVEN** a CRM app install is created with install id `crm`
- **WHEN** `/api/app-installs/crm/crm/bootstrap` is read
- **THEN** the bootstrap response contains the bundled CRM source schema and source seed records
- **AND** the install metadata keeps label and route identity scoped to `crm`

### Requirement: Launch Fixtures

The system SHALL allow launch fixtures to select deterministic initial installed app state without changing route shape.

#### Scenario: Empty fixture

- **GIVEN** `FORMLESS_LAUNCH_FIXTURE` selects `empty`
- **WHEN** fixture initialization runs
- **THEN** the product instance starts with no app installs

#### Scenario: Default Site fixture

- **GIVEN** `FORMLESS_LAUNCH_FIXTURE` selects `default-site`
- **WHEN** fixture initialization runs
- **THEN** the initial app install plan contains only the default Site install seeded from Site source records

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

# Installed Apps Specification

## Purpose

Installed apps define the product instance app shape: stable app install identity, package-backed initialization, install-scoped routes, and install-scoped storage/API behavior. They let one Formless instance host multiple Site, Tasks, Estii, CRM, and ClearTrace installs without mixing app data, browser replicas, public Site routes, or source schema-key storage.

## Requirements

### Requirement: App Install Identity

The system SHALL treat an app install id as the stable instance-local identity for one app install.

#### Scenario: Valid install id

- GIVEN a create app install request uses an install id such as `site`, `tasks`, `docs-site`, or `project-site-2026`
- WHEN the install id is route-safe and unique within the Formless instance
- THEN the app install can be created
- AND the app install id is used in admin, schema, API, Authority, browser replica, and broadcast identity

#### Scenario: Invalid or duplicate install id

- GIVEN an install id is empty, too short, uppercase, slash-containing, double-hyphenated, reserved, too long, or already installed
- WHEN a create app install request uses that install id
- THEN the request is rejected
- AND existing app install registry state is not mutated

### Requirement: Bundled Package Apps

The system MUST expose bundled Site, Tasks, Estii, CRM, and ClearTrace packages as installable package apps.

#### Scenario: Package metadata

- **GIVEN** the instance app install registry is read
- **WHEN** bundled packages are listed
- **THEN** Site, Tasks, Estii, CRM, and ClearTrace packages are returned with package app keys `site`, `tasks`, `estii`, `crm`, and `cleartrace`
- **AND** each package declares its default install id, label, source schema key, seed records key, and admin route base

#### Scenario: Unsupported package

- **GIVEN** a create app install request names an unsupported package app key
- **WHEN** the request is processed
- **THEN** the request is rejected
- **AND** no app install metadata or initial app data is committed

### Requirement: Flat App Install Metadata

The system SHALL store app installs as flat instance metadata that binds install
id, package app key, label, and status while route behavior is stored in
instance `route` records.

#### Scenario: Site install routes

- **GIVEN** a Site app install with install id `personal` and label
  `Personal Site`
- **WHEN** the install is created
- **THEN** its app install metadata stores package app key `site`, label
  `Personal Site`, and status `installed`
- **AND** route records target the install for admin route `/apps/personal`,
  schema route `/apps/personal/schema`, public route `/sites/personal`, and
  public route prefix `/sites/personal/`
- **AND** compatibility metadata can include those route summaries derived from
  route records

#### Scenario: Non-Site install routes

- **GIVEN** a Tasks, Estii, CRM, or ClearTrace app install is created
- **WHEN** install metadata is returned
- **THEN** the app install metadata stores package app key, label, and status
- **AND** route records target the install for admin and schema routes under
  `/apps/<installId>`
- **AND** no public Site route record is created for that install

### Requirement: Installed Package Revision

The system SHALL track package app revision and source schema hash for each
installed package app without changing install identity.

#### Scenario: Create install with package facts

- WHEN a bundled package app install is created
- THEN install metadata records the package app key, install id, package
  revision, and source schema hash used for initialization
- AND admin, schema, API, Authority, browser replica, and broadcast identity
  remain derived from the stable install id

#### Scenario: Upgrade installed package facts

- WHEN a package app migration completes for an installed app
- THEN the installed app metadata records the new package revision and source
  schema hash
- AND the install id and package app key remain immutable

### Requirement: Package Revision Drift

The system SHALL report installed package app revision drift to CLI upgrade
planning.

#### Scenario: Installed app behind bundled package

- WHEN a CLI reads app install metadata and local bundled package metadata
- THEN it can identify installed apps whose package revision or schema hash
  differs from the local package facts
- AND it can include required package app migrations in the upgrade plan

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

#### Scenario: ClearTrace initialization

- **GIVEN** a ClearTrace app install is created with install id `cleartrace`
- **WHEN** `/api/app-installs/cleartrace/cleartrace/bootstrap` is read
- **THEN** the bootstrap response contains the bundled ClearTrace source schema and source seed records
- **AND** the install metadata keeps label and route identity scoped to `cleartrace`

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

### Requirement: Install-Scoped Storage And API

The system MUST keep installed app storage, APIs, browser replicas, broadcast channels, and public Site reads scoped by app install identity.

#### Scenario: Installed app storage identity

- GIVEN an installed Site with install id `personal`
- WHEN the app storage identity is selected
- THEN the API prefix is `/api/app-installs/site/personal`, the Authority name is `app:personal`, and browser database and broadcast channel names use `formless:app:personal`
- AND those names are distinct from schema-key Site storage and from other installed Sites
- AND the storage identity does not expose a Site-owned media scope

#### Scenario: Installed app API routes

- GIVEN an installed app API prefix `/api/app-installs/:packageAppKey/:installId`
- WHEN app data is read, synced, reset, snapshotted, restored, mutated, or acted on
- THEN operations use that install-scoped prefix
- AND Site public tree reads use `/api/app-installs/site/:installId/tree/:slug` for installed Sites

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
schema-owned `route` records that target app install records.

#### Scenario: Site install route records

- **GIVEN** a Site app install with install id `personal` is created
- **WHEN** default route records are created
- **THEN** route records target the `personal` app install for admin route
  `/apps/personal`, schema route `/apps/personal/schema`, public route
  `/sites/personal`, and public route prefix `/sites/personal/`
- **AND** Site public route metadata is scoped to that app install record

#### Scenario: Non-Site install route records

- **GIVEN** a Tasks, Estii, CRM, or ClearTrace app install is created
- **WHEN** default route records are created
- **THEN** route records target the app install for admin and schema routes
  under `/apps/<installId>`
- **AND** no public Site route record is created for that install

#### Scenario: Route record target

- **GIVEN** app routing, custom-domain targets, deployment graphs, archive
  export, or generated UI need to identify an app route
- **WHEN** a route target is selected
- **THEN** they reference a `route` record that uses `appInstall` to reference
  an `app-install` record
- **AND** the install id remains the storage identity for installed app data

### Requirement: App Install Compatibility

Existing app install API responses SHALL remain compatible while app installs
and routes are backed by control-plane records.

#### Scenario: Existing registry read

- **GIVEN** `/api/formless/app-installs` is read during or after migration
- **WHEN** control-plane install and route records are available
- **THEN** the response includes the same app install metadata and route fields
  expected by existing clients
- **AND** the response is derived from schema-owned app install and route
  records

#### Scenario: Existing create install request

- **GIVEN** the existing create app install API is called
- **WHEN** the request is valid
- **THEN** it creates schema-owned app install and route records
- **AND** unsupported packages, invalid install ids, duplicate install ids,
  invalid labels, and invalid default route records are rejected before
  installed app storage is initialized

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
- **THEN** the runtime creates `app-install` and default `route` records in the
  instance control-plane identity
- **AND** the installed app storage identity is initialized from the package
  source schema and source seed records
- **AND** the next workspace save writes the install records and app archive to
  reviewable workspace source

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

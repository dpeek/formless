# Installed Apps Specification

## Purpose

Installed apps define the product instance app shape: stable app install identity, package-backed initialization, install-scoped routes, and install-scoped storage/API behavior. They let one Formless instance host multiple Site, Tasks, and Estii installs without mixing app data, browser replicas, public Site routes, or source schema-key storage.

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

The system MUST expose bundled Site, Tasks, and Estii packages as installable package apps.

#### Scenario: Package metadata

- GIVEN the instance app install registry is read
- WHEN bundled packages are listed
- THEN Site, Tasks, and Estii packages are returned with package app keys `site`, `tasks`, and `estii`
- AND each package declares its default install id, label, source schema key, seed records key, and admin route base

#### Scenario: Unsupported package

- GIVEN a create app install request names an unsupported package app key
- WHEN the request is processed
- THEN the request is rejected
- AND no app install metadata or initial app data is committed

### Requirement: Flat App Install Metadata

The system SHALL store app installs as flat instance metadata that binds install id, package app key, label, status, and routes.

#### Scenario: Site install routes

- GIVEN a Site app install with install id `personal` and label `Personal Site`
- WHEN the install is created
- THEN its metadata includes admin route `/apps/personal`, schema route `/apps/personal/schema`, public route `/sites/personal`, public route prefix `/sites/personal/`, package app key `site`, label `Personal Site`, and status `installed`
- AND Site public route metadata is scoped to that install id

#### Scenario: Non-Site install routes

- GIVEN a Tasks or Estii app install is created
- WHEN install metadata is returned
- THEN it includes admin and schema routes under `/apps/<installId>`
- AND it does not include Site public route metadata

### Requirement: Package Source Initialization

The system MUST initialize a created package app install from that package's source schema and source seed records.

#### Scenario: Tasks initialization

- GIVEN a Tasks app install is created with install id `tasks`
- WHEN `/api/app-installs/tasks/tasks/bootstrap` is read
- THEN the bootstrap response contains the bundled Tasks source schema and source seed records
- AND the bootstrap cursor reflects the seeded records

#### Scenario: Estii initialization

- GIVEN an Estii app install is created with install id `rates`
- WHEN `/api/app-installs/estii/rates/bootstrap` is read
- THEN the bootstrap response contains the bundled Estii source schema and source seed records
- AND the install metadata keeps label and route identity scoped to `rates`

### Requirement: Default Product Site Install

The system SHALL create the default product Site install during blank owner setup when no installed app metadata exists.

#### Scenario: Blank owner setup

- GIVEN owner setup completes for a product instance with no installed app metadata
- WHEN the starter app bootstrap policy runs
- THEN a Site app install with install id `site`, label `Site`, package app key `site`, admin route `/apps/site`, and public route `/sites/site` exists
- AND the owner session is established independently from the app install metadata

#### Scenario: Existing installs suppress starter Site

- GIVEN installed app metadata already exists in the Formless instance
- WHEN owner setup completes
- THEN the starter `site` install is not added
- AND existing app installs keep their labels, install ids, and public route metadata

### Requirement: Launch Fixtures

The system SHALL allow launch fixtures to select deterministic initial installed app state without changing route shape.

#### Scenario: Empty fixture

- GIVEN `FORMLESS_LAUNCH_FIXTURE` selects `empty`
- WHEN fixture initialization runs
- THEN the product instance starts with no app installs

#### Scenario: Default Site fixture

- GIVEN `FORMLESS_LAUNCH_FIXTURE` selects `default-site`
- WHEN fixture initialization runs
- THEN the initial app install plan contains only the default Site install seeded from Site source records

#### Scenario: Multi-site fixture

- GIVEN `FORMLESS_LAUNCH_FIXTURE` selects `multi-site`
- WHEN fixture initialization runs
- THEN the initial install ids are `site`, `docs`, and `projects`
- AND each install uses Site source seed records and `/apps/<installId>` plus `/sites/<installId>` routes

#### Scenario: Mixed app fixture

- GIVEN `FORMLESS_LAUNCH_FIXTURE` selects `mixed-apps`
- WHEN fixture initialization runs
- THEN the initial installs are Site, Tasks, and Estii
- AND only the Site install receives Site public route metadata

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
- THEN it creates an `appInstall` control-plane record with stable install
  identity, package app key, label, status, created time, and updated time
- AND the install is initialized from the package source schema and source seed
  records in the install-scoped app storage identity

#### Scenario: Immutable install identity

- GIVEN an existing `appInstall` record is edited
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
- THEN they reference an `appRoute` record that references an `appInstall`
  record
- AND the install id remains the storage identity for installed app data

### Requirement: App Install Compatibility

Existing app install API responses SHALL remain compatible while app installs
and routes are backed by control-plane records.

#### Scenario: Existing registry read

- GIVEN `/api/formless/app-installs` is read during or after migration
- WHEN control-plane install and route records are available
- THEN the response includes the same app install metadata and route fields
  expected by existing clients
- AND the response is derived from schema-owned app install and route records

#### Scenario: Existing create install request

- GIVEN the existing create app install API is called
- WHEN the request is valid
- THEN it creates schema-owned app install and route records
- AND unsupported packages, invalid install ids, duplicate install ids, and
  invalid labels are rejected before installed app storage is initialized

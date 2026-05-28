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

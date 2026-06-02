## MODIFIED Requirements

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

- **GIVEN** a Tasks or Estii app install is created
- **WHEN** install metadata is returned
- **THEN** the app install metadata stores package app key, label, and status
- **AND** route records target the install for admin and schema routes under
  `/apps/<installId>`
- **AND** no public Site route record is created for that install

### Requirement: Default Product Site Install

The system SHALL create the default product Site install during blank owner
setup when no installed app metadata exists.

#### Scenario: Blank owner setup

- **GIVEN** owner setup completes for a product instance with no installed app
  metadata
- **WHEN** the starter app bootstrap policy runs
- **THEN** a Site app install with install id `site`, label `Site`, package app
  key `site`, and status `installed` exists
- **AND** route records exist for `/apps/site`, `/apps/site/schema`, and
  `/sites/site`
- **AND** the owner session is established independently from the app install
  metadata and route records

#### Scenario: Existing installs suppress starter Site

- **GIVEN** installed app metadata already exists in the Formless instance
- **WHEN** owner setup completes
- **THEN** the starter `site` install is not added
- **AND** existing app installs keep their labels, install ids, and route
  records

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

- **GIVEN** a Tasks or Estii app install is created
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

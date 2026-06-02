# crm-app Specification

## Purpose

TBD - created by archiving change add-launch-crm-app. Update Purpose after archive.

## Requirements

### Requirement: CRM Source App

The system SHALL provide a bundled `crm` source app schema and source seed record set for startup audience and CRM workflows.

#### Scenario: Load CRM source schema

- **GIVEN** the runtime resolves bundled source app key `crm`
- **WHEN** the source schema is loaded
- **THEN** the app schema is available for schema key `crm`
- **AND** the schema parses through the normal app schema parser
- **AND** the app label is `CRM`

#### Scenario: Validate CRM source records

- **GIVEN** CRM source seed records exist
- **WHEN** the worker loads the bundled source app
- **THEN** the seed records validate as stored-record shaped data against the `crm` schema
- **AND** reference fields point at records in the same source seed record set

### Requirement: Flat CRM Data Model

The CRM source schema SHALL model CRM state as flat entity records with reference fields, relationships, and join records.

#### Scenario: Contact and audience records stay flat

- **WHEN** CRM contact, email address, company, audience, and subscription records are stored
- **THEN** each record stores only scalar and reference field values
- **AND** contact-company, email-address-contact, and subscription membership links are represented by reference fields
- **AND** no nested contact, company, audience, or subscription objects are persisted

#### Scenario: Campaign and broadcast records stay flat

- **WHEN** CRM campaign, campaign-message, broadcast, broadcast-recipient, and delivery-event records are stored
- **THEN** each record stores only scalar and reference field values
- **AND** campaign-message, broadcast target, broadcast-recipient, and delivery-event links are represented by reference fields
- **AND** no nested recipient or delivery event arrays are persisted on campaign or broadcast records

#### Scenario: CRM membership identity

- **WHEN** CRM email address and subscription records are created or updated
- **THEN** normalized email address is unique within the app storage identity
- **AND** the email-address and audience pair is unique within the app storage identity

### Requirement: Generated CRM Admin Workflows

The CRM source schema SHALL define generated screens and views for owner review and maintenance of CRM records.

#### Scenario: Review contacts and companies

- **WHEN** the CRM generated admin surface renders
- **THEN** the owner can inspect and create contacts, email addresses, and companies
- **AND** contact views expose company and email-address relationships through generated reference fields or related collections

#### Scenario: Review audiences and subscriptions

- **WHEN** the CRM generated admin surface renders
- **THEN** the owner can inspect audiences, email addresses, subscriptions, subscription status, and consent/source fields
- **AND** the owner can create audiences and owner-managed subscription records through generated create views

#### Scenario: Review campaigns and broadcasts

- **WHEN** the CRM generated admin surface renders
- **THEN** the owner can inspect campaigns, campaign messages, broadcasts, broadcast recipients, and delivery events
- **AND** broadcast review surfaces show recipient and delivery status without requiring queued email sending

### Requirement: CRM First-Change Boundaries

CRM SHALL remain a standalone app package in this change and SHALL NOT take over Site subscription writes or email delivery.

#### Scenario: Site subscribe behavior unchanged

- **GIVEN** Site subscribe forms and Site-owned subscriber records exist
- **WHEN** CRM is added as a bundled package app
- **THEN** Site subscribe forms continue to target the existing Site subscribe behavior
- **AND** no Site subscribe form writes CRM records in this change

#### Scenario: No public CRM write route

- **WHEN** the CRM source schema and package app are installed
- **THEN** the change does not add an anonymous public CRM subscribe action binding
- **AND** generic CRM mutation and action writes remain protected by existing owner or admin authorization

#### Scenario: No email queue execution

- **WHEN** CRM campaign, broadcast, recipient, or delivery-event records are stored
- **THEN** no queued email sending job is scheduled by this change
- **AND** delivery-event records are review data, not provider execution evidence from a new sending runtime

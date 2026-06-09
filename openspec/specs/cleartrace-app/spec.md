# ClearTrace App Specification

## Purpose

ClearTrace is a bundled source app that exercises Formless as a real operational workflow app for analytical testing labs. It models customer orders, submitted samples, lab work, reports, and verification records as flat app data with generated admin workflows.

## Requirements

### Requirement: ClearTrace Source App

The system SHALL provide a bundled `cleartrace` source app schema and source seed record set for analytical testing workflow review.

#### Scenario: Load ClearTrace source schema

- **GIVEN** the runtime resolves bundled source app key `cleartrace`
- **WHEN** the source schema is loaded
- **THEN** the app schema is available for schema key `cleartrace`
- **AND** the schema parses through the normal app schema parser
- **AND** the app label is `ClearTrace`

#### Scenario: Validate ClearTrace source records

- **GIVEN** ClearTrace source seed records exist
- **WHEN** the worker loads the bundled source app
- **THEN** the seed records validate as stored-record shaped data against the `cleartrace` schema
- **AND** reference fields point at records in the same source seed record set

### Requirement: Flat ClearTrace Data Model

The ClearTrace source schema SHALL model operational lab workflow state as flat entity records with scalar fields, reference fields, relationships, and join records.

#### Scenario: Customer and catalog records stay flat

- **WHEN** ClearTrace customer, service catalog item, test package, package item, analyte, and app configuration records are stored
- **THEN** each record stores only scalar and reference field values
- **AND** package membership, catalog selection, and analyte links are represented by reference fields or join records
- **AND** no nested customer, package, catalog, or analyte objects are persisted

#### Scenario: Order and sample records stay flat

- **WHEN** ClearTrace order, order line, sample, test request, shipment, and work item records are stored
- **THEN** each record stores only scalar and reference field values
- **AND** order-sample, order-line, sample-test-request, and work-item links are represented by reference fields
- **AND** no nested line item, sample, test request, or work item arrays are persisted on parent records

#### Scenario: Result and report records stay flat

- **WHEN** ClearTrace method, result, report, report version, verification record, invoice, payment, submission slip, support ticket, ticket message, notification, compliance attestation, or audit event records are stored
- **THEN** each record stores only scalar and reference field values
- **AND** document and media references store flat asset ids or delivery references, not provider-specific object state
- **AND** report version and verification relationships are represented by reference fields

#### Scenario: Lifecycle status fields are enum data

- **WHEN** order, sample, test request, report, invoice, payment, support ticket, or verification records are stored in this source app
- **THEN** lifecycle status is represented by normal enum fields
- **AND** this source app does not by itself introduce schema-declared state machines, transition guards, transition effects, or transition event emission

### Requirement: Generated ClearTrace Admin Workflows

The ClearTrace source schema SHALL define generated screens and views for owner and staff review of operational records without requiring raw schema editing for normal administration.

#### Scenario: Review orders and samples

- **WHEN** the ClearTrace generated admin surface renders
- **THEN** owner or staff users can inspect orders, order lines, customers, samples, test requests, and shipments through workflow-labeled screens
- **AND** order and sample views expose related records through generated reference fields, collection contexts, related collections, or scoped create defaults where supported

#### Scenario: Review lab queue and results

- **WHEN** the ClearTrace generated admin surface renders
- **THEN** owner or staff users can inspect work items, methods, results, report records, report versions, and verification records
- **AND** queue views can filter records by status, priority, due date, and assignment using existing schema query support

#### Scenario: Configure catalog and settings

- **WHEN** the ClearTrace generated admin surface renders
- **THEN** owner or staff users can inspect and maintain analytes, service catalog items, test packages, package items, compliance statements, and app configuration records
- **AND** implementation-only identifiers, source metadata, and raw provider state are not primary workflow controls

### Requirement: ClearTrace First-Change Boundaries

ClearTrace SHALL remain a source app and generated admin workflow package in this change. Customer-facing public flows and richer operational primitives belong to later reviewed changes.

#### Scenario: No public customer workflow

- **WHEN** the ClearTrace package app is installed
- **THEN** this change does not add a public configure-test page, checkout page, customer portal, report download page, or public verification route
- **AND** generic ClearTrace mutation and action writes remain protected by existing owner or admin authorization

#### Scenario: No new action primitive

- **WHEN** the ClearTrace source schema is parsed
- **THEN** the schema uses only existing action kinds or no actions
- **AND** this change does not add generic guarded action execution, action-scoped wizards, multi-record transaction declarations, or public record creation actions

#### Scenario: No provider execution

- **WHEN** ClearTrace order, payment, notification, report, or verification records are stored
- **THEN** no payment provider, email provider, document renderer, lab instrument integration, or external verification provider is called by this change
- **AND** provider-backed behavior waits for separate provider shell or adapter changes with dev-safe mock paths

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

#### Scenario: Result, report, verification, and audit records stay flat

- **WHEN** ClearTrace method, result, report, report version, verification record, and audit event records are stored
- **THEN** each record stores only scalar and reference field values
- **AND** document and media references store flat asset ids or delivery references, not provider-specific object state
- **AND** report version and verification relationships are represented by reference fields

#### Scenario: Lifecycle status fields stay flat

- **WHEN** order, sample, test request, report, invoice, payment, support ticket, or verification records are stored in this source app
- **THEN** lifecycle status is represented by normal enum fields
- **AND** any schema-declared lifecycle machines govern those enum fields without storing nested workflow data on the records

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

### Requirement: ClearTrace Public Intake Operation

The ClearTrace source schema SHALL declare one anonymous public intake operation
that proves customer-facing request creation through generic operation
primitives while keeping lab records flat.

#### Scenario: Submit public intake request

- **GIVEN** the ClearTrace source schema declares collection-scoped command
  operation `order.submit-public-intake`
- **WHEN** an anonymous public caller submits valid customer contact, terms
  acceptance, catalog or package selection, analyte selection, sample form, and
  sample notes through the target-scoped public operation route
- **THEN** the operation is evaluated through the normal public operation
  envelope with anonymous actor policy, public input validation, challenge
  policy, idempotency, and audit
- **AND** the operation commits a declarative record plan that creates flat
  `customer`, `order`, `order-line`, `sample`, `test-request`, intake
  `work-item`, and `audit-event` records
- **AND** the created records link through normal reference fields or scalar
  related-record ids, not nested objects
- **AND** generated order numbers, sample codes, record ids, timestamps, actor
  mode, and source route context are materialized by the record plan rather than
  accepted as trusted public input
- **AND** the created order uses manual payment state, the created sample starts
  in `expected`, the created test request starts in a staff-review state, and
  the created work item starts open for intake follow-up
- **AND** the public response returns only display-safe record-plan metadata
  such as created-record ids, while generated order numbers and sample codes are
  materialized on the created flat records rather than accepted as trusted
  public input

#### Scenario: Reject invalid public intake request

- **GIVEN** a public intake request references inactive, missing, or mismatched
  catalog, package, or analyte records, omits required customer or terms input,
  fails challenge policy, or violates a storage constraint
- **WHEN** the operation is evaluated
- **THEN** no `customer`, `order`, `order-line`, `sample`, `test-request`,
  `work-item`, `audit-event`, tombstone, or sync change row is committed
- **AND** protected generic mutation, action, and operation routes remain
  unavailable to the anonymous caller
- **AND** the rejected attempt is auditable through the operation invocation
  audit boundary without exposing challenge proofs or protected field values

#### Scenario: Continue intake through staff workflow

- **GIVEN** public intake created an expected sample and pending staff work
- **WHEN** staff receive and accession the physical sample
- **THEN** existing owner or staff transition operations move `sample.status`
  and `test-request.status`
- **AND** public intake does not grant anonymous callers direct lifecycle
  transition, result entry, report release, or verification rights

### Requirement: ClearTrace Public And Provider Boundaries

ClearTrace SHALL keep customer-facing behavior beyond reviewed intake and all
provider-backed behavior behind later reviewed changes.

#### Scenario: No public checkout or delivery workflow

- **WHEN** the ClearTrace package app is installed
- **THEN** ClearTrace exposes only the reviewed public intake operation for
  anonymous customer request creation
- **AND** ClearTrace does not expose a checkout page, customer portal, report
  download page, or public verification route
- **AND** generic ClearTrace mutation and action writes remain protected by existing owner or admin authorization

#### Scenario: No generic action primitive

- **WHEN** the ClearTrace source schema is parsed
- **THEN** transition-state actions may be used only for schema-declared lifecycle movement
- **AND** the public intake workflow uses the reviewed operation record-plan
  primitive, not ClearTrace-specific arbitrary action code
- **AND** this source app does not add generic guarded action execution,
  action-scoped wizards, provider-backed commands, or unreviewed public record
  creation actions

#### Scenario: No provider execution

- **WHEN** ClearTrace order, report, or verification records are stored
- **THEN** ClearTrace lifecycle state-machine behavior does not call a payment provider, email provider, document renderer, lab instrument integration, or external verification provider
- **AND** provider-backed behavior waits for separate provider shell or adapter changes with dev-safe mock paths

### Requirement: ClearTrace Lifecycle State Machines

The ClearTrace source schema SHALL use state machines for staff-owned lifecycle
movement where generated admin operators need guarded transitions.

#### Scenario: Sample intake transitions

- **GIVEN** ClearTrace declares a state machine for `sample.status`
- **WHEN** staff transition a sample through generated admin controls
- **THEN** valid intake movement includes `expected` to `received`,
  `received` to `accessioned`, `accessioned` to `inAnalysis`, and
  `inAnalysis` to `testingComplete`
- **AND** terminal movement can end in `retained`, `disposed`, or `rejected`
- **AND** direct generic patches to `sample.status` are rejected

#### Scenario: Test request transitions

- **GIVEN** ClearTrace declares a state machine for `test-request.status`
- **WHEN** staff move lab work through generated admin controls
- **THEN** valid movement includes review, queue, in-progress, technical review,
  and complete states
- **AND** `cancelled` is terminal unless a declared recovery transition exists
- **AND** direct generic patches to `test-request.status` are rejected

#### Scenario: Report release transitions

- **GIVEN** ClearTrace declares a state machine for `report.status`
- **WHEN** staff move reports through generated admin controls
- **THEN** valid movement includes draft, review, approved, released, amended,
  and revoked states
- **AND** released, amended, and revoked report states remain represented by the
  flat report record and related flat report-version and verification records
- **AND** ClearTrace lifecycle state machines do not add public verification pages or document
  rendering

#### Scenario: Transition audit events

- **GIVEN** a ClearTrace lifecycle transition commits
- **WHEN** the source schema maps lifecycle transitions to `audit-event`
- **THEN** one flat audit event record is written for the transition
- **AND** the event can identify the source record type, source record id,
  transition key, actor mode, and occurrence date through normal audit-event
  fields

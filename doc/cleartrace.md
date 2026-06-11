# ClearTrace Prompt

Last updated: 2026-06-11

Purpose: source-faithful prompt for exploring ClearTrace as a real complex-app
use case for Formless.

This is not shipped behavior. Shipped behavior lives in
`openspec/specs/*/spec.md`.

This is not a backlog. Work starts when a Git-backed `changes/<change-id>`
branch owns the proposal, spec patch, tasks, evidence, and review state.

## Workflow

Use the current Formless workflow.

1. Read `AGENTS.md`.
2. Run `devstate start`.
3. Use current devstate output. Read `./.devstate/status.md` only after
   failures, stale output, conflict resolution, or exact evidence-copy needs.
4. Read only relevant docs, specs, and code. Do not read every doc.
5. Treat `doc/vision.md` and `doc/roadmap.md` as intent, not shipped behavior.
6. Treat `openspec/specs/*/spec.md`, source schemas, tests, and code as facts.
7. Do not create local PRD files.
8. Do not use GitHub issues as the queue, lock, or status store.
9. Use Bun scripts and devstate-owned output only. Do not run `vp test`,
   `vp check`, `bun test`, or `bun check` manually during normal agent work.
10. For exploration, use `.agents/skills/change-explore/SKILL.md`.
11. For new workstreams, use `.agents/skills/change-propose/SKILL.md` to create
    `changes/<change-id>` branches with structured tip commit metadata and
    first-pass canonical spec patches.
12. For implementation, use `.agents/skills/change-apply/SKILL.md` and ship
    exactly one ready task section from change commit metadata.
13. For review prep, use `.agents/skills/change-finalize/SKILL.md`; do not run
    `openspec archive` for Git-backed Formless changes.
14. Update branch tip metadata with task status, decisions, blockers, evidence,
    and machine-readable trailers.
15. Run `devstate check` for evidence.
16. Treat the shipped ClearTrace source app as the baseline. Do not add the
    next ClearTrace customer, public, commerce, or provider behavior until a
    Git-backed change branch owns the reviewed slice, unless the user explicitly
    asks for implementation.

## Context

Formless is a schema-as-data app runtime for building custom software on
Cloudflare.

The durable product contract is the app schema. App schema is runtime data. It
defines entities, fields, relationships, mutations, queries, read models, views,
screens, operations, actions, and state machines.

Data stays flat. Composition belongs in query, view, projection, read-model, and
operation/action layers.

Generated UI should get users to usable software quickly. Custom UI should
become first-class only when a workflow deserves a custom shape.

Humans and agents should work over the same schema and data.

ClearTrace is the first concrete complex-app exercise: a customer portal and
operating system for an analytical testing lab.

The real-world domain is an Australian analytical testing lab that tests
customer-submitted samples, including peptide samples. The business does not
sell, source, recommend, prescribe, dose, or endorse any substance. The service
is analytical testing only.

Customer promise:

> Choose what you want verified. Pay. Send the sample. Receive a verifiable
> report.

North-star ordering journey:

1. Customer clicks Start a test.
2. Customer configures one or more samples using outcome-based packages.
3. Customer pays.
4. System generates sample id, vial label instructions, submission slip, and
   shipping instructions.
5. Customer ships the sample.
6. Lab receives and accessions the sample.
7. Customer tracks status.
8. Lab runs and reviews the test.
9. Customer receives a digital COA or report.
10. A permitted viewer verifies report authenticity through a public or private
    verification page.

Customer UX should hide lab complexity.

First customer flow:

1. Configure.
2. Pay.
3. Send sample.

Customer portal flow:

1. Track status.
2. Download report.
3. Verify authenticity.

## Platform Goal

For every ClearTrace-specific problem, identify the universal Formless primitive
that should exist so humans and agents can later build other workflow apps by
defining schema, views, operations, actions, and state transitions.

Do not start by hard-coding a peptide lab portal. Start by mapping the domain
into generic platform primitives, then define the smallest vertical slice that
proves those primitives.

## Agent Orientation

Use this document to understand why a ClearTrace change matters and where it
fits. Do not treat it as shipped behavior, a backlog, or a status store.

Work remains branch-owned:

- proposals, tasks, decisions, blockers, and evidence live in the tip commit of
  a Git-backed `changes/<change-id>` branch;
- shipped facts are promoted into canonical `openspec/specs/*/spec.md` files;
- this document stays a source-faithful orientation aid for future exploration
  and proposal work.

When starting a ClearTrace workstream, read only:

- this document;
- the selected `changes/<change-id>` branch metadata when it exists;
- the relevant canonical specs listed in that branch metadata;
- the package `AGENTS.md` nearest any edited file.

## Shipped Baseline And Next Slice

Use the shipped baseline as fact. Use the next-slice guidance only when no
change branch has more specific metadata.

Current shipped baseline:

- `openspec/specs/cleartrace-app/spec.md` defines ClearTrace as a bundled
  source app for operational workflow review;
- `schema/apps/cleartrace/schema.json` and seed records define a flat generated
  admin app with customers, catalog records, orders, samples, test requests,
  work items, methods, results, reports, report versions, verification records,
  audit events, and app config;
- ClearTrace has owner/admin generated screens for Orders, Sample intake, Lab
  queue, Results, Reports, Catalog and pricing, and Settings;
- ClearTrace declares state machines for `sample.status`,
  `test-request.status`, and `report.status`;
- generated UI exposes transition controls through entity operations that run
  registered `transition-state` actions;
- report version, verification, and audit records are placeholders for admin
  review, not public customer delivery.

Current non-goals are explicit in the shipped ClearTrace spec:

- no public configure-test page;
- no checkout page;
- no customer portal;
- no report download page;
- no public verification route;
- no payment, email, document-rendering, lab-instrument, or external
  verification provider execution.

Next reviewed slice goal: prove customer-facing ClearTrace behavior through the
operation model without hard-coding lab-only behavior.

Next candidate flow:

1. Public or customer user configures a sample request.
2. A declared public operation creates flat `order`, `sample`, `test-request`,
   and related event records, or invokes a reviewed multi-record command.
3. Staff receives and accessions the sample through existing transition
   operations.
4. Staff records a result and releases a report asset or report placeholder.
5. Customer tracks status through a reviewed customer/public access primitive.
6. Public or permitted viewer verifies report authenticity through a reviewed
   verification route.

Payment can be manual for the next slice. Provider-backed payment belongs in a
later commerce shell.

Already-proven foundation:

- source app packaging for a complex non-Site app;
- scoped parent-child workflows;
- state transitions;
- event/audit records;
- work queue views;
- report asset references.

The next slice should prove these remaining generic primitives:

- public operation record creation for a non-Site app;
- operation guards and declarative multi-record effects;
- conditional validation;
- customer or anonymous screen flow;
- public/customer access policy;
- report delivery;
- verification registry shape.

## Capability Assessment

Assess the current repo before proposing work.

Read the relevant shipped specs and code for:

- app schema;
- generated UI;
- Authority storage;
- sync and browser replica;
- public operations;
- Site public output;
- media;
- instance auth;
- installed apps and routes;
- deployment runtime;
- portable archives.

Summarize current support for:

- records;
- fields;
- relationships;
- queries;
- read models;
- views;
- screens;
- operations;
- state machines;
- actions;
- generated tables, forms, and trees;
- public output and pages;
- media upload and delivery;
- auth, sessions, and owner roles;
- public operations;
- installed app identity and routes;
- sync and replica;
- archives;
- deploy behavior.

Identify missing primitives needed for a serious operational app:

- richer state-machine guards and transition requirements;
- workflow transitions;
- operation guards;
- conditional fields;
- operation-scoped forms and wizards;
- derived summaries;
- payment intents;
- invoices;
- public checkout;
- guest-to-customer conversion;
- magic-link auth;
- organisations, roles, and groups;
- notifications and email;
- jobs, queues, and scheduled reminders;
- document generation;
- file attachments;
- digital signing or hash verification;
- public operation forms;
- public verification pages;
- audit logs;
- event logs;
- support tickets and conversations;
- work queues;
- dashboards and metrics;
- import and export;
- provider adapters;
- secrets and configuration;
- permission-scoped public and private views.

## Current Capability Baseline

This baseline was refreshed on 2026-06-11 from shipped specs and code. Read
`doc/operations.md` as proposal context; canonical behavior lives in specs,
schemas, tests, and runtime code. Reassess before creating a change branch if
the relevant specs or files have changed.

| Capability                | Current support                                                                                                                                                                                                                                                                  | Source evidence                                                                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Records and storage       | Flat records with scalar values, generic create/patch/delete mutations, tombstone deletes, write log cursor changes, operation invocation rows, schema reset, snapshots, and package app migrations.                                                                             | `openspec/specs/app-schema/spec.md`, `openspec/specs/authority-storage/spec.md`, `src/shared/protocol.ts`, `src/worker/storage.ts`, `src/worker/authority-validation.ts`                                         |
| Fields                    | Text, boolean, date, number, enum, and reference fields with required/default/min/max/integer behavior where supported. Stored values remain scalar.                                                                                                                             | `lib/schema/src/types.ts`, `lib/schema/src/schema-fields.ts`, `src/worker/authority-validation.ts`                                                                                                               |
| Relationships             | To-one, to-many, and many-to-many relationships over explicit reference fields. Many-to-many uses flat join records.                                                                                                                                                             | `openspec/specs/app-schema/spec.md`, `lib/schema/src/schema-relationships.ts`, `schema/apps/estii/schema.json`, `schema/apps/crm/schema.json`                                                                    |
| Queries                   | Portable `all`, `where`, `and`, `or` expressions with `eq`, date `before`, `today`, and context values.                                                                                                                                                                          | `lib/schema/src/query.ts`, `lib/schema/src/schema-views.ts`                                                                                                                                                      |
| Read models               | Numeric computed values and aggregate summaries over queries.                                                                                                                                                                                                                    | `openspec/specs/app-schema/spec.md`, `lib/schema/src/schema-read-models.ts`, `schema/apps/estii/schema.json`                                                                                                     |
| Views and screens         | Collection, create, and edit views; workspace screens with stack layouts, collection sections, and owner or anonymous access. No customer-auth or role-scoped screen type yet.                                                                                                   | `lib/schema/src/types.ts`, `lib/schema/src/schema-views.ts`, `lib/schema/src/schema-screens.ts`, `openspec/specs/generated-ui/spec.md`                                                                           |
| Generated UI              | Generated collection workspaces, create/edit/delete flows, operation controls, state transition controls, list/table/tree results, scoped contexts, related collections, ordering, summaries, and editors.                                                                       | `openspec/specs/generated-ui/spec.md`, `src/app/generated/collection.tsx`, `src/app/generated/actions.tsx`, `src/app/generated/state-machine-ui.tsx`, `src/client/views.ts`                                      |
| Operations                | Entity-local `list`, `get`, `create`, `update`, `delete`, and `command` operations have input/output/effect/idempotency/audit/policy shape and normalize into invocation envelopes. Effects are limited to one record create/patch/delete/tombstone or a registered action kind. | `doc/operations.md`, `lib/schema/src/schema-operations.ts`, `src/shared/operation-invocation.ts`, `src/worker/entity-operations.ts`, `src/worker/authority-operations.ts`                                        |
| Actions                   | Registered action modules cover clear completed, join-record helpers, tree child helpers, placement removal, subscribe, and transition-state. Actions remain trusted runtime modules behind command operations, not arbitrary schema-declared transactions.                      | `lib/schema/src/schema-actions.ts`, `src/worker/actions.ts`, `src/app/generated/actions.tsx`                                                                                                                     |
| State machines            | Enum-backed state machines declare states, transitions, terminal states, protected direct status patches, transition actions, generated controls, and one flat transition event target.                                                                                          | `openspec/specs/state-machines/spec.md`, `lib/schema/src/schema-state-machines.ts`, `src/worker/actions.ts`, `src/app/generated/state-machine-ui.tsx`                                                            |
| Public operations         | Target-scoped public operation routes can execute anonymous same-origin Turnstile-protected create or command operations. Site uses this for contact-message submit and subscription flows.                                                                                      | `openspec/specs/public-actions/spec.md`, `src/worker/public-actions.ts`, `schema/apps/site/schema.json`, `src/worker/public-actions.test.ts`                                                                     |
| ClearTrace source app     | Bundled `cleartrace` app has 17 flat entities, seed records, admin screens, scoped related collections, sample/test-request/report state machines, report-version and verification placeholders, and audit-event records. It has no public/customer/provider flow yet.           | `openspec/specs/cleartrace-app/spec.md`, `schema/apps/cleartrace/schema.json`, `schema/apps/cleartrace/seed-records.json`, `src/client/cleartrace-schema.test.ts`, `src/app/generated/cleartrace-admin.test.tsx` |
| Public output             | Site app records project into public Site trees and SSR documents. Public output is Site-specific, not a generic public view over arbitrary app records.                                                                                                                         | `openspec/specs/site-runtime/spec.md`, `src/site/tree.ts`, `src/worker/site-ssr.tsx`                                                                                                                             |
| Media                     | Core image upload, list, delivery, restore, archive inclusion, and generated media field support exist. App-specific usage remains app data.                                                                                                                                     | `openspec/specs/core-media/spec.md`, `openspec/specs/media/spec.md`, `lib/media/src/types.ts`, `lib/media/src/worker.ts`                                                                                         |
| Auth                      | Instance owner passkey setup/login/session/logout and admin bearer boundary exist. No customer magic-link or app-record-owned roles yet.                                                                                                                                         | `openspec/specs/instance-auth/spec.md`, `src/shared/instance-auth.ts`, `src/worker/owner-passkeys.ts`, `src/worker/owner-session.ts`                                                                             |
| Installed apps and routes | Bundled package apps, including ClearTrace, can be installed with stable install ids, storage identities, admin/schema routes, and Site public routes.                                                                                                                           | `openspec/specs/installed-apps/spec.md`, `src/shared/app-installs.ts`, `src/shared/app-storage-identity.ts`                                                                                                      |
| Sync and replica          | Browser IndexedDB replica, HTTP cursor sync, write-log catch-up, push sync, stale write rejection, and local projections exist.                                                                                                                                                  | `openspec/specs/sync-replica/spec.md`, `src/client/db.ts`, `src/client/sync.ts`, `src/client/store.ts`                                                                                                           |
| Archives                  | App and instance archives include installed app registry, source or store snapshot data, control-plane records, and core media.                                                                                                                                                  | `openspec/specs/portable-archives/spec.md`, `src/shared/archive.ts`, `src/shared/archive-restore-plan.ts`, `src/worker/archive-api.ts`                                                                           |
| Deployment                | Instance deployment desired state, attempts, leases, drift, status, and provider writeback exist as deployment-specific runtime primitives.                                                                                                                                      | `openspec/specs/deployment-runtime/spec.md`, `src/shared/deployment-runtime.ts`, `src/worker/deployment-runtime-state.ts`, `src/worker/deployment-runtime-api.ts`                                                |

Main limits for a serious operational app:

- ClearTrace has generated admin workflow coverage, but no public configure,
  checkout, customer portal, report download, or public verification route;
- operations are the interaction contract, but effects are still limited and do
  not yet provide arbitrary guarded, branching, multi-record transactions;
- action behavior is owned by fixed runtime modules, not schema-declared
  generic transaction plans;
- state machines exist, but transition guards, required fields, role policies,
  previous-state restoration, and side effects beyond one flat event need more
  schema support;
- field visibility exists in generated views, but conditional validation is not
  a server-side schema primitive;
- public operation support is real but deliberately narrow;
- public pages are Site-specific;
- owner auth exists, but customer identity, organisation roles, and portal
  access are not app-generic primitives;
- media supports image assets, but report/document generation and versioning
  are not generic primitives;
- deployment has provider/runtime patterns, but payments, email, rendering, and
  verification provider adapters do not exist as reusable app primitives.

## Domain Model

Model ClearTrace with flat records. Use kebab-case entity keys and camelCase
field keys. Relationships are explicit references. Composition belongs in
queries, views, projections, read models, operations, and actions.

The current source app implements a reviewed subset:

- `customer`, `analyte`, `service-catalog-item`, `test-package`,
  `package-item`, `order`, `order-line`, `sample`, `test-request`, `work-item`,
  `method`, `result`, `report`, `report-version`, `verification-record`,
  `audit-event`, and `app-config`;
- sample, test-request, and report lifecycle state machines;
- admin-only generated workflows and seeded review data.

The wider model below remains candidate domain pressure. It includes records
not yet present in the source app, such as organisations, billing profiles,
invoices, payments, shipments, submission slips, support conversations,
notifications, compliance attestations, and customer/public access records.

Classify each candidate record as:

- core platform primitive;
- app-specific record;
- catalog or config record;
- event or audit record;
- external-provider record;
- public-output record.

Candidate entities:

| Entity                    | Generic primitive              | Key fields                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `customer`                | identity-bearing actor         | `kind`, `displayName`, `email`, `phone`, `country`, `status`, `defaultBillingProfileId`, `primaryOrganisationId`, `lastSeenAt`, `termsAcceptedAt`, `termsVersionAccepted`, `metadata`                                                                                                                        |
| `organisation`            | group/account container        | `name`, `slug`, `billingEmail`, `status`, `createdAt`, `metadata`                                                                                                                                                                                                                                            |
| `organisation-membership` | actor-role membership          | `organisationId`, `customerId`, `role`, `status`, `invitedAt`, `acceptedAt`                                                                                                                                                                                                                                  |
| `billing-profile`         | billing identity               | `ownerType`, `ownerId`, `legalName`, `billingEmail`, address fields, `taxIdentifier`, `status`                                                                                                                                                                                                               |
| `service-catalog-item`    | sellable service               | `name`, `slug`, `description`, `category`, `status`, `basePrice`, `currency`, `estimatedTurnaroundBusinessDays`, `requiresManualReview`, `resultType`, `methodSummary`, `publicDescription`, `internalDescription`                                                                                           |
| `test-package`            | bundle/package                 | `name`, `slug`, `includedCatalogItemIds`, `optionalAddOnIds`, `recommendedFor`, `startingPrice`, `status`, `displayOrder`                                                                                                                                                                                    |
| `analyte`                 | catalog term                   | `name`, `aliases`, `category`, `status`, `requiresManualReview`, `supportedForms`, `defaultPackageId`, `publicNotes`, `internalNotes`, `riskFlags`                                                                                                                                                           |
| `order`                   | commercial request             | `orderNumber`, `customerId`, `organisationId`, `billingProfileId`, `status`, `currency`, totals, `paymentStatus`, `fulfillmentStatus`, `source`, `termsVersionAccepted`, `complianceAttestationId`                                                                                                           |
| `order-line`              | line item                      | `orderId`, `itemType`, `catalogItemId`, `description`, `quantity`, `unitPrice`, `total`, `linkedSampleId`, `linkedReportId`                                                                                                                                                                                  |
| `sample`                  | submitted item                 | `sampleCode`, `orderId`, `customerId`, `status`, `analyteId`, `analyteNameFreeText`, `form`, `claimedAmount`, `claimedAmountUnit`, `amountUnknown`, `batchLot`, `appearance`, `containerType`, `storageNotes`, `customerNotes`, `packageId`, lifecycle timestamps, `currentCustodyLocation`, `photoAssetIds` |
| `test-request`            | work request                   | `orderId`, `sampleId`, `packageId`, `status`, `requestedTestIds`, `requiresManualReview`, `priority`, lifecycle timestamps, `onHoldReason`, `assignedToUserId`                                                                                                                                               |
| `work-item`               | work queue item                | `type`, `status`, `priority`, `assignedToUserId`, `relatedRecordType`, `relatedRecordId`, `dueAt`, `blockedReason`, lifecycle timestamps                                                                                                                                                                     |
| `chain-of-custody-event`  | lifecycle event                | `sampleId`, `actorType`, `actorId`, `eventType`, `occurredAt`, `location`, `notes`, `evidenceAssetIds`                                                                                                                                                                                                       |
| `result`                  | structured outcome             | `testRequestId`, `sampleId`, `status`, `resultKind`, `displaySummary`, `measuredValue`, `measuredUnit`, `qualitativeOutcome`, `uncertainty`, `methodId`, `instrumentRef`, `analystUserId`, `reviewedByUserId`, `approvedAt`, `releasedAt`, `structuredDataJson`                                              |
| `method`                  | procedure reference            | `name`, `version`, `methodType`, `publicSummary`, `internalProcedureRef`, `status`, `effectiveFrom`, `retiredAt`                                                                                                                                                                                             |
| `report`                  | generated document             | `reportNumber`, `orderId`, `sampleId`, `resultIds`, `status`, `title`, `reportType`, `currentVersionId`, `publicVisibility`, `verificationRecordId`, lifecycle timestamps, `revokedReason`                                                                                                                   |
| `report-version`          | versioned document asset       | `reportId`, `versionNumber`, `assetId`, `contentHash`, `hashAlgorithm`, `generatedAt`, `generatedByUserId`, `approvedByUserId`, `changeSummary`, `status`                                                                                                                                                    |
| `verification-record`     | authenticity registry entry    | `verificationCode`, `reportId`, `reportVersionId`, `status`, `publicUrlPath`, `visibility`, `contentHash`, `issuedAt`, `expiresAt`, `lastVerifiedAt`, `displayFieldsConfig`                                                                                                                                  |
| `invoice`                 | payable document               | `invoiceNumber`, `orderId`, `customerId`, `billingProfileId`, `status`, `currency`, totals, `dueAt`, `issuedAt`, `paidAt`, `providerRef`, `assetId`                                                                                                                                                          |
| `payment-intent`          | external payment attempt       | `orderId`, `invoiceId`, `provider`, `providerIntentId`, `status`, `amount`, `currency`, `checkoutUrl`, `expiresAt`, `receivedAt`, `failureReason`, `metadata`                                                                                                                                                |
| `payment`                 | settled payment event          | `paymentIntentId`, `invoiceId`, `provider`, `providerPaymentId`, `amount`, `currency`, `receivedAt`, `status`, `reconciliationStatus`, `rawProviderEventId`                                                                                                                                                  |
| `submission-slip`         | generated instruction document | `orderId`, `sampleId`, `assetId`, `generatedAt`, `sampleCode`, `qrCodeAssetId`                                                                                                                                                                                                                               |
| `shipment`                | logistics unit                 | `orderId`, `customerId`, `direction`, `carrier`, `trackingNumber`, `status`, lifecycle timestamps, `notes`                                                                                                                                                                                                   |
| `support-ticket`          | linked support conversation    | `ticketNumber`, `customerId`, `organisationId`, `relatedRecordType`, `relatedRecordId`, `subject`, `status`, `priority`, `channel`, lifecycle timestamps, `assignedToUserId`                                                                                                                                 |
| `ticket-message`          | conversation message           | `ticketId`, `senderType`, `senderId`, `body`, `assetIds`, `createdAt`, `visibility`                                                                                                                                                                                                                          |
| `notification`            | outbound communication         | `recipientType`, `recipientId`, `channel`, `templateId`, `relatedRecordType`, `relatedRecordId`, `status`, queue/send timestamps, `providerMessageId`, `failureReason`                                                                                                                                       |
| `notification-template`   | communication template         | `key`, `channel`, `subjectTemplate`, `bodyTemplate`, `variablesSchema`, `status`                                                                                                                                                                                                                             |
| `compliance-attestation`  | accepted statement event       | `actorId`, `actorType`, `orderId`, `statementKey`, `statementVersion`, `acceptedAt`, `ipHash`, `userAgentHash`, `textSnapshot`, `status`                                                                                                                                                                     |
| `audit-event`             | append-only audit log          | `actorType`, `actorId`, `actionKey`, `recordType`, `recordId`, `beforeHash`, `afterHash`, `occurredAt`, `reason`, `metadata`                                                                                                                                                                                 |
| `app-config`              | app-level settings             | `key`, `valueJson`, `status`, `updatedAt`, `updatedByUserId`                                                                                                                                                                                                                                                 |

## State Machines

Use shipped state-machine behavior as the baseline. Treat richer lifecycle
behavior as proposed capability until source-backed evidence says otherwise.

Current platform capabilities:

- schema-declared states;
- allowed transitions;
- transition labels;
- terminal states;
- protected direct status patches;
- transition actions;
- one flat event record per transition when declared;
- generated transition controls;
- invalid-transition handling.

Still-needed lifecycle capabilities:

- transition guards;
- required fields per transition;
- side effects beyond one transition event;
- notification triggers;
- role or permission requirements;
- previous-state restoration for on-hold flows;
- richer view badges and filters from state definitions;
- timeline rendering from transition events.

Current ClearTrace source app declares machines for `sample.status`,
`test-request.status`, and `report.status`. Other machines below are candidate
future pressure.

| Entity field                 | States                                                                                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `order.status`               | `draft`, `submitted`, `awaitingPayment`, `paid`, `awaitingSample`, `sampleReceived`, `inTesting`, `inReview`, `reportReleased`, `closed`, `cancelled`, `onHold`, `refunded` |
| `sample.status`              | `expected`, `received`, `unmatched`, `quarantined`, `accessioned`, `inAnalysis`, `testingComplete`, `retained`, `disposed`, `rejected`                                      |
| `test-request.status`        | `draft`, `pendingReview`, `accepted`, `blocked`, `queued`, `inProgress`, `technicalReview`, `complete`, `cancelled`                                                         |
| `report.status`              | `notStarted`, `draft`, `review`, `approved`, `released`, `amended`, `revoked`                                                                                               |
| `invoice.status`             | `draft`, `issued`, `paid`, `overdue`, `void`, `refunded`                                                                                                                    |
| `payment-intent.status`      | `requiresPayment`, `processing`, `succeeded`, `failed`, `cancelled`, `refunded`                                                                                             |
| `support-ticket.status`      | `new`, `open`, `waitingOnCustomer`, `waitingOnStaff`, `resolved`, `closed`                                                                                                  |
| `verification-record.status` | `pending`, `valid`, `amended`, `revoked`, `expired`                                                                                                                         |

## Operations And Actions

Define user-facing behavior as operations. Use registered actions as trusted
runtime effect modules behind command operations. Separate desired generic
capability from app-specific ClearTrace examples.

Required operation capabilities:

- operation input schema;
- operation result schema;
- operation visibility rules;
- public operation support;
- authenticated operation support;
- guard conditions;
- transition side effects;
- multi-record transaction semantics where needed;
- provider call boundary;
- idempotency keys;
- confirmation modal for destructive operations;
- draft/edit sessions with save/cancel;
- human-readable generated UI;
- optional custom operation presentation;
- event emission;
- notification emission;
- audit emission.

Customer operations:

- `start-test`;
- `configure-sample`;
- `accept-terms`;
- `checkout`;
- `add-tracking-number`;
- `download-submission-slip`;
- `view-order-tracker`;
- `download-report`;
- `share-verification-link`;
- `open-support-ticket`.

Staff operations:

- `review-order`;
- `mark-payment-received`;
- `mark-sample-received`;
- `mark-sample-unmatched`;
- `accession-sample`;
- `reject-sample`;
- `assign-work-item`;
- `start-analysis`;
- `complete-analysis`;
- `submit-for-technical-review`;
- `approve-result`;
- `generate-report`;
- `release-report`;
- `amend-report`;
- `revoke-report`;
- `resolve-support-ticket`;
- `configure-catalog`;
- `configure-pricing`.

## Screens

Define ClearTrace screens as schema-first generated surfaces, with custom UX
only where a workflow needs a custom shape.

Current generated admin screens:

- Orders.
- Sample intake.
- Lab queue.
- Results.
- Reports.
- Catalog and pricing.
- Settings.

Candidate customer and public screens:

- Landing.
- Configure test.
- Checkout.
- Send sample.
- Order tracker.
- Report library.
- Report detail.
- Public verify report.

Candidate future admin screens:

- Dashboard.
- Invoices and payments.
- Support.

Required view and screen primitives:

- route-declared screens;
- anonymous screens;
- authenticated screens;
- role-scoped screens;
- operation launchers;
- inline operation forms;
- wizard or custom flow support;
- detail pages with related-record panels;
- timeline component from events and state transitions;
- status badges;
- empty, loading, and error states;
- scoped creation from parent records;
- reference pickers and search;
- conditional fields and progressive disclosure;
- sticky summary panels for configurators;
- custom result presentation registry;
- public verification pages from records.

## Universal Primitive Map

For each ClearTrace need, define the generic platform primitive and at least two
other non-lab domains that would use it.

Candidate primitives:

| ClearTrace need                                                 | Universal primitive              | Other domains                                            |
| --------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------- |
| Orders, samples, reports, invoices, and tickets have lifecycles | State machine                    | case management, hiring, publishing, repairs             |
| Chain of custody and report release need history                | Transition event / audit event   | compliance, legal, finance, asset management             |
| Start test and verify report without login                      | Public operation                 | bookings, quote requests, RSVP, certificate verification |
| Guest checkout becomes portal access                            | Guest-to-account                 | ecommerce, education, applications, bookings             |
| Quote/order/invoice/payment                                     | Commerce                         | agencies, clinics, repairs, courses                      |
| Expected sample, receipt, accession, disposal                   | Physical item / chain of custody | repairs, returns, inspections, logistics                 |
| Submission slips, invoices, COAs                                | Document generation              | contracts, certificates, inspection reports, work orders |
| Report authenticity and revocation                              | Verification registry            | licenses, warranties, permits, credentials               |
| Status emails                                                   | Notification                     | most workflow apps                                       |
| Tickets linked to records                                       | Support conversation             | CRM, helpdesk, case management                           |
| Intake, analysis, review queues                                 | Work queue                       | clinics, operations, sales, logistics                    |
| Analytes, packages, pricing                                     | Catalog config                   | configurable services businesses                         |
| Configure/pay/send flow                                         | Form or wizard                   | onboarding, claims, applications, bookings               |
| Required fields depend on context                               | Conditional validation           | most serious forms                                       |
| Reports, photos, uploaded evidence                              | File asset / attachment          | document-heavy apps                                      |
| Payments, email, rendering providers                            | Provider adapter                 | payments, email, storage, AI, analytics                  |
| Turnaround and load summaries                                   | Dashboard metric                 | most business apps                                       |
| Analytical-testing-only attestation                             | Policy boundary                  | legal, health, finance, regulated workflows              |

## Gap Matrix

Create a gap matrix with these columns:

- priority;
- primitive;
- current support;
- missing support;
- proposed owner change;
- dependencies;
- can run in parallel with;
- acceptance check.

Prioritize gaps:

- P0: required for the next serious vertical slice.
- P1: required for useful MVP.
- P2: required for production-grade operations.
- P3: later extensibility or productization.

Likely P0:

- ClearTrace public configure/send flow.
- Public operation record creation for non-Site apps.
- Operation guards.
- Operation side effects and multi-record command plans.
- Conditional validation.
- Basic generated public or customer flow.
- Basic generated multi-screen customer flow.
- File attachment or report asset references.
- Public verification route.
- Operation audit and app event timeline.

Likely P1:

- Public checkout and payment intent abstraction.
- Email notifications.
- Magic-link auth and guest-to-account.
- Document generation.
- Timeline component.
- Report versioning.
- Dashboard/read-model summaries.
- Work queue presentation improvements.

Likely P2:

- Provider adapter framework for payments, email, and rendering.
- Jobs, queues, and scheduled reminders.
- Role, organisation, and group permissions.
- Import and export.
- Backup and restore UX.
- Advanced report templates.
- Idempotency and event processing.
- Reconciliation.
- Custom operation presentations.

Likely P3:

- AI support triage.
- AI schema-to-UX assistance.
- Advanced analytics.
- Marketplace or app packaging.
- Cross-app references.
- Advanced workflow orchestration.

### Initial Gap Matrix

This matrix is planning context only. A change branch may narrow, split, or
replace any row.

| Priority | Primitive                        | Current support                                                                                                                                          | Missing support                                                                                                                    | Proposed owner change                                                                                      | Dependencies                                       | Can run in parallel with                      | Acceptance check                                                                                     |
| -------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| P0       | ClearTrace source app baseline   | Bundled ClearTrace source app parses, installs, syncs, renders admin screens, and seeds flat operational records with state machines and audit examples. | Public configure, checkout, customer portal, report download, public verification, provider execution, and richer production data. | Extend the source app only through reviewed operation/customer/public workstreams.                         | App schema, generated UI, installed apps.          | Public configure flow, verification registry. | Baseline remains parse/install/sync/render clean while new flows add only reviewed schema behavior.  |
| P0       | Public operation record creation | Target-scoped public operation routes support anonymous Turnstile create and command operations; Site uses contact-message submit and subscription.      | ClearTrace public app forms, anonymous-safe order/sample/test-request creation, guest references, and abuse boundaries.            | Add public operation bindings and execution models for non-Site ClearTrace request creation.               | Operations, public operation policy, routes.       | Conditional validation, customer flow.        | Public configure form creates only allowed flat records and rejects undeclared fields.               |
| P0       | Operation guards and effects     | Entity operations wrap CRUD or registered action-kind effects with input, output, idempotency, audit, and actor policy.                                  | Declarative guard evaluation, branching, multi-record transaction plans, and typed command result contracts.                       | Extend operation schema/parser/runtime around guarded declarative effects and transaction plans.           | Operation envelope, Authority storage.             | Conditional validation, timeline events.      | One operation validates input, creates/patches multiple records, emits an event, and replays safely. |
| P0       | Conditional validation           | View fields support `visibleWhen`; union variants support required fields; operation input can require declared fields.                                  | Server-side required-if rules, cross-field validation, and generated error messages.                                               | Add validation schema and Authority enforcement with generated form feedback.                              | App schema, Authority validation, generated forms. | Operation inputs, public configure flow.      | A context-specific required field is enforced by Authority and shown correctly in create/edit UI.    |
| P0       | Public/customer flow surfaces    | Workspace screens support owner or anonymous access; Site public rendering exists; ClearTrace admin screens exist.                                       | Public/customer generated flow for configure, send sample, tracking, report access, and verification outside Site-only pages.      | Add route/screen/binding patterns for public and customer operation flows.                                 | Installed app routes, public operations, auth.     | Commerce shell, verification registry.        | Anonymous or customer flow can start a test without exposing admin/schema surfaces.                  |
| P0       | Verification registry            | ClearTrace stores verification-record placeholders; public Site routes exist; no generic verification lookup route.                                      | Code lookup, hash/status display, revoke/amend handling, and non-Site public verification rendering.                               | Add verification registry primitive and public route renderer.                                             | Report versioning, public output policy.           | Document generation shell.                    | Public verification code displays status and hash for a released report.                             |
| P1       | State-machine expansion          | Enum-backed machines support transitions, terminal states, protected patches, transition actions, generated controls, and one flat transition event.     | Transition guards, required fields, role policy, previous-state restoration, and side effects beyond one event.                    | Extend state-machine schema and runtime transition execution where operations need richer lifecycle rules. | Operations, Authority storage, generated UI.       | Notifications, timeline view.                 | Invalid guarded transition is rejected; valid transition writes state and declared side effects.     |
| P1       | Audit and event timeline         | Operation invocation rows exist; state-machine transitions can emit one flat event; ClearTrace has `audit-event` records and settings views.             | App-generic event emission from operations and generated timeline views.                                                           | Add event declaration, event write helpers, and timeline presentation.                                     | Operation effects, state machines.                 | Work queues, notification triggers.           | Transition or operation writes an event record that appears in a related timeline.                   |
| P1       | Work queue presentation          | ClearTrace has work-item records and Lab queue filters through generated collection/table views.                                                         | First-class queue patterns, priority/status affordances, assignment actions, and dashboard summaries.                              | Add app schema patterns and generated queue presentation.                                                  | ClearTrace source app, state machines.             | Timeline view, dashboard summaries.           | Staff queue filters pending work by status/priority and links to source records.                     |
| P1       | Commerce shell                   | No app-generic invoice/payment primitive.                                                                                                                | Invoice, payment-intent, manual payment, provider boundary, and checkout handoff.                                                  | Add provider-agnostic commerce records/operations before external payment provider integration.            | Public operation creation, state machines.         | Notifications, customer access.               | Manual paid operation marks invoice/order paid and records a payment event.                          |
| P1       | Customer access                  | Owner passkeys and admin bearer boundary exist.                                                                                                          | Magic-link auth, customer session, guest claim, and customer portal route policy.                                                  | Add customer identity/session primitive separate from owner/admin.                                         | Public operation creation, installed app routes.   | Commerce shell, notifications.                | Guest order can be claimed and reopened through a customer session.                                  |
| P1       | Notifications                    | Site/CRM subscription records exist; no outbound queue.                                                                                                  | Templates, notification records, event triggers, send status, and provider adapter boundary.                                       | Add notification template and queued notification primitive.                                               | Event emission, provider config.                   | Commerce shell, customer access.              | Status transition enqueues a dev-visible notification record.                                        |
| P1       | Document generation              | Media stores image assets; archives include media; ClearTrace report-version stores `assetId` and hash placeholders.                                     | Document templates, render jobs, generated assets, and versioned report output.                                                    | Add document-generation shell with asset references and render-job records.                                | Media, operation effects.                          | Verification registry.                        | Release report creates or references a versioned document asset placeholder.                         |

## Change Queue

Draft Git-backed change workstreams. Do not create GitHub issues or local PRD
files. Each proposed workstream should be small enough to own one coherent spec
patch and parallelizable implementation tasks.

For each change draft, include:

- change id;
- problem;
- scope;
- non-goals;
- relevant specs;
- likely files or areas;
- task sections;
- acceptance criteria;
- expected devstate evidence;
- dependencies;
- parallelization notes;
- promotion notes for canonical specs.

Recommended sequencing:

1. Treat the shipped ClearTrace source app, operation envelope, public operation
   route, and state-machine foundation as baseline.
2. Prove the next slice with the smallest customer/public operation primitives
   needed to avoid hard-coding lab behavior.
3. Land schema/runtime primitives before relying on them in ClearTrace records.
4. Keep provider-backed payments, email delivery, and document rendering behind
   shells until the record/operation contracts are reviewed.
5. Promote only shipped primitive facts into `openspec/specs/*/spec.md`; keep
   ClearTrace examples as examples unless they define generic behavior.

Completed foundation:

- ClearTrace source app with generated admin screens and seed records.
- Entity operations and invocation envelopes for generated/protocol/public
  execution.
- State machines for enum-backed lifecycle movement.
- Target-scoped public operation routes for Site contact and subscription
  flows.

Suggested next change drafts:

1. `add-cleartrace-public-configure-flow`: public operation bindings and
   generated public form flow for starting a ClearTrace request.
2. `expand-operation-guards-effects`: operation guard evaluation, declarative
   side-effect plans, multi-record writes, typed command results, and replay
   evidence.
3. `add-conditional-validation`: field visibility, required-if rules,
   cross-field validation, and validation messages.
4. `add-customer-magic-link-access`: email identity, magic link session, guest
   record claiming, and customer portal route.
5. `add-commerce-shell`: invoice and payment-intent records, manual payment
   status, and provider-agnostic adapter stub.
6. `add-verification-registry`: verification records, public verification
   route, hash/status/version display, amendment and revocation handling.
7. `add-document-generation-shell`: document templates, render job records,
   asset references, and versioned output.
8. `add-timeline-event-view`: event query model, timeline component, and
   record-detail embedding.
9. `add-notification-templates`: notification templates, notification records,
   event trigger declarations, and dev-visible queued notifications.
10. `add-work-queues-dashboard`: work item model pattern, queue views,
    status/priority filters, and dashboard read models.
11. `add-support-conversations`: ticket and message records, related-record
    context, internal notes, and staff/customer surfaces.
12. `add-roles-orgs-groups`: roles, organisation membership, record access
    policies, and screen/operation visibility.
13. `add-provider-adapter-pattern`: provider interfaces for payment, email,
    render, document, and AI providers with dev mocks.
14. `add-custom-operation-presentations`: schema-backed flow registry and custom
    presentation mapping without app-wide React escape hatches.

## Next Vertical Slice

Define the smallest customer/public ClearTrace slice that proves the remaining
platform gap.

Already real:

1. Admin installs and opens the ClearTrace app.
2. Admin reviews customers, analytes, packages, orders, samples, test requests,
   work items, results, reports, report versions, verification records, and
   audit events.
3. Admin transitions samples, test requests, and reports through generated
   operation controls.
4. Admin can inspect seeded report-version and verification placeholders.

Required real behavior:

1. Public user starts a test.
2. User enters email, name, and sample basics.
3. Runtime creates flat order, sample, and test-request records through a
   declared public operation or reviewed command operation.
4. Admin marks payment received manually or records a manual payment event.
5. System generates sample code and submission slip shell.
6. Admin marks sample received and accessioned.
7. Admin uploads or creates a report shell.
8. Admin releases report.
9. Customer can view or download report through a reviewed customer/public
   access path.
10. Public verification page shows valid, amended, or revoked status.

May mock:

- real payment provider;
- real email provider;
- real PDF rendering;
- real lab instrument integration;
- AI support;
- complex result calculations.

Must not mock:

- record schema;
- relationships;
- state transitions;
- operations, action effects, idempotency, policy, or audit;
- app event trail;
- public verification model;
- customer-facing simplicity.

## Output Format

When running this prompt, produce:

1. Repo reality summary:
   - what exists today;
   - what is missing;
   - relevant files, specs, docs, and code read;
   - risks.
2. ClearTrace domain model:
   - entities;
   - fields;
   - relationships;
   - state machines;
   - operations;
   - actions;
   - views;
   - public outputs.
3. Universal primitive map:
   - domain requirement;
   - universal primitive;
   - other domains that need it;
   - proposed schema shape;
   - runtime impact;
   - generated UI impact.
4. Gap matrix:
   - priority;
   - primitive;
   - current support;
   - missing support;
   - proposed owner change;
   - dependencies;
   - can run in parallel with;
   - acceptance check.
5. Change drafts:
   - change id;
   - problem;
   - scope;
   - non-goals;
   - proposed files or areas likely to change;
   - task sections;
   - acceptance criteria;
   - expected test and devstate evidence;
   - promotion notes for canonical specs.
6. Next vertical slice:
   - smallest ClearTrace app flow;
   - what is real;
   - what is mocked;
   - platform primitives it proves.
7. Parallelization plan:
   - workstreams that can run now;
   - workstreams blocked by schema, state, operation, or action foundations;
   - suggested order;
   - file ownership boundaries to reduce conflicts.

## Guardrails

Do not:

- build a peptide marketplace;
- add sourcing, import, dosing, medical, or usage advice;
- hard-code peptide-specific logic into platform primitives;
- build deep abstractions without ClearTrace pressure proving them;
- hide all workflow behind custom React;
- create strategy-heavy docs with no implementation owner;
- create local PRD files;
- use external systems as the work queue;
- break existing Site, Tasks, Estii, or CRM apps;
- add external provider dependencies without dev or mock paths;
- require full production payment, email, or document integration in the first
  chunk.

Do:

- use ClearTrace to force real operational requirements;
- keep app data flat;
- compose in views, read models, operations, actions, and projections;
- make primitives reusable;
- keep generated back-office UI useful;
- allow custom UX only through schema-backed extension points;
- use Git-backed change branches for parallelizable work;
- include acceptance checks and devstate evidence.

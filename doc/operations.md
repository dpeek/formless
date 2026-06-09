# Operations Proposal

Last updated: 2026-06-09

Purpose: proposal for making entity operations the shared interaction contract
for UI, APIs, public forms, automation, audit, auth, and workflows.

This is not shipped behavior. Shipped behavior lives in
`openspec/specs/*/spec.md`.

## Problem

Formless already models entities, fields, relationships, queries, read models,
views, screens, mutations, and actions.

The interaction surface is split across several concepts:

- generic mutations for create, patch, and delete;
- entity actions for schema-declared commands;
- collection action slots;
- table action columns;
- tree composition controls;
- public action forms;
- route records for app, Site, instance, and redirect mounts.

This makes generated UI, public APIs, audit, auth, and future workflows reason
about related behavior through different paths.

## Proposal

Introduce operations as the semantic unit for interacting with an entity.

An operation describes what can be done in domain terms. UI buttons, menus,
forms, REST routes, public routes, hooks, CLI calls, and workflow triggers are
bindings onto operations.

Operations should cover:

- `list`: return records selected by a query.
- `get`: return one record by identity.
- `create`: create a record from declared input.
- `update`: update a record from declared input.
- `delete`: tombstone or remove a record through declared policy.
- `command`: run a domain command that may affect one or more records.
- `workflow`: start or resume a durable multi-step operation.

Existing mutations and actions can be represented as built-in operations before
the storage or UI contract changes.

## Operation Shape

An operation should declare:

- key and label;
- target entity;
- kind;
- scope: collection, record, selection, public, or system;
- input contract;
- output contract;
- effect model;
- idempotency policy;
- actor and permission policy;
- audit policy;
- optional UI binding hints;
- optional protocol binding hints.

Protocol and UI placement should not define the domain operation. They should
bind to it.

## Invocation Envelope

Every operation call should normalize into one invocation envelope before auth,
validation, execution, and audit.

The envelope should include:

- invocation id;
- operation key;
- app storage identity;
- entity;
- record id or selection when relevant;
- actor;
- source protocol;
- source route, host, UI surface, or public block when relevant;
- input;
- idempotency key;
- received timestamp.

This envelope becomes the root fact for execution, replay, audit, and workflow
state.

## Bindings

### Generated UI

Generated record, list, table, tree, and detail presentations should ask for
available operations for the presented entity and scope.

The UI can then render a consistent action menu or button group:

- record menu for record-scoped operations;
- collection toolbar for collection-scoped operations;
- selection toolbar for selection-scoped operations;
- public form for public operations;
- workflow status controls for resumable operations.

Create, edit, delete, move, tree add, tree remove, and custom commands should be
presented through the same operation model.

### REST

REST routes should be protocol bindings onto operations.

Examples:

- `GET /tasks` invokes `task.list`.
- `GET /tasks/:id` invokes `task.get`.
- `POST /tasks` invokes `task.create`.
- `PATCH /tasks/:id` invokes `task.update`.
- `DELETE /tasks/:id` invokes `task.delete`.
- `POST /tasks/:id/complete` invokes `task.complete`.

Instance route records can mount operation API surfaces at specific host and
path matches.

### Public Forms

Public actions already prove the shape: a public route resolves a schema
action, validates public input, verifies challenge policy, and commits through
Authority.

That should become a public operation binding instead of a separate action-only
path.

### Hooks And Automation

After-create hooks, CLI calls, worker tasks, scheduled work, and agent calls
should invoke operations through the same envelope.

System callers should be actors with explicit policy, not bypasses.

## Audit

Authority should keep one operation invocation log.

The current write log and action execution table are close, but they do not yet
store enough invocation context for a single audit trail.

The audit log should preserve:

- operation key and kind;
- actor and auth decision;
- source protocol and route;
- target app storage identity;
- input summary or safe input snapshot;
- affected changes;
- idempotency facts;
- status: accepted, rejected, committed, replayed, failed, or resumed;
- timestamps.

Change rows remain the sync materialization log. Operation invocations become
the semantic audit log.

## Auth And Permissions

Operation policy should become the main authorization boundary.

Current owner/admin/session/public action behavior can map into initial actors,
but the model should support:

- owner;
- admin bearer;
- public anonymous;
- CLI deployer;
- runner;
- app user;
- role;
- group;
- organization;
- service actor.

Policies should be able to cover:

- who can invoke the operation;
- which records can be read or mutated;
- which fields can be read, provided, or changed;
- whether public challenge proof is required;
- whether response fields are filtered by actor;
- whether the operation is visible in generated UI.

## Custom Actions And Workflows

Custom operations should support two levels.

Declarative operations use schema-owned primitives: validate input, read
records, create records, patch records, delete records, branch, and emit events.

Registered runtime operations call trusted package code by key. They still use
the same input, policy, audit, idempotency, and output envelope.

Workflow operations should store durable invocation and step state as flat
records. Cloudflare Durable Objects, Queues, and Workflows can execute or resume
steps, but committed app data should still flow through Authority.

## Migration Path

1. Add operation model types that can wrap existing mutations and entity
   actions.
2. Add invocation envelope and operation audit rows while preserving existing
   sync change rows.
3. Project CRUD operations from entity mutation policy and queries.
4. Project existing entity actions as command operations.
5. Move generated UI menus and buttons to operation presentation models.
6. Add REST protocol bindings for mounted app operation surfaces.
7. Move public actions to public operation bindings.
8. Add custom operation registration and workflow state.

## Open Questions

- Should operations be top-level schema records or nested under entities?
- How much REST surface should be generated by default?
- What is the minimum role/permission model before operation policy is useful?
- Should operation input reuse field schemas or define separate input schemas?
- How much input should be stored in the audit log?
- How should long-running operation status appear in generated UI?
- How should operation bindings be represented in instance route records?

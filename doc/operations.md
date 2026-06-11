# Operations Proposal

Last updated: 2026-06-11

Purpose: proposal for making entity operations the shared interaction contract
for UI, APIs, public forms, automation, audit, auth, and workflows.

This is not shipped behavior. Shipped behavior lives in
`openspec/specs/*/spec.md`.

## Domain Conventions

Operations are the domain contract for what can happen. Bindings are the
surface contract for where and how that operation is exposed.

Names use different casing by purpose:

- target keys use kebab-case or a single lower-case word;
- entity keys use singular kebab-case;
- operation key segments use kebab-case;
- field keys use lower camelCase because record values are consumed directly in
  TypeScript;
- cross-schema entity boundaries use `<schema-key>:<entity-key>`.

First-pass platform targets are:

- `app`: app entity records in Authority;
- `instance`: installs, routes, domain intent, and deploy intent;
- `workspace`: local sidecar and file source operations;
- `deployment`: desired state, attempts, leases, and observation;
- `provider`: provider resources and cleanup;
- `archive`: app and instance export and restore;
- `auth`: owner setup, login, and session bootstrap.

App-related nouns stay separate:

- `package-app`: bundled or reusable app package metadata, source schema key,
  seed records key, package revision, source schema hash, and default install
  facts;
- `app-install`: instance-local installation metadata that binds an install id
  to a package app, label, status, storage identity, and routes;
- `app`: the running app storage target containing entity records, schema,
  changes, snapshots, sync state, and app-local operation invocations.

`package-app` is installed as an `app-install`; an `app-install` points to one
app storage identity. The app storage identity owns records. The install record
does not embed app data.

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

For the first pass, operations are declared under their target entity. The
runtime derives the canonical operation key as `<entityKey>.<operationKey>`.
Top-level and cross-entity operations are deferred until entity-local operations
prove the contract.

First-pass operations should cover:

- `list`: return records selected by a query.
- `get`: return one record by identity.
- `create`: create a record from declared input.
- `update`: update a record from declared input.
- `delete`: tombstone or remove a record through declared policy.
- `command`: run a domain command that may affect one or more records.

`workflow` remains a reserved operation kind until there is a concrete
long-running workflow use case.

Existing mutations and actions can be represented as built-in operations before
the storage or UI contract changes.

## Operation Shape

An operation should declare:

- key and label;
- target;
- kind;
- scope, when the target supports scoped operations;
- input contract;
- output contract;
- effect model;
- idempotency policy;
- actor and permission policy;
- audit policy.

Public access is not an operation scope. It is an actor policy and binding on a
collection, record, or command operation. Selection and workflow operations are
reserved until their contracts are introduced.

Protocol, CLI, and UI placement do not define the domain operation. They bind
to it from separate binding declarations.

Entity-local operations use the current app-schema shape:
`entities.<entityKey>.operations.<operationKey>`. Runtime platform operations
should use a target-prefixed canonical key such as
`instance.app-install.create`, `workspace.source.save`, or
`deployment.desired-state.apply`.

## Schema Direction

Source schema should declare first-pass operations under
`entities.<entityKey>.operations`.

```json
{
  "entities": {
    "task": {
      "operations": {
        "create": {
          "kind": "create",
          "scope": "collection",
          "input": {
            "fields": {
              "title": { "field": "title", "required": true },
              "dueDate": { "field": "dueDate" },
              "priority": { "field": "priority" }
            }
          },
          "effect": { "type": "createRecord" }
        },
        "update": {
          "kind": "update",
          "scope": "record",
          "input": {
            "fields": {
              "title": { "field": "title" },
              "done": { "field": "done" },
              "dueDate": { "field": "dueDate" },
              "priority": { "field": "priority" }
            }
          },
          "effect": { "type": "patchRecord" }
        },
        "clearCompletedTasks": {
          "label": "Clear completed",
          "kind": "command",
          "scope": "collection",
          "target": { "query": "taskCompleted" },
          "effect": {
            "type": "runActionKind",
            "kind": "clear-completed"
          }
        }
      }
    }
  }
}
```

Operation input is its own contract. An input field can reference an entity
field to reuse field validation, labels, defaults, and generated editors. Inline
scalar input fields can cover command-only input that is not stored directly on
the target record.

First-pass output contracts should stay minimal and kind-shaped:

- `list`: records selected by the referenced query.
- `get`: one active record selected by record id.
- `create`: created record plus affected change ids.
- `update`: updated record plus affected change ids.
- `delete`: tombstoned record id plus affected change ids.
- `command`: typed command response plus affected change ids.

These shapes are the stable result boundary for generated UI, public bindings,
protocol adapters, automation callers, idempotency replay, and audit summaries.

Queries remain query primitives. `list` operations reference query keys instead
of replacing query declarations.

First-pass effects should stay small: create one record, patch one record,
delete or tombstone one record, or dispatch one registered schema action kind.
Declarative multi-step effects can come after the operation envelope, policy,
audit, and UI bindings are stable.

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

Bindings are external declarations that reference operation keys. They compose
operations into generated UI, CLI, API, public forms, hooks, workflow triggers,
and automation entry points.

A binding may define route, command, placement, form, output formatting, and
surface-specific availability. It must not redefine operation input, output,
effect, actor policy, idempotency, or audit behavior.

### Generated UI

Generated record, list, table, tree, and detail presentations should ask for
available operations for the presented entity and scope.

The UI can then render a consistent action menu or button group:

- record menu for record-scoped operations;
- collection toolbar for collection-scoped operations;
- selection toolbar for selection-scoped operations;
- public form for publicly exposed operations;
- workflow status controls for resumable operations.

Create, edit, delete, move, tree add, tree remove, and custom commands should be
presented through the same operation model.

Views can bind operation keys for placement and ordering while leaving operation
meaning on the entity operation declaration.

```json
{
  "views": {
    "taskHome": {
      "operations": [
        { "operation": "task.create", "placement": "toolbar" },
        { "operation": "task.clearCompletedTasks", "placement": "toolbar" }
      ]
    }
  }
}
```

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

REST should not be publicly exposed by schema declaration alone. A route record
must explicitly mount an operation API surface for an app install or schema-key
app. Schema-owned protocol binding hints can define method and path templates;
route records mount the surface and path prefix rather than duplicating every
operation binding.

### Public Forms

Public actions already prove the shape: a public route resolves a schema
action, validates public input, verifies challenge policy, and commits through
Authority.

That should become a public binding and anonymous actor policy on an operation
instead of a separate action-only path.

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

Operation invocation rows are Authority-owned system rows. They are not normal
app records and are not the sync materialization log by default.

By default, audit should store envelope metadata, status, affected change ids,
an input hash, and a safe input summary. Full input snapshots require explicit
operation audit policy and must exclude secret fields and challenge proofs.

```json
{
  "audit": {
    "input": "summary"
  }
}
```

## Auth And Permissions

Operation policy should become the main authorization boundary.

Current owner/admin/session/public action behavior can map into the first actor
set:

- owner;
- admin bearer;
- public anonymous;
- CLI deployer;
- runner.

Later actor support should include:

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

Workflow operation status should be deferred with the `workflow` operation kind.
When added, generated UI should read status from operation invocation records or
workflow state records and present resumable controls through the same operation
binding model.

## Migration Path

1. Add entity-local operation model types that can wrap existing mutations and
   entity actions.
2. Derive canonical operation keys as `<entityKey>.<operationKey>`.
3. Add invocation envelope and operation audit rows while preserving existing
   sync change rows.
4. Project CRUD operations from entity mutation policy and queries.
5. Project existing entity actions as command operations.
6. Move generated UI menus and buttons to operation presentation models.
7. Add REST protocol bindings for explicitly mounted app operation API
   surfaces.
8. Move public actions to public operation bindings.
9. Add custom operation registration and workflow state.

## Open Questions

- What exact contract should introduce selection-scoped operations for bulk
  workflows?
- What is the exact JSON grammar for field-referenced input and inline
  operation-only input?
- What are the default idempotency rules for each operation kind?
- Which REST path templates should be available as built-in binding presets?
- When workflow operations are added, are invocation records enough for status
  UI or do they need separate workflow state records?

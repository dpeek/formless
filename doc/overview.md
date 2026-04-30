---
name: Formless overview
description: "Big-picture product and runtime overview for the new Formless prototype."
last_updated: 2026-04-30
---

# Formless overview

## What we are building

Formless is a way to define an application's data model as runtime data and get a working app around it.

That sentence is easy to flatten into "forms from JSON." That is not the interesting part.

The interesting part is the full combination:

- the schema is data
- the browser keeps a local replica
- the server is still authoritative
- updates flow through a small generic mutation layer by default, with named actions where the domain actually needs them
- built-in field types carry their own editors and validation rules
- React only rerenders the exact pieces of UI that depend on the changed data

The current prototype already has the beginnings of this shape:

- the schema starts in [schema/app-schema.json](/Users/dpeek/code/formless/schema/app-schema.json)
- entities declare which generic mutations and named actions are enabled for generated editing surfaces
- the browser caches records and schema metadata in IndexedDB through [src/client/db.ts](/Users/dpeek/code/formless/src/client/db.ts)
- the authority lives in a Durable Object backed by SQLite in [src/worker/storage.ts](/Users/dpeek/code/formless/src/worker/storage.ts)
- bootstrap, schema, sync, mutation, and action routes live in [src/worker/authority.ts](/Users/dpeek/code/formless/src/worker/authority.ts)
- the browser sync loop lives in [src/client/sync.ts](/Users/dpeek/code/formless/src/client/sync.ts)

That is already more interesting than a CRUD generator. The generated home surface has a schema-backed collection workspace, reusable query scopes, shared item views, tab counts, and schema-declared actions. The next job is to make the rows themselves feel denser and more useful.

## Why this approach is interesting

Most schema-driven systems stop too early. They describe storage, maybe validation, and then hand the rest back to the application author.

Formless should go further. A type should not just tell the runtime how to store a value. It should also tell the runtime:

- how to validate it
- how to query it
- how to edit it
- how to render it

That means `text`, `boolean`, and `date` are not just primitive values. They are small behavior bundles.

That also changes what the schema means. The schema is not only a data contract. It is the starting point for the application's editing surface, rendering surface, and mutation surface.

The other interesting part is the replica model.

The browser should not be a thin form client that waits on the server for every read. It should have a real local store. That gives us:

- fast initial rendering from local state
- small reactive updates
- cleaner cross-tab behavior
- a better base for optimistic UI when we choose to use it

The authority still matters. The point is not to make the browser authoritative. The point is to make the browser useful even while the authority remains the source of truth.

## The core model

The product should revolve around six things:

1. Types
2. Entities
3. Mutations
4. Queries
5. Views
6. Sync

### Types

A type defines more than a storage codec.

The current schema embeds type names directly on fields. Later, types can become explicit behavior bundles. For example, a date type should eventually define:

- value format
- validation rules
- editor component
- display renderer
- filter operators such as `before`, `after`, and `on`

The same is true for booleans and text. And later for richer types such as money, references, enums, and markdown.

### Entities

An entity is the runtime data model that an app author actually works with.

For the current prototype, an entity is still small:

- a name
- a label
- a set of fields
- a generic mutation policy for create, patch, and disabled delete
- optional named actions such as `clearCompletedTasks`

That is enough for a first slice. It is not enough for the whole system.

Entity fields are app-owned values. They live under `StoredRecord.values`, can be edited by generic mutations when the entity allows it, and are the only fields list/edit views can currently render as editable controls.

Runtime-owned fields are separate. Values such as `id`, `createdAt`, and `deletedAt` belong to the record envelope, not to `entity.fields`. They are still addressable in queries through system field refs:

```json
{ "kind": "system", "name": "createdAt" }
```

The shared field catalog keeps these two ownership domains visible. A value ref points at `record.values`; a system ref points at record metadata. That keeps system fields queryable without pretending they are user-patchable app fields.

### Mutations

The runtime should not force an app author to name every ordinary edit as an action.

The default mutation layer should stay small:

- `create`
- `patch`
- `delete`

That gives the runtime a generic way to support most editing surfaces. A title input can commit a patch. A checkbox can commit a patch. A form save can commit one patch that spans several fields.

The current prototype makes this mutation surface explicit in the schema. Each entity declares whether generic `create` and `patch` are enabled, and `delete` is explicitly disabled until delete execution exists. The authority enforces that policy for new writes, while accepted mutation IDs still replay idempotently.

Generic patching is not enough for the full product. The server will still need a place for business logic. The cleanest eventual model is:

- generic mutations are the default transport
- entities can override the default implementation on the authority
- named actions are reserved for behavior that is genuinely more than an edit

So a task title change does not need to become `renameTask` by default. It can be a patch handled by the task entity's patch logic. An action like `archiveTask` still deserves a name because it is a command, not a field edit.

### Queries

Collection queries are named reusable record scopes. A query belongs to one entity and carries a portable expression:

```json
{
  "taskCompleted": {
    "label": "Completed",
    "entity": "task",
    "expression": {
      "kind": "where",
      "ref": { "kind": "value", "name": "done" },
      "op": "eq",
      "value": true
    }
  }
}
```

The same query can drive a collection tab, an action target, or a future summary slot. The expression model is intentionally small:

- `{ "kind": "all" }`
- `where` with `eq` or `before`
- `and` over child expressions
- `{ "kind": "today" }` for date cutoffs

Local rendering filters the browser replica with the shared evaluator, while authority actions resolve the named target query against authoritative records.

### Views

The generic generated CRUD UI should stay in the system, but as the fallback layer.

The main runtime goal is not "forms for tables." It is "the schema defines enough behavior that a user or agent can build a real application surface from it."

Views now separate the reusable pieces:

- create views choose which fields participate in generated create forms
- item views choose which fields render inline and how they commit edits
- collection views define a user-facing workspace around one entity
- collection query slots choose which named queries appear as tabs
- collection action slots choose which create views and entity actions appear in that workspace

That should eventually expand into:

- create views
- item views
- collection views
- detail views
- compact inline editors
- specialized renderers for known types

Views should also own commit policy.

That means a view decides whether an editor:

- commits immediately
- commits on field blur or Enter
- participates in a draft form that saves several fields at once
- uses optimistic local echo or waits for authority confirmation

This keeps types focused on value behavior and keeps edit semantics attached to the actual UI context.

### Counts

Counts are host-level displays over queries, not top-level schema objects. A collection query tab can ask for a count badge, and an entity-action slot can ask for a count badge over that action's target query.

Those counts are computed from the browser replica in [src/client/store.ts](/Users/dpeek/code/formless/src/client/store.ts). They are not entity fields. They are not stored under `StoredRecord.values`, written to IndexedDB as values, persisted in SQLite, or emitted as change rows. They are local feedback for the UI, not authority state.

That boundary matters for actions. The local completed count can say zero while the authority still has completed tasks the browser has not synced yet. `clearCompletedTasks` must stay enabled based on schema action availability, not on a local count. The authority reads the active schema, evaluates the action target query against authoritative records, and writes the resulting tombstones. After the authority responds, `ActionResponse.changes.length` is the canonical affected count for status copy.

The overdue query uses the shared query model instead of UI-specific code:

```json
{
  "kind": "and",
  "expressions": [
    {
      "kind": "where",
      "ref": { "kind": "value", "name": "done" },
      "op": "eq",
      "value": false
    },
    {
      "kind": "where",
      "ref": { "kind": "value", "name": "dueDate" },
      "op": "before",
      "value": { "kind": "today" }
    }
  ]
}
```

`{ "kind": "today" }` is resolved at evaluation time. In the browser, [src/app.tsx](/Users/dpeek/code/formless/src/app.tsx) uses the local calendar date and schedules a refresh at the next local midnight.

### Sync

The sync model is part of the product, not a transport detail.

The system needs:

- a server authority
- a local browser replica
- explicit mutations sent to the authority
- incremental sync back into the browser store

The current prototype already has the backbone of this through `bootstrap`, `sync`, and `mutations`.

Named actions now use the same change-log and local-merge path, so commands such as `clearCompletedTasks` can update the local replica without a bespoke client-side state model.

Named actions can also declare a target query. The client submits only `{ actionId, entity, action }`; it does not send target IDs or a query. The authority reads the active schema, evaluates the target query against its own active records, and then runs the action effect.

For example, `clearCompletedTasks` is a named action whose target is `value.done eq true`. If a record no longer matches on the authority, it is not affected. If a matching record exists on the authority but the client has not seen it yet, it is still affected. Replay by `actionId` returns the recorded execution instead of selecting targets again.

## Running example: personal task planner

The best working example for this system is not a generic todo list. It is a personal task planner.

That is a better fit because it uses:

- text
- boolean
- date
- explicit actions
- local-first feeling

without forcing us into relations, collaboration, or complex permissions too early.

A useful example schema looks like this:

```json
{
  "version": 1,
  "entities": {
    "task": {
      "label": "Task",
      "fields": {
        "title": { "type": "text", "required": true },
        "done": { "type": "boolean", "required": true, "default": false },
        "dueDate": { "type": "date", "required": false }
      },
      "mutations": {
        "create": {
          "enabled": true
        },
        "patch": {
          "enabled": true
        },
        "delete": {
          "enabled": false
        }
      },
      "actions": {
        "clearCompletedTasks": {
          "label": "Clear completed",
          "kind": "clear-completed",
          "target": {
            "query": "taskCompleted"
          }
        }
      }
    }
  },
  "queries": {
    "taskAll": {
      "label": "All",
      "entity": "task",
      "expression": { "kind": "all" }
    },
    "taskActive": {
      "label": "Active",
      "entity": "task",
      "expression": {
        "kind": "where",
        "ref": { "kind": "value", "name": "done" },
        "op": "eq",
        "value": false
      }
    },
    "taskCompleted": {
      "label": "Completed",
      "entity": "task",
      "expression": {
        "kind": "where",
        "ref": { "kind": "value", "name": "done" },
        "op": "eq",
        "value": true
      }
    },
    "taskOverdue": {
      "label": "Overdue",
      "entity": "task",
      "expression": {
        "kind": "and",
        "expressions": [
          {
            "kind": "where",
            "ref": { "kind": "value", "name": "done" },
            "op": "eq",
            "value": false
          },
          {
            "kind": "where",
            "ref": { "kind": "value", "name": "dueDate" },
            "op": "before",
            "value": { "kind": "today" }
          }
        ]
      }
    }
  },
  "itemViews": {
    "taskListItem": {
      "entity": "task",
      "fields": {
        "title": { "editor": "text", "commit": "field-commit" },
        "done": { "editor": "boolean", "commit": "immediate" },
        "dueDate": { "editor": "date", "commit": "field-commit" }
      }
    }
  },
  "views": {
    "taskHome": {
      "type": "collection",
      "label": "Tasks",
      "entity": "task",
      "queries": [
        { "query": "taskAll", "count": { "type": "count" } },
        { "query": "taskActive", "count": { "type": "count" } },
        { "query": "taskCompleted", "count": { "type": "count" } },
        { "query": "taskOverdue", "count": { "type": "count" } }
      ],
      "defaultQuery": "taskAll",
      "result": { "type": "list", "itemView": "taskListItem" },
      "actions": [
        { "type": "create", "createView": "taskCreate" },
        {
          "type": "entityAction",
          "action": "clearCompletedTasks",
          "count": { "type": "count" }
        }
      ]
    },
    "taskCreate": {
      "type": "create",
      "entity": "task",
      "fields": {
        "title": {
          "editor": "text"
        },
        "dueDate": {
          "editor": "date"
        }
      }
    }
  }
}
```

This example captures what we want better than a notes app does.

A notes app mostly proves rich text and storage. A task planner proves mutation semantics.

## What it should feel like to build on Formless

The authoring flow should look like this:

1. Use the built-in field types the runtime supports.
2. Define the entities and fields.
3. Decide what generic mutations the entity supports.
4. Add named actions only where the domain needs more than an ordinary edit.
5. Add reusable collection queries for the record scopes the UI and actions need.
6. Add item views and collection views that assemble those scopes into workspaces.
7. Use count badges where a host surface needs local query feedback.
8. Replace or refine the generated views where the domain needs more shape.

That sequence is important.

If the system starts from tables and CRUD, we will end up with a CRUD framework that happens to have a sync layer. If it starts from field types, entities, mutation policy, actions, views, and local replica semantics, we have a chance of building something narrower and more opinionated in a useful way.

## Generic mutations and named actions

This distinction matters enough to state plainly.

Generic mutations should stay in the system, and they should be the default way ordinary editing works.

That is not the same thing as saying generic CRUD is the whole programming model.

The split should be:

- generic mutations for ordinary editing
- named actions for real commands
- authority-side handlers where an entity needs business logic around generic mutations

For example:

- changing `task.title` should usually be a patch
- toggling `task.done` should usually be a patch
- setting `task.dueDate` should usually be a patch
- archiving a task should probably be a named action
- clearing all completed tasks should definitely be a named action

This keeps the client simpler. The editor does not need to know a command name for every keystroke. It only needs to produce draft values and commit points. The view decides when to flush those drafts. The authority decides what a patch means for that entity.

Generic fallback UI is still useful for:

- debugging
- admin surfaces
- fallback inspectors
- early-stage generated UI

But real apps still need explicit commands when the behavior is bigger than "write these fields."

This split affects a lot of things:

- validation can happen both at the field layer and inside entity-specific patch handlers
- permissions later can target generic capabilities and named actions separately
- optimistic behavior can be chosen by view policy and refined for specific actions
- logs and history are easier to read
- agents have a clearer contract for what they are allowed to do

The schema should describe not just what data exists, but what changes are legal and which of those changes are ordinary edits versus real commands.

## Type-driven editors and renderers

The type system should grow outward from the runtime we already have.

For each supported type, the runtime should know:

- how to parse it
- how to validate it
- how to render it in a generic list or detail view
- how to edit it in a generic form
- how to filter it in a query UI

The first three built-in types are enough to prove this:

- `text`
- `boolean`
- `date`

That already gives us:

- text inputs and inline text rendering
- checkboxes and boolean editing
- date inputs and date validation

Once that foundation is in place, richer types start to make more sense because they plug into an established runtime model instead of arriving as one-off widget code.

## Local replica and fine-grained rendering

One of the strongest ideas from the earlier system is still worth keeping: components should be able to subscribe to the smallest piece of data they actually depend on.

That means:

- a component can read one entity and one field
- when that field changes, only that component updates
- a mutation can apply one atomic update to the local store
- reconciliation from the authority uses the same local update model

This is more efficient than broad cache invalidation, and it also produces a cleaner mental model for UI authors. The UI is bound to the local replica. The authority keeps that replica honest.

The current prototype does not yet expose the full field-level subscription story, but the shape is already there:

- local state is in IndexedDB
- the app hydrates from local state before sync finishes
- sync merges incremental changes back into local state

The long-term goal is to make that reactive model more precise rather than more generic.

## Optimistic vs authoritative writes

This is one of the real design problems in the system, and the document should not pretend otherwise.

The cleanest framing is:

The authority is always canonical. Optimism is a view policy first, and a command-specific choice where needed.

That gives us room for different editing behaviors:

- some fields should commit immediately
- some fields should wait for blur or Enter
- some forms should batch several fields into one patch
- some interactions can be echoed locally and rolled back if rejected
- some actions may not be worth making optimistic at all

For example:

- inline checkbox toggles are good optimistic candidates
- inline title edits might be optimistic with rollback
- multi-field edits may be better as a save button that submits one patch
- schema edits probably should not be optimistic in the first version

The important point is that optimism should not be turned on for the whole storage layer in one sweep. It should follow the shape of the UI and the semantics of the thing being changed.

## Current prototype and next steps

The current prototype is still small on purpose.

It currently proves:

- one checked-in schema file used as the authority seed
- one task planner seed schema with `text`, `boolean`, and `date` fields
- authority-owned runtime schema editing through `/schema`
- one generated type-aware create form
- one generated task collection workspace
- reusable query scopes for all, active, completed, and overdue tasks
- generated tab counts derived from collection query slots
- a shared task item view for row field config
- one query-targeted named action, `clearCompletedTasks`
- local target-count feedback for the clear-completed action
- one authority-backed record store
- soft-deleted tombstones for action-produced removals
- bootstrap and incremental sync
- local IndexedDB hydration
- schema metadata flowing through local replica sync
- generic `create` and `patch` mutations flowing through the same change log and local merge path
- action-produced changes flowing through that same change log and local merge path

The task planner foundation is now implemented: the checked-in task schema seeds storage, `/schema` edits the authority-owned schema, polling sync can refresh stale browser replicas, ordinary field edits submit validated patches back to the authority, collection tabs and count badges use schema-owned queries, and `clearCompletedTasks` proves the query-targeted named-action path with authority-reported affected counts.

The next slice is about making generated rows denser and giving views better display policy. The rough priority list lives in [doc/roadmap.md](/Users/dpeek/code/formless/doc/roadmap.md).

## What success looks like

A useful version of Formless is not one where a user can generate a generic admin app from a schema. Plenty of systems can do that.

A useful version is one where a user or agent can define:

- a few domain types
- a few entities
- a generic mutation policy and a few named actions where they matter

and get back:

- a local-first application shell
- an authoritative sync model
- type-aware editors and renderers
- reusable collection queries and collection workspaces
- derived count badges that are not persisted as data
- a default UI that is good enough to use
- a runtime that can be refined rather than rewritten

That is the bar the prototype should keep aiming at.

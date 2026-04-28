---
name: Formless overview
description: "Big-picture product and runtime overview for the new Formless prototype."
last_updated: 2026-04-28
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
- known types carry their own editors and renderers
- React only rerenders the exact pieces of UI that depend on the changed data

The current prototype already has the beginnings of this shape:

- the schema starts in [schema/app-schema.json](/Users/dpeek/code/formless/schema/app-schema.json)
- the browser caches records and schema metadata in IndexedDB through [src/client/db.ts](/Users/dpeek/code/formless/src/client/db.ts)
- the authority lives in a Durable Object backed by SQLite in [src/worker/storage.ts](/Users/dpeek/code/formless/src/worker/storage.ts)
- bootstrap, sync, and mutation routes live in [src/worker/authority.ts](/Users/dpeek/code/formless/src/worker/authority.ts)
- the browser sync loop lives in [src/client/sync.ts](/Users/dpeek/code/formless/src/client/sync.ts)

That is already more interesting than a CRUD generator. The next job is to make the product thesis explicit.

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

The product should revolve around five things:

1. Types
2. Entities
3. Mutations
4. Views
5. Sync

### Types

A type defines more than a storage codec.

For example, a date type should eventually define:

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

That is enough for a first slice. It is not enough for the whole system.

### Mutations

The runtime should not force an app author to name every ordinary edit as an action.

The default mutation layer should stay small:

- `create`
- `patch`
- `delete`

That gives the runtime a generic way to support most editing surfaces. A title input can commit a patch. A checkbox can commit a patch. A form save can commit one patch that spans several fields.

But generic patching is not enough on its own. The server still needs a place for business logic. The cleanest model is:

- generic mutations are the default transport
- entities can override the default implementation on the authority
- named actions are reserved for behavior that is genuinely more than an edit

So a task title change does not need to become `renameTask` by default. It can be a patch handled by the task entity's patch logic. An action like `archiveTask` still deserves a name because it is a command, not a field edit.

### Views

The generic generated CRUD UI should stay in the system, but as the fallback layer.

The main runtime goal is not "forms for tables." It is "the schema defines enough behavior that a user or agent can build a real application surface from it."

That means views should eventually be schema-driven too:

- list views
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

### Sync

The sync model is part of the product, not a transport detail.

The system needs:

- a server authority
- a local browser replica
- explicit mutations sent to the authority
- incremental sync back into the browser store

The current prototype already has the backbone of this through `bootstrap`, `sync`, and `mutations`.

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
  "types": {
    "text": {},
    "boolean": {},
    "date": {}
  },
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
          "enabled": true,
          "handler": "taskPatch"
        },
        "delete": {
          "enabled": false
        }
      },
      "actions": {
        "archiveTask": {
          "label": "Archive",
          "handler": "archiveTask"
        },
        "clearCompleted": {
          "label": "Clear completed",
          "handler": "clearCompletedTasks"
        }
      }
    }
  },
  "views": {
    "taskListItem": {
      "entity": "task",
      "fields": {
        "title": {
          "editor": "text",
          "commit": "field-commit"
        },
        "done": {
          "editor": "boolean",
          "commit": "immediate"
        }
      }
    },
    "taskEditor": {
      "entity": "task",
      "fields": {
        "title": {
          "editor": "text",
          "commit": "form-save"
        },
        "dueDate": {
          "editor": "date",
          "commit": "form-save"
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

1. Define the types you want to use.
2. Define the entities and fields.
3. Decide what generic mutations the entity supports and whether any of them need server-side handlers.
4. Add named actions only where the domain needs more than an ordinary edit.
5. Let the runtime provide a default list, detail, and editing surface.
6. Replace or refine the generated views where the domain needs more shape.

That sequence is important.

If the system starts from tables and CRUD, we will end up with a CRUD framework that happens to have a sync layer. If it starts from types, entities, mutation policy, and local replica semantics, we have a chance of building something narrower and more opinionated in a useful way.

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
- checkboxes, toggles, and boolean badges
- date pickers, date formatting, and date filters

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
- one generated create form
- one generated list
- one authority-backed record store
- bootstrap and incremental sync
- local IndexedDB hydration
- authority-owned runtime schema editing
- schema metadata flowing through local replica sync

The schema authority slice is now implemented: the checked-in schema seeds storage, `/schema`
edits the authority-owned schema, and polling sync can refresh a stale browser replica when the
schema changes elsewhere.

The next useful product proof is probably not more generic CRUD. It is one better domain example
with a real patch policy, commit policy, and a few named actions, likely the task planner described
above.

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
- a default UI that is good enough to use
- a runtime that can be refined rather than rewritten

That is the bar the prototype should keep aiming at.

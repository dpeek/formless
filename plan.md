---
Status: Proposed
Last Updated: 2026-04-28
---

# Formless plan

## Must read

- [AGENTS.md](/Users/dpeek/code/formless/AGENTS.md)
- [package.json](/Users/dpeek/code/formless/package.json)
- [vite.config.ts](/Users/dpeek/code/formless/vite.config.ts)
- [wrangler.jsonc](/Users/dpeek/code/formless/wrangler.jsonc)
- [schema/app-schema.json](/Users/dpeek/code/formless/schema/app-schema.json)
- [src/app.tsx](/Users/dpeek/code/formless/src/app.tsx)
- [src/client/schema.ts](/Users/dpeek/code/formless/src/client/schema.ts)
- [src/client/db.ts](/Users/dpeek/code/formless/src/client/db.ts)
- [src/client/sync.ts](/Users/dpeek/code/formless/src/client/sync.ts)
- [src/worker/authority.ts](/Users/dpeek/code/formless/src/worker/authority.ts)
- [src/worker/storage.ts](/Users/dpeek/code/formless/src/worker/storage.ts)
- [src/worker/authority.test.ts](/Users/dpeek/code/formless/src/worker/authority.test.ts)
- [src/worker/storage.test.ts](/Users/dpeek/code/formless/src/worker/storage.test.ts)
- [src/client/db.test.ts](/Users/dpeek/code/formless/src/client/db.test.ts)
- [src/client/sync.test.ts](/Users/dpeek/code/formless/src/client/sync.test.ts)

## Goal

Make the schema authoritative runtime data owned by the authority and editable in the browser.

The first slice already proved a lot:

- schema is JSON
- the browser can render a form from that schema
- the authority is a Durable Object backed by SQLite
- the client keeps a local IndexedDB cache
- records sync across clients through bootstrap plus incremental sync

The biggest remaining mismatch with the product direction is that the live schema is still imported from disk at build time. This slice fixes that.

The end state for this round is:

- the authority stores the active schema
- `/schema` becomes a real schema editor
- `/` renders from the active schema returned by the authority
- the checked-in schema file becomes a seed, not the live source of truth

## Context

The long-term direction is still:

- schema authored as JSON
- generated UI from that schema
- Durable Object authority with SQLite
- browser-local cache with sync to the authority

This slice moves the schema part of that story from “checked-in configuration” to “runtime data”.

That matters because a schema-driven product is not really schema-driven if changing the schema still requires a code change and deploy.

What this slice is not:

- it is not schema code generation
- it is not richer field types
- it is not record updates or deletes
- it is not full migrations

It is just the smallest slice that makes the schema live in the system the same way the records do.

## Current state

Right now the active schema still comes from the repo:

- [src/client/schema.ts](/Users/dpeek/code/formless/src/client/schema.ts) imports [schema/app-schema.json](/Users/dpeek/code/formless/schema/app-schema.json)
- [src/worker/authority.ts](/Users/dpeek/code/formless/src/worker/authority.ts) uses that imported schema for bootstrap and mutation validation

That means:

- the authority does not own the active schema
- the browser cannot change the schema
- `/schema` is only a viewer
- the product cannot yet prove “schema as runtime data”

The records side is already much closer to the product thesis than the schema side is. That is why the next slice should focus here.

## Approach

Keep the existing package and runtime shape. Do not widen product scope.

The change is conceptual, not architectural:

- the active schema moves into the authority
- the authority returns it from the API
- the browser caches it just like it caches records
- `/schema` can submit a validated replacement schema

The checked-in JSON file stays, but only as a seed used when storage is empty.

### First principle

There should be exactly one live schema at runtime, and it should come from the authority.

The browser may cache it. The repo may seed it. But the authority owns it.

### Scope constraints for this slice

Keep all of these constraints:

- one package
- one authority
- text-only field kind
- create-only record mutations
- no code generation
- no record migrations
- raw JSON editing is acceptable for `/schema`

Those constraints are what make this slice small enough to finish.

## Rules

- Do not add more CRUD in this slice.
- Do not add more field types in this slice.
- Do not add a visual schema builder. A textarea editor is enough.
- The authority must be the live source of schema truth.
- The client must stop treating the checked-in schema import as the canonical live schema.
- The checked-in schema file may seed an empty authority, but it must not override an existing stored schema.
- Reject clearly incompatible schema changes rather than pretending migrations exist.
- Keep tests focused on schema load, save, validation, and downstream rendering behavior.

## Proposed file layout

The layout can stay mostly the same. The important change is ownership, not number of files.

```text
schema/
  app-schema.json

src/
  app.tsx
  main.tsx
  style.css
  app.test.tsx
  client/
    db.ts
    schema.ts
    sync.ts
    state.ts
    broadcast.ts
    db.test.ts
    sync.test.ts
  shared/
    schema.ts
    protocol.ts
    ids.ts
    clock.ts
  worker/
    index.ts
    authority.ts
    storage.ts
    authority.test.ts
    storage.test.ts
```

What changes inside that layout:

- `schema/app-schema.json` becomes the seed schema
- `src/worker/storage.ts` gains schema persistence helpers
- `src/worker/authority.ts` gains schema read and schema update routes
- `src/client/sync.ts` gains schema fetch and schema save helpers
- `src/app.tsx` stops treating the imported schema as the live runtime source

## Data model

### Seed schema

Keep the checked-in seed schema shape:

```json
{
  "version": 1,
  "entities": {
    "note": {
      "label": "Note",
      "fields": {
        "text": {
          "type": "text",
          "required": true
        }
      }
    }
  }
}
```

### Stored runtime schema

Persist one active schema document in SQLite.

The simplest storage shape is one table:

- `app_schema`
  - `id INTEGER PRIMARY KEY CHECK (id = 1)`
  - `schema_json TEXT NOT NULL`
  - `updated_at TEXT NOT NULL`

Operational rule:

- if no row exists, seed it from `schema/app-schema.json`
- if a row exists, always use that row

### Records

Keep the existing `records` and `changes` tables for record data and sync history.

This slice does not require rethinking the record model.

## HTTP contract

Keep the existing routes:

- `GET /api/bootstrap`
- `GET /api/sync?after=<cursor>`
- `POST /api/mutations`

Add:

- `GET /api/schema`
- `POST /api/schema`

### `GET /api/schema`

Purpose:

- return the active runtime schema

Response:

```ts
{
  schema: AppSchema;
}
```

### `POST /api/schema`

Purpose:

- validate and persist a replacement runtime schema

Request:

```ts
{
  schema: AppSchema;
}
```

Response:

```ts
{
  schema: AppSchema;
  updatedAt: string;
}
```

### `GET /api/bootstrap`

Keep the current purpose, but make sure the returned `schema` comes from authority storage, not from a direct import.

## Compatibility policy

This is what keeps the slice small.

Allow:

- changing entity labels
- changing field order if represented in JSON ordering only
- adding another text field
- changing `required` from `false` to `true` only when existing stored records are still valid, or reject for now

Reject for now:

- changing field type
- deleting a field that already has stored values
- renaming field keys
- removing an entity that has stored records

The policy can be strict. Strict is better than pretending migrations exist.

If a proposed schema change is incompatible, return `400` with a clear message.

## Browser behavior

### `/`

The home route should render from the live cached schema returned by the authority.

Requirements:

- use cached schema from IndexedDB on initial paint if available
- reconcile with `GET /api/bootstrap`
- render the generated create form from the active schema

### `/schema`

The schema route becomes a real editor.

Requirements:

- show the current active schema JSON in a textarea
- allow the user to edit and save it
- validate on the server
- update local cached schema after a successful save
- show the validation error message if the save is rejected

Raw JSON editing is enough. The point of this slice is not a polished schema authoring UI. It is runtime schema ownership.

## Implementation phases

### Phase 1: authority-owned schema storage

Goal:

Move the active schema into the authority without changing the rest of the product surface yet.

Files:

- [src/worker/storage.ts](/Users/dpeek/code/formless/src/worker/storage.ts)
- [src/worker/authority.ts](/Users/dpeek/code/formless/src/worker/authority.ts)
- [schema/app-schema.json](/Users/dpeek/code/formless/schema/app-schema.json)

Tasks:

- add schema storage bootstrap to SQLite
- add helpers to read and write the active schema
- seed storage from the checked-in JSON file when empty
- update bootstrap and mutation validation to read the active stored schema

Done when:

- the authority can start from an empty database and persist a seeded schema
- mutation validation uses the stored schema rather than a direct import

### Phase 2: schema API routes

Goal:

Expose the active schema through explicit authority routes.

Files:

- [src/worker/authority.ts](/Users/dpeek/code/formless/src/worker/authority.ts)
- [src/shared/protocol.ts](/Users/dpeek/code/formless/src/shared/protocol.ts)

Tasks:

- add `GET /api/schema`
- add `POST /api/schema`
- validate submitted schema documents
- reject incompatible schema changes clearly

Done when:

- the authority can return the active schema
- the authority can accept a valid compatible replacement schema

### Phase 3: client schema sync and cache

Goal:

Make the browser consume the authority-owned schema as live runtime data.

Files:

- [src/client/schema.ts](/Users/dpeek/code/formless/src/client/schema.ts)
- [src/client/db.ts](/Users/dpeek/code/formless/src/client/db.ts)
- [src/client/sync.ts](/Users/dpeek/code/formless/src/client/sync.ts)
- [src/client/state.ts](/Users/dpeek/code/formless/src/client/state.ts)

Tasks:

- keep the checked-in schema import only as a client fallback if needed before first bootstrap
- make bootstrap and schema fetch populate the cached live schema
- add client helpers for reading and saving schema
- make local state refresh after schema save

Done when:

- the browser treats the authority-returned schema as the active one
- reloading the page restores cached schema before reconciliation completes

### Phase 4: schema editor route

Goal:

Turn `/schema` from a viewer into a real editor.

Files:

- [src/app.tsx](/Users/dpeek/code/formless/src/app.tsx)

Tasks:

- replace the read-only schema view with a textarea editor
- submit edits to `POST /api/schema`
- show save status and validation errors
- refresh the home route view from the saved schema

Done when:

- a valid schema edit changes the generated form after save and refresh
- no code change is required to make a supported schema edit take effect

### Phase 5: tests

Goal:

Cover the new runtime-schema behavior directly.

Files:

- [src/worker/storage.test.ts](/Users/dpeek/code/formless/src/worker/storage.test.ts)
- [src/worker/authority.test.ts](/Users/dpeek/code/formless/src/worker/authority.test.ts)
- [src/client/db.test.ts](/Users/dpeek/code/formless/src/client/db.test.ts)
- [src/client/sync.test.ts](/Users/dpeek/code/formless/src/client/sync.test.ts)
- [src/app.test.tsx](/Users/dpeek/code/formless/src/app.test.tsx)

Tests to add:

- authority seeds schema from disk on empty storage
- authority returns stored schema from `GET /api/schema`
- schema updates persist and survive a new authority instance
- incompatible schema changes are rejected
- bootstrap returns the stored schema
- client cache updates when schema is saved
- route smoke tests still pass with the editor UI

Done when:

- the runtime-schema flow is covered at the storage, authority, client, and route seam

## Task list

- [ ] Add schema persistence to the authority storage layer.
- [ ] Seed the authority-owned schema from `schema/app-schema.json` only when storage is empty.
- [ ] Make bootstrap and mutation validation read the stored active schema.
- [ ] Add `GET /api/schema` and `POST /api/schema`.
- [ ] Add compatibility validation for schema changes and reject unsupported changes clearly.
- [ ] Update the client sync layer to fetch, cache, and save the active schema.
- [ ] Replace the `/schema` read-only view with a textarea editor and save flow.
- [ ] Add focused tests for schema persistence, schema routes, compatibility validation, and client schema cache behavior.
- [ ] Run `vp check`.
- [ ] Run `vp test`.

## Open questions

- Should adding a new text field to an entity with existing records be allowed immediately, with older records simply lacking that field? I think yes, as long as the runtime and UI tolerate missing optional values cleanly.
- Should a schema save trigger any record-side sync invalidation event, or is refreshing the locally cached schema enough for this slice? My default is to keep it local for now and only add cross-client schema invalidation if it becomes visibly necessary.

## Success criteria

- The authority persists the active schema in SQLite.
- The checked-in schema file acts only as an initial seed.
- `GET /api/bootstrap` returns the authority-owned schema.
- `GET /api/schema` and `POST /api/schema` work.
- `/schema` can edit and save the active schema as raw JSON.
- `/` renders from the active runtime schema rather than a direct checked-in source of truth.
- A supported schema edit can change the generated form without a code change.
- Incompatible schema edits fail clearly.
- `vp check` passes.
- `vp test` passes.

## Non-goals

- TypeScript code generation from schema
- more field types beyond the current text-only model
- record update or delete mutations
- schema migrations for incompatible changes
- visual schema builder UI
- auth and permissions
- websocket or SSE schema sync

## Why this is the right next slice

The current slice already proves that records can sync through an authority. The next question is whether the schema itself can become part of that same runtime system.

That is the real product move.

If we add more CRUD or more field types first, we will make the system broader without making it more aligned with the product thesis. Moving the schema into the authority is smaller than it looks and more important than it looks. Once that is true, the app starts behaving like a schema-defined system instead of a coded demo with a schema file nearby.

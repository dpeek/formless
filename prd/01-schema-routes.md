# PRD 01: Schema-backed app routes

Status: active
Current chunk: SR-05 route-keyed app shell
Last updated: 2026-05-05

## Goal

Support multiple direct app routes backed by separate schemas.

First routes:

- `/tasks`
- `/rates`

Each route should:

- bootstrap from the correct checked-in source schema;
- keep authority state isolated;
- keep browser local replica state isolated;
- expose route-scoped reset schema and reset seed data controls.

The result should feel like two schema-backed apps, not one global app whose schema is manually swapped.

## Source map

- App shell: `src/app.tsx`.
- Home route: `src/app/routes/home.tsx`.
- Schema route: `src/app/routes/schema.tsx`.
- Dev reset controls: `src/app/dev-actions.tsx`.
- Worker dispatch: `src/worker/index.ts`.
- Authority routes: `src/worker/authority.ts`.
- Storage: `src/worker/storage.ts`.
- Seed parsing: `src/worker/schema-apps.ts`.
- Seed compatibility exports: `src/worker/fixtures.ts`.
- Client API calls: `src/client/sync.ts`.
- Client local DB: `src/client/db.ts`.
- Client broadcast: `src/client/broadcast.ts`.
- Client store: `src/client/store.ts`.
- Shared app registry: `src/shared/schema-apps.ts`.
- Worker app registry: `src/worker/schema-apps.ts`.
- Task source schema: `schema/apps/tasks/schema.json`.
- Task seed records: `schema/apps/tasks/seed-records.json`.
- Rate source schema: `schema/apps/rates/schema.json`.
- Rate seed records: `schema/apps/rates/seed-records.json`.
- Generated create/action/table UI: `src/app/generated/`.
- Tests: `src/app.test.tsx`, `src/client/*.test.ts`, `src/shared/schema.test.ts`, `src/worker/*.test.ts`.

## Decisions

| ID    | Decision                                                      | Reason                                                                                            | Evidence                                                         |
| ----- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| SR-D1 | Use separate schema instances keyed by `tasks` and `rates`.   | Schema artifact names are app-local. Merging would force global collision naming.                 | `schema/apps/tasks/schema.json`, `schema/apps/rates/schema.json` |
| SR-D2 | Do not merge task and rate-card schemas into one `AppSchema`. | The current parser and view model treat one active schema as the app boundary.                    | `src/shared/schema.ts`, `src/client/views.ts`                    |
| SR-D3 | Use path-keyed APIs.                                          | The schema key is part of resource identity and is visible in tests/browser tools.                | `src/client/sync.ts`, `src/worker/authority.ts`                  |
| SR-D4 | Use one Durable Object instance per schema key.               | Existing storage can remain unkeyed inside each app instance.                                     | `src/worker/index.ts`, `src/worker/storage.ts`                   |
| SR-D5 | Use one IndexedDB database per schema key.                    | Reset and browser debugging are simpler than storing multiple schemas in one local DB.            | `src/client/db.ts`                                               |
| SR-D6 | Split reset schema from reset seed data.                      | Schema reset should preserve records. Seed reset should restore source schema and source records. | `src/worker/storage.ts`, `src/app/dev-actions.tsx`               |
| SR-D7 | Fresh bootstrap should initialize source seed records.        | Opening `/tasks` or `/rates` should work without a manual dev reset.                              | `schema/apps/*/seed-records.json`, `src/worker/storage.ts`       |

## Non-goals

- Do not merge task and rate-card schemas.
- Do not introduce cross-app queries or references.
- Do not add permissions, users, or multi-tenant account routing.
- Do not add import/export UI.
- Do not build dynamic schema discovery.
- Do not redesign generated collection, table, or field rendering beyond passing the active schema key.
- Do not change the flat rate-card data model.

## Chunks

| ID    | Status  | Depends on | Main files                                                                 | Acceptance                                                                      |
| ----- | ------- | ---------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| SR-01 | shipped | none       | `schema/apps/**`, `src/shared/schema-apps.ts`, `src/worker/schema-apps.ts` | Source schemas and seed files are app-keyed and parse.                          |
| SR-02 | shipped | SR-01      | `src/worker/index.ts`, `src/worker/authority.ts`                           | `/api/tasks/*` and `/api/rates/*` dispatch to isolated authority instances.     |
| SR-03 | shipped | SR-02      | `src/worker/storage.ts`, `src/worker/authority.ts`                         | Fresh bootstrap and reset endpoints use source schema plus source seed records. |
| SR-04 | shipped | SR-02      | `src/client/db.ts`, `src/client/sync.ts`, `src/client/broadcast.ts`        | Client persistence, sync, and broadcast are keyed by schema key.                |
| SR-05 | pending | SR-04      | `src/app.tsx`, `src/app/routes/home.tsx`, `src/app/routes/schema.tsx`      | `/tasks`, `/rates`, `/tasks/schema`, and `/rates/schema` render the right app.  |
| SR-06 | pending | SR-05      | `src/app/generated/**`, `src/client/sync.ts`                               | Generated create, patch, and action calls submit to the active schema key.      |
| SR-07 | pending | SR-05      | `src/app/routes/schema.tsx`, `src/app/dev-actions.tsx`                     | Schema editing and reset controls are route-scoped.                             |
| SR-08 | pending | SR-07      | tests and cleanup                                                          | Old global schema swap paths are removed and browser smoke passes.              |

## Shipped chunks

### SR-01 registry and source layout

Status: shipped 2026-05-05.

Outcome:

- Added `src/shared/schema-apps.ts` with `SchemaKey`, app metadata, and key/route lookup helpers.
- Added `src/worker/schema-apps.ts` with parsed source schemas and parsed seed records.
- Moved task source files to `schema/apps/tasks/schema.json` and `schema/apps/tasks/seed-records.json`.
- Moved rate source files to `schema/apps/rates/schema.json` and `schema/apps/rates/seed-records.json`.
- Updated code and tests to import the new app-keyed source paths.
- Kept no forwarding copies of old schema paths.
- Kept runtime behavior unchanged: unkeyed APIs and `/api/dev/reset` remain until SR-02/SR-03.

Evidence:

- `src/shared/schema-apps.test.ts`.
- `src/worker/schema-apps.test.ts`.
- `rg "schema/app-schema|schema/samples|app-schema.json|task-records.json|rate-card.json|rate-card-records.json" src schema` returns no matches.
- `bun run test` passed.
- `bun run check` passed.

### SR-02 path-keyed worker dispatch

Status: shipped 2026-05-05.

Outcome:

- `src/worker/index.ts` parses `/api/:schemaKey/*`.
- Unknown schema keys and unkeyed `/api/*` paths return `404`.
- Durable Object ids resolve with `idFromName(schemaKey)`.
- `src/worker/authority.ts` parses the validated key and uses that app's source schema.
- `/api/tasks/bootstrap` returns the task schema.
- `/api/rates/bootstrap` returns the rate-card schema.
- Task and rate records stay isolated across separate authority instances.
- Mutation replay is isolated across separate authority instances.
- Mutation, action, schema validation, and sync behavior stay unchanged inside one authority instance.
- Reset endpoints are not implemented here. SR-03 owns source seed/reset semantics.

Evidence:

- `src/worker/authority.test.ts` covers keyed task bootstrap, keyed rate bootstrap, unknown key `404`, old unkeyed path `404`, and cross-key mutation isolation.
- `bun run test` passed.
- `bun run check` passed.

### SR-03 source bootstrap and reset semantics

Status: shipped 2026-05-05.

Outcome:

- Added `initializeStorageFromSource(storage, source)` in `src/worker/storage.ts`.
- Added `resetStorageToSourceSeed(storage, source)` in `src/worker/storage.ts`.
- Added `resetStorageSchemaToSource(storage, source, validate)` in `src/worker/storage.ts`.
- Fresh keyed authority access writes source schema plus source seed records.
- Added `POST /api/:schemaKey/reset/schema`.
- Added `POST /api/:schemaKey/reset/seed`.
- Reset schema restores the source schema, validates compatibility and source unique constraints, and preserves records and cursor.
- Reset seed clears records, changes, action executions, and mutation replay history for that schema key.
- Reset seed restores source schema, source records, and seeded create change rows.
- `/api/dev/reset` remains gone from keyed and unkeyed authority paths.
- Resetting `/rates` seed data does not affect `/tasks`.

Evidence:

- `src/worker/authority.test.ts` covers fresh task seed bootstrap, fresh rate seed bootstrap, reset schema preserve behavior, reset schema rejection, reset seed restore behavior, seed change sync from cursor `0`, and cross-key reset isolation.
- `bun run test` passed.
- `bun run check` passed.

### SR-04 keyed client persistence and sync

Status: shipped 2026-05-05.

Outcome:

- `src/client/db.ts` takes `schemaKey` on every exported persistence operation.
- Local DB names are `formless:tasks` and `formless:rates`.
- Object stores stay unchanged: `meta`, `records`.
- `src/client/sync.ts` takes `schemaKey` for bootstrap, sync, schema fetch/save, mutation, action, and reset calls.
- Sync URLs are built as `/api/${schemaKey}/sync`.
- Removed `resetRemoteData`.
- Added `resetSourceSchema(schemaKey)` and `resetSeedData(schemaKey)`.
- Reset seed deletes only the selected IndexedDB database before writing the selected reset response.
- Broadcast channel names are keyed as `formless:${schemaKey}`.
- Store hydration, refresh, and broadcast listeners read from the selected client DB.
- Existing root routes and generated submit paths pass `defaultSchemaKey` until SR-05 and SR-06 provide active route context.

Evidence:

- `src/client/db.test.ts` covers separate client DBs and raw deletion of `formless:rates` without deleting `formless:tasks`.
- `src/client/sync.test.ts` covers keyed task and rate bootstrap, keyed API URLs, selected reset seed DB deletion, and broadcast isolation.
- `bun run test` passed.
- `bun run check` passed.

## Current chunk

### SR-05 route-keyed app shell

Goal: direct browser routes render the correct app and switch cleanly.

Routes:

- `/` defaults to `/tasks`.
- `/tasks` renders task home.
- `/rates` renders rate-card home.
- `/tasks/schema` renders task schema editor.
- `/rates/schema` renders rate-card schema editor.

Tasks:

- [ ] Pass `schemaKey` through `HomeRoute`.
- [ ] Pass `schemaKey` through `SchemaRoute`.
- [ ] Reset selected view/query/context state when schema key changes.
- [ ] Start and stop polling per mounted schema key.
- [ ] Hydrate from keyed IndexedDB before keyed bootstrap.
- [ ] Show navigation for `Tasks`, `Rates`, and current app `Schema`.
- [ ] Remove global reset buttons that can mutate another app.

Acceptance checks:

- [ ] `/tasks` shows task loading state and task nav.
- [ ] `/rates` shows rate loading state and rate nav.
- [ ] `/tasks/schema` shows the task schema editor.
- [ ] `/rates/schema` shows the rate-card schema editor.
- [ ] App tests bootstrap and render both routes.

## Later chunks

### SR-06 generated UI schema-key propagation

Goal: generated components submit mutations and actions to the active app route.

Preferred pattern:

- Add `SchemaAppProvider`.
- Read schema key through `useSchemaKey()`.

Acceptable fallback:

- Thread explicit `schemaKey` props through generated components.

Tasks:

- [ ] Update generated create submit paths.
- [ ] Update `RecordFieldEditor` patch submit paths.
- [ ] Update generated action buttons.
- [ ] Update call sites in collection, table, list, and context editors.
- [ ] Keep selectors schema-key-free while there is one active in-memory store.

Acceptance checks:

- [ ] Creating a task from `/tasks` posts to `/api/tasks/mutations`.
- [ ] Creating a resource from `/rates` posts to `/api/rates/mutations`.
- [ ] Inline editing a rate posts to `/api/rates/mutations`.
- [ ] `clearCompletedTasks` posts to `/api/tasks/actions`.
- [ ] `regenerateMissingRates` posts to `/api/rates/actions`.

### SR-07 route-specific schema editing and reset UI

Goal: schema editing and reset controls are scoped and understandable.

Tasks:

- [ ] Show selected app label and key in `SchemaRoute`.
- [ ] Load `/api/tasks/schema` from `/tasks/schema`.
- [ ] Load `/api/rates/schema` from `/rates/schema`.
- [ ] Save only the selected route schema.
- [ ] Add route-scoped reset schema control.
- [ ] Add route-scoped reset seed data control.
- [ ] Add independent pending and error states.
- [ ] After reset schema, update local schema and leave records in place.
- [ ] After reset seed data, clear and replace only the selected local replica.
- [ ] Add confirmation for reset seed data unless the user chooses otherwise.

Acceptance checks:

- [ ] Saving `/tasks/schema` does not affect `/rates/schema`.
- [ ] Saving `/rates/schema` does not affect `/tasks/schema`.
- [ ] Reset schema preserves route records in client state.
- [ ] Reset seed replaces only route records in client state.

### SR-08 browser smoke and cleanup

Goal: prove route isolation in one browser session and remove obsolete global reset code.

Tasks:

- [ ] Remove `DevResetSchema = "default" | "rate-card"`.
- [ ] Remove `/api/dev/reset`.
- [ ] Remove compatibility imports from old schema paths.
- [ ] Browser smoke with Browser Use.
- [ ] Kill the dev server.

Browser smoke:

- [ ] Start app with `bun dev`.
- [ ] Open `/tasks`.
- [ ] Confirm task schema and seed records load.
- [ ] Create or edit a task.
- [ ] Open `/rates`.
- [ ] Confirm rate-card schema and seed records load.
- [ ] Create or edit a rate-card record.
- [ ] Switch back to `/tasks` and confirm the task edit is still present.
- [ ] Switch back to `/rates` and confirm the rate edit is still present.
- [ ] Reset only `/rates` seed data.
- [ ] Confirm `/rates` returns to source seed records.
- [ ] Confirm `/tasks` is unaffected.
- [ ] Open `/tasks/schema` and `/rates/schema`.
- [ ] Confirm each editor shows the correct schema.

Final checks:

- [ ] `bun run test`.
- [ ] `bun run check`.

## Open decisions

| ID    | Question                                                                  | Default for implementation                                  |
| ----- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| SR-O1 | Should `/` redirect to `/tasks`, or render tasks in place?                | Redirect to `/tasks` if router support stays simple.        |
| SR-O2 | Should reset seed data require confirmation?                              | Yes. It deletes route data.                                 |
| SR-O3 | Should IndexedDB names use `formless:${schemaKey}` or a versioned prefix? | Use `formless:${schemaKey}` until a migration need appears. |

## Blockers

| ID    | Status | Blocks | Notes                                                                                         |
| ----- | ------ | ------ | --------------------------------------------------------------------------------------------- |
| SR-B1 | closed | SR-02  | SR-01 shipped app definitions in `src/shared/schema-apps.ts` and `src/worker/schema-apps.ts`. |

## Cross-PRD dependencies

| Dependency          | Direction           | Notes                                                                                         |
| ------------------- | ------------------- | --------------------------------------------------------------------------------------------- |
| Runtime foundations | optional input      | Route isolation can start on current storage. If atomic-write helpers land first, reuse them. |
| Rate-card work      | downstream consumer | `/rates` should preserve the current flat rate-card model and `rateHome` workspace.           |

## Progress rules

- Mark exactly one chunk as `doing` when implementation starts.
- When a chunk ships, mark it `shipped` and replace task detail with outcome plus evidence.
- Do not append terminal logs.
- Keep decisions in `Decisions`, not scattered through phase notes.
- Put global-doc updates in `Promote after ship`.

## Promote after ship

When this PRD ships, update `doc/current.md`:

- Current routes are `/tasks`, `/rates`, `/tasks/schema`, `/rates/schema`.
- Current API paths are schema-keyed.
- Source schemas live under `schema/apps/`.
- Client DBs are schema-keyed.
- Client broadcast channels are schema-keyed.
- Global `/api/dev/reset` is gone.

When this PRD ships, update `doc/roadmap.md`:

- Remove schema-backed app routes from target work.
- Move the next release target to runtime hardening or rate-card derived values, depending on what has landed.

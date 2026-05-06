# PRD 01: Schema-backed app routes

Status: shipped
Current chunk: none
Last updated: 2026-05-06

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
- Source schema and seed parsing: `src/worker/schema-apps.ts`.
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
- Test source app helper: `src/test/schema-apps.ts`.
- Tests: `src/app.test.tsx`, `src/client/*.test.ts`, `src/shared/schema.test.ts`, `src/worker/*.test.ts`.

## Decisions

| ID    | Decision                                                                                     | Reason                                                                                                               | Evidence                                                         |
| ----- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| SR-D1 | Use separate schema instances keyed by `tasks` and `rates`.                                  | Schema artifact names are app-local. Merging would force global collision naming.                                    | `schema/apps/tasks/schema.json`, `schema/apps/rates/schema.json` |
| SR-D2 | Do not merge task and rate-card schemas into one `AppSchema`.                                | The current parser and view model treat one active schema as the app boundary.                                       | `src/shared/schema.ts`, `src/client/views.ts`                    |
| SR-D3 | Use path-keyed APIs.                                                                         | The schema key is part of resource identity and is visible in tests/browser tools.                                   | `src/client/sync.ts`, `src/worker/authority.ts`                  |
| SR-D4 | Use one Durable Object instance per schema key.                                              | Existing storage can remain unkeyed inside each app instance.                                                        | `src/worker/index.ts`, `src/worker/storage.ts`                   |
| SR-D5 | Use one IndexedDB database per schema key.                                                   | Reset and browser debugging are simpler than storing multiple schemas in one local DB.                               | `src/client/db.ts`                                               |
| SR-D6 | Split reset schema from reset seed data.                                                     | Schema reset should preserve records. Seed reset should restore source schema and source records.                    | `src/worker/storage.ts`, `src/app/dev-actions.tsx`               |
| SR-D7 | Fresh bootstrap should initialize source seed records.                                       | Opening `/tasks` or `/rates` should work without a manual dev reset.                                                 | `schema/apps/*/seed-records.json`, `src/worker/storage.ts`       |
| SR-D8 | Put app selection in sidebar and Home/Schema selection in content tabs.                      | Schema is part of the selected app workspace, not a peer app route.                                                  | `src/app.tsx`, `src/app.test.tsx`                                |
| SR-D9 | Keep backend reset endpoints separate but expose one full source reset control in schema UI. | The seed reset path restores source schema plus source records, so one destructive UI action matches source restore. | `src/app/dev-actions.tsx`, `src/app/routes/schema.tsx`           |

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
| SR-05 | shipped | SR-04      | `src/app.tsx`, `src/app/routes/home.tsx`, `src/app/routes/schema.tsx`      | `/tasks`, `/rates`, `/tasks/schema`, and `/rates/schema` render the right app.  |
| SR-06 | shipped | SR-05      | `src/app/generated/**`, `src/client/sync.ts`                               | Generated create, patch, and action calls submit to the active schema key.      |
| SR-07 | shipped | SR-05      | `src/app/routes/schema.tsx`, `src/app/dev-actions.tsx`                     | Schema editing and reset controls are route-scoped.                             |
| SR-08 | shipped | SR-07      | tests and cleanup                                                          | Old global schema swap paths are removed and browser smoke passes.              |

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

### SR-05 route-keyed app shell

Status: shipped 2026-05-05.

Outcome:

- `/` redirects to `/tasks`.
- `/tasks` renders the task home route.
- `/rates` renders the rate-card home route.
- `/tasks/schema` renders the task schema editor.
- `/rates/schema` renders the rate-card schema editor.
- App navigation shows `Tasks`, `Rates`, and the active app's `Schema` link.
- The app shell no longer renders global seed reset buttons.
- `HomeRoute` takes a `schemaKey`.
- `HomeRoute` hydrates, bootstraps, broadcasts, and polls with the mounted schema key.
- `HomeRoute` resets selected view, query, and context state when the schema key changes.
- `SchemaRoute` takes a `schemaKey`.
- `SchemaRoute` hydrates, fetches, and saves the mounted schema key.
- Client store state tracks the active schema key.
- Late client sync responses for an inactive schema key do not replace the visible route state.

Evidence:

- `src/app.test.tsx` covers `/tasks`, `/rates`, `/tasks/schema`, and `/rates/schema`.
- `src/client/store.test.ts` covers ignoring stale responses for an inactive schema key.
- Browser Use smoke covered `/`, `/tasks`, `/rates`, `/tasks/schema`, and `/rates/schema`.
- `bun run test` passed.
- `bun run check` passed.

### SR-06 generated UI schema-key propagation

Status: shipped 2026-05-05.

Outcome:

- Added `SchemaAppProvider` in `src/app/generated/schema-app-context.tsx`.
- Generated create forms read the active schema key through `useSchemaKey()`.
- `RecordFieldEditor` patch mutations read the active schema key through `useSchemaKey()`.
- Generated action buttons read the active schema key through `useSchemaKey()`.
- `HomeRoute` wraps `HomeCollection` with the active route schema key.
- Collection, table, list, context editor, referenced editor, and dialog paths inherit the provider.
- Selectors stay schema-key-free while the client store has one active in-memory schema.

Evidence:

- `src/app/generated/create.tsx`.
- `src/app/generated/record-field-editor.tsx`.
- `src/app/generated/actions.tsx`.
- `src/app/routes/home.tsx`.
- `src/client/sync.test.ts` covers keyed create, patch, and action URLs.
- Browser Use smoke covered task create from `/tasks`, resource create from `/rates`, rate price inline edit from `/rates`, `clearCompletedTasks` from `/tasks`, and `regenerateMissingRates` from `/rates`.
- `bun run test` passed.
- `bun run check` passed.

### SR-07 route-specific schema editing and reset UI

Status: shipped 2026-05-05.

Outcome:

- `/tasks/schema` shows `Tasks Schema` and key `tasks`.
- `/rates/schema` shows `Rates Schema` and key `rates`.
- Schema editor load and save stay keyed by the mounted route schema key.
- Reset controls render inside the mounted schema route.
- Reset source schema calls the mounted route's `/api/:schemaKey/reset/schema`.
- Reset seed data calls the mounted route's `/api/:schemaKey/reset/seed`.
- Reset source schema and reset seed data have separate pending and error state.
- Reset source schema updates the editor with the returned source schema and preserves returned records in local state.
- Reset seed data updates the editor with the returned source schema and replaces only the selected local replica through keyed client sync.
- Reset seed data requires the shared `@formless/ui/alert-dialog` confirmation before the reset action runs.

Evidence:

- `src/app.test.tsx` covers `/tasks/schema` and `/rates/schema` route labels, keys, and route reset controls.
- `src/client/sync.test.ts` covers keyed schema fetch/save, reset schema, reset seed data, and selected local database replacement.
- Browser Use smoke covered `/tasks/schema`, `/rates/schema`, route labels and keys, route reset controls, reset source schema, and seed reset confirmation open/cancel.
- `bun run test` passed.
- `bun run check` passed.

### SR-08 browser smoke and cleanup

Status: shipped 2026-05-05.

Outcome:

- Removed the old task-only schema shim `src/client/schema.ts`.
- Removed the seed compatibility export shim `src/worker/fixtures.ts`.
- Added `src/test/schema-apps.ts` so tests read parsed app-keyed source schemas and seed records through `src/worker/schema-apps.ts`.
- Updated tests to stop importing old global schema and seed exports.
- Confirmed no source code imports old schema paths, `DevResetSchema`, or `resetRemoteData`.
- Promoted shipped route facts into `doc/current.md`.
- Moved `doc/roadmap.md` past route isolation and onto WebSocket push sync.
- Browser Use smoke proved `/tasks` and `/rates` load seeded records, preserve independent route edits, reset only `/rates` seed data, keep `/tasks` unaffected, and show correct `/tasks/schema` and `/rates/schema` editors.
- Killed the dev server after smoke.

Evidence:

- `src/test/schema-apps.ts`.
- `src/client/schema.test.ts`.
- `src/worker/authority.test.ts`.
- `rg "src/worker/fixtures|src/client/schema|schema/samples|schema/app-schema|DevResetSchema|resetRemoteData" src schema` returns no matches.
- Browser Use smoke covered `/tasks`, `/rates`, `/rates` seed reset, `/tasks/schema`, and `/rates/schema`.
- `bun run test` passed.
- `bun run check` passed.

## Maintenance notes

- 2026-05-06: Route shell uses `@formless/ui/sidebar` for schema-app selection.
- 2026-05-06: `Home` and `Schema` are content tabs for the active app route.
- 2026-05-06: Schema route reset UI exposes one combined `Reset schema and seed data` control.
- 2026-05-06 evidence: `src/app.test.tsx` covers sidebar app links, content tabs, and the single reset control.
- 2026-05-06 evidence: `./tmp/agent-dev.json` shows tests pass and checks pass after `bun start`.

## Later chunks

None.

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
- App selection is in the shared sidebar shell.
- Active app content has `Home` and `Schema` tabs.
- Schema route reset UI has one combined schema-and-seed reset control.

When this PRD ships, update `doc/roadmap.md`:

- Remove schema-backed app routes from target work.
- Move the next release target to runtime hardening or rate-card derived values, depending on what has landed.

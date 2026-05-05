# Current

Last updated: 2026-05-05

## Runtime

- Schema parser: `src/shared/schema.ts`.
- Schema parts: entities, queries, item views, table views, views.
- Authority worker dispatch: `src/worker/index.ts`.
- One authority instance today: `FORMLESS_AUTHORITY.idFromName("default")`.
- Authority routes: `src/worker/authority.ts`.
- Current API paths: `/api/bootstrap`, `/api/schema`, `/api/sync`, `/api/mutations`, `/api/actions`, `/api/dev/reset`.
- Storage tables: `records`, `changes`, `app_schema`, `action_executions`.
- Storage code: `src/worker/storage.ts`.
- Browser local DB: IndexedDB database `formless`.
- Browser local stores: `meta`, `records`.
- Browser DB code: `src/client/db.ts`.
- Sync and API client code: `src/client/sync.ts`.
- Client store: `src/client/store.ts`.

## Source schemas

- Task schema: `schema/app-schema.json`.
- Task seed records: `schema/samples/task-records.json`.
- Rate-card schema: `schema/samples/rate-card.json`.
- Rate-card seed records: `schema/samples/rate-card-records.json`.
- Dev reset selects task or rate-card source data through `/api/dev/reset`.
- Reset code: `src/worker/authority.ts`, `src/worker/storage.ts`, `src/worker/fixtures.ts`, `src/client/sync.ts`.

## Task app

- Entity: `task`.
- Fields: `title`, `done`, `dueDate`, `estimate`, `priority`.
- Field types used: text, boolean, date, number, enum.
- Queries: `taskAll`, `taskActive`, `taskCompleted`, `taskOverdue`.
- Item view: `taskListItem`.
- Collection view: `taskHome`.
- Create view: `taskCreate`.
- Generic create enabled.
- Generic patch enabled.
- Generic delete disabled.
- Action: `clearCompletedTasks`.
- Action target: `taskCompleted`.

## Rate-card app

- Source schema: `schema/samples/rate-card.json`.
- Entities: `resource`, `card`, `rate`.
- Data model: flat records.
- `rate` is the join record for `resource` and `card`.
- `rate.uniqueRatePair` enforces one active `rate(resource, card)`.
- `resource.create` runs `rate.regenerateMissingRates` after create.
- `card.create` runs `rate.regenerateMissingRates` after create.
- `rate.regenerateMissingRates` uses `create-missing-join-records`.
- Primary workspace: `rateHome`.
- `rateHome` is scoped by selected `card`.
- `ratesForSelectedCard` uses context.
- Table view: `rateTable`.
- `rateTable` renders `resource.name` through a `referenceField` column.
- `rateTable` renders cost and price with `/ day` suffixes.
- `cardHome` and `resourceHome` stay in schema as non-primary admin/debug views.

## Generated UI

- App shell: `src/app.tsx`.
- Current browser routes: `/`, `/schema`.
- Home route: `src/app/routes/home.tsx`.
- Schema editor route: `src/app/routes/schema.tsx`.
- Dev reset controls: `src/app/dev-actions.tsx`.
- Generated collection renderer: `src/app/generated/collection.tsx`.
- Generated table renderer: `src/app/generated/table.tsx`.
- Generated create renderer: `src/app/generated/create.tsx`.
- Field editor: `src/app/generated/record-field-editor.tsx`.
- Field display: `src/app/generated/record-field-display.tsx`.
- View model selection: `src/client/views.ts`.

## Tests

- App tests: `src/app.test.tsx`.
- Schema parser tests: `src/shared/schema.test.ts`.
- View model tests: `src/client/views.test.ts`.
- Sync tests: `src/client/sync.test.ts`.
- Local DB tests: `src/client/db.test.ts`.
- Store tests: `src/client/store.test.ts`.
- Authority tests: `src/worker/authority.test.ts`.
- Storage tests: `src/worker/storage.test.ts`.

## Checks

- Unit/runtime check: `bun run test`.
- Type/lint/format check: `bun run check`.
- Browser smoke when app behavior changes: `bun dev`, then Browser Use.

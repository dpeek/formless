# Current

Last updated: 2026-05-06

## Runtime

- Schema parser: `src/shared/schema.ts`.
- Schema parts: entities, queries, item views, table views, views.
- Authority worker dispatch: `src/worker/index.ts`.
- Authority instances: `FORMLESS_AUTHORITY.idFromName(schemaKey)`.
- Authority routes: `src/worker/authority.ts`.
- Current API paths: `/api/:schemaKey/bootstrap`, `/api/:schemaKey/schema`, `/api/:schemaKey/tree/:slug`, `/api/:schemaKey/sync`, `/api/:schemaKey/mutations`, `/api/:schemaKey/actions`, `/api/:schemaKey/reset/schema`, `/api/:schemaKey/reset/seed`.
- Storage tables: `records`, `changes`, `app_schema`, `action_executions`.
- Storage code: `src/worker/storage.ts`.
- Browser local DBs: `formless:tasks`, `formless:rates`, `formless:site`.
- Browser local stores: `meta`, `records`.
- Browser DB code: `src/client/db.ts`.
- Browser broadcast channels: `formless:tasks`, `formless:rates`, `formless:site`.
- Sync and API client code: `src/client/sync.ts`.
- Client store: `src/client/store.ts`.

## Source schemas

- Task schema: `schema/apps/tasks/schema.json`.
- Task seed records: `schema/apps/tasks/seed-records.json`.
- Rate-card schema: `schema/apps/rates/schema.json`.
- Rate-card seed records: `schema/apps/rates/seed-records.json`.
- Site schema: `schema/apps/site/schema.json`.
- Site seed records: `schema/apps/site/seed-records.json`.
- Source app registry: `src/shared/schema-apps.ts`.
- Source parsing: `src/worker/schema-apps.ts`.
- Reset code: `src/worker/authority.ts`, `src/worker/storage.ts`, `src/client/sync.ts`.

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

- Source schema: `schema/apps/rates/schema.json`.
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

## Site app

- Source schema: `schema/apps/site/schema.json`.
- Source seed records: `schema/apps/site/seed-records.json`.
- Entities: `block`, `blockPlacement`.
- Data model: flat records.
- Admin route: `/site`.
- Schema route: `/site/schema`.
- Public page routes: `/pages`, `/pages/*`.
- `/pages` redirects to `/pages/home`.
- Public tree endpoint: `/api/site/tree/:slug`.
- Tree projection: `src/site/tree.ts`.
- Tree response types: `src/shared/protocol.ts`.
- Public route source: `src/app/routes/site-page.tsx`.
- Renderer source: `src/app/site-renderer/renderer.tsx`.
- Media records are `block` records with `type` image, video, or file.
- `block.type` drives public rendering.
- `blockPlacement.parent` is the parent block.
- `blockPlacement.block` is the child block.
- `blockPlacement.slot`, `order`, and `visible` control placement.
- Public tree excludes drafts, archived blocks, invisible placements, and tombstoned records.
- Missing children and cycles become tree metadata warnings.
- Home seed includes nested Header, Hero, Recent posts, Featured projects, and Footer blocks.
- Header and footer use nested groups and reusable link blocks.
- `contentList` and `contentGrid` blocks render public query results.

## Generated UI

- App shell: `src/app.tsx`.
- Current browser routes: `/`, `/tasks`, `/rates`, `/site`, `/tasks/schema`, `/rates/schema`, `/site/schema`, `/pages`, `/pages/*`.
- Home route: `src/app/routes/home.tsx`.
- Schema editor route: `src/app/routes/schema.tsx`.
- Route reset controls: `src/app/dev-actions.tsx`.
- Generated collection renderer: `src/app/generated/collection.tsx`.
- Generated table renderer: `src/app/generated/table.tsx`.
- Generated create renderer: `src/app/generated/create.tsx`.
- Field editor: `src/app/generated/record-field-editor.tsx`.
- Field display: `src/app/generated/record-field-display.tsx`.
- View model selection: `src/client/views.ts`.

## Tests

- App tests: `src/app.test.tsx`.
- Site tree tests: `src/site/tree.test.ts`.
- Schema parser tests: `src/shared/schema.test.ts`.
- View model tests: `src/client/views.test.ts`.
- Sync tests: `src/client/sync.test.ts`.
- Local DB tests: `src/client/db.test.ts`.
- Store tests: `src/client/store.test.ts`.
- Authority tests: `src/worker/authority.test.ts`.
- Storage tests: `src/worker/storage.test.ts`.

## Checks

- Agent dev command: `bun start`.
- Dev state and process IDs: `./tmp/agent-dev.json`.
- Dev URL: `url` in `./tmp/agent-dev.json`.
- Dev URL source: portless stdout in `./tmp/dev.txt`.
- Agent dev pid files are not used.
- Stdout logs stay as `./tmp/*.txt`.
- Test output: `./tmp/test.txt`.
- Check output: `./tmp/check.txt`.
- Unit/runtime watcher: `vp test --watch --reporter=agent`, started by `bun start`.
- Type/lint/format check: `vp check`, run by `bun start`.
- Browser smoke when app behavior changes: `bun browser ...`.

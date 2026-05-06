# Current

Last updated: 2026-05-06

## Runtime

- Schema parser: `src/shared/schema.ts`.
- Schema types: `src/shared/schema-types.ts`.
- Schema parse helpers: `src/shared/schema-parse-helpers.ts`.
- Field parser: `src/shared/schema-fields.ts`.
- Relationship parser: `src/shared/schema-relationships.ts`.
- View parser: `src/shared/schema-views.ts`.
- Screen parser: `src/shared/schema-screens.ts`.
- Read-model parser: `src/shared/schema-read-models.ts`.
- Action parser: `src/shared/schema-actions.ts`.
- Mutation parser: `src/shared/schema-mutations.ts`.
- Schema parts: entities, relationships, queries, read models, item views, table views, views, screens.
- Authority worker dispatch: `src/worker/index.ts`.
- Authority instances: `FORMLESS_AUTHORITY.idFromName(schemaKey)`.
- Authority routes: `src/worker/authority.ts`.
- Current API paths: `/api/:schemaKey/bootstrap`, `/api/:schemaKey/schema`, `/api/:schemaKey/tree/:slug`, `/api/:schemaKey/sync`, `/api/:schemaKey/sync/ws`, `/api/:schemaKey/mutations`, `/api/:schemaKey/actions`, `/api/:schemaKey/reset/schema`, `/api/:schemaKey/reset/seed`.
- HTTP remains the write path.
- Push sync route: `/api/:schemaKey/sync/ws`.
- Push sync client entrypoint: `startPushSync(schemaKey, options)` in `src/client/sync.ts`.
- Pushed sync merge helper: `applySyncResponse(schemaKey, response)` in `src/client/sync.ts`.
- Push sync protocol types: `SyncSocketClientMessage`, `SyncSocketServerMessage`, `SyncSocketAttachment`.
- Authority accepts hibernatable Durable Object WebSockets.
- Authority socket handles `hello` and `sync-requested`.
- Authority socket catches up from client cursor.
- Authority socket omits schema when client timestamp is current.
- Authority broadcasts committed create, patch, action, schema write, reset schema, and reset seed sync messages.
- Failed validation and mutation replay do not broadcast.
- Browser push sync has no polling fallback.
- Home route starts push sync after route-keyed bootstrap.
- Home route stops push sync when route schema key changes or unmounts.
- Storage tables: `records`, `changes`, `app_schema`, `action_executions`.
- Storage code: `src/worker/storage.ts`.
- Browser local DBs: `formless:tasks`, `formless:rates`, `formless:site`.
- Browser local stores: `meta`, `records`.
- Browser DB code: `src/client/db.ts`.
- Browser broadcast channels: `formless:tasks`, `formless:rates`, `formless:site`.
- Client store: `src/client/store.ts`.
- Developer sync status source: `src/client/sync-status.ts`.
- Developer status line: `src/app/routes/status-line.tsx`.

## Source Schemas

- Task schema: `schema/apps/tasks/schema.json`.
- Task seed records: `schema/apps/tasks/seed-records.json`.
- Rate-card schema: `schema/apps/rates/schema.json`.
- Rate-card seed records: `schema/apps/rates/seed-records.json`.
- Site schema: `schema/apps/site/schema.json`.
- Site seed records: `schema/apps/site/seed-records.json`.
- Source app registry: `src/shared/schema-apps.ts`.
- Source parsing: `src/worker/schema-apps.ts`.
- Reset code: `src/worker/authority.ts`, `src/worker/storage.ts`, `src/client/sync.ts`.
- Task source schema defines `screens.taskHome`.
- Rate-card source schema defines `screens.rateHome` and non-primary `screens.rateSetup`.

## Screens

- Top-level `screens` are optional.
- Screen type: `workspace`.
- Screen layout type: `stack`.
- Screen sections type: `collection`.
- Screen sections reference existing collection views.
- Screens with `navigation.primary` own route workspace selection when `screens` exists.
- Collection `navigation.primary` remains the fallback when `screens` is absent.
- Screen model selection: `src/client/views.ts`.
- Generated screen renderer: `src/app/generated/screen.tsx`.
- Home route renders through screen models: `src/app/routes/home.tsx`.
- One-section screens render like the old home workspace.
- Multi-section stack screens render sections in schema order.
- Section query and context state is keyed by screen and section.

## Read Models

- App schemas can declare optional `readModels.computedValues`.
- App schemas can declare optional `readModels.aggregates`.
- Read-model evaluator: `src/shared/read-model.ts`.
- Read-model parser: `src/shared/schema-read-models.ts`.
- Computed values are read-only display values over flat records.
- Computed values use numeric field, literal, and binary expressions.
- Invalid numeric evaluation returns empty output.
- Aggregates are read-only display values over query results.
- Aggregate functions: count, sum, average, min, max.
- Empty count and sum render `0`.
- Empty average, min, and max render empty output.
- Runtime bad aggregate values are skipped.
- Table views can declare computed columns with `type: "computed"`.
- Collection views can declare aggregate summary slots with `type: "aggregate"`.
- Aggregate summary slots render only for the active query tab.
- Aggregate selectors evaluate against local query-matching records in `src/client/store.ts`.
- Authority writes, storage, sync, and mutation paths do not store read-model values.

## Field Editors

- Field behavior module: `src/shared/field-types.ts`.
- Field behavior owns scalar validation, defaults, conversion, display, and editor metadata.
- Generated field UI adapters: `src/app/generated/field-ui-adapters.ts`.
- Generated field display: `src/app/generated/record-field-display.tsx`.
- Generated inline editor: `src/app/generated/record-field-editor.tsx`.
- Generated create renderer: `src/app/generated/create.tsx`.
- Shared UI primitives live under `lib/ui/src/`.
- Markdown editor uses shared UI markdown primitives.
- Markdown read-only display can use the shared markdown renderer.
- Color editor uses shared color input and swatch display.
- Date editors preserve `YYYY-MM-DD` values.
- Text editors can render title-like autosizing editable text.
- Number editors can use formatted number input and still store numbers.
- Value/unit table editing patches multiple flat scalar fields.

## Task App

- Entity: `task`.
- Fields: `title`, `done`, `dueDate`, `estimate`, `priority`.
- Field types used: text, boolean, date, number, enum.
- Queries: `taskAll`, `taskActive`, `taskCompleted`, `taskOverdue`.
- Item view: `taskListItem`.
- Collection view: `taskHome`.
- Create view: `taskCreate`.
- Screen: `taskHome`.
- Generic create enabled.
- Generic patch enabled.
- Generic delete disabled.
- Action: `clearCompletedTasks`.
- Action target: `taskCompleted`.

## Rate-Card App

- Source schema: `schema/apps/rates/schema.json`.
- Entities: `resource`, `card`, `rate`.
- Data model: flat records.
- `rate` is the join record for `resource` and `card`.
- `rate.uniqueRatePair` enforces one active `rate(resource, card)`.
- `resource.create` runs `rate.regenerateMissingRates` after create.
- `card.create` runs `rate.regenerateMissingRates` after create.
- `rate.regenerateMissingRates` uses `create-missing-join-records`.
- Primary screen: `rateHome`.
- Non-primary screen: `rateSetup`.
- Primary workspace view: `rateHome`.
- `rateHome` is scoped by selected `card`.
- `ratesForSelectedCard` uses context.
- Table view: `rateTable`.
- `rateTable` renders `resource.name` through a `referenceField` column.
- `rateTable` uses value/unit editing for cost and price columns.
- `rateTable` renders read-only `Margin` through `readModels.computedValues.rateMargin`.
- `rateHome` renders `Cost total`, `Price total`, and `Average margin` summary slots.
- Rate-card read-model values do not add stored `rate` fields.
- `cardHome` and `resourceHome` stay in schema as non-primary admin/setup views.

## Site App

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
- Generated screen renderer: `src/app/generated/screen.tsx`.
- Generated collection renderer: `src/app/generated/collection.tsx`.
- Generated table renderer: `src/app/generated/table.tsx`.
- Generated create renderer: `src/app/generated/create.tsx`.
- Field editor: `src/app/generated/record-field-editor.tsx`.
- Field display: `src/app/generated/record-field-display.tsx`.
- View and screen model selection: `src/client/views.ts`.
- Collection rendering consumes model facts, not raw schema.
- Table rendering supports field, reference-field, and computed columns.
- Collection rendering supports aggregate summary slots.

## Tests

- App tests: `src/app.test.tsx`.
- Site tree tests: `src/site/tree.test.ts`.
- Schema parser tests: `src/shared/schema.test.ts`.
- Schema app tests: `src/shared/schema-apps.test.ts`, `src/worker/schema-apps.test.ts`.
- Protocol tests: `src/shared/protocol.test.ts`.
- Query tests: `src/shared/query.test.ts`.
- Read-model tests: `src/shared/read-model.test.ts`.
- Field behavior tests: `src/shared/field-types.test.ts`.
- View model tests: `src/client/views.test.ts`.
- Sync tests: `src/client/sync.test.ts`.
- Local DB tests: `src/client/db.test.ts`.
- Store tests: `src/client/store.test.ts`.
- Readiness tests: `src/client/readiness.test.ts`.
- Authority tests: `src/worker/authority.test.ts`.
- Storage tests: `src/worker/storage.test.ts`.
- Generated format tests: `src/app/generated/format.test.ts`.
- Generated field UI adapter tests: `src/app/generated/field-ui-adapters.test.ts`.

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

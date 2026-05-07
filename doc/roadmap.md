# Roadmap

Last updated: 2026-05-06

Release target: first usable Formless release.

Current workstream: Site editor list/detail.

## Runtime

- Direct app routes stay `/tasks`, `/rates`, and `/site`.
- Schema editor routes stay `/tasks/schema`, `/rates/schema`, and `/site/schema`.
- Public site routes stay `/pages` and `/pages/*`.
- One schema key maps to one source schema.
- One schema key maps to one authority instance.
- One schema key maps to one browser local DB.
- API paths stay schema-keyed.
- Current API paths: `/api/:schemaKey/bootstrap`, `/api/:schemaKey/schema`, `/api/:schemaKey/tree/:slug`, `/api/:schemaKey/sync`, `/api/:schemaKey/sync/ws`, `/api/:schemaKey/mutations`, `/api/:schemaKey/actions`, `/api/:schemaKey/reset/schema`, `/api/:schemaKey/reset/seed`.
- Reset schema and reset seed data stay separate.
- Fresh route bootstrap loads source schema and source seed records.
- Push sync stays at `/api/:schemaKey/sync/ws`.
- Browser replicas receive authority-pushed changes.
- Push sync is keyed by schema app.
- Push sync preserves route isolation.
- HTTP remains the write path for mutations, actions, schema, and reset.
- Authority writes stay atomic across primary and caused records.
- Authority constraints protect shipped invariants.
- Browser push sync has no polling fallback.

## Source Schemas

- Source app files live under `schema/apps/`.
- Task source: `schema/apps/tasks/schema.json`.
- Task seed: `schema/apps/tasks/seed-records.json`.
- Rate source: `schema/apps/rates/schema.json`.
- Rate seed: `schema/apps/rates/seed-records.json`.
- Site source: `schema/apps/site/schema.json`.
- Site seed: `schema/apps/site/seed-records.json`.
- Seed records stay close to `StoredRecord` shape.
- Seed files do not store change rows.
- Storage derives seed create changes during reset/bootstrap.

## Screens

- App schemas can declare top-level `screens`.
- Workspace screens compose existing collection views.
- First layout primitive is `stack`.
- Screen navigation owns primary route workspace selection when `screens` exists.
- Collection navigation remains legacy fallback when `screens` is absent.
- Task and rate source schemas define screens.
- General layout DSL stays out of first release.

## Read Models

- App schemas can declare `readModels.computedValues`.
- App schemas can declare `readModels.aggregates`.
- Computed values are read-only display values over flat records.
- Aggregates are read-only display values over query results.
- Generated tables can render computed columns.
- Generated collections can render aggregate summary slots.
- Derived rate display values are covered by read-model computed values and aggregates.
- Full computed graph engine stays out of first release.

## Task App

- `/tasks` opens the task app.
- `/tasks/schema` edits the task runtime schema.
- Task records and schema edits are isolated from `/rates`.
- `clearCompletedTasks` still runs as a schema-declared action.
- Task screen stays one primary workspace.

## Rate-Card App

- `/rates` opens the rate-card app.
- `/rates/schema` edits the rate-card runtime schema.
- Rate-card records and schema edits are isolated from `/tasks`.
- `rateHome` remains the primary workspace.
- Records stay flat: resources, cards, rates.
- Rate matrix integrity stays authority-enforced.
- Rate-card source schema uses read-model output for margin and totals.
- Rate setup can stay non-primary.

## Site App

- `/site` opens the site admin app.
- `/site/schema` edits the site runtime schema.
- `/pages` redirects to `/pages/home`.
- `/pages/*` renders public site pages.
- Public pages fetch `/api/site/tree/:slug`.
- Site records stay flat: blocks and block placements.
- Media stays in block records.
- `blockPlacement.parent` and `blockPlacement.block` stay the composition edge.
- Header and footer stay nested blocks/groups in source seeds.
- Public tree output excludes drafts, archived blocks, invisible placements, and tombstones.
- First public renderer stays site-specific.
- Site editor first-release surface uses Pages, Header, and Footer roots.
- Site editor root selection uses generated list/detail context presentation.
- Raw Blocks and Placements are not the primary Site editor surface.
- Inline scoped child creation is later than the list/detail workstream.

## Generated UI

- Route shell shows `Tasks`, `Rates`, `Site`, and the current app's `Schema`.
- Generated create, patch, and action paths submit to the active schema key.
- Reset controls are route-scoped.
- Global schema swap UI is removed.
- Switching routes in one browser session keeps each route's local state.
- Public site routes do not show generated admin navigation.
- Generated screen renderer owns route workspace layout.
- Generated collection renderer owns query tabs, context selection, summaries, actions, and result rendering.
- Generated table renderer owns field, reference-field, value/unit, and computed columns.
- Generated field editors use shared UI primitives for richer scalar editing.
- Generated edit dialogs can use per-field patching before draft save flows exist.
- Table row reordering can start on generic patch writes; atomic batch mutations are later.

## Docs

- `doc/current.md` is the current-state source for agents.
- `doc/roadmap.md` is the first-release target.
- Each `prd/*.md` owns one workstream.
- PRD agents update PRDs.
- Shipped PRD facts get promoted into `doc/current.md`.
- External memory is not required for normal Formless work.

## Not First Release

- Users and permissions.
- Multi-tenant account routing.
- Cross-app references.
- Cross-app queries.
- General import/export UI.
- App marketplace.
- Full layout DSL.
- Full computed graph engine.
- Draft edit sessions with save/cancel.
- Cross-field draft validation UI.
- Proper delete mutations and generated delete UI.
- Destructive action confirmation flow.
- Atomic batch mutation endpoint.
- Boards.
- Dashboards.
- Charts.
- Plugin view registry.
- Media upload.

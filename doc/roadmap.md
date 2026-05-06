# Roadmap

Last updated: 2026-05-06

Release target: first usable Formless release.

Next workstream: WebSocket push sync.

## Runtime

- Direct app routes stay `/tasks`, `/rates`, and `/site`.
- Schema editor routes stay `/tasks/schema`, `/rates/schema`, and `/site/schema`.
- Public site routes stay `/pages` and `/pages/*`.
- One schema key maps to one source schema.
- One schema key maps to one authority instance.
- One schema key maps to one browser local DB.
- API paths stay schema-keyed.
- Current API paths: `/api/:schemaKey/bootstrap`, `/api/:schemaKey/schema`, `/api/:schemaKey/tree/:slug`, `/api/:schemaKey/sync`, `/api/:schemaKey/mutations`, `/api/:schemaKey/actions`, `/api/:schemaKey/reset/schema`, `/api/:schemaKey/reset/seed`.
- Reset schema and reset seed data stay separate.
- Fresh route bootstrap loads source schema and source seed records.
- Add push sync at `/api/:schemaKey/sync/ws`.
- Keep writes on HTTP: mutations, actions, schema, reset.
- Keep polling fallback while push sync ships.
- Authority writes stay atomic across primary and caused records.
- Authority constraints protect shipped invariants.

## Source schemas

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

## Task app

- `/tasks` opens the task app.
- `/tasks/schema` edits the task runtime schema.
- Task records and schema edits are isolated from `/rates`.
- `clearCompletedTasks` still runs as a schema-declared action.

## Rate-card app

- `/rates` opens the rate-card app.
- `/rates/schema` edits the rate-card runtime schema.
- Rate-card records and schema edits are isolated from `/tasks`.
- `rateHome` remains the primary workspace.
- Records stay flat: resources, cards, rates.
- Rate matrix integrity stays authority-enforced.
- Derived rate display values can land after route isolation and authority invariants are firm.

## Site app

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
- General layout DSL stays out of first release.

## Generated UI

- Route shell shows `Tasks`, `Rates`, `Site`, and the current app's `Schema`.
- Generated create, patch, and action paths submit to the active schema key.
- Reset controls are route-scoped.
- Global schema swap UI is removed.
- Switching routes in one browser session keeps each route's local state.
- Public site routes do not show generated admin navigation.

## Docs

- `doc/current.md` is the current-state source for agents.
- `doc/roadmap.md` is the first-release target.
- Each `prd/*.md` owns one workstream.
- PRD agents update PRDs.
- Shipped PRD facts get promoted into `doc/current.md`.
- External memory is not required for normal Formless work.

## Not first release

- Users and permissions.
- Multi-tenant account routing.
- Cross-app references.
- Cross-app queries.
- General import/export UI.
- App marketplace.
- Full layout DSL.
- Full computed graph engine.

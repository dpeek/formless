# Roadmap

Last updated: 2026-05-05

Release target: first usable Formless release.

## Runtime

- Support direct schema-backed app routes.
- First routes: `/tasks`, `/rates`.
- One schema key maps to one source schema.
- One schema key maps to one authority instance.
- One schema key maps to one browser local DB.
- API paths include the schema key.
- Target API paths: `/api/:schemaKey/bootstrap`, `/api/:schemaKey/schema`, `/api/:schemaKey/sync`, `/api/:schemaKey/mutations`, `/api/:schemaKey/actions`.
- Reset schema and reset seed data are separate operations.
- Fresh route bootstrap loads source schema and source seed records.
- Authority writes stay atomic across primary and caused records.
- Authority constraints protect shipped invariants.

## Source schemas

- Move source app files under `schema/apps/`.
- Task source: `schema/apps/tasks/schema.json`.
- Task seed: `schema/apps/tasks/seed-records.json`.
- Rate source: `schema/apps/rates/schema.json`.
- Rate seed: `schema/apps/rates/seed-records.json`.
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

## Generated UI

- Route shell shows `Tasks`, `Rates`, and the current app's `Schema`.
- Generated create, patch, and action paths submit to the active schema key.
- Reset controls are route-scoped.
- Global schema swap UI is removed.
- Switching routes in one browser session keeps each route's local state.

## Docs

- `doc/current.md` is the current-state source for agents.
- `doc/roadmap.md` is the first-release target.
- Each `prd/*.md` owns one workstream.
- PRD agents update PRDs.
- A docs/steward pass promotes shipped facts into `doc/current.md` and adjusts this file.
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

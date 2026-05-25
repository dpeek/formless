# Formless Context

Formless is a schema-as-data app runtime.

## Core Model

- App schema: runtime data that defines entities, fields, relationships, mutations, queries, read models, views, screens, and actions.
- Source schema: repo JSON schema under `schema/apps/<key>/schema.json`.
- Schema key: route and storage key such as `tasks`, `estii`, or `site`.
- Entity: flat record type in an app schema.
- Field: scalar or reference value on a flat record.
- Record: stored entity instance with flat values.
- Relationship: schema metadata over references; it does not change stored record shape.
- Query: schema-declared filter over records.
- Read model: computed display output over records or query results; it is not stored.
- View: generated UI surface over records.
- Screen: route workspace that composes collection views.
- Action: schema-declared command for domain behavior.
- Mutation: generic create or patch write.

## Runtime Terms

- Formless instance: runtime boundary for installed apps, app data, media, auth, and deploy config.
- Product instance profile: runtime profile for installed apps and instance management.
- Dev workbench profile: runtime profile for bundled source app development.
- Package app key: bundled schema package identity such as `site`, `tasks`, or `estii`.
- App install id: stable instance-local identity for one installed app.
- App install: flat instance metadata that binds install id, package app key, label, status, and routes.
- App storage identity: route, Authority, browser replica, broadcast, and media scope for a schema key or installed app.
- Browser replica: local IndexedDB copy keyed by app storage identity.
- Authority: Durable Object that owns committed storage and invariants.
- Storage: Durable Object tables for records, changes, schema, and action executions.
- Sync cursor: timestamp cursor used by HTTP sync and push sync catch-up.
- Push sync: hibernatable WebSocket route at `/api/:schemaKey/sync/ws`.
- Generated UI: React app surfaces selected from schema models.
- Public tree: Site projection from flat block and placement records into nested public output.
- Portable archive: versioned app or instance export/restore/import envelope.

## App Terms

- Task app: tasks with active, completed, and overdue queries.
- Estii app: resources, cards, and rates; rate is the join record.
- Site app: blocks and block placements; public pages render from the tree projection.
- Block: Site content/media/group/page record.
- Block placement: flat composition edge from parent block to child block.
- Default product Site install: installed Site app with install id `site`.

## Project Memory

- Agent docs map: `doc/README.md`.
- Current shipped behavior index: `doc/current.md`.
- Current shipped behavior topics: `doc/topics/*.md`.
- Possible next-work directions: `doc/roadmap.md`.
- New workstream plans and status: GitHub Issues for `dpeek/formless`.
- Legacy local workstreams: `prd/*.md` when present until retired.
- Agent instructions: `AGENTS.md`.
- Agent skill config: `doc/agents/`.

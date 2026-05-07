# Formless Context

Formless is a schema-as-data app runtime.

## Core Model

- App schema: runtime data that defines entities, fields, relationships, mutations, queries, read models, views, screens, and actions.
- Source schema: repo JSON schema under `schema/apps/<key>/schema.json`.
- Schema key: route and storage key such as `tasks`, `rates`, or `site`.
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

- Browser replica: local IndexedDB copy keyed by schema key.
- Authority: Durable Object that owns committed storage and invariants.
- Storage: Durable Object tables for records, changes, schema, and action executions.
- Sync cursor: timestamp cursor used by HTTP sync and push sync catch-up.
- Push sync: hibernatable WebSocket route at `/api/:schemaKey/sync/ws`.
- Generated UI: React app surfaces selected from schema models.
- Public tree: Site projection from flat block and placement records into nested public output.

## App Terms

- Task app: tasks with active, completed, and overdue queries.
- Rate-Card app: resources, cards, and rates; rate is the join record.
- Site app: blocks and block placements; public pages render from the tree projection.
- Block: Site content/media/group/page record.
- Block placement: flat composition edge from parent block to child block.

## Project Memory

- Current shipped behavior: `doc/current.md`.
- First-release target: `doc/roadmap.md`.
- Workstream plans and status: `prd/*.md`.
- Agent instructions: `AGENTS.md`.
- Agent skill config: `docs/agents/`.
- ADR home: `docs/adr/`.


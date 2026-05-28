# Formless Agents

Write short. Facts only. Keep docs source-faithful.

## Project

Formless = schema-as-data app runtime.

App schema is runtime data. It defines entities, fields, relationships, mutations, queries, read models, views, screens, actions.

Data stays flat. Compose in query, view, projection, action layer.

## Read Levels

- Always: this file.
- Workstream: assigned GitHub PRD issue, or legacy local PRD only when assigned.
- Task loop: `doc/agents/ralph-implement.md` or `doc/agents/ralph-finalize.md` when Ralph injects it.
- Package scope: nearest package `AGENTS.md`, for example `lib/ui/AGENTS.md`.
- Capability scope: relevant `openspec/specs/*/spec.md`.
- Skill config: relevant file in `doc/agents/`.
- Do not read every doc. Read only path needed for task.

## Agent Docs

- `doc/agents/issue-tracker.md`: GitHub issue workflow.
- `doc/agents/local-agent-workers.md`: local OpenSpec pull worker workflow.
- `doc/agents/triage-labels.md`: triage labels.
- `doc/agents/ralph-implement.md`: one-chunk loop prompt body.
- `doc/agents/ralph-finalize.md`: PRD finalization prompt body.

## Capability Specs

- `openspec/specs/app-schema/spec.md`: schema parsing, fields, relationships, read models, actions.
- `openspec/specs/authority-storage/spec.md`: Authority, writes, bootstrap, reset, snapshots.
- `openspec/specs/sync-replica/spec.md`: browser replica, cursors, push sync, local projections.
- `openspec/specs/generated-ui/spec.md`: React generated surfaces, fields, screens, actions.
- `openspec/specs/site-runtime/spec.md`: Site records, public tree, SSR, metadata, icons.
- `openspec/specs/site-cli-publish/spec.md`: standalone Site CLI, save, publish, deploy commands.
- `openspec/specs/installed-apps/spec.md`: product app installs, routes, install storage.
- `openspec/specs/runtime-topology/spec.md`: profiles, route policy, mapped hosts.
- `openspec/specs/core-media/spec.md`: core media assets, upload, delivery, media archive payloads.
- `openspec/specs/custom-domains/spec.md`: exact-host mappings, provider jobs, redirects, cleanup.
- `openspec/specs/portable-archives/spec.md`: app and instance archives, restore, import, workspaces.

## Repo Map

- `src/shared/`: schema, protocol, read models, field behavior, app identities.
- `src/client/`: browser replica, projections, local publish, generated view models.
- `src/app/`: React routes, generated UI, Site renderer.
- `src/worker/`: Worker routes, Authority, storage, installed apps, public SSR.
- `src/site/`: standalone Site CLI, project files, publish, archives, domains.
- `src/media/`: core media model and providers.
- `src/test/`: shared test fixtures.
- `schema/apps/`: bundled app schemas and seed records.
- `lib/ui/`: shared browser UI package.
- `scripts/`: repo scripts, Ralph loop, package build, seed pull.
- `openspec/specs/`: shipped capability specs.
- `doc/agents/`: agent workflow config and Ralph prompt bodies.

## Core Terms

- App schema: runtime data contract.
- Source schema: `schema/apps/<key>/schema.json`.
- Schema key: route and storage key such as `tasks`, `estii`, `site`.
- Entity: flat record type.
- Field: scalar or reference value.
- Record: stored entity instance with flat values.
- Relationship: schema metadata over references; no nested stored data.
- Query: schema-declared record filter.
- Read model: computed display output; not stored.
- View: generated UI surface.
- Screen: route workspace that composes collection views.
- Action: schema-declared command.
- Mutation: generic create, patch, delete write.

## Runtime Terms

- Formless instance: installed apps, app data, media, auth, deploy config.
- Product instance profile: installed app and instance management runtime.
- Dev workbench profile: bundled source app development runtime.
- Package app key: bundled schema package identity.
- App install id: stable instance-local identity for one installed app.
- App install: flat metadata with install id, package app key, label, status, routes.
- App storage identity: route, Authority, browser replica, broadcast, media scope.
- Browser replica: IndexedDB copy keyed by app storage identity.
- Authority: Durable Object that owns committed storage and invariants.
- Storage: records, changes, schema, action executions.
- Sync cursor: timestamp cursor for HTTP sync and push catch-up.
- Push sync: hibernatable WebSocket at `/api/:schemaKey/sync/ws` or install route.
- Generated UI: React surfaces selected from schema models.
- Public tree: Site flat block and placement projection into nested output.
- Core media: instance-owned media assets referenced by flat app records.
- Custom domain mapping: exact-host profile route intent stored on the instance.
- Portable archive: versioned app or instance export, restore, import envelope.

## App Terms

- Task app: tasks with active, completed, overdue queries.
- Estii app: resources, cards, rates. Rate is join record.
- Site app: blocks and block placements. Public pages render from tree projection.
- Block: Site content, media, group, or page record.
- Block placement: flat parent-child composition edge.
- Default product Site install: installed Site app with install id `site`.

## Work

1. Run `devstate start`.
2. Read `./.devstate/status.md`; fix red status first.
3. Read workstream issue or assigned legacy PRD.
4. Read nearest package `AGENTS.md` only when editing inside that package.
5. Read relevant `openspec/specs/*/spec.md`.
6. Ship exactly one ready chunk unless user explicitly asks for docs/planning only.
7. Update only owning workstream body with status, decisions, blockers, evidence, promotion notes.
8. Run `devstate check`.
9. Read `./.devstate/status.md`; fix issues.
10. If app behavior changed, smoke with `bun browser ...`.
11. End with changed files, checks, PRD status.

## Workstream

- New PRDs live in GitHub Issues for `dpeek/formless`.
- GitHub PRD issue body is canonical.
- Do not create new local PRD files.
- Do not add one progress comment per chunk.
- Chunk statuses: `ready`, `doing`, `shipped`, `blocked`, `closed`.
- Mark one chunk `doing` at a time for a workstream.
- Normal PRD agent adds promotion notes; finalization promotes them.

## Finalization

When user asks to finalize after review:

- Use `bun ralph finalize --issue <issue>` or `bun ralph finalise --issue <issue>`.
- Verify required chunks are `shipped` or intentionally `closed`.
- Rebase on local `main`: `git rebase main`.
- Resolve clear conflicts; stop when unsure.
- Promote PRD promotion notes into relevant `openspec/specs/*/spec.md`.
- Update owning PRD issue body or legacy PRD file.
- Run `devstate check`; read status; fix issues.
- Run `devstate stop`.
- Commit with `Fixes #<issue>` for GitHub PRDs.
- Do not merge unless user asks.

## Rules

- Bun scripts only.
- `devstate` owns dev, test, check output.
- Do not run `vp test`, `vp check`, `bun test`, or `bun check` manually during normal agent work.
- Use `./.devstate/status.md` as check evidence.
- Preserve user changes.
- Keep data model flat.
- Compose in view/query/projection/action layer.
- Tests must not depend on exact `schema/apps/site/seed-records.json` content.
- Use `src/test/site-records.ts` fixtures for Site record shape.
- Claims in docs must point to code, schema, tests, specs, or shipped behavior.
- Shipped facts belong in `openspec/specs/`.
- Human narrative does not belong in agent docs.

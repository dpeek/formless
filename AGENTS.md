# Formless Agents

Write short. Facts only. Keep docs source-faithful.

## Project

Formless = schema-as-data app runtime.

App schema is runtime data. It defines entities, fields, relationships, mutations, queries, read models, views, screens, actions.

Data stays flat. Compose in query, view, projection, action layer.

## Read Levels

- Always: this file.
- Workstream: assigned committed OpenSpec change under `openspec/changes/<change-id>/`.
- Task loop: `doc/agents/local-openspec-implement.md` or `doc/agents/local-openspec-finalize.md` when `bun agents` injects it.
- Package scope: nearest package `AGENTS.md`, for example `lib/ui/AGENTS.md`.
- Capability scope: relevant `openspec/specs/*/spec.md`.
- Skill config: relevant file in `doc/agents/`.
- Do not read every doc. Read only path needed for task.

## Agent Docs

- `doc/agents/local-agent-workers.md`: local OpenSpec pull worker workflow.
- `doc/agents/local-openspec-implement.md`: one-section implementation prompt body.
- `doc/agents/local-openspec-finalize.md`: automatic finalization prompt body.

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
- `scripts/`: repo scripts, local agents, package build, seed pull.
- `openspec/specs/`: shipped capability specs.
- `doc/agents/`: local agent workflow config and prompt bodies.

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
3. Read assigned OpenSpec change artifacts.
4. Read nearest package `AGENTS.md` only when editing inside that package.
5. Read relevant `openspec/specs/*/spec.md`.
6. Ship exactly one ready `##` section from `openspec/changes/<change-id>/tasks.md` unless user explicitly asks for docs/planning only.
7. Update only owning OpenSpec change artifacts with status, decisions, blockers, evidence, promotion notes.
8. Run `devstate check`.
9. Read `./.devstate/status.md`; fix issues.
10. If app behavior changed, smoke with `bun browser ...`.
11. End with changed files, checks, OpenSpec change status.

## Workstream

- Workstreams live in committed OpenSpec changes under `openspec/changes/<change-id>/`.
- Do not use external systems as queue, lock, or status store.
- Do not create alternate planning docs.
- Task statuses are task checkboxes plus recorded evidence in the owning change artifacts.
- Mark or ship one `##` section at a time for a workstream.
- Local OpenSpec implementation unit is one ready `##` section in `openspec/changes/<change-id>/tasks.md`.
- Local OpenSpec workers auto-finalize before review and include promoted specs on the review branch.

## Local OpenSpec Finalization

For `bun agents watch <worker-name>`:

- Finalize automatically when required tasks are shipped or intentionally closed.
- Rebase on local `main` and reconcile updated change artifacts before marking ready.
- Resolve clear structural rebase conflicts; block only on semantic conflicts that require product, storage, security, public API, or user-intent decisions.
- Promote shipped facts into relevant `openspec/specs/*/spec.md` on the branch.
- Leave a clean review-ready `changes/<change-id>` branch.
- Keep review-ready branches rebased on local `main`; workers rerun finalization when `main` advances.
- Detach the worker worktree from `changes/<change-id>` at the final branch tip before marking ready.
- Do not archive the OpenSpec change; archiving is a separate process after review and merge.
- Do not merge unless user asks.

## Rules

- Bun scripts only.
- `devstate` owns dev, test, check output.
- Do not run `vp test`, `vp check`, `bun test`, or `bun check` manually during normal agent work.
- Use `./.devstate/status.md` as check evidence.
- Preserve user changes.
- Keep data model flat.
- Compose in view/query/projection/action layer.
- Backwards compat is not yet a concern: no shims, re-exports, migrations and new schema versions.
- Tests must not depend on exact `schema/apps/site/seed-records.json` content.
- Use `src/test/site-records.ts` fixtures for Site record shape.
- Claims in docs must point to code, schema, tests, specs, or shipped behavior.
- Shipped facts belong in `openspec/specs/`.
- Human narrative does not belong in agent docs.

# Formless Agents

Write short. Facts only. Keep docs source-faithful.

## Project

Formless = schema-as-data app runtime.

App schema is runtime data. It defines entities, fields, relationships, mutations, queries, read models, views, screens, actions.

Data stays flat. Compose in query, view, projection, action layer.

## Read Levels

- Always: this file.
- Workstream: assigned Git-backed change branch `changes/<change-id>` and parsed tip commit metadata.
- Task loop: rendered prompt injected by `bun agents`; source skill templates are reference, not required per-session reads.
- Package scope: nearest package `AGENTS.md`, for example `lib/ui/AGENTS.md`.
- Capability scope: relevant `openspec/specs/*/spec.md`.
- Do not read every doc. Read only path needed for task.

## Agent Skills

- `.agents/skills/change-propose/SKILL.md`: create Git-backed change branches.
- `.agents/skills/change-apply/SKILL.md`: implement one ready task section.
- `.agents/skills/change-finalize/SKILL.md`: finalize completed branches for review.
- `.agents/skills/change-explore/SKILL.md`: inspect Git-backed changes without implementation.

## Capability Specs

- `openspec/specs/app-schema/spec.md`: schema parsing, fields, relationships, read models, actions.
- `openspec/specs/authority-storage/spec.md`: Authority, writes, bootstrap, reset, snapshots.
- `openspec/specs/sync-replica/spec.md`: browser replica, cursors, push sync, local projections.
- `openspec/specs/generated-ui/spec.md`: React generated surfaces, fields, screens, actions.
- `openspec/specs/site-runtime/spec.md`: Site records, public tree, SSR, metadata, icons.
- `openspec/specs/site-cli-publish/spec.md`: standalone Site CLI, save, publish, deploy commands.
- `openspec/specs/installed-apps/spec.md`: product app installs, routes, install storage.
- `openspec/specs/instance-control-plane/spec.md`: schema-owned instance management records.
- `openspec/specs/instance-auth/spec.md`: owner passkeys, sessions, admin bearer boundary.
- `openspec/specs/runtime-topology/spec.md`: profiles, route policy, mapped hosts.
- `openspec/specs/deployment-runtime/spec.md`: desired deploy state, attempts, leases, status.
- `openspec/specs/core-media/spec.md`: core media assets, upload, delivery, media archive payloads.
- `openspec/specs/media/spec.md`: reusable Media package contracts and adapters.
- `openspec/specs/custom-domains/spec.md`: exact-host mappings, provider jobs, redirects, cleanup.
- `openspec/specs/portable-archives/spec.md`: app and instance archives, restore, import, workspaces.
- `openspec/specs/public-actions/spec.md`: public action policy, target routes, challenges.
- `openspec/specs/contact-subscriptions/spec.md`: Site contacts, emails, audiences, subscriptions.
- `openspec/specs/package-slices/spec.md`: reusable `lib/<package>` package boundaries.
- `openspec/specs/upgrade-migrations/spec.md`: metadata, migrations, CLI upgrade flow.
- `openspec/specs/local-agent-workers/spec.md`: worker leases, branches, finalization.

## Repo Map

- `src/shared/`: schema, protocol, read models, field behavior, app identities.
- `src/client/`: browser replica, projections, generated view models.
- `src/app/`: React routes, generated UI, Site renderer.
- `src/worker/`: Worker routes, Authority, storage, installed apps, public SSR.
- `src/site/`: standalone Site CLI, project files, publish, archives, domains.
- `src/media/`: core media model and providers.
- `src/test/`: shared test fixtures.
- `schema/apps/`: bundled app schemas and seed records.
- `lib/ui/`: shared browser UI package.
- `lib/media/`: reusable media contracts and adapters package.
- `lib/deploy/`: reusable deployment contracts and adapters package.
- `scripts/`: repo scripts, local agents, package build, seed pull.
- `openspec/specs/`: shipped capability specs.

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
- Media package: reusable core media contracts, helpers, and adapters under `lib/media`.
- Custom domain mapping: exact-host profile route intent stored on the instance.
- Instance control plane: schema records for installs, routes, domain intent, deploy intent.
- Deployment runtime: versioned desired deploy state, attempt history, leases, and status.
- Instance auth: owner passkey setup, sessions, logout, and admin bearer boundary.
- Public action: schema-declared action opened through target-scoped public routes.
- Contact subscription: flat Site-owned contact, email address, audience, and subscription records.
- Portable archive: versioned app or instance export, restore, import envelope.
- Package slice: reusable capability package under `lib/<package>` without app records.
- Upgrade migration: registered runtime or app-data migration with safety policy and apply evidence.

## App Terms

- Task app: tasks with active, completed, overdue queries.
- Estii app: resources, cards, rates. Rate is join record.
- Site app: blocks and block placements. Public pages render from tree projection.
- Block: Site content, media, group, or page record.
- Block placement: flat parent-child composition edge.
- Default product Site install: installed Site app with install id `site`.

## Work

1. Run `devstate start`.
2. Use current devstate output; read `./.devstate/status.md` after failures, stale output, conflict resolution, or exact evidence-copy needs.
3. Select the ready task section from parsed change commit metadata before broad context reads when doing implementation work.
4. Read assigned change metadata, canonical specs, docs, and code needed for the selected section or finalization prompt.
5. Read nearest package `AGENTS.md` only when editing inside that package.
6. Read relevant `openspec/specs/*/spec.md`.
7. Ship exactly one ready task section from change commit metadata unless user explicitly asks for docs/planning only.
8. Update the branch tip with task status, decisions, blockers, evidence, and machine-readable trailers.
9. Run `devstate check`.
10. Use current devstate output; read `./.devstate/status.md` after failures, stale output, conflict resolution, or exact evidence-copy needs.
11. If app behavior changed, smoke with `bun browser ...`.
12. End with changed files, checks, and change metadata status.

## Workstream

- Workstreams live in local `changes/<change-id>` branches.
- Do not use external systems as queue, lock, or status store.
- Do not create alternate planning docs.
- The branch tip commit message stores proposal, design, task state, evidence, blockers, and trailers.
- The branch diff against local `main` is the review delta.
- Proposal branches start with a first-pass spec patch in canonical `openspec/specs/*/spec.md` files plus structured commit metadata.
- Shipped spec facts are direct edits to canonical `openspec/specs/*/spec.md` files on the branch.
- Task statuses are task checkboxes plus recorded evidence in structured commit metadata.
- Mark or ship one task section at a time for a workstream.
- Local Git-backed implementation unit is one ready task section in change commit metadata.
- Local Git-backed workers auto-finalize before review and leave code changes, completed evidence, canonical specs, and structured metadata on the review branch.
- Future worker changes do not produce OpenSpec archive output.

## Local Git-backed Finalization

For `bun agents watch <worker-name>`:

- Finalization is supervisor and rendered-prompt owned after required tasks are shipped or intentionally closed.
- Rebase on local `main`, validate structured commit metadata, run `openspec validate --specs --strict --no-interactive`, publish to the review branch, and mark metadata ready for review.
- Do not run `openspec archive` or commit archived change files for Git-backed Formless changes.
- Reuse latest implementation `devstate check` evidence unless rebase, conflict resolution, code changes, generated output edits, or unclear coverage invalidate it.
- Resolve clear structural rebase conflicts; block only on semantic conflicts that require product, storage, security, public API, or user-intent decisions.
- Leave a clean review-ready `changes/<change-id>` branch with code changes, completed evidence, canonical specs, and structured commit metadata.
- Keep review-ready branches rebased on local `main`; workers rerun finalization when `main` advances.
- Keep the worker worktree on `agents/<worker-name>` and leave `changes/<change-id>` free for review after marking ready.
- Do not merge unless user asks.

## Rules

- Bun scripts only.
- `devstate` owns dev, test, check output.
- Do not run `vp test`, `vp check`, `bun test`, or `bun check` manually during normal agent work.
- Use current devstate output or `./.devstate/status.md` as check evidence.
- Preserve user changes.
- Keep data model flat.
- Compose in view/query/projection/action layer.
- Backwards compat is not yet a concern: no shims, re-exports, migrations and new schema versions.
- Tests must not depend on exact `schema/apps/site/seed-records.json` content.
- Use `src/test/site-records.ts` fixtures for Site record shape.
- Claims in docs must point to code, schema, tests, specs, or shipped behavior.
- Shipped facts belong in `openspec/specs/`.
- Human narrative does not belong in agent docs.

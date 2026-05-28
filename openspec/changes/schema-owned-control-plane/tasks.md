## 1. Control-Plane Contracts

- [x] 1.1 Reconcile this change against the promoted `add-deployment-primitives` specs and update capability references if `deployment-runtime` has landed.
- [x] 1.2 Define instance control-plane schema record types for `appInstall`, `appRoute`, deploy targets, provider config refs, domain mappings, redirects, desired resources, attempts, evidence summaries, and drift reports.
- [x] 1.3 Define app install identity invariants, immutable fields, package app key references, route record shapes, route kinds, enabled state, and route path validation rules.
- [x] 1.4 Add runtime-owned instance control-plane schema definition with install, route, domain, deployment, evidence, and drift screens/views/actions.
- [x] 1.5 Add `lib/deploy` package scaffold with `AGENTS.md`, `package.json`, `tsconfig.json`, and public root/client/react/worker entrypoints.
- [x] 1.6 Define public deploy package types, action ids, actor kinds, secret reference shapes, projection inputs, display-safe evidence types, and projection helpers.
- [x] 1.7 Add deterministic projection and hash fixtures for current app route, domain mapping, and redirect intent cases.

Evidence:

- Files changed: `src/shared/instance-control-plane.ts`, `src/shared/instance-control-plane.test.ts`, `lib/deploy/AGENTS.md`, `lib/deploy/package.json`, `lib/deploy/tsconfig.json`, `lib/deploy/src/types.ts`, `lib/deploy/src/index.ts`, `lib/deploy/src/client.ts`, `lib/deploy/src/react.tsx`, `lib/deploy/src/worker.ts`, `lib/deploy/src/index.test.ts`, `openspec/changes/schema-owned-control-plane/proposal.md`, `openspec/changes/schema-owned-control-plane/design.md`, `openspec/changes/schema-owned-control-plane/specs/instance-control-plane/spec.md`, `openspec/changes/schema-owned-control-plane/specs/package-slices/spec.md`, `openspec/changes/schema-owned-control-plane/specs/deployment-runtime/spec.md`.
- Checks: `devstate start` ran before implementation; initial status had checks pass and a watch-test service timeout. `devstate check` after implementation passed with checks ok and services running in `./.devstate/status.md` at 2026-05-28T06:05:51.625Z.
- Smoke: not run; section 1 adds contracts, schema data, package helpers, and tests without wiring generated instance UI behavior.
- Promotion notes: added a change-local `deployment-runtime` delta because the promoted capability exists; final promoted spec updates remain in section 8.

## 2. Schema Runtime Capabilities

- [ ] 2.1 Add parser support for runtime-owned control-plane schema metadata without exposing those sections to unsupported Builder edits.
- [ ] 2.2 Add immutable field semantics for app install identity, package app key, storage identity, and other control-plane identity fields.
- [ ] 2.3 Add route field validation support for route-safe shape, reserved paths, package capability, route kind, and enabled-route uniqueness.
- [ ] 2.4 Add schema support for non-secret secret reference fields or metadata used by deployment records.
- [ ] 2.5 Add actor-scoped schema action exposure for owner, admin, CLI deployer, and runner callers.
- [ ] 2.6 Add action response filtering so actor-only deployment actions return only fields allowed for that actor.
- [ ] 2.7 Add append-only or action-created history semantics for deployment attempt, evidence, cleanup, and drift records.
- [ ] 2.8 Add schema parser and action capability tests for control-plane schema metadata, immutable fields, route validation, actor exposure, secret references, and append-only history.

## 3. Authority Control-Plane Storage

- [ ] 3.1 Add the instance control-plane app storage identity and bootstrap it from the instance control-plane schema.
- [ ] 3.2 Expose owner/admin, CLI deployer, and runner-safe control-plane query and action routes through the instance protocol.
- [ ] 3.3 Ensure control-plane writes use Authority validation, write-log idempotency, action execution records, and monotonic change cursors.
- [ ] 3.4 Implement package app install creation as a transaction that writes `appInstall` and default `appRoute` records and initializes install-scoped app storage.
- [ ] 3.5 Enforce secret, provider-truth, and installed-app-data exclusion from control-plane record values, change rows, sync responses, snapshots, and exports.
- [ ] 3.6 Add storage tests proving control-plane records are isolated from installed app storage identities.
- [ ] 3.7 Add auth and actor policy tests for browser, CLI deployer, and runner access.

## 4. App Install And Route Compatibility

- [ ] 4.1 Backfill existing `app_installs` rows into `appInstall` and default `appRoute` control-plane records.
- [ ] 4.2 Derive existing `/api/formless/app-installs` responses from control-plane install and route records while preserving response shape.
- [ ] 4.3 Route existing create app install requests through control-plane records while preserving validation for unsupported packages, invalid ids, duplicates, and labels.
- [ ] 4.4 Resolve installed app browser routes and installed Site public routes from enabled `appRoute` records.
- [ ] 4.5 Keep install-scoped API prefixes, Authority names, browser replica names, broadcast names, and public Site reads derived from stable install identity.
- [ ] 4.6 Add compatibility tests for default Site, Tasks, Estii, multi-site, mixed-app fixtures, installed app routes, public Site routes, and app install API responses.

## 5. Deployment Runtime Projection

- [ ] 5.1 Change desired-state materialization to project from control-plane records for the selected target.
- [ ] 5.2 Preserve exact desired-state version ids, stable hashes, source fingerprints, resource graph shape, and no-secret response shape.
- [ ] 5.3 Route deployment attempt start, heartbeat, plan, success, failure, and drift writeback through schema-declared actions where available.
- [ ] 5.4 Store display-safe attempt, evidence summary, and drift history as control-plane records while keeping raw lease tokens and provider truth external.
- [ ] 5.5 Add regression tests comparing old route/domain-derived desired-state output with schema-projected output.
- [ ] 5.6 Add failure tests for stale desired-state references, actor mismatches, hidden secret values, and provider-truth payloads.

## 6. Custom-Domain Migration And Compatibility

- [ ] 6.1 Backfill existing domain mapping and redirect intent tables into control-plane records that reference app installs or app routes where applicable.
- [ ] 6.2 Backfill compatible deployment attempt, evidence summary, cleanup, and drift facts into display-safe control-plane records.
- [ ] 6.3 Delegate existing custom-domain mapping and redirect APIs to schema-owned records while preserving response shapes.
- [ ] 6.4 Delegate domain provider apply, delete, cleanup, forget, and manual cleanup workflows to schema records/actions where available.
- [ ] 6.5 Keep legacy table reads available long enough to verify old and new state during migration.
- [ ] 6.6 Add compatibility tests for domain routes, app/public Site targets, provider evidence, cleanup behavior, and existing API responses.

## 7. Generated UI, CLI, And Archives

- [ ] 7.1 Render app install management in the instance shell from control-plane schema screens, views, read models, and actions.
- [ ] 7.2 Provide install creation and edit UI with package selection, route-safe install id entry, label editing, immutable identity fields, status display, and route summaries.
- [ ] 7.3 Render app route management with install grouping, route kind, path or prefix, enabled state, surface, package capability, conflict feedback, and read-only derived fields.
- [ ] 7.4 Render deployment management from control-plane records and hide CLI deployer and runner actions from browser generated UI.
- [ ] 7.5 Update CLI target helpers to query app install, app route, domain, and deployment records and invoke actor-scoped deployment actions.
- [ ] 7.6 Keep existing domain remote-plan, run-apply, run-delete, forget, manual cleanup, direct fallback, app install, archive, and deploy command/API surfaces stable.
- [ ] 7.7 Update instance workspace pull, check, push, and archive flows to represent app install, route, domain, and deployment intent as schema-owned records without secrets.
- [ ] 7.8 Add UI, CLI, workspace, and archive tests for install editor behavior, route editor validation, no-secret responses, action exposure, drift reporting, and command compatibility.

## 8. Verification And Promotion

- [ ] 8.1 Run `devstate start` before implementation work and fix any red status in `./.devstate/status.md`.
- [ ] 8.2 Run `devstate check` after each shipped implementation section and use `./.devstate/status.md` as evidence.
- [ ] 8.3 Smoke visible instance management UI behavior with `bun browser ...` when generated instance UI changes.
- [ ] 8.4 Record implementation decisions, blockers, evidence, and promotion notes in the owning change artifacts.
- [ ] 8.5 Promote shipped facts into `openspec/specs/` for instance control plane, installed apps, runtime topology, app schema, authority storage, generated UI, Site CLI, custom domains, package slices, and portable archives.

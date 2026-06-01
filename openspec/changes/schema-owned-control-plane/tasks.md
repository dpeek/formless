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
- Promotion notes: added a change-local `deployment-runtime` delta because the promoted capability exists; final promoted spec updates remain in section 12.

## 2. Schema Runtime Capabilities

- [x] 2.1 Add parser support for runtime-owned control-plane schema metadata without exposing those sections to unsupported Builder edits.
- [x] 2.2 Add immutable field semantics for app install identity, package app key, storage identity, and other control-plane identity fields.
- [x] 2.3 Add route field validation support for route-safe shape, reserved paths, package capability, route kind, and enabled-route uniqueness.
- [x] 2.4 Add schema support for non-secret secret reference fields or metadata used by deployment records.
- [x] 2.5 Add actor-scoped schema action exposure for owner, admin, CLI deployer, and runner callers.
- [x] 2.6 Add action response filtering so actor-only deployment actions return only fields allowed for that actor.
- [x] 2.7 Add append-only or action-created history semantics for deployment attempt, evidence, cleanup, and drift records.
- [x] 2.8 Add schema parser and action capability tests for control-plane schema metadata, immutable fields, route validation, actor exposure, secret references, and append-only history.

Evidence:

- Files changed: `src/shared/schema-types.ts`, `src/shared/schema-runtime.ts`, `src/shared/schema.ts`, `src/shared/schema-actions.ts`, `src/shared/schema-control-plane.test.ts`, `src/shared/instance-control-plane.ts`, `src/shared/instance-control-plane.test.ts`, `src/worker/authority-validation.ts`, `src/worker/actions.ts`, `src/worker/control-plane-schema-validation.test.ts`, `src/client/collection-shell-model.ts`, `src/client/schema-builder.test.ts`, `openspec/changes/schema-owned-control-plane/tasks.md`.
- Checks: `devstate start` ran before implementation with checks ok and services running in `./.devstate/status.md` at 2026-05-28T06:08:16.855Z. `devstate check` after implementation passed with checks ok and services running in `./.devstate/status.md` at 2026-05-28T06:22:08.009Z.
- Smoke: `bun browser --ignore-https-errors open https://schema-owned-control-plane.formless.local` loaded the local instance shell; `bun browser snapshot -i --max-output 6000` returned App management, Installed apps, and Custom domains controls.
- Decisions: runtime-owned metadata parses under `runtime.owner = "runtime"` with `builder.editable = false`; control-plane entity metadata owns immutable fields, route validation, secret reference fields, and action-created or append-only history. Actor-scoped action exposure defaults legacy actions to browser owner access when no exposure is declared and filters actor response change payload values when response fields are declared.
- Promotion notes: shipped facts remain change-local; final promoted spec updates remain in section 12.

## 3. Authority Control-Plane Storage

- [x] 3.1 Add the instance control-plane app storage identity and bootstrap it from the instance control-plane schema.
- [x] 3.2 Expose owner/admin, CLI deployer, and runner-safe control-plane query and action routes through the instance protocol.
- [x] 3.3 Ensure control-plane writes use Authority validation, write-log idempotency, action execution records, and monotonic change cursors.
- [x] 3.4 Implement package app install creation as a transaction that writes `appInstall` and default `appRoute` records and initializes install-scoped app storage.
- [x] 3.5 Enforce secret, provider-truth, and installed-app-data exclusion from control-plane record values, change rows, sync responses, snapshots, and exports.
- [x] 3.6 Add storage tests proving control-plane records are isolated from installed app storage identities.
- [x] 3.7 Add auth and actor policy tests for browser, CLI deployer, and runner access.

Evidence:

- Files changed: `src/shared/app-storage-identity.ts`, `src/shared/app-storage-identity.test.ts`, `src/shared/instance-control-plane.ts`, `src/shared/instance-control-plane.test.ts`, `src/worker/instance-control-plane.ts`, `src/worker/instance-control-plane.test.ts`, `src/worker/authority.ts`, `src/worker/index.ts`, `src/worker/authority-operations.ts`, `src/worker/authority-validation.ts`, `src/worker/schema-apps.ts`, `src/worker/storage.ts`, `openspec/changes/schema-owned-control-plane/tasks.md`.
- Checks: `devstate start` ran before implementation with checks ok and services running in `./.devstate/status.md` at 2026-05-28T06:24:55.179Z. `devstate check` initially caught type/lint issues in the new control-plane handler and validator; post-rebase `devstate check` caught two new test issues in `src/worker/instance-control-plane.test.ts`. After fixes, the final `devstate check` passed with checks ok and services running in `./.devstate/status.md` at 2026-05-28T06:36:17.841Z.
- Smoke: not run; section 3 adds instance protocol and storage behavior without generated instance UI changes.
- Decisions: `/api/formless/control-plane/*` targets the dedicated `instance:control-plane` Authority storage identity and bootstraps from `instanceControlPlaneSchema`. The first custom control-plane action is `POST /api/formless/control-plane/actions/createAppInstall`; it writes fixed-id `appInstall` and default `appRoute` records with action write-log idempotency, then initializes install-scoped app storage before route records become usable. Generic control-plane writes stay owner/admin-only for now; actor-scoped schema actions read the actor from `X-Formless-Control-Plane-Actor`, `X-Formless-Actor-Kind`, or `actorKind`.
- Promotion notes: shipped facts remain change-local; final promoted spec updates remain in section 12.

## 4. App Install And Route Compatibility

- [x] 4.1 Backfill existing `app_installs` rows into `appInstall` and default `appRoute` control-plane records.
- [x] 4.2 Derive existing `/api/formless/app-installs` responses from control-plane install and route records while preserving response shape.
- [x] 4.3 Route existing create app install requests through control-plane records while preserving validation for unsupported packages, invalid ids, duplicates, and labels.
- [x] 4.4 Resolve installed app browser routes and installed Site public routes from enabled `appRoute` records.
- [x] 4.5 Keep install-scoped API prefixes, Authority names, browser replica names, broadcast names, and public Site reads derived from stable install identity.
- [x] 4.6 Add compatibility tests for default Site, Tasks, Estii, multi-site, mixed-app fixtures, installed app routes, public Site routes, and app install API responses.

Evidence:

- Files changed: `src/shared/app-installs.ts`, `src/worker/instance-control-plane.ts`, `src/worker/instance-app-installs.ts`, `src/worker/instance-app-installs-state.ts`, `src/worker/default-app-installs.ts`, `src/worker/owner-setup.ts`, `src/worker/instance-domain-mappings.ts`, `src/worker/instance-domain-mappings-state.ts`, `src/app/runtime-profile.ts`, `src/site/instance-workspace.ts`, `src/worker/instance-app-installs.test.ts`, `src/worker/launch-fixture-startup.test.ts`, `src/app/runtime-profile.test.ts`, `openspec/changes/schema-owned-control-plane/tasks.md`.
- Checks: `devstate start` ran before implementation with checks ok and services running in `./.devstate/status.md` at 2026-05-28T06:38:45.987Z. `devstate check` first caught route type fallout from control-plane route widening, then the custom-domain compatibility watch caught target install validation still reading only the legacy table. After narrowing compatibility casts, routing domain mapping validation through the backfilled control-plane install list, and restarting stale watch services, final `devstate check` passed with checks ok and services running in `./.devstate/status.md` at 2026-05-28T06:56:23.181Z.
- Smoke: `bun browser --ignore-https-errors open https://schema-owned-control-plane.formless.local` loaded the local instance shell; `bun browser snapshot -i --max-output 6000` returned App management, Installed apps, Install, and Custom domains controls.
- Decisions: `/api/formless/app-installs` now backfills legacy `app_installs` rows through an internal control-plane-only route, reads installed install responses from control-plane `appInstall` and `appRoute` records, and forwards create requests to the control-plane `createAppInstall` action with per-request action ids to preserve duplicate validation. Runtime route selection and domain mapping target validation use enabled control-plane route/install metadata when present and fall back to legacy install-id-derived routes for existing callers.
- Promotion notes: shipped facts remain change-local; final promoted spec updates remain in section 12.

## 5. Deployment Runtime Projection

- [x] 5.1 Change desired-state materialization to project from control-plane records for the selected target.
- [x] 5.2 Preserve exact desired-state version ids, stable hashes, source fingerprints, resource graph shape, and no-secret response shape.
- [x] 5.3 Route deployment attempt start, heartbeat, plan, success, failure, and drift writeback through schema-declared actions where available.
- [x] 5.4 Store display-safe attempt, evidence summary, and drift history as control-plane records while keeping raw lease tokens and provider truth external.
- [x] 5.5 Add regression tests comparing old route/domain-derived desired-state output with schema-projected output.
- [x] 5.6 Add failure tests for stale desired-state references, actor mismatches, hidden secret values, and provider-truth payloads.

Evidence:

- Files changed: `src/worker/deployment-control-plane-client.ts`, `src/worker/deployment-runtime-api.ts`, `src/worker/deployment-runtime-projection.ts`, `src/worker/deployment-runtime-state.ts`, `src/worker/domain-provider-api.ts`, `src/worker/instance-control-plane.ts`, `src/worker/deployment-runtime-api.test.ts`, `openspec/changes/schema-owned-control-plane/tasks.md`.
- Checks: `devstate start` ran before implementation with checks ok and services running in `./.devstate/status.md` at 2026-05-28T06:59:33.542Z. `devstate check` first caught two parser narrowing type errors in `src/worker/instance-control-plane.ts`; after fixing them, `devstate check` passed with checks ok and services running in `./.devstate/status.md` at 2026-05-28T07:14:36.049Z.
- Smoke: not run; section 5 changes deployment runtime API and control-plane record writeback behavior without changing visible generated instance UI.
- Decisions: desired-state reads still compute the legacy route/domain projection, sync its display-safe resources into `deployTarget` and `deployDesiredResource` control-plane records, then materialize desired state from those control-plane records so version ids, hashes, source fingerprints, resource graph shape, and no-secret response behavior stay stable during migration. Deployment start, heartbeat, plan, success, failure, and drift endpoints now mirror display-safe attempt, evidence, and drift records into the control-plane storage identity; raw lease tokens remain only in deployment runtime lease tables and provider truth remains rejected from evidence payloads.
- Promotion notes: shipped facts remain change-local; final promoted spec updates remain in section 12.

## 6. Custom-Domain Migration And Compatibility

- [x] 6.1 Backfill existing domain mapping and redirect intent tables into control-plane records that reference app installs or app routes where applicable.
- [x] 6.2 Backfill compatible deployment attempt, evidence summary, cleanup, and drift facts into display-safe control-plane records.
- [x] 6.3 Delegate existing custom-domain mapping and redirect APIs to schema-owned records while preserving response shapes.
- [x] 6.4 Delegate domain provider apply, delete, cleanup, forget, and manual cleanup workflows to schema records/actions where available.
- [x] 6.5 Keep legacy table reads available long enough to verify old and new state during migration.
- [x] 6.6 Add compatibility tests for domain routes, app/public Site targets, provider evidence, cleanup behavior, and existing API responses.

Evidence:

- Files changed: `src/worker/deployment-control-plane-client.ts`, `src/worker/instance-control-plane.ts`, `src/worker/instance-domain-mappings.ts`, `src/worker/domain-provider-api.ts`, `src/worker/instance-domain-mappings.test.ts`, `src/worker/domain-provider-api.test.ts`, `src/worker/authority-operations.ts`, `bun.lock`, `openspec/changes/schema-owned-control-plane/tasks.md`.
- Checks: `devstate start` before implementation passed with checks ok and services running in `./.devstate/status.md` at 2026-05-29T01:47:04.649Z. `devstate check` first caught one type error in `src/worker/instance-domain-mappings.ts`; after fixing the forget handler env type, `devstate check` passed with checks ok and services running in `./.devstate/status.md` at 2026-05-29T01:55:48.213Z. Post-rebase `devstate check` caught one `src/worker/authority-operations.ts` identity narrowing type error; after adding the Site tree app-storage guard, final `devstate check` passed with checks ok and services running in `./.devstate/status.md` at 2026-05-29T04:55:53.443Z. `openspec validate schema-owned-control-plane --strict` passed.
- Smoke: not run; section 6 changes worker API/control-plane sync behavior without generated instance UI changes.
- Decisions: custom-domain mapping and redirect legacy rows now sync into `domainMapping` and `redirectIntent` control-plane records on compatible API reads and writes, while responses preserve existing API shapes. Provider apply/delete attempts and display-safe evidence summaries are mirrored into control-plane deployment records; raw provider truth and cleanup audit tables stay outside control-plane records. During migration, legacy tables remain the source list and control-plane reads are filtered back to those source ids so stale control-plane intent cannot reappear in compatibility responses.
- Rebase note: `changes/schema-owned-control-plane` is rebased on local `main` at `d8f48c9`. Conflicts in `src/shared/schema-actions.ts` and `src/shared/schema-types.ts` were resolved by preserving public subscribe action input support and schema action actor exposure metadata; the section 6 stash reapplied cleanly.
- Promotion notes: shipped facts remain change-local; final promoted spec updates remain in section 12.

## 7. Generated UI Target Plumbing

- [x] 7.1 Generalize browser client targets and generated app context so the instance shell can load the runtime-owned `instance:control-plane` schema target without requiring a bundled `SchemaKey`.
- [x] 7.2 Render app install management from control-plane schema screens, views, read models, and owner/admin actions in the instance shell.
- [x] 7.3 Provide install creation and edit UI with package selection, route-safe install id entry, label editing, immutable identity fields, status display, and generated route summaries.
- [x] 7.4 Render app route management with install grouping, route kind, path or prefix, enabled state, surface, package capability, conflict feedback, and read-only derived fields.
- [x] 7.5 Add generated UI tests for install editor behavior, route editor validation, hidden non-browser actions, and no-secret browser responses.
- [x] 7.6 Smoke visible instance management UI behavior with `bun browser ...`.

Evidence:

- Files changed: `src/client/app-target.ts`, `src/client/store.ts`, `src/client/broadcast.test.ts`, `src/client/db.test.ts`, `src/client/store.test.ts`, `src/client/sync.test.ts`, `src/client/views.test.ts`, `src/app.tsx`, `src/app/generated/schema-app-context.tsx`, `src/app/routes/home.tsx`, `src/app/routes/schema.tsx`, `src/app/routes/instance-shell.tsx`, `src/app/routes/instance-shell.test.tsx`, `src/shared/instance-control-plane.ts`, `src/shared/instance-control-plane.test.ts`, `src/worker/instance-control-plane.test.ts`, `openspec/changes/schema-owned-control-plane/tasks.md`.
- Checks: `devstate start` before implementation passed with checks ok and services running in `./.devstate/status.md` at 2026-06-01T01:20:54.607Z. `devstate check` first caught client target type fallout from widening generated UI targets; after narrowing the app-router component contract and using client target helpers, `devstate check` passed with checks ok and services running in `./.devstate/status.md` at 2026-06-01T01:30:28.171Z. Post-rebase `devstate check` passed with checks ok and services running in `./.devstate/status.md` at 2026-06-01T01:31:28.231Z. Final `devstate check` after evidence update passed with checks ok and services running in `./.devstate/status.md` at 2026-06-01T01:32:10.269Z.
- Smoke: `bun browser --ignore-https-errors open https://schema-owned-control-plane.formless.local` loaded the local instance shell; `bun browser snapshot -i --max-output 8000` returned the generated control-plane `App installs` and `App routes` tables under Installed apps, with editable route columns and the guided Install action still visible.
- Decisions: browser client target plumbing now accepts the runtime-owned instance control-plane storage identity without adding it to bundled `SchemaKey`; generated app context can carry `instance-control-plane` only when a concrete control-plane target is provided. The instance shell renders the control-plane Apps screen from schema screens/views while keeping the existing guided install dialog as the owner/admin creation path because generic `appInstall` record creation does not initialize install-scoped app storage. Control-plane table metadata makes install labels, route paths, route prefixes, and enabled state editable while identity, package, storage, surface, and package capability fields remain read-only in generated UI.
- Rebase note: `changes/schema-owned-control-plane` rebased cleanly on local `main`; the section 7 autostash reapplied without conflicts.
- Promotion notes: shipped facts remain change-local; final promoted spec updates remain in section 12.

## 8. Deployment Action Protocol

- [x] 8.1 Define and record whether deployment lifecycle commands use schema-declared actions or compatibility endpoint delegation for this migration slice.
- [x] 8.2 Add or adapt actor-scoped deployment protocol helpers so CLI deployer and runner actors can query allowed control-plane records and bind commands to exact desired-state versions.
- [x] 8.3 Update CLI target helpers to query app install, app route, domain, and deployment records through the control-plane protocol where available.
- [x] 8.4 Keep existing domain remote-plan, run-apply, run-delete, forget, manual cleanup, direct fallback, app install, and deploy command/API surfaces stable.
- [x] 8.5 Add CLI and protocol tests for actor exposure, action invocation or delegation, no-secret responses, and existing command compatibility.

Evidence:

- Files changed: `lib/deploy/src/client.ts`, `lib/deploy/src/client.test.ts`, `src/site/instance-target-client.ts`, `src/site/instance-target-client.test.ts`, `src/site/domain-provider-runner.ts`, `src/site/cli.test.ts`, `package.json`, `bun.lock`, `openspec/changes/schema-owned-control-plane/tasks.md`.
- Checks: `devstate start` before implementation passed with checks ok and services running in `./.devstate/status.md` at 2026-06-01T01:34:22.406Z. `devstate check` first caught a stale watch-service resolver error for `@dpeek/formless-deploy/client` after adding the root workspace dependency; `bun -e "await import('@dpeek/formless-deploy/client')"` proved package resolution, `devstate start` refreshed services, and final `devstate check` passed with checks ok and services running in `./.devstate/status.md` at 2026-06-01T01:42:47.994Z.
- Smoke: not run; section 8 changes CLI/protocol helpers and command compatibility tests without visible generated instance UI behavior.
- Decisions: deployment lifecycle commands stay on compatibility endpoint delegation for this migration slice. CLI runner apply now reads the runner-scoped control-plane bootstrap when available, then binds command writeback to the exact desired-state version returned by `/api/formless/deployments/desired-state` before calling existing deployment-runtime attempt, plan, success, and failure endpoints. Schema-declared deployment lifecycle actions remain a future cutover point once the runtime schema declares those actions.
- Promotion notes: shipped facts remain change-local; final promoted spec updates remain in section 12.

## 9. Deployment Management UI

- [ ] 9.1 Render deployment targets, desired resources, attempts, evidence summaries, and drift summaries from control-plane records in the instance shell.
- [ ] 9.2 Hide CLI deployer and runner actions from browser generated UI while preserving owner/admin browser actions.
- [ ] 9.3 Keep custom-domain desired state, provider applied evidence, and provider drift visually separate.
- [ ] 9.4 Add generated UI tests for deployment history read-only behavior, action visibility, no-secret responses, and drift reporting.
- [ ] 9.5 Smoke visible deployment management UI behavior with `bun browser ...`.

## 10. Workspace And Archive Control Plane

- [ ] 10.1 Define the reviewable instance workspace and archive envelope for schema-owned app install, route, domain, and deployment intent records.
- [ ] 10.2 Update instance workspace pull, check, push, and archive flows to represent app install, route, domain, and deployment intent as schema-owned records without secrets.
- [ ] 10.3 Compare workspace drift against remote control-plane records while keeping provider drift summaries separate from desired intent drift.
- [ ] 10.4 Keep installed app snapshots scoped by app install identity and outside control-plane records.
- [ ] 10.5 Add workspace and archive tests for record shape, secret exclusion, drift comparison, and command compatibility.

## 11. Compatibility Sweep

- [ ] 11.1 Verify existing app install, custom-domain, deployment-runtime, archive, and CLI command/API surfaces remain stable after the UI, protocol, and workspace slices.
- [ ] 11.2 Add or update integration coverage for install editor behavior, route editor validation, command compatibility, archive shape, no-secret responses, action exposure, and drift reporting gaps not covered by sections 7-10.
- [ ] 11.3 Record cross-slice evidence, decisions, blockers, and promotion notes in the owning change artifacts.

## 12. Verification And Promotion

- [ ] 12.1 Run `devstate start` before implementation work and fix any red status in `./.devstate/status.md`.
- [ ] 12.2 Run `devstate check` after each shipped implementation section and use `./.devstate/status.md` as evidence.
- [ ] 12.3 Smoke visible instance management UI behavior with `bun browser ...` when generated instance UI changes.
- [ ] 12.4 Record implementation decisions, blockers, evidence, and promotion notes in the owning change artifacts.
- [ ] 12.5 Promote shipped facts into `openspec/specs/` for instance control plane, installed apps, runtime topology, app schema, authority storage, generated UI, Site CLI, custom domains, package slices, and portable archives.

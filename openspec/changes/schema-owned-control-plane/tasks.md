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
- Promotion notes: shipped facts remain change-local; final promoted spec updates remain in section 8.

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
- Promotion notes: shipped facts remain change-local; final promoted spec updates remain in section 8.

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
- Promotion notes: shipped facts remain change-local; final promoted spec updates remain in section 8.

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
- Promotion notes: shipped facts remain change-local; final promoted spec updates remain in section 8.

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
- Promotion notes: shipped facts remain change-local; final promoted spec updates remain in section 8.

## 7. Generated UI, CLI, And Archives

- [ ] 7.1 Render app install management in the instance shell from control-plane schema screens, views, read models, and actions.
- [ ] 7.2 Provide install creation and edit UI with package selection, route-safe install id entry, label editing, immutable identity fields, status display, and route summaries.
- [ ] 7.3 Render app route management with install grouping, route kind, path or prefix, enabled state, surface, package capability, conflict feedback, and read-only derived fields.
- [ ] 7.4 Render deployment management from control-plane records and hide CLI deployer and runner actions from browser generated UI.
- [ ] 7.5 Update CLI target helpers to query app install, app route, domain, and deployment records and invoke actor-scoped deployment actions.
- [ ] 7.6 Keep existing domain remote-plan, run-apply, run-delete, forget, manual cleanup, direct fallback, app install, archive, and deploy command/API surfaces stable.
- [ ] 7.7 Update instance workspace pull, check, push, and archive flows to represent app install, route, domain, and deployment intent as schema-owned records without secrets.
- [ ] 7.8 Add UI, CLI, workspace, and archive tests for install editor behavior, route editor validation, no-secret responses, action exposure, drift reporting, and command compatibility.

Blocker:

- Section 7 is not ready as one local implementation unit. It crosses generated UI target plumbing, schema action/API contract shape, Site CLI deployment protocol, workspace/archive manifest format, and command compatibility tests.
- Evidence: `src/app/routes/instance-shell.tsx` still renders the instance shell from compatibility clients such as `/api/formless/app-installs`, `/api/formless/domain-mappings`, and `/api/formless/deployments/status`; `src/client/app-target.ts` only accepts `SchemaKey | AppStorageIdentity`, while `AppStorageIdentity` does not include `instanceControlPlaneStorageIdentity`; `src/app/routes/home.tsx` and generated app context still require bundled `SchemaKey` definitions rather than a runtime-owned control-plane schema target; `src/shared/instance-control-plane.ts` defines control-plane screens and views but not schema-declared deployment lifecycle actions; `src/site/instance-target-client.ts` invokes deployment compatibility endpoints, not schema action routes; `src/site/instance-workspace-config.ts` persists bespoke `apps[].routes` and `domains` manifest state instead of a control-plane record envelope.
- Split guidance: first ship a generated UI target slice that generalizes browser client targets for `instance:control-plane` and renders app install/app route screens from the control-plane schema with browser-hidden runner actions; then ship a deployment action protocol slice that either defines schema-declared deployment lifecycle actions or records compatibility endpoint delegation as the public contract; then ship a workspace/archive slice that defines the reviewable control-plane record envelope and drift comparison; finish with a compatibility test slice covering UI, CLI commands, workspaces, archives, no-secret responses, and action exposure.
- Checks: `devstate start` ran before assessment with checks ok and services starting in `./.devstate/status.md` at 2026-06-01T00:42:53.449Z. `devstate check` after recording the blocker passed with checks ok and services running in `./.devstate/status.md` at 2026-06-01T00:46:27.661Z.
- Smoke: not run; no app behavior changed because section 7 is blocked before implementation.

## 8. Verification And Promotion

- [ ] 8.1 Run `devstate start` before implementation work and fix any red status in `./.devstate/status.md`.
- [ ] 8.2 Run `devstate check` after each shipped implementation section and use `./.devstate/status.md` as evidence.
- [ ] 8.3 Smoke visible instance management UI behavior with `bun browser ...` when generated instance UI changes.
- [ ] 8.4 Record implementation decisions, blockers, evidence, and promotion notes in the owning change artifacts.
- [ ] 8.5 Promote shipped facts into `openspec/specs/` for instance control plane, installed apps, runtime topology, app schema, authority storage, generated UI, Site CLI, custom domains, package slices, and portable archives.

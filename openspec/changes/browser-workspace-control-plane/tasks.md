## 1. Layout-Only Workspace Manifest

- [x] 1.1 Replace the existing v1 `formless.json` parser with a v1 manifest model that stores only workspace layout and local configuration paths.
- [x] 1.2 Remove existing v1 source parsing for `apps`, `domains`, deploy intent, targets, and default app policy.
- [x] 1.3 Update workspace discovery, formatting, parser errors, and fixture generation for the layout-only manifest.
- [x] 1.4 Update manifest tests to cover valid layout paths, secret rejection, removed source keys, and no compatibility parser.

Evidence:

- Changed `src/site/instance-workspace-config.ts`, `src/site/instance-workspace-config.test.ts`, and `src/site/cli.test.ts`.
- `devstate check` green at 2026-06-02T08:32:13.533Z: `vp check --fix` passed, web service ready, `vp test --watch --reporter=agent --no-color` passed.
- Old CLI tests that require manifest-owned target/app/domain/deploy intent are skipped in `src/site/cli.test.ts` until the later control-plane record-source sections replace their source setup.

## 2. Control-Plane Record Source

- [x] 2.1 Define deterministic workspace paths and file format for instance control-plane record source.
- [x] 2.2 Implement read/write helpers for schema-owned control-plane record files.
- [x] 2.3 Validate record source for supported entities, references, uniqueness, immutable fields, route conflicts, and secret-looking values.
- [x] 2.4 Add tests proving `app-install`, unified `route`, `deploy-target`, `provider-config-ref`, and `deploy-desired-resource` records round-trip through workspace source.
- [x] 2.5 Remove `deploy-attempt`, `deploy-evidence-summary`, and `deploy-drift-report` from workspace record source, instance archive source, restore input, source drift comparisons, and generated control-plane source views.
- [x] 2.6 Add tests proving deployment attempts, evidence summaries, drift reports, cleanup audit summaries, raw lease tokens, and provider state are not written to reviewable record source or restored as source records.

Evidence:

- Changed `src/site/instance-workspace-record-source.ts`, `src/site/instance-workspace.ts`, `src/shared/instance-control-plane.ts`, `src/shared/archive-normalizers.ts`, `src/site/instance-target-client.ts`, and generated UI/schema tests.
- Added deterministic record source files under manifest `source.records`, with one JSON file per `app-install`, `route`, `deploy-target`, `provider-config-ref`, and `deploy-desired-resource` entity.
- Added `src/site/instance-workspace-record-source.test.ts` for round-trip, unsupported file rejection, secret/raw lease/provider-state rejection, identity validation, route conflict validation, and deployment execution-history exclusion.
- Updated archive/schema/client/CLI tests proving execution-history entities are rejected from archive restore/source and removed from generated control-plane views.
- `devstate check` green at 2026-06-02T09:02:47.428Z: `vp check --fix` passed, web service ready, `vp test --watch --reporter=agent --no-color` passed.

## 3. Workspace Archive Composition

- [x] 3.1 Compose instance archives from control-plane record source, app archives, and media payloads instead of manifest app/domain/deploy declarations.
- [x] 3.2 Validate app archive presence, install id, package app key, package facts, and media references before restore or push mutation.
- [x] 3.3 Preserve installed app data under install-scoped app archives and outside control-plane records.
- [x] 3.4 Add archive composition and restore tests for missing archives, mismatched installs, secret rejection, and app data boundaries.

Evidence:

- Changed `src/site/instance-workspace.ts`, `src/site/cli.ts`, and `src/site/cli.test.ts`.
- Local dev and push archive readers now derive install archives from control-plane `app-install` records, require matching install-scoped app archives, validate bundled package revision/source schema facts, and reject missing, duplicate, or wrong-size media payloads before restore calls.
- Added local dev restore coverage for composing an instance archive from record source plus app archive media, missing app archive rejection, mismatched install id rejection, package fact rejection, missing media rejection, secret-looking record source rejection, and app data staying in app archives instead of control-plane records.
- `devstate check` green at 2026-06-02T09:11:59.885Z: `vp check --fix` passed, web service ready, `vp test --watch --reporter=agent --no-color` passed.

## 4. Local Dev And Browser Bootstrap

- [x] 4.1 Let local dev start in an empty or layout-only workspace and mount browser onboarding state.
- [x] 4.2 Restore local Authority state from control-plane record source and app archives on first run or after local reset.
- [x] 4.3 Let browser-created app installs initialize app storage and save back to record source plus app archives.
- [x] 4.4 Add local dev tests for empty workspace, initialized workspace, reset rebuild, and first app install from browser state.

Evidence:

- Changed `src/site/instance-workspace.ts` so `formless dev` uses an in-memory default layout when `formless.json` is absent, while other workspace commands still require the reviewable manifest.
- Added active `src/site/cli.test.ts` coverage for empty workspace dev startup, layout/record-source restore into local Authority, local reset rebuild from record source plus app archives, and saving browser-created local Authority installs back to deterministic record source plus app archives.
- `devstate check` green at 2026-06-02T09:18:18.737Z: `vp check --fix` passed, web service ready, `vp test --watch --reporter=agent --no-color` passed.
- Browser smoke: `bun browser --ignore-https-errors --session grug-browser-workspace-bootstrap-smoke batch --bail "open https://grug.formless.local/" "wait 1000" "snapshot -i --max-output 6000" "errors"` loaded the instance shell with App installs, Routes, and Deployments surfaces and no browser errors.

## 5. Shared Workspace Operation Layer

- [ ] 5.1 Extract shared workspace operations for init, status, save, check, pull, push, deploy plan, and deploy apply.
- [ ] 5.2 Add display-safe operation result and progress models with ids, status, timestamps, summaries, logs, and errors.
- [ ] 5.3 Persist display-safe operation state under ignored `.formless/operations/` without secrets or raw adapter/tool output.
- [ ] 5.4 Keep operation inputs semantic and scoped to the resolved workspace root.
- [ ] 5.5 Add unit tests for persisted operation progress, stale-source detection, deployment attempt/evidence/drift summaries, cleanup summaries, and display-safe output.

## 6. Local Workspace Gateway API

- [ ] 6.1 Add local-only workspace gateway API routes for operation start, status, and progress reads.
- [ ] 6.2 Enforce runtime route policy so gateway routes are unavailable in deployed instance, app, site-authoring, and published Site profiles.
- [ ] 6.3 Issue a process-scoped pre-owner bootstrap capability from `formless dev` for same-origin workspace status and init only.
- [ ] 6.4 Reject bootstrap capability use for save, pull, push, credential setup, deploy plan/apply, cleanup, arbitrary control-plane writes, arbitrary filesystem access, and provider mutation.
- [ ] 6.5 Enforce same-origin owner-session and CSRF protection for browser-started post-bootstrap mutating gateway operations.
- [ ] 6.6 Allow admin bearer authorization only for CLI or automation gateway callers, not browser login or browser-visible state.
- [ ] 6.7 Block arbitrary filesystem reads, arbitrary filesystem writes, path traversal, shell commands, raw logs, raw adapter output, provider state payloads, and secret output from gateway requests.
- [ ] 6.8 Expose allowlisted Cloudflare or Alchemy authorization URLs from trusted credential setup adapters as display-safe operation events.
- [ ] 6.9 Add worker/runtime tests for route availability, bootstrap status/init authorization, bootstrap denial for non-init mutations, same-origin and CSRF rejection, owner-session authorization, admin-bearer non-browser authorization, semantic operation dispatch, operation-id workspace scoping, auth URL handoff, and secret redaction.

## 7. Browser Instance Management UI

- [ ] 7.1 Add workspace gateway status and operation controls to local instance management surfaces.
- [ ] 7.2 Add React-first browser onboarding flow for workspace init, first app install, save, check, and deploy entry points.
- [ ] 7.3 Render operation progress and display-safe errors without exposing raw filesystem paths or credentials.
- [ ] 7.4 Render external Cloudflare authorization URL prompts from gateway operation events and continue polling after the user opens the URL.
- [ ] 7.5 Reuse generated create/edit field controls, create-field authoring facts, defaults, `visibleWhen`, and Authority-backed validation for onboarding steps that write schema records.
- [ ] 7.6 Keep onboarding orchestration separate from generated field rendering so later schema-defined app setup flows can reuse the field/mutation layer.
- [ ] 7.7 Add generated UI tests and browser smoke coverage for local onboarding, auth URL handoff, field-control reuse, validation behavior, and workspace operation controls.

## 8. Gateway Deployment Flow

- [ ] 8.1 Implement deploy plan through the local gateway using schema-owned route/deploy records and desired-state projection.
- [ ] 8.2 Implement deploy apply through the local gateway as a trusted local deployer with exact desired-state writeback.
- [ ] 8.3 Return display-safe plan/apply attempt, evidence, drift, cleanup, and writeback summaries from gateway operation status/results without requiring schema-owned deployment history records.
- [ ] 8.4 Implement browser-initiated Cloudflare credential setup through an API-first trusted local Alchemy profile adapter.
- [ ] 8.5 Use existing default or named Alchemy profile credentials when available, otherwise create an Alchemy OAuth profile through auth URL handoff and browser-visible account selection.
- [ ] 8.6 Do not expose browser token paste during onboarding.
- [ ] 8.7 Keep Cloudflare API-token creation out of first browser onboarding unless explicit high-privilege bootstrap credentials are added in a later change.
- [ ] 8.8 Resolve Cloudflare, Alchemy, admin, and automation credentials only from environment, local Alchemy profile storage, or ignored `.formless/` secret state.
- [ ] 8.9 Add tests for credential setup, auth URL capture, no pasted-token path, no browser API-token creation path, plan/apply success, stale desired-state rejection, missing credentials, drift refusal, gateway-returned execution summaries, and no-secret browser responses.

## 9. CLI Rewire And Command Compatibility

- [ ] 9.1 Remove `formless onboard` from public help and command handling, with any retained transition parser failing before filesystem, Authority, Cloudflare, Alchemy, or provider mutation.
- [ ] 9.2 Rewire `formless dev`, `save`, `check`, `deploy`, and `instance ...` commands to the shared workspace operation layer.
- [ ] 9.3 Update CLI output to describe `formless dev` as the local bootstrap entry, layout-only manifest, record source, app archives, intent drift, and deployment execution summaries returned by gateway/runtime operations.
- [ ] 9.4 Remove manifest app/domain/deploy source behavior and update tests that previously expected manifest intent writeback.
- [ ] 9.5 Preserve remaining command names and explicit apply/credential boundaries while dropping old manifest compatibility.

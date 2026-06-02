## 1. Layout-Only Workspace Manifest

- [ ] 1.1 Replace the existing v1 `formless.json` parser with a v1 manifest model that stores only workspace layout and local configuration paths.
- [ ] 1.2 Remove existing v1 source parsing for `apps`, `domains`, deploy intent, targets, and default app policy.
- [ ] 1.3 Update workspace discovery, formatting, parser errors, and fixture generation for the layout-only manifest.
- [ ] 1.4 Update manifest tests to cover valid layout paths, secret rejection, removed source keys, and no compatibility parser.

## 2. Control-Plane Record Source

- [ ] 2.1 Define deterministic workspace paths and file format for instance control-plane record source.
- [ ] 2.2 Implement read/write helpers for schema-owned control-plane record files.
- [ ] 2.3 Validate record source for supported entities, references, uniqueness, immutable fields, route conflicts, and secret-looking values.
- [ ] 2.4 Add tests proving `app-install`, `app-route`, `domain-mapping`, `deploy-target`, `provider-config-ref`, `redirect-intent`, and `deploy-desired-resource` records round-trip through workspace source.

## 3. Workspace Archive Composition

- [ ] 3.1 Compose instance archives from control-plane record source, app archives, and media payloads instead of manifest app/domain/deploy declarations.
- [ ] 3.2 Validate app archive presence, install id, package app key, package facts, and media references before restore or push mutation.
- [ ] 3.3 Preserve installed app data under install-scoped app archives and outside control-plane records.
- [ ] 3.4 Add archive composition and restore tests for missing archives, mismatched installs, secret rejection, and app data boundaries.

## 4. Local Dev And Browser Bootstrap

- [ ] 4.1 Let local dev start in an empty or layout-only workspace and mount browser onboarding state.
- [ ] 4.2 Restore local Authority state from control-plane record source and app archives on first run or after local reset.
- [ ] 4.3 Let browser-created app installs initialize app storage and save back to record source plus app archives.
- [ ] 4.4 Add local dev tests for empty workspace, initialized workspace, reset rebuild, and first app install from browser state.

## 5. Shared Workspace Operation Layer

- [ ] 5.1 Extract shared workspace operations for init, status, save, check, pull, push, deploy plan, and deploy apply.
- [ ] 5.2 Add display-safe operation result and progress models with ids, status, timestamps, summaries, logs, and errors.
- [ ] 5.3 Persist display-safe operation state under ignored `.formless/operations/` without secrets or raw adapter/tool output.
- [ ] 5.4 Keep operation inputs semantic and scoped to the resolved workspace root.
- [ ] 5.5 Add unit tests for persisted operation progress, stale-source detection, drift summaries, and display-safe output.

## 6. Local Workspace Gateway API

- [ ] 6.1 Add local-only workspace gateway API routes for operation start, status, and progress reads.
- [ ] 6.2 Enforce runtime route policy so gateway routes are unavailable in deployed instance, app, site-authoring, and published Site profiles.
- [ ] 6.3 Block arbitrary filesystem reads, arbitrary filesystem writes, path traversal, shell commands, and secret output from gateway requests.
- [ ] 6.4 Expose allowlisted Cloudflare or Alchemy authorization URLs from trusted credential setup adapters as display-safe operation events.
- [ ] 6.5 Add worker/runtime tests for route availability, authorization, semantic operation dispatch, auth URL handoff, and secret redaction.

## 7. Browser Instance Management UI

- [ ] 7.1 Add workspace gateway status and operation controls to local instance management surfaces.
- [ ] 7.2 Add browser onboarding flow for workspace init, first app install, save, check, and deploy entry points.
- [ ] 7.3 Render operation progress and display-safe errors without exposing raw filesystem paths or credentials.
- [ ] 7.4 Render external Cloudflare authorization URL prompts from gateway operation events and continue polling after the user opens the URL.
- [ ] 7.5 Add generated UI tests and browser smoke coverage for local onboarding, auth URL handoff, and workspace operation controls.

## 8. Gateway Deployment Flow

- [ ] 8.1 Implement deploy plan through the local gateway using schema-owned deploy/domain records and desired-state projection.
- [ ] 8.2 Implement deploy apply through the local gateway as a trusted local deployer with exact desired-state writeback.
- [ ] 8.3 Implement browser-initiated Cloudflare credential setup through an API-first trusted local Alchemy profile adapter.
- [ ] 8.4 Use existing default or named Alchemy profile credentials when available, otherwise create an Alchemy OAuth profile through auth URL handoff and browser-visible account selection.
- [ ] 8.5 Do not expose browser token paste during onboarding.
- [ ] 8.6 Keep Cloudflare API-token creation out of first browser onboarding unless explicit high-privilege bootstrap credentials are added in a later change.
- [ ] 8.7 Resolve Cloudflare, Alchemy, admin, and automation credentials only from environment, local Alchemy profile storage, or ignored `.formless/` secret state.
- [ ] 8.8 Add tests for credential setup, auth URL capture, no pasted-token path, no browser API-token creation path, plan/apply success, stale desired-state rejection, missing credentials, drift refusal, and no-secret browser responses.

## 9. CLI Rewire And Command Compatibility

- [ ] 9.1 Rewire `formless onboard`, `dev`, `save`, `check`, `deploy`, and `instance ...` commands to the shared workspace operation layer.
- [ ] 9.2 Update CLI output to describe layout-only manifest, record source, app archives, and control-plane drift.
- [ ] 9.3 Remove manifest app/domain/deploy source behavior and update tests that previously expected manifest intent writeback.
- [ ] 9.4 Preserve command names and explicit apply/credential boundaries while dropping old manifest compatibility.

## 10. Verification And Promotion

- [ ] 10.1 Run `devstate start` before implementation work and fix red status in `./.devstate/status.md`.
- [ ] 10.2 Run `devstate check` after each shipped implementation section and use `./.devstate/status.md` as evidence.
- [ ] 10.3 Smoke browser-visible onboarding, save/check, and deploy controls with `bun browser ...`.
- [ ] 10.4 Record implementation evidence, decisions, blockers, and promotion notes in this change.
- [ ] 10.5 Promote shipped facts into relevant `openspec/specs/*/spec.md` files after implementation is complete.

## 1. Shared Deployment Model

- [x] 1.1 Add shared deployment-runtime types for desired-state versions, deployment targets, actors, attempts, leases, resource graphs, results, evidence summaries, drift reports, and status.
- [x] 1.2 Add parsers and validators for deployment target ids, actor ids, attempt modes, attempt statuses, lease tokens, idempotency keys, and desired-state version references.
- [x] 1.3 Add deterministic resource graph canonicalization and desired-state hash helpers.
- [x] 1.4 Add shared tests for stable hashing, deterministic graph ordering, secret exclusion, stale version checks, and parser failures.

## 2. Runtime Storage And APIs

- [x] 2.1 Add instance-authority storage tables for desired-state versions, deployment attempts, deployment leases, deployment evidence summaries, and drift reports.
- [x] 2.2 Implement desired-state version read/materialization for one deployment target without changing user intent writes.
- [x] 2.3 Add `/api/formless/deployments/desired-state` with no-secret response shape and cache policy.
- [x] 2.4 Add deployment attempt start with idempotency, desired-state version/hash validation, and apply/destroy lease acquisition.
- [x] 2.5 Add lease heartbeat and lease release on terminal attempt writeback.
- [x] 2.6 Add plan, success, failure, and drift writeback handlers with exact attempt/version validation.
- [x] 2.7 Add latest deployment status derivation for no target, pending changes, active attempt, latest success, failed current version, failed older version, and drift.

## 3. Domain Projection And Compatibility

- [x] 3.1 Project enabled custom-domain mappings into deployment resource graph resources with existing deterministic logical ids.
- [x] 3.2 Project enabled redirect intent into deployment redirect rule and redirect DNS graph resources.
- [x] 3.3 Bridge existing domain provider apply job creation to a deployment attempt while preserving existing apply response shape.
- [x] 3.4 Bridge existing domain provider apply result writeback to deployment result/evidence summaries while preserving domain mapping applied evidence.
- [x] 3.5 Bridge existing domain provider delete jobs to deployment cleanup attempts without deleting desired route intent.
- [x] 3.6 Add compatibility tests proving current domain provider endpoints, job statuses, locks, evidence, and cleanup behavior remain stable.

## 4. CLI And Target Client

- [x] 4.1 Add instance target client helpers for deployment desired-state reads, attempt start, heartbeat, plan writeback, success writeback, failure writeback, drift writeback, and latest status.
- [x] 4.2 Update domain provider runner apply to write generic deployment attempt facts when the target supports them.
- [x] 4.3 Update domain provider runner failure handling to write failure details for the exact desired-state version after an attempt is created.
- [x] 4.4 Update `formless instance domains run-apply` output with desired-state version, attempt id, resource counts, and writeback status when available.
- [x] 4.5 Keep existing domain remote-plan, run-apply, run-delete, forget, manual cleanup, and direct fallback command surfaces stable.

## 5. Status Integration

- [x] 5.1 Add deployment status to the existing remote status data path without exposing provider credentials or Alchemy secrets.
- [x] 5.2 Add display-summary helpers for deployment status states used by CLI and custom-domain surfaces.
- [x] 5.3 Keep browser clients and workspace manifests free of mutation credentials and Alchemy state tokens.

## 6. Verification

- [ ] 6.1 Add worker API tests for desired-state reads, attempt idempotency, stale revision rejection, lease conflict, heartbeat, completion, failure, and drift writeback.
- [ ] 6.2 Add CLI tests for deployment-aware run-apply output and failure writeback.
- [ ] 6.3 Add regression tests proving direct Cloudflare fallback commands remain explicit fallback commands and do not use deployment-runtime mutation paths.
- [ ] 6.4 Run `devstate check` and read `./.devstate/status.md`; fix any red status before finishing.
- [ ] 6.5 Run browser smoke only if visible app behavior changes, and record why it was or was not required.

## 7. Promotion Notes

- [ ] 7.1 Record promotion notes for deployment runtime primitives, domain-provider compatibility, CLI status behavior, and Alchemy ownership boundary in this change.
- [ ] 7.2 Do not promote global docs until the implementation has been reviewed and a finalization/doc-steward pass is requested.

## Evidence

- 1.1: Added `src/shared/deployment-runtime.ts` shared types for deployment targets, actors, desired-state versions, resource graphs, attempts, leases, result/evidence summaries, drift reports, and derived status.
- 1.1 check: `devstate check` passed; evidence in `.devstate/status.md`.
- 1.1 smoke: Not run; shared type-only change with no visible app behavior.
- 1.2: Added `src/shared/deployment-runtime.ts` parsers and non-throwing validators for deployment ids, attempt modes/statuses, lease tokens, idempotency keys, SHA-256 desired-state hashes, and desired-state version references.
- 1.2 check: `devstate check` passed; evidence in `.devstate/status.md`.
- 1.2 smoke: Not run; shared parser/validator-only change with no visible app behavior.
- 1.3: Added `src/shared/deployment-runtime.ts` helpers for deterministic deployment resource graph canonicalization, stable hash-input JSON, SHA-256 desired-state hash computation, secret-key exclusion from resource inputs, and exact desired-state version reference comparison.
- 1.3 check: `devstate check` passed; evidence in `.devstate/status.md`.
- 1.3 smoke: Not run; shared helper-only change with no visible app behavior.
- 1.4: Added `src/shared/deployment-runtime.test.ts` coverage for stable desired-state hashing, deterministic resource/dependency ordering, secret-key exclusion, exact desired-state version reference checks, and parser/validator failures.
- 1.4 check: `devstate check` passed; evidence in `.devstate/status.md`.
- 1.4 smoke: Not run; shared test-only change with no visible app behavior.
- 2.1: Added `src/worker/deployment-runtime-state.ts` with instance deployment runtime SQL tables for desired-state versions, attempts, leases, evidence summaries, drift reports, and target-scoped indexes.
- 2.1 tests: Added `src/worker/deployment-runtime-state.test.ts` coverage for table creation, required storage columns, target-scoped desired-state revisions, attempt status checks, and active lease serialization.
- 2.1 check: `devstate check` passed; evidence in `.devstate/status.md`.
- 2.1 smoke: Not run; storage table/test-only change with no visible app behavior.
- 2.2: Added `src/worker/deployment-runtime-state.ts` helpers to read latest/by-id desired-state versions and lazily materialize immutable primary instance target versions from canonical no-secret resource graphs without touching user intent tables.
- 2.2 tests: Extended `src/worker/deployment-runtime-state.test.ts` Durable Object storage coverage for version reuse on unchanged source output, revision advancement on changed desired output, by-id reads, canonical resource ordering, secret input exclusion, and no user intent table writes.
- 2.2 check: `devstate check` passed; evidence in `.devstate/status.md`.
- 2.2 smoke: Not run; worker storage helper/test-only change with no visible app behavior.
- 2.3: Added `src/worker/deployment-runtime-api.ts` and routed `/api/formless/deployments/desired-state` through the instance Durable Object to materialize the primary target desired-state version with `Cache-Control: no-store`.
- 2.3 shared API: Added deployment runtime API path constants and `InstanceDeploymentDesiredStateResponse` in `src/shared/deployment-runtime.ts`.
- 2.3 tests: Added `src/worker/deployment-runtime-api.test.ts` coverage for primary desired-state reads, stable repeated reads, no provider secret exposure, no-store success/errors, method rejection, unknown target rejection, and invalid target validation.
- 2.3 check: `devstate check` passed; evidence in `.devstate/status.md`.
- 2.3 smoke: Not run; worker API route/test change with no visible app behavior.
- 2.4: Added `src/shared/deployment-runtime.ts` attempt-start API constants/request/response types, `src/worker/deployment-runtime-state.ts` start helpers for idempotent attempt replay, latest desired-state ref validation, stale rejection, expired-lease cleanup, and target-scoped apply/destroy lease acquisition, and `src/worker/deployment-runtime-api.ts` `/api/formless/deployments/attempts/start` handling with owner/admin write authorization.
- 2.4 tests: Extended `src/worker/deployment-runtime-api.test.ts` coverage for apply attempt creation with lease token, idempotent replay, stale desired-state rejection before lease acquisition, active lease conflict, plan attempts without leases, write authorization, method rejection, and request validation.
- 2.4 check: `devstate check` passed; evidence in `.devstate/status.md`.
- 2.4 smoke: Not run; worker deployment runtime API/test change with no visible app behavior.
- 2.5: Added `src/shared/deployment-runtime.ts` heartbeat API path/request/response types and attempt id validation; added `src/worker/deployment-runtime-api.ts` `/api/formless/deployments/attempts/heartbeat` handling with owner/admin write authorization.
- 2.5 state: Added `src/worker/deployment-runtime-state.ts` helpers for exact attempt/version lease heartbeat, token validation, expiry extension, and terminal writeback lease release for succeeded/failed attempts.
- 2.5 tests: Extended `src/worker/deployment-runtime-api.test.ts` and `src/worker/deployment-runtime-state.test.ts` coverage for heartbeat success, token mismatch rejection, fixed-time expiry extension, release on terminal writeback, and subsequent mutating attempt start after release.
- 2.5 check: `devstate check` passed; evidence in `.devstate/status.md`.
- 2.5 smoke: Not run; worker deployment runtime API/state change with no visible app behavior.
- 2.6: Added shared writeback API paths/types in `src/shared/deployment-runtime.ts`, Durable Object routes/parsers in `src/worker/deployment-runtime-api.ts`, and state helpers in `src/worker/deployment-runtime-state.ts` for plan, success, failure, and drift writeback with exact attempt/version validation.
- 2.6 tests: Extended `src/worker/deployment-runtime-api.test.ts` coverage for plan-only completion, apply plan writeback, success evidence writeback, mutating failure lease-token enforcement, failure writeback, drift report writeback, and stale desired-state rejection.
- 2.6 check: `devstate check` passed; evidence in `.devstate/status.md`.
- 2.6 smoke: Not run; worker deployment runtime API/state change with no visible app behavior.
- 2.7: Added `src/worker/deployment-runtime-state.ts` latest deployment status derivation for no target, active attempts, current/older failures, pending changes, drift, and deployed success states.
- 2.7 API: Added `/api/formless/deployments/status` and shared response/path types in `src/shared/deployment-runtime.ts` and `src/worker/deployment-runtime-api.ts`.
- 2.7 tests: Extended `src/worker/deployment-runtime-state.test.ts` and `src/worker/deployment-runtime-api.test.ts` for status derivation coverage and no-store status reads.
- 2.7 check: `devstate check` passed; evidence in `.devstate/status.md`.
- 2.7 smoke: Not run; worker deployment runtime API/state change with no visible app behavior.
- 3.1: Added deployment desired-state projection of enabled custom-domain mappings into `cloudflare-worker-custom-domain` graph resources, reusing existing domain provider logical ids and excluding disabled mappings.
- 3.1 tests: Extended `src/worker/deployment-runtime-api.test.ts` coverage for enabled `instance`, `app`, and `publicSite` mappings, disabled mapping exclusion, worker-name input projection, and secret exclusion.
- 3.1 check: `devstate check` passed; evidence in `.devstate/status.md`.
- 3.1 smoke: Not run; API resource graph behavior changed with no visible app behavior.
- 3.2: Added deployment desired-state projection of enabled domain provider redirect intents into `cloudflare-dns-records` placeholder resources and `cloudflare-redirect-rule` resources with existing deterministic redirect logical ids; disabled redirect intents are excluded.
- 3.2 shared helper: Exported redirect intent normalization and target URL formatting from `src/shared/domain-provider-planner.ts` so deployment projection matches existing domain provider redirect planning semantics.
- 3.2 tests: Extended `src/worker/deployment-runtime-api.test.ts` coverage for enabled `toHost` and `toUrl` redirect intent projection, default and explicit redirect options, redirect DNS dependencies, disabled redirect exclusion, source fingerprinting, and secret exclusion.
- 3.2 check: `devstate check` passed; evidence in `.devstate/status.md`.
- 3.2 smoke: Not run; API resource graph behavior changed with no visible app behavior.
- 3.3: Added a domain-provider apply compatibility bridge that materializes the primary deployment desired-state projection, starts an internal deployment `apply` attempt for the current desired-state version, stores the attempt/version/lease association on the apply job row, and preserves the legacy apply response/job JSON shape without exposing the lease token.
- 3.3 projection: Moved primary deployment desired-state graph projection into `src/worker/deployment-runtime-projection.ts` and moved redirect intent table reads into `src/worker/domain-provider-redirect-intents-state.ts` so deployment runtime and domain provider apply creation use the same projection source.
- 3.3 tests: Extended `src/worker/domain-provider-api.test.ts` to prove apply job creation starts a generic deployment attempt visible through deployment status while the legacy ready response shape stays unchanged and omits lease tokens.
- 3.3 check: `devstate check` passed; evidence in `.devstate/status.md`.
- 3.3 smoke: Not run; worker API/storage compatibility change with no visible browser behavior.
- 3.4: Updated `src/worker/domain-provider-api.ts` so existing domain-provider apply job result writeback records generic deployment success/failure results, maps runner evidence to deployment resource evidence summaries, and keeps legacy domain mapping applied evidence writes intact.
- 3.5: Updated `src/worker/domain-provider-api.ts` so existing domain-provider delete jobs start hidden deployment `destroy` cleanup attempts, store delete job attempt/version/lease links without changing public job JSON, and write cleanup success/failure results without deleting desired route intent.
- 3.6 tests: Extended `src/worker/domain-provider-api.test.ts` coverage for apply success deployment status, apply failure deployment status, delete job public shape without lease tokens, cleanup in-progress/deployed status, applied evidence, audit events, locks, and disabled desired mapping retention.
- 3.4-3.6 files: `src/worker/domain-provider-api.ts`, `src/worker/domain-provider-api.test.ts`.
- 3.4-3.6 check: `devstate check` passed; evidence in `.devstate/status.md`.
- 3.4-3.6 smoke: Not run; worker API/storage compatibility change with no visible browser behavior.
- 4.1: Added deployment runtime target helpers in `src/site/instance-target-client.ts` for desired-state reads, latest status reads, attempt start, heartbeat, plan/success/failure writeback, and drift writeback with admin-token headers for mutating calls.
- 4.2: Updated `src/site/domain-provider-runner.ts` so remote apply detects bridged deployment attempts when `/api/formless/deployments/status` is available, writes deployment plan summaries for the exact attempt/version, and falls back without changing legacy domain apply on unsupported targets.
- 4.3: Updated remote apply failure handling to attempt exact-version deployment failure writeback for runner-owned deployment attempts while preserving existing domain apply job failure writeback.
- 4.4: Updated `formless instance domains run-apply` formatting in `src/site/cli.ts` to include desired-state version, attempt id, target id, resource counts, and writeback status when deployment facts are available.
- 4.5 tests: Updated `src/site/domain-provider-runner.test.ts` to keep legacy unsupported-target apply result writeback stable and added deployment-aware bridged apply plan-writeback coverage; remote-plan, run-delete, forget, manual cleanup, and direct fallback command implementations were not changed.
- 4.1-4.5 check: `devstate check` passed; evidence in `.devstate/status.md`.
- 4.1-4.5 smoke: Not run; CLI/target-client behavior changed with no browser-visible app behavior.
- 5.1: Added opt-in deployment status reads to the existing instance target status path and surfaced deployment status in `formless instance status` without admin tokens, provider credentials, or Alchemy secrets.
- 5.2: Added shared deployment status display-summary helpers and used them in CLI status output and the custom-domain provider panel.
- 5.3: Added a browser read-only deployment status client and tightened workspace manifest secret-key rejection for Alchemy state tokens and provider/mutation credential fields.
- 5.1-5.3 check: `devstate check` passed; evidence in `.devstate/status.md`.
- 5.1-5.3 smoke: `bun browser` opened `https://add-deployment-primitives.formless.local/`; custom-domain provider panel displayed `Deployment No deployment state · No desired-state version has been recorded`; console after reload showed only Vite connection and React DevTools informational output.

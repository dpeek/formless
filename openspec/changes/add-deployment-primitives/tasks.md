## 1. Shared Deployment Model

- [ ] 1.1 Add shared deployment-runtime types for desired-state versions, deployment targets, actors, attempts, leases, resource graphs, results, evidence summaries, drift reports, and status.
- [ ] 1.2 Add parsers and validators for deployment target ids, actor ids, attempt modes, attempt statuses, lease tokens, idempotency keys, and desired-state version references.
- [ ] 1.3 Add deterministic resource graph canonicalization and desired-state hash helpers.
- [ ] 1.4 Add shared tests for stable hashing, deterministic graph ordering, secret exclusion, stale version checks, and parser failures.

## 2. Runtime Storage And APIs

- [ ] 2.1 Add instance-authority storage tables for desired-state versions, deployment attempts, deployment leases, deployment evidence summaries, and drift reports.
- [ ] 2.2 Implement desired-state version read/materialization for one deployment target without changing user intent writes.
- [ ] 2.3 Add `/api/formless/deployments/desired-state` with no-secret response shape and cache policy.
- [ ] 2.4 Add deployment attempt start with idempotency, desired-state version/hash validation, and apply/destroy lease acquisition.
- [ ] 2.5 Add lease heartbeat and lease release on terminal attempt writeback.
- [ ] 2.6 Add plan, success, failure, and drift writeback handlers with exact attempt/version validation.
- [ ] 2.7 Add latest deployment status derivation for no target, pending changes, active attempt, latest success, failed current version, failed older version, and drift.

## 3. Domain Projection And Compatibility

- [ ] 3.1 Project enabled custom-domain mappings into deployment resource graph resources with existing deterministic logical ids.
- [ ] 3.2 Project enabled redirect intent into deployment redirect rule and redirect DNS graph resources.
- [ ] 3.3 Bridge existing domain provider apply job creation to a deployment attempt while preserving existing apply response shape.
- [ ] 3.4 Bridge existing domain provider apply result writeback to deployment result/evidence summaries while preserving domain mapping applied evidence.
- [ ] 3.5 Bridge existing domain provider delete jobs to deployment cleanup attempts without deleting desired route intent.
- [ ] 3.6 Add compatibility tests proving current domain provider endpoints, job statuses, locks, evidence, and cleanup behavior remain stable.

## 4. CLI And Target Client

- [ ] 4.1 Add instance target client helpers for deployment desired-state reads, attempt start, heartbeat, plan writeback, success writeback, failure writeback, drift writeback, and latest status.
- [ ] 4.2 Update domain provider runner apply to write generic deployment attempt facts when the target supports them.
- [ ] 4.3 Update domain provider runner failure handling to write failure details for the exact desired-state version after an attempt is created.
- [ ] 4.4 Update `formless instance domains run-apply` output with desired-state version, attempt id, resource counts, and writeback status when available.
- [ ] 4.5 Keep existing domain remote-plan, run-apply, run-delete, forget, manual cleanup, and direct fallback command surfaces stable.

## 5. Status Integration

- [ ] 5.1 Add deployment status to the existing remote status data path without exposing provider credentials or Alchemy secrets.
- [ ] 5.2 Add display-summary helpers for deployment status states used by CLI and custom-domain surfaces.
- [ ] 5.3 Keep browser clients and workspace manifests free of mutation credentials and Alchemy state tokens.

## 6. Verification

- [ ] 6.1 Add worker API tests for desired-state reads, attempt idempotency, stale revision rejection, lease conflict, heartbeat, completion, failure, and drift writeback.
- [ ] 6.2 Add CLI tests for deployment-aware run-apply output and failure writeback.
- [ ] 6.3 Add regression tests proving direct Cloudflare fallback commands remain explicit fallback commands and do not use deployment-runtime mutation paths.
- [ ] 6.4 Run `devstate check` and read `./.devstate/status.md`; fix any red status before finishing.
- [ ] 6.5 Run browser smoke only if visible app behavior changes, and record why it was or was not required.

## 7. Promotion Notes

- [ ] 7.1 Record promotion notes for deployment runtime primitives, domain-provider compatibility, CLI status behavior, and Alchemy ownership boundary in this change.
- [ ] 7.2 Do not promote global docs until the implementation has been reviewed and a finalization/doc-steward pass is requested.

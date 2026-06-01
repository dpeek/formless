## 1. Upgrade Contracts And Registry

- [x] 1.1 Run `devstate start` and read `./.devstate/status.md`; fix red status before implementation.
- [x] 1.2 Add shared upgrade migration contract types for migration ids, owners, families, checksums, safety classes, package app revisions, schema hashes, and apply evidence.
- [x] 1.3 Add deterministic schema hash helpers for bundled source schemas and fixed hash fixtures for Site, Tasks, and Estii.
- [x] 1.4 Add migration registry validation for duplicate ids, bad checksums, invalid safety classes, and invalid package revision ranges.
- [x] 1.5 Add tests for registry ordering, duplicate rejection, checksum preservation, safety classification, and package revision validation.

Evidence:

- `grug` 2026-05-28: added `src/shared/upgrade-migrations.ts` and `src/shared/upgrade-migrations.test.ts` for shared contracts, canonical source schema hashing, registry validation, and focused tests.
- `devstate start` initially reported a red test service because local `tmp/test` was missing; created the ignored temp parent and restarted devstate. `.devstate/status.md` then reported checks ok and services running.
- `devstate check` after implementation and again after `git rebase main`: `.devstate/status.md` reported checks ok, web service ready, and test service pass. No `bun browser` smoke run because this section changes shared contracts only and no app behavior changed.

## 2. Runtime Metadata And Package App Facts

- [x] 2.1 Extend bundled package app definitions with package revision and source schema hash facts while keeping `schema.version` as the schema language version.
- [x] 2.2 Extend app install metadata storage and response parsing with installed package revision and source schema hash facts.
- [x] 2.3 Add compatibility reads for existing installs that do not yet have package revision/hash columns.
- [x] 2.4 Extend deploy metadata response with package version, runtime protocol version, storage migration set identity, and package app revision/hash facts.
- [x] 2.5 Update metadata and app install tests for no-secret responses, no-store caching, legacy install compatibility, and stable install identity.

Evidence:

- `grug` 2026-05-28: added package revision/source schema hash facts to bundled package app metadata, created app install metadata, installed-app storage rows, archive restore app install materialization, target registry parsing, and deploy metadata.
- Added legacy install-table compatibility in `src/worker/instance-app-installs-state.ts`; missing `package_revision` and `source_schema_hash` columns are added/read with current package facts for existing rows.
- Added deploy metadata upgrade facts: package version, runtime protocol version, storage migration set identity, and bundled package app revision/hash facts. Metadata remains `Cache-Control: no-store` and test coverage asserts secret env values are not emitted.
- Added focused tests in `src/worker/instance-app-installs-state.test.ts`, `src/site/instance-target-client.test.ts`, plus updated app install, deploy metadata, onboarding, fixture, archive, domain, and runtime profile tests for stable install identity and package facts.
- `devstate check` 2026-05-28 before and after `git rebase --autostash main`: `.devstate/status.md` reported checks ok, web service ready, and test service pass. No `bun browser` smoke run because this section changed metadata/API contracts and no visible browser app workflow changed.

## 3. SQL Migration Runner

- [x] 3.1 Add shared Durable Object SQLite applied-migration table helpers keyed by storage identity family.
- [x] 3.2 Add an idempotent SQL migration runner that applies pending migrations in registry order and records id, checksum, package version, and applied timestamp.
- [x] 3.3 Move existing one-off SQLite table shape migrations behind the shared runner without changing migrated table output.
- [x] 3.4 Ensure storage initialization runs required SQL migrations before code depends on migrated table shape.
- [x] 3.5 Add migration harness tests for pending migration apply, applied migration skip, checksum mismatch handling, introspective legacy table rewrite, and rerun no-op behavior.

Evidence:

- `grug` 2026-05-28: added `src/worker/sql-migrations.ts` with `formless_applied_sql_migrations`, storage-family keyed applied-state helpers, registry validation reuse, checksum mismatch rejection, ordered apply, skip, package version, and applied timestamp recording.
- Routed Authority storage initialization, instance app install package fact backfill, instance domain mapping legacy rewrites, and domain provider job/action table rewrites through the shared runner before reads or writes depend on migrated shape.
- Added `src/worker/sql-migrations.test.ts` for pending apply order, applied skip, checksum mismatch before mutation, introspective legacy rewrite, and rerun no-op behavior. Updated existing app install and domain mapping migration harness tests to assert applied SQL migration evidence.
- `devstate check` 2026-05-28 before and after `git rebase main`: `.devstate/status.md` reported checks ok, web service ready, and test service pass. No `bun browser` smoke run because this section changes worker storage initialization and migration internals only.

## 4. Authority Package App Migrations

- [x] 4.1 Add package app migration registry entries and execution helpers for schema/data migrations between package revisions.
- [x] 4.2 Add Authority-backed migration execution that validates schema changes, materializes flat record creates/patches/tombstones, appends change rows, and advances cursors.
- [x] 4.3 Add applied package migration state per installed app storage identity with revision/hash update behavior after successful migration.
- [x] 4.4 Add rollback-safe failure behavior so invalid migrated records leave stored schema, records, write log, and package facts unchanged.
- [x] 4.5 Add Authority tests for successful record migration catch-up, invalid field/reference/unique/delete validation failures, idempotent replay, and browser sync visibility.

Evidence:

- `grug` 2026-05-28: added `src/worker/package-app-migrations.ts` for package app migration registry validation, package-family helpers, and revision-chain selection. Current bundled packages remain at revision `1`, so the production registry is empty until a real package revision advances.
- Added Authority storage package migration state in `src/worker/storage.ts`: `formless_applied_package_app_migrations`, `formless_package_app_state`, atomic apply, schema parsing before storage, flat create/patch/tombstone materialization, change-row append, cursor response, checksum skip/replay checks, and rollback on validation failure.
- Added `/package-migrations/apply` Authority operation and `/api/formless/app-installs/:packageAppKey/:installId/package-migrations/apply` instance coordination. The instance route calls the installed app Authority, then updates app install package revision/hash facts only after successful migration evidence.
- Added tests in `src/worker/storage.test.ts` for successful migration catch-up through sync, idempotent replay, applied state, package facts, and rollback for invalid field, reference, unique, and delete plans. Added `src/worker/instance-app-installs.test.ts` coverage for installed app migration apply updating install facts through Authority.
- `devstate check` 2026-05-28 before and after `git rebase main`: `.devstate/status.md` reported checks ok, web service ready, and test service pass. No `bun browser` smoke run because this section changes worker storage/API migration behavior and no visible browser app workflow changed.

## 5. Target Upgrade Status Reads

- [x] 5.1 Extend target status reads to collect deployed upgrade metadata, local package metadata, app install package facts, and deployment status.
- [x] 5.2 Include archive input presence and envelope version as read-only facts where an existing CLI flow already has an archive path; do not normalize or mutate archives in this section.
- [x] 5.3 Return explicit metadata verification failures when deployed metadata, local package facts, installed app facts, or deployment status cannot support an upgrade plan.
- [x] 5.4 Add CLI tests proving target status reads surface upgrade facts and do not directly access Durable Object SQLite.

Evidence:

- `grug` 2026-06-01: extended `src/site/instance-target-client.ts` target status reads with `upgradeStatus` containing deployed upgrade metadata, local package revision/hash facts, installed app package facts, optional deployment status, archive input facts, and explicit verification failures for missing no-store metadata, package version, runtime protocol, storage migration set, package app facts, installed app facts, or deployment status.
- Added `src/site/archive-input-status.ts` and wired restore flows in `src/site/archive-workflows.ts` to read archive manifest presence, kind, and envelope version without calling archive normalization or mutating archives.
- Added `src/site/instance-target-client.test.ts` coverage proving target status reads use only HTTP endpoints and surface upgrade facts/failures; added `src/site/archive-input-status.test.ts` coverage proving unsupported archive envelope versions can be read as status facts without normalization.
- `devstate check` 2026-06-01: `.devstate/status.md` reported checks ok, web service ready, and test service pass. No `bun browser` smoke run because this section changes CLI target-status and archive-status reads only, with no visible browser app behavior change.

## 6. Upgrade Plan Model And Formatting

- [x] 6.1 Add CLI upgrade plan models for code deploy, SQL migration, package app migration, backup, browser reload, manual approval, and archive normalization pending or unsupported steps.
- [x] 6.2 Add plan formatting that includes step type, safety class, required evidence, target identity, package app identity, and why a step is blocked or pending.
- [x] 6.3 Add formatting tests for code deploy, SQL migration, package app migration, archive normalization pending, backup, browser reload, and manual approval steps.

Evidence:

- `grug` 2026-06-01: added `src/site/upgrade-plan.ts` with CLI upgrade plan step models for code deploy, SQL migration, package app migration, backup, browser reload, manual approval, and archive normalization pending or unsupported states.
- Added deterministic `formatCliUpgradePlan` output with step type, safety class, required evidence, target identity, package app identity, step details, and blocked or pending reasons.
- Added `src/site/upgrade-plan.test.ts` formatter coverage for code deploy, SQL migration, package app migration, backup, browser reload, manual approval, archive normalization pending, and unsupported archive normalization.
- `devstate check` 2026-06-01: `.devstate/status.md` reported checks ok, web service ready, and test service pass. No `bun browser` smoke run because this section adds CLI planning model/formatting only and does not change visible app behavior.

## 7. Deploy And Publish Dry-run Planning

- [ ] 7.1 Integrate non-mutating upgrade planning into deploy dry-run and publish dry-run flows.
- [ ] 7.2 Ensure dry-run output includes deployed metadata, local package facts, app install facts, planned steps, blockers, and evidence requirements.
- [ ] 7.3 Add CLI tests proving deploy and publish dry-runs do not mutate target data and stop on metadata verification failure.

## 8. Archive Restore And Workspace Push Dry-run Planning

- [ ] 8.1 Integrate non-mutating upgrade planning into archive restore dry-run and instance workspace push dry-run flows.
- [ ] 8.2 Keep archive normalization as pending or unsupported until the archive normalizer registry ships.
- [ ] 8.3 Add CLI tests proving archive restore and workspace push dry-runs do not mutate target data and include archive-state evidence.

## 9. Runtime Upgrade Apply Evidence API

- [ ] 9.1 Add a narrow secured runtime or Authority API that exposes SQL migration applied-state evidence per storage identity.
- [ ] 9.2 Expose package app migration applied-state evidence through the same upgrade status or apply boundary.
- [ ] 9.3 Keep the API unavailable to public app and browser-generated write routes.
- [ ] 9.4 Add worker tests for authorization, storage identity scoping, applied-state evidence, and no direct CLI Durable Object SQLite access.

## 10. CLI Auto-safe Apply

- [ ] 10.1 Apply `auto-safe` SQL migrations through the secured runtime or Authority API.
- [ ] 10.2 Apply `auto-safe` package app migrations through the installed app migration API.
- [ ] 10.3 Verify applied-state evidence after each apply step before continuing to later steps.
- [ ] 10.4 Add CLI tests proving apply output includes evidence and metadata verification failure stops data migration.

## 11. Backup And Manual Approval Gates

- [ ] 11.1 Define CLI input and evidence shape for backup completion before `auto-with-backup` user-data migrations.
- [ ] 11.2 Define CLI input and evidence shape for explicit manual approval before `manual-approval` migrations.
- [ ] 11.3 Wire backup and manual approval gates into one mutating CLI flow before broadening to remaining flows.
- [ ] 11.4 Add CLI tests for backup gating, manual approval gating, missing evidence failure, and persisted output evidence.

## 12. Browser Replica Compatibility

- [ ] 12.1 Add stale client compatibility checks for mutation and action writes using runtime protocol, schema timestamp, or package app revision facts.
- [ ] 12.2 Return reload-required errors for incompatible stale writes before any Authority commit or push notification.
- [ ] 12.3 Preserve compatible bootstrap and sync reads where possible and include current schema/upgrade facts needed for reload or re-bootstrap.
- [ ] 12.4 Add IndexedDB cache migration handling that can migrate local cache metadata or delete/re-bootstrap the replica if cache migration fails.
- [ ] 12.5 Add browser replica and Authority operation tests for stale write rejection, compatible stale reads, failed cache migration re-bootstrap, and no data loss.

## 13. Archive Compatibility

- [ ] 13.1 Add archive normalizer registry for older supported app and instance archive envelopes.
- [ ] 13.2 Update archive parse/restore planning to normalize older supported versions before current validation.
- [ ] 13.3 Keep archive export writers on the latest supported envelope and include package revision/schema hash facts needed for future planning.
- [ ] 13.4 Add dry-run evidence for archive normalization and reject unsupported archive versions before mutation.
- [ ] 13.5 Add archive tests for latest export, older supported import/restore normalization, unsupported version rejection, dry-run evidence, and no target mutation on failure.

## 14. Verification And Promotion

- [ ] 14.1 Run `devstate check` after each shipped implementation section and read `./.devstate/status.md` as evidence.
- [ ] 14.2 Smoke visible app or CLI behavior with `bun browser ...` only when app behavior changes.
- [ ] 14.3 Record implementation decisions, blockers, evidence, and promotion notes in this change's artifacts.
- [ ] 14.4 Promote shipped requirements into `openspec/specs/upgrade-migrations/spec.md` and update modified capability specs after implementation.
- [ ] 14.5 Confirm OpenSpec status is complete and leave the change review-ready without archiving or merging.

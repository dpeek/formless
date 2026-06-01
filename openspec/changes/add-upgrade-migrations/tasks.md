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

- [x] 7.1 Integrate non-mutating upgrade planning into deploy dry-run and publish dry-run flows.
- [x] 7.2 Ensure dry-run output includes deployed metadata, local package facts, app install facts, planned steps, blockers, and evidence requirements.
- [x] 7.3 Add CLI tests proving deploy and publish dry-runs do not mutate target data and stop on metadata verification failure.

Evidence:

- `grug` 2026-06-01: added `src/site/upgrade-plan.ts` planning report helpers that build a non-mutating dry-run upgrade report from target status reads, deployed metadata, local package facts, installed app facts, blockers, and formatted plan/evidence requirements.
- Wired `src/site/publish.ts` dry-runs with a target to read target upgrade status through existing HTTP target reads, log the upgrade planning report, and stop before returning when metadata verification blockers are present. Apply publish flow remains unchanged in this section.
- Added `src/site/publish.test.ts` and `src/site/cli.test.ts` coverage proving direct Site publish and Site project publish dry-runs read only deploy/setup/app-install status endpoints, do not run deploy commands or touch Site snapshot data, include upgrade evidence output, and stop on target metadata verification failures.
- `devstate check` 2026-06-01: `.devstate/status.md` reported checks ok, web service ready, and test service pass. No `bun browser` smoke run because this section changes CLI dry-run output and no visible browser app behavior changed.

## 8. Archive Restore And Workspace Push Dry-run Planning

- [x] 8.1 Integrate non-mutating upgrade planning into archive restore dry-run and instance workspace push dry-run flows.
- [x] 8.2 Keep archive normalization as pending or unsupported until the archive normalizer registry ships.
- [x] 8.3 Add CLI tests proving archive restore and workspace push dry-runs do not mutate target data and include archive-state evidence.

Evidence:

- `grug` 2026-06-01: wired archive restore dry-runs and instance workspace push dry-runs through CLI upgrade planning reports that read target metadata, installed app facts, local package facts, and archive input status without applying restore data.
- Added archive input evidence to upgrade planning output and modeled non-current archive normalization as pending for older supported versions or blocked unsupported for unreadable, unknown-kind, or unsupported-version archives until a normalizer registry ships.
- Added `src/site/cli.test.ts` coverage proving archive restore dry-run sends only a dry-run restore request, workspace push dry-run includes archive-state evidence, and neither flow sends an apply restore.
- `devstate check` 2026-06-01: `.devstate/status.md` reported checks ok, web service ready, and test service pass. No `bun browser` smoke run because this section changes CLI dry-run planning output only and no visible browser app behavior changed.

## 9. Runtime Upgrade Apply Evidence API

- [x] 9.1 Add a narrow secured runtime or Authority API that exposes SQL migration applied-state evidence per storage identity.
- [x] 9.2 Expose package app migration applied-state evidence through the same upgrade status or apply boundary.
- [x] 9.3 Keep the API unavailable to public app and browser-generated write routes.
- [x] 9.4 Add worker tests for authorization, storage identity scoping, applied-state evidence, and no direct CLI Durable Object SQLite access.

Evidence:

- `grug` 2026-06-01: added `src/shared/upgrade-status.ts` response contracts and `/api/formless/upgrade/status` plus app-storage `/upgrade/status` handlers in `src/worker/upgrade-status-api.ts`, routed through the instance and app Authority Durable Objects.
- The runtime status API requires instance write authorization, returns no-store JSON evidence, reads SQL applied-state rows per reported storage identity, and includes package app migration applied rows plus package state for app storage identities. Installed app evidence is collected through Authority fetches rather than direct CLI Durable Object SQLite access.
- Added `src/worker/upgrade-status-api.test.ts` coverage for authorization, storage identity scoping, SQL/package evidence, method rejection, and public app route exclusion.
- `devstate check` 2026-06-01: `.devstate/status.md` reported checks ok, web service ready, and test service pass. No `bun browser` smoke run because this section changes secured worker API evidence only and no visible browser app workflow changed.

## 10. CLI Auto-safe Apply

- [x] 10.1 Apply `auto-safe` SQL migrations through the secured runtime or Authority API.
- [x] 10.2 Apply `auto-safe` package app migrations through the installed app migration API.
- [x] 10.3 Verify applied-state evidence after each apply step before continuing to later steps.
- [x] 10.4 Add CLI tests proving apply output includes evidence and metadata verification failure stops data migration.

Evidence:

- `grug` 2026-06-01: added secured `POST /api/formless/upgrade/apply` runtime apply status for known instance and installed-app storage identities, preserving `/api/formless/upgrade/status` as a no-store evidence read.
- Added CLI auto-safe apply orchestration in `src/site/upgrade-apply.ts` and wired Site publish apply to verify target upgrade metadata, apply SQL migration status through the runtime API, apply installed app package migrations with `safety: "auto-safe"`, verify package applied-state evidence after each installed-app apply, and log apply evidence before data backup/restore.
- Added installed-app package migration `safety: "auto-safe"` request enforcement so the CLI path refuses package migrations that require backup or manual approval safety.
- Added coverage in `src/site/publish.test.ts`, `src/site/cli.test.ts`, and `src/worker/upgrade-status-api.test.ts` for apply evidence output, metadata verification failure stopping data mutation, secured runtime SQL apply evidence, and package migration apply calls through the installed-app API.
- `devstate check` 2026-06-01: `.devstate/status.md` reported checks ok, web service ready, and test service pass. No `bun browser` smoke run because this section changes CLI apply/runtime API behavior and no visible browser app workflow changed.

## 11. Backup And Manual Approval Gates

- [x] 11.1 Define CLI input and evidence shape for backup completion before `auto-with-backup` user-data migrations.
- [x] 11.2 Define CLI input and evidence shape for explicit manual approval before `manual-approval` migrations.
- [x] 11.3 Wire backup and manual approval gates into one mutating CLI flow before broadening to remaining flows.
- [x] 11.4 Add CLI tests for backup gating, manual approval gating, missing evidence failure, and persisted output evidence.

Evidence:

- `grug` 2026-06-01: added CLI upgrade apply gate evidence in `src/site/upgrade-apply.ts` with backup evidence shape (`kind`, scope, artifact path, completion timestamp, optional target) and manual approval evidence shape (`kind`, approval key, approval timestamp, optional approver/reason).
- Wired Site publish apply as the first mutating flow by adding `--upgrade-backup-evidence <path>` and `--approve-upgrade <key>` parsing in `src/site/publish.ts`; project publish passes empty gate evidence until it grows equivalent inputs.
- Added `src/site/upgrade-apply.test.ts` coverage for missing backup evidence, missing manual approval evidence, satisfied gates, and persisted apply evidence output. Updated `src/site/publish.test.ts` for Site publish option parsing and apply evidence logging.
- Updated change specs for `upgrade-migrations` and `site-cli-publish` with the shipped evidence shapes.
- `devstate check` 2026-06-01: `.devstate/status.md` reported checks ok, web service ready, and test service pass. No `bun browser` smoke run because this section changes CLI apply evidence behavior only and no visible browser app behavior changed.

## 12. Browser Replica Compatibility

- [x] 12.1 Add stale client compatibility checks for mutation and action writes using runtime protocol, schema timestamp, or package app revision facts.
- [x] 12.2 Return reload-required errors for incompatible stale writes before any Authority commit or push notification.
- [x] 12.3 Preserve compatible bootstrap and sync reads where possible and include current schema/upgrade facts needed for reload or re-bootstrap.
- [x] 12.4 Add IndexedDB cache migration handling that can migrate local cache metadata or delete/re-bootstrap the replica if cache migration fails.
- [x] 12.5 Add browser replica and Authority operation tests for stale write rejection, compatible stale reads, failed cache migration re-bootstrap, and no data loss.

Evidence:

- `grug` 2026-06-01: added browser replica compatibility headers and reload-required response contracts in `src/shared/protocol.ts`; browser mutation/action submits now send runtime protocol, schema timestamp, package revision, and source schema hash facts from `src/client/sync.ts`.
- Added Authority stale-write guards in `src/worker/authority-operations.ts` using current runtime protocol, stored schema timestamp, and package app migration state. Incompatible mutation/action writes throw reload-required `409` responses before write outcome execution, change-row append, or push notification.
- Bootstrap and HTTP sync reads now return current browser replica upgrade facts in no-store response headers while keeping existing JSON read bodies compatible.
- Bumped the browser replica IndexedDB cache version in `src/client/db.ts`; safe older cache shape migrates metadata in place, and unsafe local cache migration deletes the replica so sync can re-bootstrap from Authority without Authority data loss.
- Added coverage in `src/client/db.test.ts`, `src/client/sync.test.ts`, `src/worker/authority-operations.test.ts`, and `src/worker/authority.test.ts` for stale write rejection, compatible read facts, write headers, failed cache migration re-bootstrap, and no commit/push on reload-required writes.
- `devstate check` 2026-06-01: `.devstate/status.md` reported checks ok, web service ready, and test service pass. `bun browser` smoke against `/tasks` was attempted after `devstate start`; the page stayed blank because the dev server returned 404s for Vite optimized deps and `lib/ui` source modules, so no visible workflow assertion completed.

## 13. Archive Compatibility

- [x] 13.1 Add archive normalizer registry for older supported app and instance archive envelopes.
- [x] 13.2 Update archive parse/restore planning to normalize older supported versions before current validation.
- [x] 13.3 Keep archive export writers on the latest supported envelope and include package revision/schema hash facts needed for future planning.
- [x] 13.4 Add dry-run evidence for archive normalization and reject unsupported archive versions before mutation.
- [x] 13.5 Add archive tests for latest export, older supported import/restore normalization, unsupported version rejection, dry-run evidence, and no target mutation on failure.

Evidence:

- `grug` 2026-06-01: bumped portable archive writer/parser envelope to version `2`, added archived app install `packageRevision` and `sourceSchemaHash` fields, and added `src/shared/archive-normalizers.ts` with registered app and instance version `1` to `2` normalizers.
- Routed archive restore planning, Worker archive restore API handling, Site CLI archive directory reads, and instance workspace archive reads through normalization before current validation or restore posting. Unsupported archive versions now fail before target mutation.
- Updated Site CLI archive export and Site project import writers to emit package revision/schema hash facts, preserve archived package facts during restore planning, and report archive normalization evidence in dry-run output.
- Added focused coverage in `src/shared/archive-normalizers.test.ts`, `src/shared/archive.test.ts`, `src/shared/archive-restore-plan.test.ts`, `src/site/cli.test.ts`, `src/worker/archive-restore.test.ts`, and `src/worker/archive-api.test.ts` for latest export facts, older supported archive normalization, unsupported-version rejection, dry-run evidence, and no target mutation on failure.
- Updated change specs for `portable-archives` and `site-cli-publish` with the shipped v1-to-v2 normalization and dry-run evidence behavior.
- `devstate check` 2026-06-01: `.devstate/status.md` reported checks ok, web service ready, and test service pass. No `bun browser` smoke run because this section changes archive and CLI behavior only and no visible browser app workflow changed.

## 14. Verification And Promotion

- [ ] 14.1 Run `devstate check` after each shipped implementation section and read `./.devstate/status.md` as evidence.
- [ ] 14.2 Smoke visible app or CLI behavior with `bun browser ...` only when app behavior changes.
- [ ] 14.3 Record implementation decisions, blockers, evidence, and promotion notes in this change's artifacts.
- [ ] 14.4 Promote shipped requirements into `openspec/specs/upgrade-migrations/spec.md` and update modified capability specs after implementation.
- [ ] 14.5 Confirm OpenSpec status is complete and leave the change review-ready without archiving or merging.

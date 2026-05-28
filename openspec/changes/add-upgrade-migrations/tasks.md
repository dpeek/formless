## 1. Upgrade Contracts And Registry

- [ ] 1.1 Run `devstate start` and read `./.devstate/status.md`; fix red status before implementation.
- [ ] 1.2 Add shared upgrade migration contract types for migration ids, owners, families, checksums, safety classes, package app revisions, schema hashes, and apply evidence.
- [ ] 1.3 Add deterministic schema hash helpers for bundled source schemas and fixed hash fixtures for Site, Tasks, and Estii.
- [ ] 1.4 Add migration registry validation for duplicate ids, bad checksums, invalid safety classes, and invalid package revision ranges.
- [ ] 1.5 Add tests for registry ordering, duplicate rejection, checksum preservation, safety classification, and package revision validation.

## 2. Runtime Metadata And Package App Facts

- [ ] 2.1 Extend bundled package app definitions with package revision and source schema hash facts while keeping `schema.version` as the schema language version.
- [ ] 2.2 Extend app install metadata storage and response parsing with installed package revision and source schema hash facts.
- [ ] 2.3 Add compatibility reads for existing installs that do not yet have package revision/hash columns.
- [ ] 2.4 Extend deploy metadata response with package version, runtime protocol version, storage migration set identity, and package app revision/hash facts.
- [ ] 2.5 Update metadata and app install tests for no-secret responses, no-store caching, legacy install compatibility, and stable install identity.

## 3. SQL Migration Runner

- [ ] 3.1 Add shared Durable Object SQLite applied-migration table helpers keyed by storage identity family.
- [ ] 3.2 Add an idempotent SQL migration runner that applies pending migrations in registry order and records id, checksum, package version, and applied timestamp.
- [ ] 3.3 Move existing one-off SQLite table shape migrations behind the shared runner without changing migrated table output.
- [ ] 3.4 Ensure storage initialization runs required SQL migrations before code depends on migrated table shape.
- [ ] 3.5 Add migration harness tests for pending migration apply, applied migration skip, checksum mismatch handling, introspective legacy table rewrite, and rerun no-op behavior.

## 4. Authority Package App Migrations

- [ ] 4.1 Add package app migration registry entries and execution helpers for schema/data migrations between package revisions.
- [ ] 4.2 Add Authority-backed migration execution that validates schema changes, materializes flat record creates/patches/tombstones, appends change rows, and advances cursors.
- [ ] 4.3 Add applied package migration state per installed app storage identity with revision/hash update behavior after successful migration.
- [ ] 4.4 Add rollback-safe failure behavior so invalid migrated records leave stored schema, records, write log, and package facts unchanged.
- [ ] 4.5 Add Authority tests for successful record migration catch-up, invalid field/reference/unique/delete validation failures, idempotent replay, and browser sync visibility.

## 5. CLI Upgrade Planning And Apply

- [ ] 5.1 Extend target status reads to collect deployed upgrade metadata, local package metadata, app install package facts, deployment status, and archive state when relevant.
- [ ] 5.2 Add CLI upgrade plan models and formatting for code deploy, SQL migration, package app migration, archive normalization, backup, browser reload, and manual approval steps.
- [ ] 5.3 Integrate upgrade planning into deploy, publish, archive restore, and instance workspace push flows without mutating data during dry-run.
- [ ] 5.4 Apply `auto-safe` migrations through deployed runtime or Authority APIs and verify applied-state evidence.
- [ ] 5.5 Require backup evidence before `auto-with-backup` user-data migrations and explicit manual approval before `manual-approval` migrations.
- [ ] 5.6 Add CLI tests proving no direct Durable Object SQLite access, dry-run non-mutation, backup gating, metadata verification failure stops data migration, and apply output includes evidence.

## 6. Browser Replica Compatibility

- [ ] 6.1 Add stale client compatibility checks for mutation and action writes using runtime protocol, schema timestamp, or package app revision facts.
- [ ] 6.2 Return reload-required errors for incompatible stale writes before any Authority commit or push notification.
- [ ] 6.3 Preserve compatible bootstrap and sync reads where possible and include current schema/upgrade facts needed for reload or re-bootstrap.
- [ ] 6.4 Add IndexedDB cache migration handling that can migrate local cache metadata or delete/re-bootstrap the replica if cache migration fails.
- [ ] 6.5 Add browser replica and Authority operation tests for stale write rejection, compatible stale reads, failed cache migration re-bootstrap, and no data loss.

## 7. Archive Compatibility

- [ ] 7.1 Add archive normalizer registry for older supported app and instance archive envelopes.
- [ ] 7.2 Update archive parse/restore planning to normalize older supported versions before current validation.
- [ ] 7.3 Keep archive export writers on the latest supported envelope and include package revision/schema hash facts needed for future planning.
- [ ] 7.4 Add dry-run evidence for archive normalization and reject unsupported archive versions before mutation.
- [ ] 7.5 Add archive tests for latest export, older supported import/restore normalization, unsupported version rejection, dry-run evidence, and no target mutation on failure.

## 8. Verification And Promotion

- [ ] 8.1 Run `devstate check` after each shipped implementation section and read `./.devstate/status.md` as evidence.
- [ ] 8.2 Smoke visible app or CLI behavior with `bun browser ...` only when app behavior changes.
- [ ] 8.3 Record implementation decisions, blockers, evidence, and promotion notes in this change's artifacts.
- [ ] 8.4 Promote shipped requirements into `openspec/specs/upgrade-migrations/spec.md` and update modified capability specs after implementation.
- [ ] 8.5 Confirm OpenSpec status is complete and leave the change review-ready without archiving or merging.

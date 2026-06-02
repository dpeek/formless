## 1. Existing Key Rewrite

- [x] 1.1 Rename existing instance control-plane schema entity keys from `appInstall`, `appRoute`, `domainMapping`, `redirectIntent`, `deployTarget`, `providerConfigRef`, `deployDesiredResource`, `deployAttempt`, `deployEvidenceSummary`, and `deployDriftReport` to the canonical kebab-case keys before adding parser rejection for camelCase entity keys.
- [x] 1.2 Bulk update existing schema fixtures, seed records, generated models, test fixtures, source constants, and direct string lookups that embed the renamed control-plane entity keys.
- [x] 1.3 Update control-plane relationships and reference targets to use local kebab-case entity keys.
- [x] 1.4 Update app install, app route, domain, redirect, deploy target, provider reference, desired resource, attempt, evidence, and drift helpers to address entity keys as strings.
- [x] 1.5 Preserve storage identities such as `instance:control-plane` and `app:<installId>`.
- [x] 1.6 Confirm installed app content records remain outside instance control-plane records.

- Files changed: `src/shared/instance-control-plane.ts`, `src/worker/instance-control-plane.ts`, `src/worker/deployment-runtime-projection.ts`, `src/worker/domain-provider-api.ts`, `src/worker/instance-domain-mappings.ts`, `src/site/instance-target-client.ts`, `src/site/instance-workspace.ts`, plus related source/client/worker/site tests.
- Evidence: instance control-plane schema entity keys, relationships, references, runtime control-plane metadata, record readers/writers, workspace/archive record fixtures, CLI/control-plane test fixtures, and generated view model expectations now use local kebab-case entity keys. Field keys, query/view/action/screen keys, `INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY = "instance:control-plane"`, and app storage identities such as `app:<installId>` remain unchanged.
- Boundary evidence: archive/workspace tests still keep installed app content in app archive/snapshot payloads while control-plane records store only flat management records.
- Checks: `devstate check` passed with checks ok and services running in `./.devstate/status.md` at 2026-06-02T02:17:51.725Z.
- Smoke: `bun browser --ignore-https-errors --session grug-control-plane-smoke batch --bail "open https://standardize-entity-key-conventions.formless.local/" "wait 1000" "snapshot -i" "errors"` rendered App management, App installs, App routes, and deployment control-plane sections. Follow-up `bun browser --session grug-control-plane-smoke errors` returned no errors.

## 2. Parser And Schema Grammar

- [x] 2.1 Add schema-local entity key validation for singular kebab-case keys and reject camelCase, qualified, underscored, dotted, slash-containing, empty, leading-digit, leading/trailing hyphen, and double-hyphen keys.
- [x] 2.2 Add qualified entity name parsing and formatting for `<schema-key>:<entity-key>` boundary names.
- [x] 2.3 Keep schema-internal entity references local when the target entity is declared in the same schema.
- [x] 2.4 Add parser errors that distinguish invalid local entity keys from invalid qualified boundary names.

- Files changed: `src/shared/schema-entity-names.ts`, `src/shared/schema-fields.ts`, `src/shared/schema-relationships.ts`, `src/shared/schema.test.ts`, Site schema/seed fixtures, and Site entity lookup/test references under `src/app`, `src/client`, `src/site`, `src/test`, and `src/worker`.
- Evidence: schema parsing now validates local entity keys with kebab-case grammar, rejects camelCase/qualified/underscored/dotted/slash/empty/leading-digit/hyphen-boundary/double-hyphen local keys, exposes qualified entity parse/format helpers, and rejects qualified references to same-schema entities with local-key guidance.
- Site fixture evidence: bundled Site local entity keys `blockPlacement` and `emailAddress` were renamed to `block-placement` and `email-address`; field, query, view, action, and screen keys such as `emailAddress`, `blockPlacementTable`, and `blockPlacementCreate` remain unchanged.
- Checks: `devstate check` passed with checks ok and services running in `./.devstate/status.md` at 2026-06-02T02:27:36.378Z.
- Smoke: `bun browser --ignore-https-errors --session grug-entity-grammar-smoke batch --bail "open https://standardize-entity-key-conventions.formless.local/" "wait 1000" "snapshot -i" "errors"` rendered App management and returned no browser errors.

## 3. Builder And Generated UI

- [x] 3.1 Update Builder entity creation and validation to accept parser-valid kebab-case entity keys.
- [x] 3.2 Keep saved entity keys locked after save and leave saved field, query, view, action, and screen keys unchanged.
- [x] 3.3 Render human-facing labels from kebab-case entity keys without treating hyphens as namespaces.
- [x] 3.4 Update generated instance management surfaces that assume entity keys are JavaScript identifiers.

- Files changed: `src/client/schema-builder.ts`, `src/client/schema-builder.test.ts`, `src/client/views.test.ts`, `src/app/routes/schema.tsx`, and generated UI fixture expectations in `src/app.test.tsx`.
- Evidence: Builder entity validation now delegates entity keys to schema-local kebab-case grammar while field and enum keys keep the existing Builder key rule. Builder creates `project-note` entities, derives `Project note` labels from hyphenated keys, exposes saved entity `keyLocked` projection state, and preserves saved field, query, view, and screen keys. Generated control-plane app screen model coverage verifies `app-install` and `app-route` entity names with existing camelCase view/query keys. Generated UI test fixtures use local kebab-case entity keys such as `task-placement` with existing relationship/query/view names preserved.
- Checks: `devstate check` passed with checks ok and services running in `./.devstate/status.md` at 2026-06-02T02:37:09.566Z.
- Smoke: `bun browser --ignore-https-errors --session grug-builder-kebab-smoke batch --bail "open https://standardize-entity-key-conventions.formless.local/site/schema" "wait 1000" "snapshot -i" "errors"` rendered the Schema Builder route. `bun browser --session grug-builder-kebab-smoke batch --bail "open https://standardize-entity-key-conventions.formless.local/" "wait 1000" "snapshot -i" "errors"` rendered App management, app-install/app-route generated sections, and deployment sections with no browser errors.

## 4. Archive And Workspace Record Source

- [x] 4.1 Emit qualified entity names for control-plane records at portable archive boundaries.
- [x] 4.2 Emit qualified entity names for deterministic workspace record source used by `browser-workspace-control-plane`.
- [x] 4.3 Map qualified boundary names back to schema-local entity keys before Authority validation.
- [x] 4.4 Update drift reports, logs, diagnostics, and CLI output that identify record entity types to use qualified names.
- [x] 4.5 Reconcile `destroy-instance` source-of-truth wording that still refers to target and deploy intent in `formless.json`.

- Files changed: `src/shared/instance-control-plane.ts`, `src/shared/archive.ts`, `src/site/archive-workflows.ts`, `src/site/instance-workspace.ts`, `src/shared/archive.test.ts`, and `src/site/cli.test.ts`.
- Evidence: instance control-plane archive and workspace-source JSON now emits record entities as qualified names such as `instance:app-install`, `instance:app-route`, and `instance:deploy-desired-resource`; archive parsing maps those qualified boundary names back to local entity keys before validation and Authority restore.
- Boundary output evidence: CLI restore requests serialize archives through archive formatting before POST, workspace pull/save tests assert raw archive source uses qualified names, parsed archive tests assert internal records remain local, and changed control-plane drift record keys now use qualified entity names.
- Diagnostics evidence: archive validation and remote control-plane archiveability errors now report qualified control-plane field labels such as `instance:deploy-desired-resource.inputsJson`.
- Source-of-truth reconciliation: `formless.json` remains the reviewable selected-target/deploy-adapter metadata used by destroy, while app, route, domain, and deploy intent records crossing archive or workspace-source boundaries are represented as schema-owned control-plane records with qualified entity names.
- Checks: `devstate check` passed with checks ok and services running in `./.devstate/status.md` at 2026-06-02T02:47:04.685Z.
- Smoke: not run; this section changed archive, workspace-source, CLI request, and diagnostic boundaries without browser-visible generated UI behavior.

## 5. Compatibility Adapters

- [x] 5.1 Add one-way camelCase-to-kebab-case normalization for supported archive or workspace record-source readers only where existing artifacts require it.
- [x] 5.2 Report normalization evidence in dry-run, check, or diagnostic output.
- [x] 5.3 Reject mixed legacy and canonical entity-name spellings when they would address the same logical record set.
- [x] 5.4 Ensure normalization does not introduce runtime aliases, re-exports, dual canonical keys, or new schema versions.

- Files changed: `src/shared/archive-normalizers.ts`, `src/shared/archive-normalizers.test.ts`, `src/site/instance-workspace.ts`, `src/site/cli.ts`, and `src/site/cli.test.ts`.
- Evidence: supported archive and workspace archive readers now normalize legacy instance control-plane record entity names such as `appInstall` to canonical qualified names such as `instance:app-install` before current archive parsing and Authority validation. Parsed runtime records remain local kebab-case records.
- Output evidence: archive restore dry-runs and instance workspace check/push output report archive normalization evidence, including original and canonical entity names and record counts.
- Mixed-spelling evidence: normalization rejects archives that mix legacy and canonical spellings for the same logical instance control-plane entity, such as `appInstall` with `instance:app-install`.
- Compatibility boundary: the legacy spelling map is private to the archive normalizer; schema parsing, archive parsing, runtime schema constants, exports, schema versions, and canonical format output keep only canonical kebab-case entity names.
- Checks: `devstate check` passed with checks ok and services running in `./.devstate/status.md` at 2026-06-02T02:56:44.685Z.
- Smoke: not run; this section changed archive/workspace reader normalization and CLI/check diagnostics without browser-visible app behavior.

## 6. Tests And Verification

- [x] 6.1 Add schema parser tests for valid kebab-case entity keys and invalid camelCase or qualified local entity keys.
- [x] 6.2 Add qualified entity name parse/format tests for archive, workspace source, drift, log, and diagnostic boundaries.
- [x] 6.3 Add Builder tests for kebab-case creation, invalid key feedback, clean labels, and saved key locking.
- [x] 6.4 Add instance control-plane tests for renamed entities, references, immutable fields, route target integrity, and installed app data boundary.
- [x] 6.5 Add archive and workspace record-source tests for qualified names, normalization evidence, unsupported spelling rejection, and app data separation.
- [x] 6.6 Run `devstate check` and use `./.devstate/status.md` as evidence.
- [x] 6.7 Smoke app behavior with `bun browser ...` if generated UI, workspace save/check, or browser-visible control-plane behavior changes.

- Files changed: `src/shared/schema.test.ts`, `src/client/schema-builder.test.ts`, `src/shared/instance-control-plane.test.ts`, `src/worker/control-plane-schema-validation.test.ts`, `src/worker/instance-control-plane.test.ts`, `src/shared/archive.test.ts`, `src/shared/archive-normalizers.test.ts`, and `src/site/cli.test.ts`.
- Evidence: parser tests now cover `app-install` and `deploy-desired-resource` as valid local entity keys, non-canonical local key rejection, and qualified parse/format contexts for archive, workspace source, drift, log, and diagnostic boundaries. Builder tests cover kebab-case creation, invalid key feedback, clean labels, and saved key locking.
- Control-plane evidence: instance control-plane tests assert local kebab-case entity keys, local reference targets, `instance` boundary formatting/parsing, immutable field metadata, missing route target rejection, default route records, and installed app data isolation.
- Archive/workspace evidence: archive tests assert qualified formatting at archive boundaries, local parsing before Authority validation, qualified diagnostic labels, one-way legacy normalization evidence including qualified legacy spelling, unsupported spelling rejection, mixed spelling rejection, workspace archive qualified output, workspace parsed-local records, qualified control-plane drift output, and app data separation.
- Checks: `devstate check` passed with checks ok and services running in `./.devstate/status.md` at 2026-06-02T03:04:56.490Z.
- Smoke: not run; this section changed tests and verification artifacts only, without generated UI, workspace save/check behavior, or browser-visible control-plane behavior changes.

## 7. Spec Promotion And Finalization

- [x] 7.1 Promote shipped entity key grammar and qualified name rules into `openspec/specs/app-schema/spec.md`.
- [x] 7.2 Promote instance control-plane kebab-case entity keys into `openspec/specs/instance-control-plane/spec.md`.
- [x] 7.3 Promote archive and workspace boundary naming rules into `openspec/specs/portable-archives/spec.md`.
- [x] 7.4 Promote Builder and generated UI naming behavior into `openspec/specs/generated-ui/spec.md`.
- [x] 7.5 Promote CLI, installed app, and runtime topology wording into `site-cli-publish`, `installed-apps`, and `runtime-topology` specs.
- [x] 7.6 Record decisions, blockers, evidence, and promotion notes in this change before marking the implementation ready.

- Files changed: `openspec/specs/app-schema/spec.md`, `openspec/specs/instance-control-plane/spec.md`, `openspec/specs/portable-archives/spec.md`, `openspec/specs/generated-ui/spec.md`, `openspec/specs/site-cli-publish/spec.md`, `openspec/specs/installed-apps/spec.md`, `openspec/specs/runtime-topology/spec.md`, and this `tasks.md`.
- Promotion notes: promoted schema-local kebab-case entity grammar, qualified boundary entity names, instance control-plane local entity keys, qualified archive/workspace/drift naming, one-way legacy archive/workspace normalization evidence, Builder kebab-case authoring and clean labels, CLI canonical key use, installed app route records, and runtime topology route resolution.
- Decisions: no new product or storage decisions; promotion follows shipped behavior and existing change decisions.
- Blockers: none.
- Evidence: `rg` over the promoted specs found no exact legacy control-plane entity keys `appInstall`, `appRoute`, `deployTarget`, `providerConfigRef`, `domainMapping`, `redirectIntent`, `deployDesiredResource`, `deployAttempt`, `deployEvidenceSummary`, or `deployDriftReport`.
- Checks: `devstate check` passed with checks ok and services running in `./.devstate/status.md` at 2026-06-02T03:09:48.973Z.
- Smoke: not run; this section changed promoted OpenSpec docs only and no app behavior changed.

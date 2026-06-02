## 1. Existing Key Rewrite

- [ ] 1.1 Rename existing instance control-plane schema entity keys from `appInstall`, `appRoute`, `domainMapping`, `redirectIntent`, `deployTarget`, `providerConfigRef`, `deployDesiredResource`, `deployAttempt`, `deployEvidenceSummary`, and `deployDriftReport` to the canonical kebab-case keys before adding parser rejection for camelCase entity keys.
- [ ] 1.2 Bulk update existing schema fixtures, seed records, generated models, test fixtures, source constants, and direct string lookups that embed the renamed control-plane entity keys.
- [ ] 1.3 Update control-plane relationships and reference targets to use local kebab-case entity keys.
- [ ] 1.4 Update app install, app route, domain, redirect, deploy target, provider reference, desired resource, attempt, evidence, and drift helpers to address entity keys as strings.
- [ ] 1.5 Preserve storage identities such as `instance:control-plane` and `app:<installId>`.
- [ ] 1.6 Confirm installed app content records remain outside instance control-plane records.

## 2. Parser And Schema Grammar

- [ ] 2.1 Add schema-local entity key validation for singular kebab-case keys and reject camelCase, qualified, underscored, dotted, slash-containing, empty, leading-digit, leading/trailing hyphen, and double-hyphen keys.
- [ ] 2.2 Add qualified entity name parsing and formatting for `<schema-key>:<entity-key>` boundary names.
- [ ] 2.3 Keep schema-internal entity references local when the target entity is declared in the same schema.
- [ ] 2.4 Add parser errors that distinguish invalid local entity keys from invalid qualified boundary names.

## 3. Builder And Generated UI

- [ ] 3.1 Update Builder entity creation and validation to accept parser-valid kebab-case entity keys.
- [ ] 3.2 Keep saved entity keys locked after save and leave saved field, query, view, action, and screen keys unchanged.
- [ ] 3.3 Render human-facing labels from kebab-case entity keys without treating hyphens as namespaces.
- [ ] 3.4 Update generated instance management surfaces that assume entity keys are JavaScript identifiers.

## 4. Archive And Workspace Record Source

- [ ] 4.1 Emit qualified entity names for control-plane records at portable archive boundaries.
- [ ] 4.2 Emit qualified entity names for deterministic workspace record source used by `browser-workspace-control-plane`.
- [ ] 4.3 Map qualified boundary names back to schema-local entity keys before Authority validation.
- [ ] 4.4 Update drift reports, logs, diagnostics, and CLI output that identify record entity types to use qualified names.
- [ ] 4.5 Reconcile `destroy-instance` source-of-truth wording that still refers to target and deploy intent in `formless.json`.

## 5. Compatibility Adapters

- [ ] 5.1 Add one-way camelCase-to-kebab-case normalization for supported archive or workspace record-source readers only where existing artifacts require it.
- [ ] 5.2 Report normalization evidence in dry-run, check, or diagnostic output.
- [ ] 5.3 Reject mixed legacy and canonical entity-name spellings when they would address the same logical record set.
- [ ] 5.4 Ensure normalization does not introduce runtime aliases, re-exports, dual canonical keys, or new schema versions.

## 6. Tests And Verification

- [ ] 6.1 Add schema parser tests for valid kebab-case entity keys and invalid camelCase or qualified local entity keys.
- [ ] 6.2 Add qualified entity name parse/format tests for archive, workspace source, drift, log, and diagnostic boundaries.
- [ ] 6.3 Add Builder tests for kebab-case creation, invalid key feedback, clean labels, and saved key locking.
- [ ] 6.4 Add instance control-plane tests for renamed entities, references, immutable fields, route target integrity, and installed app data boundary.
- [ ] 6.5 Add archive and workspace record-source tests for qualified names, normalization evidence, unsupported spelling rejection, and app data separation.
- [ ] 6.6 Run `devstate check` and use `./.devstate/status.md` as evidence.
- [ ] 6.7 Smoke app behavior with `bun browser ...` if generated UI, workspace save/check, or browser-visible control-plane behavior changes.

## 7. Spec Promotion And Finalization

- [ ] 7.1 Promote shipped entity key grammar and qualified name rules into `openspec/specs/app-schema/spec.md`.
- [ ] 7.2 Promote instance control-plane kebab-case entity keys into `openspec/specs/instance-control-plane/spec.md`.
- [ ] 7.3 Promote archive and workspace boundary naming rules into `openspec/specs/portable-archives/spec.md`.
- [ ] 7.4 Promote Builder and generated UI naming behavior into `openspec/specs/generated-ui/spec.md`.
- [ ] 7.5 Promote CLI, installed app, and runtime topology wording into `site-cli-publish`, `installed-apps`, and `runtime-topology` specs.
- [ ] 7.6 Record decisions, blockers, evidence, and promotion notes in this change before marking the implementation ready.

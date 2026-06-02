## Why

Formless schema data currently uses JavaScript-style camelCase entity keys for
runtime-owned instance control-plane records. `browser-workspace-control-plane`
is about to freeze deterministic workspace record source files, so Formless
needs a stable schema-data naming convention before that format becomes another
place that preserves camelCase runtime entity names.

## What Changes

- **BREAKING** Standardize schema-local entity keys as singular `kebab-case`
  identifiers.
- **BREAKING** Rename instance control-plane entity keys conceptually from
  camelCase to kebab-case:
  `appInstall` -> `app-install`, `appRoute` -> `app-route`,
  `domainMapping` -> `domain-mapping`,
  `redirectIntent` -> `redirect-intent`, `deployTarget` -> `deploy-target`,
  `providerConfigRef` -> `provider-config-ref`,
  `deployDesiredResource` -> `deploy-desired-resource`,
  `deployAttempt` -> `deploy-attempt`,
  `deployEvidenceSummary` -> `deploy-evidence-summary`, and
  `deployDriftReport` -> `deploy-drift-report`.
- Define qualified entity names as `<schema-key>:<entity-key>` at
  cross-schema and external boundaries, for example `instance:app-install` and
  `site:block`.
- Keep namespace prefixes out of a schema's `entities` object. Entity keys stay
  local inside the schema that declares them.
- Use qualified names in archives, workspace record source, drift reports,
  logs, cross-schema references, and diagnostic output when records cross a
  schema or storage boundary.
- Keep schema-internal references local unless a cross-schema reference is
  explicitly introduced.
- Preserve flat records, normal reference fields, install-scoped app storage
  identities, and the boundary that keeps installed app data outside instance
  control-plane records.
- Do not unify route, domain, or redirect entities and do not redesign routing,
  deploy, destroy, or storage identity behavior.
- Note that `destroy-instance` still describes target and deploy intent in
  `formless.json`, while `browser-workspace-control-plane` moves that intent to
  schema-owned record source. This naming proposal requires those active
  changes to reconcile their source-of-truth language without solving destroy
  behavior directly.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-schema`: Define entity key grammar and qualified entity name grammar.
- `instance-control-plane`: Use kebab-case entity keys for schema-owned
  control-plane records.
- `portable-archives`: Use qualified entity names at archive and workspace
  record-source boundaries, with normalization for older camelCase records when
  compatibility is needed.
- `generated-ui`: Builder accepts kebab-case entity keys and renders labels
  cleanly without treating hyphens as namespaces.
- `site-cli-publish`: CLI workspace, save, check, pull, push, deploy, and domain
  workflows read and write control-plane records using the new entity keys and
  qualified names at external boundaries.
- `installed-apps`: App install and route requirements refer to `app-install`
  and `app-route` control-plane records.
- `runtime-topology`: Route resolution requirements refer to `app-route` records
  that target `app-install` records.

## Impact

- Affected schema contracts: parser validation, source schema authoring,
  runtime-owned control-plane schemas, record references, generated surfaces,
  portable archives, workspace record source, drift output, logs, diagnostics,
  and CLI formatting.
- Affected control-plane entities: app install, app route, domain mapping,
  redirect intent, deploy target, provider config reference, deploy desired
  resource, deploy attempt, deploy evidence summary, and deploy drift report.
- Affected active changes: `browser-workspace-control-plane` should freeze
  workspace record source using qualified kebab-case entity names, and
  `destroy-instance` should reconcile its remaining `formless.json`
  deploy-intent language with schema-owned record source.
- No runtime code is implemented by this proposal.

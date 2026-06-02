## Context

Formless treats app schema as runtime data. Entity keys are stored in source
schemas, records, generated UI models, Authority writes, archives, workspace
source, drift output, logs, and diagnostics. Current promoted instance
control-plane specs use camelCase entity keys such as `appInstall`,
`appRoute`, `domainMapping`, and `deployTarget`, which mirrors JavaScript
identifier style rather than schema-data style.

`browser-workspace-control-plane` moves app install, route, domain, and deploy
intent out of `formless.json` and into deterministic schema-owned record source.
That record-source format should not freeze camelCase entity names. The active
`destroy-instance` change still describes target and deploy intent in
`formless.json`, so finalization needs to reconcile source-of-truth language
after this naming decision lands.

## Goals / Non-Goals

**Goals:**

- Define canonical schema-local entity keys as singular kebab-case.
- Define qualified entity names for cross-schema and external record
  boundaries.
- Rename instance control-plane entity keys conceptually to kebab-case.
- Keep entity namespaces out of a schema's `entities` object.
- Preserve flat records and normal reference fields.
- Keep installed app data outside instance control-plane records.
- Give Builder, archive, workspace source, CLI, drift, logs, and diagnostics a
  single way to present entity names.
- Define a bounded compatibility path for older camelCase control-plane record
  artifacts where a supported reader needs normalization.

**Non-Goals:**

- Do not unify `app-route`, `domain-mapping`, and `redirect-intent`.
- Do not redesign routing, deployment, destroy, domain provider, or runtime
  topology behavior.
- Do not rename field keys, query keys, view keys, action keys, or screen keys
  unless implementation proves an unavoidable parser conflict.
- Do not change storage identities such as `instance:control-plane` or
  `app:<installId>`.
- Do not move app content records into the instance control plane.
- Do not introduce long-lived aliases, re-exported entity keys, or dual
  canonical names.

## Decisions

### Use schema-local kebab-case entity keys

Entity keys are local names inside the declaring schema. The grammar is:

`entity-key = /^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/`

Each segment starts with a lowercase ASCII letter and then contains only
lowercase ASCII letters or digits. Empty keys, leading digits, uppercase
characters, underscores, dots, slashes, colons, leading hyphens, trailing
hyphens, and double hyphens are invalid. Singular naming is a schema authoring
convention: the parser can enforce shape, while docs, Builder copy, and review
enforce singular vocabulary.

Alternative: keep camelCase because JavaScript code can consume it without
translation. That keeps implementation convenient but leaks JS naming into
runtime data and into reviewable workspace files.

### Use qualified names only at boundaries

Qualified entity names use `<schema-key>:<entity-key>` when a record crosses a
schema or external boundary. Examples are `instance:app-install` and
`site:block`. The right-hand side always uses the local entity key. The
left-hand side is the boundary schema namespace used by that record family. For
the instance control plane, the boundary namespace is `instance`; the runtime
schema key can remain `instance-control-plane` and the storage identity remains
`instance:control-plane`.

Schema source stays local:

- `entities` object keys are `app-install`, `app-route`, or `block`, not
  `instance:app-install` or `site:block`.
- Schema-internal reference fields keep local reference targets such as
  `app-install` when both records belong to the same schema.
- Cross-schema references, if introduced later, must use qualified targets at
  the reference boundary.

Alternative: store qualified names everywhere. That makes external output
uniform but creates duplicated namespaces inside schema data and makes simple
local references noisier than the flat model needs.

### Rename instance control-plane entities as data, not storage

The instance control-plane schema uses these local entity keys:

- `app-install`
- `app-route`
- `domain-mapping`
- `redirect-intent`
- `deploy-target`
- `provider-config-ref`
- `deploy-desired-resource`
- `deploy-attempt`
- `deploy-evidence-summary`
- `deploy-drift-report`

External output that identifies those record types uses qualified names such as
`instance:app-install`. This does not change install ids, app storage
identities, API route prefixes, Durable Object names, browser replica names, or
the boundary that keeps installed app records in `app:<installId>` storage.

Alternative: change the instance control-plane storage identity at the same
time. That would make a naming cleanup mutate runtime identity and increase
blast radius without helping schema entity naming.

### Keep compatibility one-way and boundary-scoped

Canonical runtime schema data uses kebab-case only. If existing supported
archive, workspace source, drift fixture, or diagnostic fixture readers need to
accept camelCase control-plane entity names, they should normalize them at the
parse boundary before validation and write back canonical kebab-case names.
Normalization evidence should name the original and canonical entity names.
Mixed canonical and legacy spellings for the same logical record set should be
rejected unless a reader can prove they are non-conflicting.

This is not a promise to keep runtime aliases. It is a one-way import and
upgrade shape for external artifacts while Formless is still early enough to
avoid schema versions and runtime shims.

Alternative: reject every camelCase artifact. That is simpler and consistent
with early breaking cleanup, but it makes active workspace/archive work harder
to finalize if test fixtures or draft artifacts already contain promoted
camelCase names.

### Builder validates keys and renders labels from words

Builder creation and validation should accept kebab-case entity keys. Existing
saved entity keys stay locked after save. Labels should be generated from words
(`app-install` -> `App install`) without treating hyphens as namespaces or
forcing visible raw keys into ordinary UI copy.

Field, query, view, action, screen, and read-model keys are out of scope for
this change. If a code path assumes entity keys are JavaScript identifiers, the
implementation should update that path to address object keys through string
lookup rather than broadening the naming change.

Alternative: keep Builder-created entities camelCase while source schemas can
use kebab-case. That creates two authoring modes for the same schema language.

### Archives and workspace record source use qualified boundary names

Portable archives, workspace record source, drift reports, logs, and diagnostic
output should include qualified entity names when the output is outside the
declaring schema or combines records from multiple schemas. This lets record
source distinguish `instance:app-install` from app-local entities without
putting `instance:` into the instance schema definition.

The exact workspace record-source file layout belongs to
`browser-workspace-control-plane`, but whatever deterministic format it freezes
should carry enough schema namespace plus local entity key information to
produce the qualified name at boundaries and restore the local entity key inside
Authority validation.

Alternative: rely on file paths alone for namespace and entity identity. That
can work for one source tree but makes archives, logs, drift output, and
diagnostics less self-describing.

## Risks / Trade-offs

- Existing code assumes JS identifiers for entity keys -> update parser,
  generated UI, and helper lookups to treat entity keys as strings.
- Some human-facing output becomes noisier with qualified names -> use qualified
  names only at boundaries and render clean labels in UI.
- `instance` as boundary namespace differs from promoted
  `instance-control-plane` schema key -> document the namespace mapping and keep
  storage identity unchanged.
- Normalizing camelCase artifacts can look like long-term compatibility -> keep
  it one-way, boundary-scoped, and evidence-producing.
- Active OpenSpec changes can conflict on `formless.json` source language ->
  finalization should reconcile source-of-truth wording, with
  `browser-workspace-control-plane` owning the move to record source and this
  change owning entity naming.

## Migration Plan

1. Add parser grammar for schema-local entity keys and qualified entity names.
2. Update runtime-owned instance control-plane schema definitions and tests to
   use kebab-case entity keys.
3. Update Builder validation, generated labels, schema source mode, and saved
   key locking around kebab-case entity keys.
4. Update archive, workspace record-source, drift, logs, and diagnostics to emit
   qualified entity names at boundaries.
5. Add one-way camelCase-to-kebab-case normalizers for supported external
   artifacts only where implementation evidence shows they are needed.
6. Update CLI and generated UI behavior that reads or writes control-plane
   records.
7. Promote shipped facts into `app-schema`, `instance-control-plane`,
   `portable-archives`, `generated-ui`, `site-cli-publish`,
   `installed-apps`, and `runtime-topology`.

Rollback during implementation is a code and spec revert before the workspace
record-source format is frozen. After deterministic workspace source ships,
rollback would require rewriting record-source files back to the old names and
is not preferred.

## Open Questions

- Should the instance control-plane boundary namespace `instance` remain a
  documented alias over runtime schema key `instance-control-plane`, or should a
  later cleanup rename the runtime schema key itself?
- Which existing draft archives or workspace record-source fixtures actually
  need camelCase normalization instead of direct rewrite during implementation?

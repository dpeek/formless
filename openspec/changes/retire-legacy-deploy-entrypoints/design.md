## Context

This change assumes layout-only `formless.json`, browser workspace operations,
unified `instance:route` records, and route-derived desired resources have
landed. Formless therefore has a single reviewable workspace source, a
schema-owned control plane for deploy intent, and generic deployment attempts
for Worker, R2, DNS, custom-domain, and redirect provider resources.

The remaining friction is old deploy vocabulary:

- standalone Site publish still presents Site as a separate deploy product;
- domain-specific apply commands still present custom domains as a separate
  provider mutation path;
- CLI help still exposes advanced instance/domain command families beside the
  top-level workspace path.

The cleanup should remove duplicate entrypoints without weakening explicit
cleanup or credential boundaries.

## Goals / Non-Goals

**Goals:**

- Make `formless deploy` the only normal CLI provider mutation path for
  workspace-controlled deploy intent.
- Remove standalone Site publish from the normal package surface.
- Remove domain-specific apply entrypoints as provider mutation paths.
- Preserve explicit cleanup/delete commands for selected recorded provider
  evidence.
- Preserve Site source seed promotion and legacy Site project import.
- Update CLI help, parser behavior, tests, specs, and docs to describe one
  deploy story.

**Non-Goals:**

- Do not change the control-plane data model.
- Do not add new provider resource kinds.
- Do not remove portable archive export, restore, or import workflows.
- Do not remove `site:pull-seed`.
- Do not remove explicit cleanup when the runtime cannot infer the intended
  provider resource from deploy intent.

## Decisions

### Use workspace deploy as the normal mutation interface

`formless deploy` should read workspace source, control-plane desired resources,
and local secret state, then run the generic deployment path. Worker, R2, DNS,
custom-domain, and redirect resources share the same attempt, evidence, drift,
and status model.

Alternative: keep domain-specific apply commands as aliases. That preserves old
mental models and makes future deploy output harder to explain because users can
still ask whether domains are deployed through domains or deployment.

### Remove standalone Site publish instead of adapting it

Standalone Site publish should not be rewired to generic deployment. Site is now
an installed app in a Formless instance, and deploy intent belongs to the
workspace and control plane.

Alternative: keep `site:publish` as a compatibility wrapper around
`formless deploy`. That keeps a Site-only deploy command in the package surface
and undermines the installed app model.

### Keep cleanup commands separate from deploy

Cleanup/delete commands remain explicit when they target current provider
evidence or manually removed resources. Deploy and destroy can remove resources
that are still owned by selected deploy state. Manual cleanup still needs a
selected host, resource kind, and logical id because it edits evidence after an
out-of-band provider change.

Alternative: force all cleanup through deploy destroy. That would make
out-of-band cleanup and partial provider repair harder and would conflate
desired intent with evidence repair.

### Fail removed command shapes with product-path guidance

Removed legacy commands should fail early with display-safe guidance to use
`formless deploy`, browser workspace operations, `formless archive import-site`,
or explicit cleanup commands as appropriate. They should not silently delegate
provider mutation because silent delegation makes evidence and credential
behavior harder to audit.

Alternative: leave aliases indefinitely. That keeps the interface shallow and
forces tests to preserve names that no longer carry product meaning.

## Risks / Trade-offs

- Removed commands may break local scripts -> Fail with clear guidance and keep
  `formless` top-level commands stable.
- Direct domain troubleshooting may feel less convenient -> Keep non-mutating
  status/drift reads and explicit cleanup/delete commands.
- Site seed and Site deploy can be confused -> Keep `site:pull-seed` wording
  source-only and remove `site:publish` from normal help/scripts.
- Generic deployment gaps could be exposed late -> Gate removal on tests proving
  deploy covers Worker, R2, DNS, custom domains, and redirects from
  control-plane desired resources.
- Cleanup could accidentally delete desired resources -> Keep cleanup selected
  by recorded evidence and separate from route or deploy desired-state writes.

## Migration Plan

1. Remove standalone Site publish script exposure and fail any retained internal
   script entry with guidance to use `formless deploy`.
2. Remove domain-specific apply command mutations and direct fallback adapters.
3. Update CLI help to show top-level workspace deploy, archives, and explicit
   cleanup only.
4. Update tests that previously asserted fallback domain apply or standalone
   Site publish behavior.
5. Update specs and docs so provider mutation is described through deployment
   attempts.

Rollback is to restore the parser entries and script bindings. Control-plane
records, archives, and deploy evidence do not need rollback because this change
deletes entrypoints rather than changing stored data.

## Open Questions

- Should removed domain apply command names be rejected permanently, or should a
  later compatibility change add non-mutating aliases that print current
  deployment status?

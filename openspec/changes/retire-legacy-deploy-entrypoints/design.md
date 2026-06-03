## Context

This change is a follow-up cleanup gate after
`browser-workspace-control-plane`. It assumes layout-only `formless.json`,
browser workspace operations, unified `instance:route` records, and
route-derived desired resources have landed. Formless therefore has a single
reviewable workspace source, a schema-owned control plane for deploy intent,
and generic deployment attempts for Worker, R2, DNS, custom-domain, and
redirect provider resources.

The remaining friction is old deploy vocabulary:

- standalone Site publish still presents Site as a separate deploy product;
- browser local Site publish controls and the local publish broker still expose
  a Site-only publish path;
- domain-specific apply commands still present custom domains as a separate
  provider mutation path;
- browser/client and Worker domain-provider apply jobs still expose custom
  domains as a separate provider mutation path;
- CLI help still exposes advanced instance/domain command families beside the
  top-level workspace path.

The cleanup should remove duplicate entrypoints without weakening explicit
cleanup or credential boundaries.

## Goals / Non-Goals

**Goals:**

- Make `formless deploy` the only normal CLI provider mutation path for
  workspace-controlled deploy intent.
- Remove standalone Site publish from the normal package surface.
- Remove standalone Site project publish wrappers, local Site publish broker
  code, browser local Site publish controls, and client helpers.
- Remove domain-specific apply entrypoints as provider mutation paths.
- Remove browser/client and Worker domain-provider apply-job mutation surfaces.
- Preserve explicit cleanup/delete commands for selected recorded provider
  evidence.
- Preserve Site source seed promotion and legacy Site project import.
- Update CLI help, parser behavior, tests, specs, and docs to describe one
  deploy story.
- Remove retired publish/apply vocabulary from implementation and spec surfaces
  where it no longer names supported behavior.
- Shrink this change if `browser-workspace-control-plane` already removed a
  legacy path; preserve only the remaining command rejection, verification,
  docs, and spec promotion work.

**Non-Goals:**

- Do not change the control-plane data model.
- Do not add new provider resource kinds.
- Do not remove portable archive export, restore, or import workflows.
- Do not remove `site:pull-seed`.
- Do not remove explicit cleanup when the runtime cannot infer the intended
  provider resource from deploy intent.
- Do not remove pure resource planning helpers when generic deployment or
  destroy still imports them.
- Do not edit archived historical change artifacts only to rewrite old
  decisions; clean canonical specs and current implementation surfaces.

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

### Remove local Site publish controls with standalone publish

Browser app settings, local publish client helpers, and the local publish broker
are part of the same legacy Site-only publish path. Keeping them after removing
`site:publish` would leave a working product path whose only difference is that
it is browser-triggered instead of shell-triggered.

Alternative: hide the browser control but keep the broker for internal use. That
keeps dead deploy vocabulary and makes future searches ambiguous because the
old publish flow still has active code and tests.

### Remove domain-provider apply APIs and jobs

Domain provider apply jobs should be retired with the CLI apply commands. The
generic deployment attempt API now owns provider mutation and writeback. Domain
inspection can remain non-mutating, and delete/manual cleanup/forget can remain
explicit because they repair or remove recorded evidence.

Alternative: keep Worker apply jobs as a compatibility API while removing only
CLI entrypoints. That preserves the split mutation boundary and leaves browser
or client code able to bypass the normal deployment path.

### Keep pure resource planners only when reused by generic deploy

The domain provider resource planner may remain if generic deployment, destroy,
or inspection still uses it as a pure projection/planning helper. It should not
define public mutation vocabulary, apply-job response shapes, or fallback CLI
behavior after this change.

Alternative: delete every domain-provider-named module. That risks removing
shared route-to-resource planning needed by generic deployment and cleanup.

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

### Reject removed apply names permanently

Removed domain apply command names should stay rejected as mutation paths.
Non-mutating domain, route, deployment, drift, or evidence inspection can remain
available through supported inspection commands, but removed apply names should
not become status aliases. Reusing retired mutation names for status keeps old
mental models alive and makes it harder to explain that `formless deploy` is
the normal provider mutation boundary.

Alternative: keep removed apply names as non-mutating status aliases. That may
help users who try old commands, but it preserves vocabulary this cleanup is
trying to remove.

## Risks / Trade-offs

- Removed commands may break local scripts -> Fail with clear guidance and keep
  `formless` top-level commands stable.
- Direct domain troubleshooting may feel less convenient -> Keep non-mutating
  status/drift reads and explicit cleanup/delete commands.
- Site seed and Site deploy can be confused -> Keep `site:pull-seed` wording
  source-only and remove `site:publish`, local publish broker, and browser
  publish controls from normal surfaces.
- Removing browser/Worker apply jobs could strand old clients -> Fail retired
  apply requests before provider, Authority, or deployment mutation with
  guidance to use workspace deploy or explicit cleanup.
- Generic deployment gaps could be exposed late -> Gate removal on tests proving
  deploy covers Worker, R2, DNS, custom domains, and redirects from
  control-plane desired resources.
- Cleanup could accidentally delete desired resources -> Keep cleanup selected
  by recorded evidence and separate from route or deploy desired-state writes.

## Migration Plan

1. Verify `browser-workspace-control-plane` or equivalent behavior is shipped
   and generic deploy covers Worker, R2, DNS, custom-domain, and redirect
   desired resources.
2. Inventory legacy deploy entrypoints still present after that change and
   shrink this change to the remaining surface.
3. Remove standalone Site publish script exposure and fail any retained internal
   script entry with guidance to use `formless deploy`.
4. Remove standalone Site project publish wrappers, local publish broker,
   browser local publish controls, and local publish client helpers.
5. Remove domain-specific apply command mutations and direct fallback adapters.
6. Remove browser/client and Worker domain-provider apply-job mutation surfaces.
7. Keep non-mutating route/domain/deployment inspection and explicit provider
   delete/manual cleanup/forget behavior where those still expose unique
   evidence repair.
8. Update CLI help to show top-level workspace deploy, archives, and explicit
   cleanup only.
9. Update tests that previously asserted fallback domain apply or standalone
   Site publish behavior.
10. Update specs and docs so provider mutation is described through deployment
    attempts.

Rollback is to restore the parser entries, script bindings, browser controls,
client helpers, and Worker apply job routes. Control-plane records, archives,
and deploy evidence do not need rollback because this change deletes entrypoints
rather than changing stored data.

## Open Questions

None.

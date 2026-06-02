## Context

`formless deploy` creates a Cloudflare-backed product instance from a local
workspace. It plans Worker, Durable Object namespace, R2 media bucket, runtime
vars, and secrets from `formless.json`, stores provider and secret material under
ignored `.formless/`, verifies deployed metadata, creates an owner setup
capability, then pushes saved archives.

The current command surface can reset only local workspace runtime state. It can
also delete custom-domain provider resources, but it does not tear down the
instance Worker, Durable Object storage, R2 media bucket, or Alchemy state. That
means repeated onboarding tests against one Workers target keep owner/passkey
state and cannot exercise first-owner setup from a clean remote instance.

Currently instance deploy resources and custom-domain provider resources are
driven by separate Alchemy app names. The target design makes the instance
Alchemy app/stage the owner of the whole Cloudflare provider graph for that
instance. The default Alchemy Cloudflare token covers Worker, R2, Durable
Object, custom-domain, DNS, and redirect permissions, so one app-level destroy
can clean up the full deployed instance.

## Goals / Non-Goals

**Goals:**

- Add an explicit, confirmation-gated command that destroys the Cloudflare
  instance resources selected by a workspace target.
- Destroy custom-domain, DNS, and redirect provider resources as part of the
  same instance provider graph.
- Put instance deploy and domain provider resources under the same Alchemy
  app/stage/state root.
- Preserve reviewable workspace source so the same directory can be redeployed
  after destroy.
- Keep provider credentials and admin tokens in ignored state only.
- Make destroy idempotent enough for test loops: missing provider resources are
  reported as already absent when Alchemy or Cloudflare exposes that state.
- Support both the top-level local-first command and the advanced
  `formless instance` command family.

**Non-Goals:**

- Do not archive the OpenSpec change or merge review branches.
- Do not reset or delete local archives, app source, media source, or
  `formless.json`.
- Do not add browser UI for provider teardown.
- Do not remove existing explicit domain cleanup commands; they remain useful
  for targeted domain changes.

## Decisions

### Use `formless destroy` plus `formless instance destroy`

Top-level `formless destroy` matches local-first onboarding and selects the
nearest `formless.json`, like `formless deploy`. `formless instance destroy`
keeps parity for advanced workspaces with configured remote targets.

Alternative: add `formless deploy destroy`. That keeps deploy lifecycle under
one command but preserves a removed standalone `deploy setup` style that the
local-first flow intentionally moved away from.

### Require `--confirm <workerName>`

Destroy is provider-destructive and removes remote data. The CLI should require
the selected deployment's Worker name as the confirmation token. The value is
already display-safe in `formless.json` and in CLI deploy output.

Alternative: require `--force`. That is shorter but does not prove the user is
looking at the intended target.

### Reuse the deploy plan and Alchemy app state

The command should derive the same deployment plan used by deploy, then run the
same Alchemy app/stage with `phase: "destroy"` and the deploy state root under
`.formless/deploy/<workerName>`. This lets Alchemy destroy the resources it
owns and clear its provider state consistently with the existing deploy adapter.

Alternative: call Cloudflare REST APIs directly. That creates a second provider
ownership path and risks deleting resources that Alchemy still believes it owns.

### Own domain resources in the instance Alchemy app

Domain provider apply should stop creating a separate `formless-domain-*`
Alchemy app for resources that belong to a Formless instance. Instead, domain
resources declared for an instance target should be materialized in the same
Alchemy app, stage, and state root as Worker, Durable Object, and R2 resources.
The default Alchemy Cloudflare token is the credential boundary for this full
provider graph.

Alternative: keep separate Alchemy apps and make destroy orchestrate both. That
keeps the current split but makes teardown depend on cross-app coordination,
duplicated state lookup, and partial-failure handling that Alchemy can already
avoid when the graph is owned by one app.

### Preserve reviewable source and invalidate ignored deploy state

After provider destroy succeeds, reviewable source stays unchanged. Ignored
deploy state should either be removed or marked destroyed so later status output
does not imply the target is still deployed. The automation admin token may
remain in `.formless/instance.env` because it is ignored and useful only if the
same target is redeployed; it is not written to source.

Alternative: remove `targets` and `deploy` from `formless.json`. That would make
the workspace look undeployed, but it would also discard display-safe target
intent that is useful for redeploying the same test instance.

## Risks / Trade-offs

- Destroy may fail after deleting some resources -> report the exact failed
  phase and leave ignored deploy state present so retry can continue against the
  same Alchemy state.
- Alchemy state may be missing but Cloudflare resources remain -> fail with a
  message that the workspace deploy state is required, rather than guessing from
  names.
- Cloudflare may report already-missing resources -> treat already-missing as a
  successful no-op when the provider library exposes that result.
- `formless.json` still contains a target after destroy -> CLI status should
  make target reachability clear, and redeploy remains convenient.
- Existing deployments may have domain resources recorded under the old
  separate domain Alchemy app -> keep existing explicit domain delete commands
  for those legacy domain resources and make new domain apply use the unified
  instance app.

## Migration Plan

Existing workspaces do not need manifest changes. Workspaces that were deployed
before ignored deploy state was written may need a fresh `formless deploy` or
manual cleanup because destroy depends on the `.formless/deploy/<workerName>`
Alchemy state root.

Domain resources created after this change use the instance Alchemy app and are
destroyed by `formless destroy`. Domain resources created before this change
under the separate domain-provider app can still be removed through existing
domain cleanup commands before or after instance destroy.

Rollback is to leave the new command unused. Destroy does not change archive
format or runtime APIs.

## Open Questions

None.

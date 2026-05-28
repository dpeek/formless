## Context

Formless has an instance runtime that owns user-configured intent such as domain
routes, redirects, app installs, site settings, and future infrastructure
resources. Today the deployment path is domain-specific:

- desired exact-host mappings live in instance metadata;
- redirect intent lives in the domain provider API;
- the server returns a Cloudflare-focused provider plan;
- the CLI or Node runner uses Alchemy to apply resources;
- successful applies write provider evidence back through domain-specific
  endpoints.

This has the right operational shape but the wrong abstraction. The runtime
needs a generic deployment protocol before buckets, queues, scheduled jobs,
wildcard ingress, app-specific resources, or CI/server-side deployers can fit
without copying the domain-provider model.

## Goals / Non-Goals

**Goals:**

- Introduce immutable desired deployment state versions with stable hashes.
- Introduce deployment targets, actors, attempts, leases, results, evidence
  summaries, and status derivation.
- Project existing domain mappings and redirect intent into the first generic
  resource graph.
- Keep existing custom-domain command and API surfaces compatible during the
  migration.
- Keep provider credentials and Alchemy state out of browser clients, portable
  archives, workspace manifests, and desired-state responses.
- Keep Alchemy as the provider resource-state and transition engine.

**Non-Goals:**

- No wildcard ingress in this change.
- No provider resources beyond current domain custom domains, redirect rules,
  and redirect placeholder DNS records.
- No removal of direct Cloudflare fallback commands.
- No server-side deploy node or CI product UX.
- No full provider-state mirror inside Formless.
- No change to app/archive data movement semantics.

## Decisions

### Desired state is versioned runtime output

Add a deployment desired-state projection owned by the instance runtime. Each
version is immutable and contains:

- `targetId`;
- monotonic `revision`;
- stable `hash`;
- creation time;
- source intent revision/fingerprint;
- resource graph;
- display summary.

The hash is computed from canonical desired-state content, not timestamps or
attempt data.

Alternative: let deployers build desired state by calling several existing APIs.
That keeps the runtime simpler, but makes exact-version apply impossible and
forces every deployer to duplicate projection logic.

### Resource graphs are provider-facing but not provider-owned truth

The resource graph is the deployment-facing form of user intent. It uses stable
logical ids and provider resource kinds, but it is not the provider state store.
For the first slice, it can contain only the current domain-provider resources:

- Cloudflare Worker Custom Domain for exact-host route mappings;
- Cloudflare Redirect Rule for redirect intent;
- Cloudflare DNS records for originless redirect placeholders.

Alternative: keep using the existing domain provider plan as the only graph.
That avoids a new model, but keeps domains as the root deployment abstraction.

### Attempts bind to exact desired-state versions

Every plan/apply attempt records the desired-state version id and hash it was
started from. Success for an older version remains historical evidence and does
not mark the latest desired state deployed.

Alternative: record only latest status. That is easier to display, but loses
the distinction between "failed current change" and "old failure after the user
made a new change".

### Leases serialize mutating apply per target

Apply attempts acquire a target-scoped lease with a token and expiry. Completion
for a mutating attempt must include the matching lease token. Heartbeats extend
the lease while a runner is active.

Alternative: keep the current domain apply lock. That works for one resource
family, but it cannot coordinate future resource types under one deployment
target.

### Formless stores summaries, not provider truth

Formless stores attempt history, plan/result summaries, routing-critical
evidence, Alchemy app/stage/scope pointers, provider resource ids needed for
audit/cleanup, errors, and drift summaries. It does not store Alchemy's resource
state store or full provider resource JSON as canonical truth.

Alchemy remains responsible for provider reads, diffs, applies, destroys, and
resource-state persistence.

Alternative: mirror provider resources in Formless. That makes UI reads richer
without a runner, but creates two sources of truth and makes drift harder to
reason about.

### Domain provider APIs become compatibility surfaces

Existing domain provider endpoints and CLI commands stay available. Internally,
domain apply/delete jobs can create or reference generic deployment attempts.
This lets current users keep their workflow while implementation moves toward a
generic protocol.

Alternative: replace domain provider APIs immediately. That would simplify new
code, but it is too much user-visible churn for the first OpenSpec change.

### Direct fallback retirement is a later change

The direct Cloudflare plan/apply path stays unchanged in this change. The
generic deployment protocol should be proven through the remote runner path
first, then a later change can remove the duplicate fallback.

Alternative: remove fallback now. That reduces duplication quickly, but removes
the current escape hatch before the new runner protocol has evidence.

## Risks / Trade-offs

- Extra model layer can feel abstract before non-domain resources exist ->
  mitigate by projecting only current domain resources in the first slice.
- Desired-state hashes can churn if canonicalization is weak -> mitigate with
  deterministic ordering tests and fixed JSON/hash fixtures.
- Lease expiry can strand or double-run attempts -> mitigate with explicit
  heartbeat, expiry, and idempotency tests.
- Compatibility bridge can duplicate status -> mitigate by deriving domain job
  summaries from deployment attempts where possible.
- Storing too much evidence can recreate provider-state duplication -> mitigate
  with narrow evidence types and explicit "summary, not source of truth" tests.
- Storing too little evidence can weaken UX and cleanup -> mitigate by keeping
  provider ids, logical ids, action, timestamps, runner id, zone/account facts,
  and user-facing errors.

## Migration Plan

1. Add shared deployment runtime models and deterministic desired-state hashing.
2. Add instance-authority storage tables for desired-state versions, attempts,
   leases, result summaries, evidence summaries, and drift reports.
3. Add deployment runtime API handlers under `/api/formless/deployments`.
4. Project current domain mappings and redirect intent into a deployment
   resource graph.
5. Bridge domain provider apply/delete job creation and completion to generic
   deployment attempts while preserving existing endpoint responses.
6. Update CLI target helpers and output to display desired-state version,
   attempt id, and writeback status when the target exposes deployment runtime
   status.
7. Keep direct fallback commands unchanged.
8. Run `devstate check`; run browser smoke only if visible app behavior changes.

Rollback is compatibility-preserving: the old domain provider API surface stays
available, so a bad deployment-runtime implementation can be disabled or ignored
without removing domain mapping state.

## Open Questions

- Whether deployment desired-state versions are materialized on every intent
  write or generated lazily on first read.
- Exact lease TTL and heartbeat interval.
- Whether failed plan-only attempts should acquire a lease or remain lease-free.
- How much Alchemy plan output can be stored without implying Formless owns the
  canonical provider diff.

## Why

Formless deployment state is currently domain-shaped: the runtime stores desired
domain mappings, a domain provider planner builds Cloudflare resources, and
runner writeback records provider evidence through domain-specific APIs. This
couples deployment orchestration to custom domains and duplicates resource-state
concerns that Alchemy should own.

This change establishes a generic deployment runtime contract so Formless can
version user intent, let CLI/CI/future deploy nodes apply that intent through
Alchemy, and record exact-version deployment attempts without making domains the
deployment model.

## What Changes

- Add a deployment runtime capability with immutable desired-state versions,
  stable desired-state hashes, resource graphs, deployment targets, deployment
  actors, attempts, leases, results, evidence summaries, and drift reports.
- Project current domain mappings and redirect intent into the first generic
  deployment desired-state graph.
- Store deployment attempt history, last successful desired-state version, last
  failed attempt, and display-friendly status in the Formless runtime.
- Keep Alchemy as the provider resource-state and transition engine; Formless
  stores Alchemy scope/pointers and audit/UX evidence summaries, not full
  provider truth.
- Add generic deployment APIs for fetching desired state, starting attempts,
  heartbeats, plan writeback, success writeback, failure writeback, and latest
  status.
- Bridge existing domain provider apply/delete jobs to deployment attempts so
  existing custom-domain commands and UI remain compatible during migration.
- Keep direct Cloudflare fallback apply unchanged in this first change; its
  retirement belongs to a later change after the generic runner path is proven.
- Defer wildcard ingress, non-domain resource types, new CI UX, and server-side
  deploy nodes to follow-up changes.

## Capabilities

### New Capabilities

- `deployment-runtime`: Versioned desired deployment state, deployment targets,
  leases, attempts, writeback, status derivation, Alchemy boundary, evidence
  summaries, and drift reports.

### Modified Capabilities

- `custom-domains`: Existing exact-host mappings, redirect intent, and provider
  jobs become a compatibility source and compatibility surface for the generic
  deployment runtime.
- `site-cli-publish`: Existing instance domain remote-runner CLI commands keep
  their command surface while using or reporting the generic deployment attempt
  protocol when the target supports it.

## Impact

- Adds deployment runtime shared models, server state, API handlers, client
  helpers, and tests.
- Affects current domain provider API/server code, domain provider runner
  writeback, instance target client helpers, and CLI command output.
- Affects instance shell status data only enough to show generic deployment
  status behind existing custom-domain surfaces.
- Does not introduce provider credentials into browser clients, portable
  archives, workspace manifests, or desired-state responses.
- Does not require provider mutation in tests; Alchemy/provider behavior is
  covered with deterministic fakes.

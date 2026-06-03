## Why

The local workspace gateway currently blurs the Worker runtime boundary with
filesystem and provider operations. Workers cannot own that behavior because
they are sandboxed and cannot access the local workspace filesystem.

## What Changes

- Split the workspace gateway into a filesystem-capable local sidecar process
  and a Worker-facing local proxy route.
- Keep the browser-facing workspace gateway API family stable for local
  workspaces.
- Require local gateway sidecar configuration before Worker runtime routes can
  expose browser workspace operations.
- Forbid Worker code from importing or executing workspace filesystem,
  shell/tool, Alchemy profile, or local provider credential adapters.
- Move local operation execution, operation-state persistence, credential
  setup, deploy plan, and deploy apply behavior behind the sidecar HTTP API.
- Keep deployed instance, app, site-authoring, and published Site profiles from
  exposing gateway routes or sidecar configuration.
- Add tests and checks that prove the Worker bundle has no gateway
  implementation imports and that local browser operations travel through the
  sidecar boundary.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-workspace-gateway`: Define the gateway as a local sidecar process and
  specify its HTTP contract, operation ownership, and secret/filesystem
  boundary.
- `runtime-topology`: Clarify that Worker runtime gateway routes are proxy
  routes only and are eligible only when a local sidecar target is configured.
- `generated-ui`: Show local workspace operation controls only when the browser
  can reach the local gateway through the runtime proxy.
- `deployment-runtime`: Clarify that browser-triggered deploy plan/apply
  provider mutation runs in the trusted local gateway sidecar, not in Worker
  code.

## Impact

- Affected code: `vite.config.ts`, `src/client/workspace-gateway.ts`,
  `src/app/routes/instance-shell.tsx`, `src/worker/routing.ts`, Worker request
  routing, `src/site/local-workspace-gateway.ts`,
  `src/site/instance-workspace-operations.ts`, local dev startup, CLI dev env
  helpers, gateway tests, Worker routing tests, generated UI tests, and
  dependency-boundary tests.
- Affected APIs: browser-local `/api/formless/workspace/*` remains the local
  browser API family; sidecar-only HTTP routes and internal authorization are
  added or made explicit.
- Affected systems: local `formless dev` process topology, Vite dev middleware,
  Cloudflare Worker runtime bundle boundaries, local workspace operation state,
  credential setup, and deploy plan/apply execution.

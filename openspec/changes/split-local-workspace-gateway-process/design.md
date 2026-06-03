## Context

The browser workspace controls call `/api/formless/workspace/*` through
`src/client/workspace-gateway.ts` and render status in
`src/app/routes/instance-shell.tsx`. The current local gateway handler lives in
`src/site/local-workspace-gateway.ts` and runs filesystem, Alchemy credential,
operation-state, and deployment work through `src/site` workspace operation
helpers.

That behavior cannot be owned by `src/worker`. Cloudflare Workers can proxy
HTTP requests and access Worker bindings, but they cannot read or write the
developer's local workspace filesystem or run local tool adapters. The current
spec language says "local workspace runtime with filesystem adapters
configured"; that is not explicit enough to prevent Worker-owned gateway
implementation.

Current local dev startup already has a process owner:
`runFormlessInstanceWorkspaceDev` in `src/site/instance-workspace.ts` spawns the
local runtime command, waits for it, and writes local dev state. That command is
the right owner for starting and stopping a gateway sidecar.

Target topology:

```text
browser
  |
  | same-origin /api/formless/workspace/*
  v
local Worker runtime
  | route policy, owner/bootstrap/CSRF checks, HTTP proxy only
  | loopback URL + internal proxy token from process env
  v
local workspace gateway sidecar
  | filesystem, operation state, credentials, deploy plan/apply
  v
workspace root + provider adapters
```

## Goals / Non-Goals

**Goals:**

- Keep the browser-facing local gateway API family stable.
- Move filesystem, shell/tool, credential setup, and provider mutation behavior
  into a local Node HTTP sidecar process.
- Make Worker gateway routes local proxy routes only.
- Start and stop the sidecar as part of `formless dev`.
- Preserve bootstrap, owner-session, CSRF, operation allowlist, and
  display-safe response boundaries.
- Prove with tests that Worker code does not import local gateway
  implementation modules or Node filesystem APIs.

**Non-Goals:**

- Do not change the flat app/control-plane schema model.
- Do not add new workspace operation kinds.
- Do not change deployed instance, app, site-authoring, or published Site route
  behavior except to keep gateway routes unavailable.
- Do not make the sidecar reachable from deployed runtimes.
- Do not rewrite deployment runtime state or provider resource planning beyond
  the gateway process boundary.

## Decisions

### Start a loopback sidecar from `formless dev`

`runFormlessInstanceWorkspaceDev` should start a local HTTP sidecar before or
alongside the spawned runtime command, then stop it when the dev child exits.
The sidecar receives the workspace root, ignored local state paths,
process-scoped bootstrap/CSRF material, credential environment, and operation
dependencies.

The sidecar server should use Node's `node:http` server APIs. The repo already
uses Node HTTP request/response conversion for local gateway middleware, and
the CLI dev owner already manages Node child-process lifecycle. Using Node HTTP
keeps the server implementation aligned with the current local runtime code.

Alternative: keep Vite middleware as the gateway owner. That still places
filesystem behavior in the runtime server process and does not create the
explicit HTTP boundary the Worker needs.

Alternative: start the sidecar manually as a second user command. That makes
browser onboarding fragile and splits one local workspace session across two
manual lifecycles.

### Pass only proxy configuration into Worker env

The Worker runtime should receive a loopback gateway origin and internal proxy
token through `FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL` and
`FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN`. It should not receive
`FORMLESS_WORKSPACE_GATEWAY_ROOT`, filesystem paths, or any adapter that can
mutate local source.

`FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL` is Worker-private process
configuration for the loopback sidecar base URL. It must not be exposed through
`VITE_*` config or rendered in browser state. `FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN`
is the process-scoped shared secret the Worker uses when proxying to the
sidecar and the sidecar validates before accepting proxied browser requests.

Browser code should continue to receive only same-origin API configuration such
as `VITE_FORMLESS_WORKSPACE_GATEWAY_API` and
`VITE_FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN` before owner setup.

Alternative: expose the sidecar URL directly to the browser. That would create
cross-origin/CORS complexity and bypass the runtime owner-session boundary.

### Keep browser authorization in Worker, require internal auth at sidecar

The Worker proxy should validate local route policy, same-origin browser
requests, bootstrap capability limits, owner session, CSRF proof, and operation
allowlist before proxying browser traffic. It then forwards an internal
gateway request with a process-scoped proxy token and display-safe actor facts.

The sidecar should require the internal proxy token for proxied browser
requests. It may also accept non-browser automation requests through the admin
bearer boundary when explicitly configured. Direct browser requests to the
sidecar without the internal token are refused before filesystem or provider
work.

Alternative: perform all auth in the sidecar. That requires the sidecar to
understand Worker owner state and makes it easier for a direct sidecar request
to bypass runtime route policy.

### Split protocol from implementation

Route constants, browser response types, operation input types, allowlists, and
redaction helpers should live in Worker-safe shared modules. The Worker proxy
may import only those shared protocol modules. Sidecar implementation stays in
`src/site` or another Node-only package slice.

Alternative: make Worker import the current `src/site/local-workspace-gateway.ts`
for constants or parsing. That preserves the import path that caused the
boundary problem.

### Preserve operation state under ignored local workspace state

Operation state remains sidecar-owned and persists under ignored workspace
state. The Worker proxy does not store operation state; reads for
`/operations/:id` are proxied to the sidecar after route and authorization
checks.

Alternative: mirror operation state in Worker storage. That introduces a second
state owner for local-only operations and makes refresh/retry behavior harder
to reason about.

## Risks / Trade-offs

- Sidecar process fails to start -> `formless dev` should fail early or render
  gateway unavailable with display-safe diagnostics before browser controls are
  shown.
- Proxy auth drift between Worker and sidecar -> keep shared protocol tests for
  operation kind parsing and authorization intent classification.
- Loopback URL exposure in logs or browser state -> never expose the sidecar URL
  to browser config; only expose the same-origin API base path.
- Long-running operations continue after runtime exit -> dev command shutdown
  should close the sidecar and mark active operation state as failed or
  interrupted.
- Worker accidentally imports Node-only modules again -> add an import-boundary
  test over `src/worker` and gateway modules.

## Migration Plan

1. Extract Worker-safe gateway protocol constants and types from
   `src/site/local-workspace-gateway.ts`.
2. Add the sidecar HTTP server and internal proxy authorization.
3. Add Worker proxy routing and route-policy behavior.
4. Update local dev env construction to start the sidecar and pass proxy env to
   the Worker runtime.
5. Remove Vite middleware ownership of gateway execution or reduce it to
   proxying only.
6. Update browser/UI tests to assert gateway availability through proxy status.
7. Add boundary tests and run `devstate check`.

Rollback is local-only: remove sidecar proxy env from dev startup and the
gateway controls become unavailable. Deployed runtimes remain unaffected
because they do not receive sidecar configuration.

## Open Questions

None.

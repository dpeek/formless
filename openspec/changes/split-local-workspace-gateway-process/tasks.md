## 0. Boundary Inventory

- [x] 0.1 Inventory current gateway imports, route handling, Vite middleware, local dev env, and browser config that mention workspace gateway behavior.
- [x] 0.2 Confirm no deployed Worker route currently exposes workspace gateway execution, and record the current failing boundary as implementation evidence.
- [x] 0.3 Identify the minimal Worker-safe gateway protocol surface needed by browser helpers, Worker proxy, and sidecar implementation.

Evidence 2026-06-03 gorp:

- Current executor ownership: `vite.config.ts` registers `formless-local-workspace-gateway`, dynamically loads `/src/site/local-workspace-gateway.ts`, and installs `createLocalWorkspaceGatewayMiddleware()` in Vite dev middleware.
- Current gateway implementation: `src/site/local-workspace-gateway.ts` owns `/api/formless/workspace`, `/status`, `/operations`, and `/operations/:id`; reads `FORMLESS_LOCAL_WORKSPACE_GATEWAY`, `FORMLESS_WORKSPACE_GATEWAY_ROOT`, bootstrap, CSRF, owner-session, and admin bearer env; validates same-origin, bootstrap limits, operation ids, operation input, forbidden path/shell/secret-looking input; directly runs `runFormlessWorkspaceOperation`, operation-state reads/writes, Cloudflare credential setup, and Alchemy account discovery.
- Current local operation modules: `src/site/instance-workspace-operations.ts` imports Node `fs`, `path`, and workspace helpers; persists `.formless/operations`; runs init, status, save, check, pull, push, deploy plan, and deploy apply; redacts operation output.
- Current local dev env: `src/site/instance-workspace.ts` `formlessInstanceWorkspaceDevEnv()` sets `FORMLESS_LOCAL_WORKSPACE_GATEWAY=1`, `FORMLESS_WORKSPACE_GATEWAY_ROOT`, bootstrap and CSRF env, `FORMLESS_WRANGLER_PERSIST`, `VITE_FORMLESS_WORKSPACE_GATEWAY_API=/api/formless/workspace`, and `VITE_FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN`.
- Current browser surface: `src/client/workspace-gateway.ts` defines the browser operation and response types, reads only the same-origin API base path plus bootstrap token from Vite env, calls `GET /status`, `POST /operations`, and `GET /operations/:id`, retries after bootstrap expiry, and sends CSRF proof for owner-session mutations. `src/app/routes/instance-shell.tsx` renders local workspace controls only when that browser config/status is available, with controls for init, save, check, pull, push, credential setup, deploy plan, and deploy apply.
- Current Worker boundary: `src/worker/routing.ts` exposes a `workspaceGatewayApiRoutes` policy field but `workerRuntimeRoutePolicyFromKind()` returns `false` for every profile; `src/worker/routing.test.ts` asserts false for instance, dev, app, site-authoring, and published Site profiles. `src/worker/index.ts` has no `/api/formless/workspace/*` handler before normal API routing and final 404.
- Import search evidence: `rg "local-workspace-gateway|instance-workspace-operations|instance-workspace-credential-setup|FORMLESS_WORKSPACE_GATEWAY|/api/formless/workspace" src/worker` found no Worker gateway implementation import or route handler; only routing policy/test mentions of `workspaceGatewayApiRoutes`.
- Current failing boundary for this change: local browser gateway execution succeeds only through Vite's Node middleware path, while deployed Worker/runtime source has no route that can execute or proxy `/api/formless/workspace/*`; deployed, mapped-host, and non-local profiles therefore cannot expose workspace gateway execution today.
- Minimal Worker-safe protocol surface for the next section: shared route constants/path parsing for prefix, status, operations, and operation reads; bootstrap and CSRF header/cookie names; browser response/display-safe operation state types; operation kind allowlist; start-input union for init, status, save, check, pull, push, credential setup, deploy plan, and deploy apply; operation-id pattern/parsing; bootstrap-limited operation classification (`status`, `init`, and reads of those operations only); mutating-operation classification for all operation starts except `status`; display-safe actor facts; and input validation helpers for supported provider, migration policy, forbidden keys, path traversal, shell text, and secret-looking values. This protocol surface must not import Node filesystem/path/process APIs, workspace operation execution, credential setup adapters, Alchemy/provider adapters, workspace roots, or local secret env.

## 1. Gateway Protocol And Boundary Tests

- [x] 1.1 Extract workspace gateway route constants, browser response types, operation input types, and operation-intent classification into Worker-safe shared modules.
- [x] 1.2 Update browser gateway helpers and local gateway implementation imports to use the shared protocol surface.
- [x] 1.3 Add an import-boundary test proving `src/worker` does not import local gateway sidecar implementation, workspace filesystem operation modules, local credential setup adapters, or Node filesystem/path/process APIs for gateway execution.
- [x] 1.4 Add protocol tests for gateway operation allowlists, operation id parsing, bootstrap-limited operations, and mutating operation classification.

Evidence 2026-06-03 gorp:

- Added `src/shared/workspace-gateway-protocol.ts` as the Worker-safe gateway protocol surface: route/header/cookie/env constants, display-safe operation response types, start-input union, operation kind allowlist, operation id/path parsing, start/read/status intent classification, and input validation helpers for provider, migration policy, forbidden keys, path traversal, shell text, and secret-looking values.
- Updated `src/client/workspace-gateway.ts` to re-export shared browser protocol types and use shared route/intent helpers; updated `src/site/local-workspace-gateway.ts` to import shared constants, input parsing, operation id parsing, and authorization intent classification while leaving local execution dependencies in `src/site`.
- Added `src/worker/workspace-gateway-boundary.test.ts` to scan production `src/worker` TypeScript and reject imports of local gateway/instance-workspace sidecar modules plus Node filesystem/path/process APIs for gateway execution.
- Added `src/shared/workspace-gateway-protocol.test.ts` covering operation allowlists, start input validation, operation id and read-path parsing, bootstrap-limited operations, and mutating start-operation classification.
- Check evidence: `devstate check` passed at 2026-06-03T02:03:15.715Z with `vp check --fix` green and watch tests green.

## 2. Local Sidecar Gateway

- [x] 2.1 Add a Node HTTP sidecar server for workspace gateway requests with loopback binding, generated endpoint, generated internal proxy token, and close lifecycle.
- [x] 2.2 Refactor `src/site/local-workspace-gateway.ts` so filesystem, operation state, credential setup, deploy plan, and deploy apply execution are sidecar-owned.
- [x] 2.3 Require internal proxy authorization for proxied browser requests before sidecar filesystem, Authority, Cloudflare, Alchemy, or provider mutation begins.
- [x] 2.4 Preserve direct non-browser automation authorization through the admin bearer boundary where explicitly configured.
- [x] 2.5 Add sidecar tests for unavailable root, internal token rejection, admin bearer automation, display-safe responses, operation progress persistence, and secret redaction.

Evidence 2026-06-03 gorp:

- Added sidecar proxy env/header constants in `src/shared/workspace-gateway-protocol.ts` for sidecar URL, proxy token, internal proxy authorization, actor facts, authorization source, and operation kind intent.
- Added `startLocalWorkspaceGatewaySidecar()` in `src/site/local-workspace-gateway.ts`; it binds a Node HTTP server to `127.0.0.1`, generates a process-scoped proxy token, returns a loopback endpoint, and exposes an async close lifecycle.
- Refactored `handleLocalWorkspaceGatewayRequest()` into proxy behavior: it keeps same-origin/bootstrap/owner-session/CSRF/admin-bearer authorization, strips browser credentials, forwards only internal proxy authorization plus display-safe actor/intent facts to the sidecar, and preserves the browser response shape including CSRF token handoff.
- Added `handleLocalWorkspaceGatewaySidecarRequest()` execution ownership for status, operation starts, operation reads, credential setup, deploy plan, and deploy apply; direct sidecar execution requires the internal proxy token or a configured non-browser admin bearer before local workspace execution begins.
- Updated `src/site/local-workspace-gateway.test.ts` so browser-facing gateway tests exercise runtime proxy to sidecar execution, plus new sidecar coverage for unavailable root, invalid internal token rejection before credential setup, direct admin automation, close lifecycle, operation-state read persistence, and secret redaction.
- Check evidence: `devstate check` passed at 2026-06-03T02:15:12.432Z with `vp check --fix` green and watch tests green.
- Browser smoke evidence: `bun browser --ignore-https-errors open https://gorp.formless.local` and `bun browser snapshot -i --compact --depth 2` succeeded; the snapshot rendered the Instance shell with app, route, provider, and deployment regions.

## 3. Worker Gateway Proxy

- [x] 3.1 Add Worker env/config parsing for `FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL` and `FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN` without passing workspace root or filesystem adapter values into Worker-visible config.
- [x] 3.2 Add Worker route handling for `/api/formless/workspace/*` that is eligible only for local instance/dev profiles with sidecar proxy config.
- [x] 3.3 Implement same-origin, bootstrap, owner-session, CSRF, operation-intent, and operation-id checks in the Worker proxy before forwarding browser requests.
- [x] 3.4 Proxy authorized requests to the sidecar over HTTP with internal proxy authorization and display-safe actor facts.
- [x] 3.5 Add Worker routing/proxy tests proving deployed, mapped-host, cross-origin, unauthenticated, and missing-sidecar requests fail before sidecar or provider mutation.

Evidence 2026-06-03 gorp:

- Added `src/worker/workspace-gateway-proxy.ts` as the Worker-owned proxy boundary for `/api/formless/workspace/*`; it parses only sidecar URL/token plus browser authorization env, requires local instance/dev route eligibility and sidecar config, blocks mapped hosts, validates same-origin/bootstrap/owner-session/CSRF/start intent/read intent/operation ids before forwarding, and strips browser credentials before adding internal proxy authorization and display-safe actor facts.
- Updated `src/worker/index.ts` to route workspace gateway API requests through the Worker proxy before generic API routing, and updated `src/worker/routing.ts` so only instance/dev profiles are gateway-route eligible.
- Updated `vite.config.ts` Worker var forwarding for existing Worker auth secrets plus workspace gateway bootstrap token, CSRF token, sidecar URL, and proxy token; workspace root and filesystem adapter values remain absent from Worker-visible config.
- Updated `src/client/workspace-gateway.ts` to include the already-known operation kind on operation read requests so the Worker can validate bootstrap read intent before proxying.
- Added `src/worker/workspace-gateway-proxy.test.ts` coverage for config parsing, deployed profile rejection, mapped-host rejection, missing-sidecar rejection, cross-origin rejection, unauthenticated rejection, invalid operation id rejection, owner-session proxy forwarding, bootstrap operation limits, bootstrap read intent checks, and admin bearer automation forwarding.
- Check evidence: `devstate check` passed at 2026-06-03T02:26:11.484Z with `vp check --fix` green and watch tests green.
- Browser smoke evidence: `bun browser --ignore-https-errors open https://gorp.formless.local` and `bun browser snapshot -i --compact --depth 2` succeeded; the snapshot rendered the Instance shell with app, route, provider, and deployment regions.

## 4. Local Dev Startup

- [ ] 4.1 Update `formless dev` workspace startup to start the sidecar, pass only sidecar proxy env to the local runtime, and stop the sidecar when the runtime child exits.
- [ ] 4.2 Update workspace dev env construction so browser config keeps the same-origin gateway API base path while `FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL` and `FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN` stay out of browser-visible env.
- [ ] 4.3 Remove Vite middleware ownership of gateway execution or reduce it to proxy-only behavior consistent with the sidecar boundary.
- [ ] 4.4 Add local dev startup tests proving gateway controls become available only when the sidecar starts and become unavailable when sidecar config is absent.

## 5. Browser, Credential, And Deploy Coverage

- [ ] 5.1 Update generated instance shell tests for gateway proxy status, unavailable state, operation polling, CSRF cookie/header behavior, and external authorization prompts.
- [ ] 5.2 Prove Cloudflare credential setup runs through the sidecar and does not expose provider tokens, Alchemy passwords, local secret values, sidecar URL, or internal proxy token to browser state.
- [ ] 5.3 Prove deploy plan/apply operations run through the sidecar, preserve exact desired-state version/hash checks, and keep provider mutation out of Worker code.
- [ ] 5.4 Prove operation status reads are proxied to sidecar operation state and do not create schema-owned deployment execution records.

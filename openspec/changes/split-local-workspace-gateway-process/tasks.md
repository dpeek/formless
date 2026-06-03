## 0. Boundary Inventory

- [ ] 0.1 Inventory current gateway imports, route handling, Vite middleware, local dev env, and browser config that mention workspace gateway behavior.
- [ ] 0.2 Confirm no deployed Worker route currently exposes workspace gateway execution, and record the current failing boundary as implementation evidence.
- [ ] 0.3 Identify the minimal Worker-safe gateway protocol surface needed by browser helpers, Worker proxy, and sidecar implementation.

## 1. Gateway Protocol And Boundary Tests

- [ ] 1.1 Extract workspace gateway route constants, browser response types, operation input types, and operation-intent classification into Worker-safe shared modules.
- [ ] 1.2 Update browser gateway helpers and local gateway implementation imports to use the shared protocol surface.
- [ ] 1.3 Add an import-boundary test proving `src/worker` does not import local gateway sidecar implementation, workspace filesystem operation modules, local credential setup adapters, or Node filesystem/path/process APIs for gateway execution.
- [ ] 1.4 Add protocol tests for gateway operation allowlists, operation id parsing, bootstrap-limited operations, and mutating operation classification.

## 2. Local Sidecar Gateway

- [ ] 2.1 Add a Node HTTP sidecar server for workspace gateway requests with loopback binding, generated endpoint, generated internal proxy token, and close lifecycle.
- [ ] 2.2 Refactor `src/site/local-workspace-gateway.ts` so filesystem, operation state, credential setup, deploy plan, and deploy apply execution are sidecar-owned.
- [ ] 2.3 Require internal proxy authorization for proxied browser requests before sidecar filesystem, Authority, Cloudflare, Alchemy, or provider mutation begins.
- [ ] 2.4 Preserve direct non-browser automation authorization through the admin bearer boundary where explicitly configured.
- [ ] 2.5 Add sidecar tests for unavailable root, internal token rejection, admin bearer automation, display-safe responses, operation progress persistence, and secret redaction.

## 3. Worker Gateway Proxy

- [ ] 3.1 Add Worker env/config parsing for `FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL` and `FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN` without passing workspace root or filesystem adapter values into Worker-visible config.
- [ ] 3.2 Add Worker route handling for `/api/formless/workspace/*` that is eligible only for local instance/dev profiles with sidecar proxy config.
- [ ] 3.3 Implement same-origin, bootstrap, owner-session, CSRF, operation-intent, and operation-id checks in the Worker proxy before forwarding browser requests.
- [ ] 3.4 Proxy authorized requests to the sidecar over HTTP with internal proxy authorization and display-safe actor facts.
- [ ] 3.5 Add Worker routing/proxy tests proving deployed, mapped-host, cross-origin, unauthenticated, and missing-sidecar requests fail before sidecar or provider mutation.

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

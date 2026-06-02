## Context

Local-first workspace support now writes `formless.json` as a reviewable manifest and stores app/domain/deploy intent there while also exporting schema-owned control-plane records. The product runtime already models app installs, unified routes, and deployment intent as flat `instance:control-plane` records, and currently mirrors display-safe deployment history there too. That leaves two editable shapes for intent and mixes runtime execution history into schema records.

The browser admin UI edits Authority records. The CLI currently owns workspace filesystem mutation, archive composition, and deployment commands. To make onboarding browser-first, the local runtime needs a trusted local workspace gateway that can mutate the workspace root through semantic operations without exposing arbitrary filesystem access to app code.

## Goals / Non-Goals

**Goals:**

- Make `formless.json` a layout-only workspace manifest.
- Store `app-install`, unified `route`, `deploy-target`,
  `provider-config-ref`, and `deploy-desired-resource` intent as
  schema-owned record source.
- Remove `deploy-attempt`, `deploy-evidence-summary`, and
  `deploy-drift-report` as schema-owned workspace/source entities; keep
  deployment execution history in deployment runtime state and local gateway
  operation state.
- Let a browser create or initialize a local workspace, install apps, edit instance intent, save source, check drift, push, and deploy through a local gateway.
- Reuse one workspace operation layer from the CLI and the browser gateway.
- Preserve the secret boundary: credentials and provider state stay outside browser-visible records, archives, and manifest files.
- Treat this as a breaking early cleanup that keeps manifest version `1` but replaces the current v1 source shape.

**Non-Goals:**

- Do not expose a generic browser filesystem API.
- Do not let deployed Cloudflare runtimes access a user's local filesystem.
- Do not move installed app content records into the instance control-plane identity.
- Do not introduce a hosted remote deploy runner in this change.
- Do not preserve existing `formless.json` v1 `apps`, `domains`, targets, default app policy, or deploy intent parsing.

## Decisions

### Use a layout-only manifest

`formless.json` should remain manifest version `1`, but version `1` should now describe only the workspace container: version, kind, name, record source path, app archive root, media root, local state root, and ignored secret state root. The existing v1 parsing for source keys such as `apps`, `domains`, target/deploy intent, and default app policy should be removed.

Alternative: bump the manifest version or keep app and domain summaries as generated compatibility fields. That preserves familiar CLI output but keeps a second staleable source shape.

### Make record files the reviewable control-plane source

Workspace source should include deterministic record files for the instance control-plane schema. App data and media can continue to move through app archives during this change. Push and local-dev restore compose an instance archive from record source plus app archives.

Alternative: keep only instance archive manifests as source. That is closer to the current implementation, but it makes review and browser authoring harder than normal schema-owned records.

### Keep deployment execution history out of record source

Deployment attempts, evidence summaries, drift reports, and cleanup audit
summaries are runtime execution facts, not owner-authored intent. They should
not be written as workspace record files, restored as source, or mirrored as
schema-owned control-plane entities. The deployment runtime can keep exact
desired-state versions, attempts, leases, evidence, drift, and cleanup audit
tables for writeback and status. The local workspace gateway can return
display-safe attempt, plan, evidence, drift, cleanup, and writeback summaries
through operation progress and completion responses.

Alternative: keep `deploy-attempt`, `deploy-evidence-summary`, and
`deploy-drift-report` as action-created control-plane records. That gives
generated UI an easy history view, but it turns runtime execution data into
schema records and forces workspaces, archives, source drift, and restore flows
to carry facts that are not reviewable intent.

### Share a workspace operation layer

Save, check, pull, push, deploy plan, and deploy apply should move into a reusable operation layer. CLI commands and local gateway routes should call that layer with different adapters for logging, progress, credentials, and response formatting.

Alternative: implement browser routes beside the existing CLI flow. That would duplicate drift, archive, deploy, and secret handling.

### Expose semantic local gateway operations

The local gateway should expose named operations, not file primitives. Browser callers can start operations and read status or progress. They cannot pass arbitrary filesystem paths, read raw files, write raw files, or receive local secret values.

Alternative: expose a workspace file API with constrained paths. Even with path guards, that makes security review and generated UI behavior depend on low-level file operations.

### Protect gateway routes with local same-origin owner authority

Workspace gateway routes should be available only in a local workspace runtime
with filesystem adapters configured. Deployed instance, app, site-authoring,
published Site, and mapped-host profiles should not route the gateway API
family.

Browser calls should be same-origin calls from the local workspace origin.
Pre-owner local bootstrap is the only exception: `formless dev` may issue a
process-scoped, unguessable bootstrap capability to the browser shell for
gateway status reads and workspace initialization in the resolved workspace
root. That capability must not authorize save, pull, push, credential setup,
deploy plan/apply, provider cleanup, arbitrary control-plane writes, or any
remote/provider mutation, and it expires when the local process exits or owner
setup completes.

After owner setup exists, mutating browser gateway operations should require a
valid owner session cookie and should reject missing or cross-origin `Origin`
headers. Cookie-authorized mutations should also require a same-origin CSRF
token or equivalent double-submit/header proof issued by the local runtime. CLI
or automation calls may use the admin bearer boundary for non-browser requests,
but the browser login flow must not accept admin tokens and gateway responses
must not expose admin token state.

All requests remain operation-scoped: operation kind, operation id, and input
shape are allowlisted; arbitrary paths, shell commands, raw logs, raw adapter
output, raw provider state, and secrets are rejected or redacted. Operation ids
are workspace-scoped and unguessable, and progress reads return only
display-safe state for operations in the current workspace.

Alternative: treat loopback access as sufficient. That is simpler, but local
web pages and browser tabs can still issue requests to local origins, so
same-origin owner session plus CSRF gives a clearer baseline.

### Treat the gateway as a trusted local runner

Deploy plan/apply through the browser should run in the local gateway process. The gateway resolves credentials from environment or ignored `.formless/` state, calls provider adapters, records display-safe writeback, and returns progress and summaries only.

Alternative: have the browser run deployment directly against provider APIs. That exposes credentials to browser code and breaks the current credential boundary.

### Capture external authorization URLs as operation events

Cloudflare credential setup can start from browser UI, but the local gateway should execute a Formless-owned Alchemy OAuth profile adapter. That is the browser equivalent of `alchemy configure` with method `OAuth`, default scopes, Cloudflare authorization, account selection, and profile storage. When the adapter creates or receives an external authorization URL, the gateway should expose only the expected URL and publish a display-safe operation event with the URL, profile label, and waiting status. The browser can open that URL and continue polling the operation until the gateway validates credentials, resolves account choices, captures the resulting profile reference or workspace-scoped secret reference, and stores any secret material under ignored `.formless/` state.

Alternative: show raw terminal output in the browser or ask the user to switch back to the terminal. Raw output risks leaking credentials; terminal handoff breaks browser-first onboarding.

### Prefer Alchemy APIs for credential setup

Credential setup should call Alchemy APIs where they expose the needed behavior. The current Alchemy package exposes `createCloudflareApi({ profile })` for provider API calls and stores/refreshes profile credentials locally, but the OAuth profile configuration helpers are CLI/internal rather than a stable exported API. The gateway should therefore use a Formless adapter that can call a future Alchemy API directly, and can otherwise own a local wrapper modeled on Alchemy's current OAuth flow: generate the Cloudflare authorization URL, receive the local callback, list accessible accounts, store credentials and provider metadata, then validate the profile. Browser onboarding should not accept pasted Cloudflare tokens. It should use existing default or named Alchemy profile credentials when available, otherwise create a new Alchemy OAuth profile through the gateway.

Alternative: add a browser pasted-token path. That is simpler to implement but makes onboarding responsible for handling long-lived provider secrets in browser input, which is not needed for the first browser-focused flow.

### Use the default Alchemy OAuth scopes initially

The first credential setup implementation should use Alchemy's default Cloudflare OAuth scopes because they cover the Worker, R2, Durable Object, custom domain, and deployment needs for now. Narrower OAuth scopes or least-privilege API token generation can be a follow-up once the deployed resource set and provider permissions stabilize.

Alternative: design least-privilege Cloudflare token policies before implementation. That is better long term, but it can block browser onboarding on provider permission research.

### Keep API token creation out of first browser onboarding

Alchemy's Cloudflare OAuth profile configuration does not require a Cloudflare email, Global API Key, or pasted API token. Alchemy's separate Cloudflare API-token creation utility does require an existing Cloudflare API token or global API key with token-management authority. That conflicts with the first browser flow's no-paste-token decision. The first implementation should rely on Alchemy OAuth profile credentials for deploy-time Cloudflare API calls. API-token creation should remain a future credential-management path after explicit least-privilege and high-privilege bootstrap decisions.

Alternative: ask for a global API key or token-management API token during browser onboarding. That would enable API token creation now, but it introduces a higher-risk credential into the browser-facing flow.

### Store local secrets on disk

Workspace gateway secrets should be stored under ignored `.formless/` state using the same practical security posture as local `.env` files. Browser-visible records and operation responses should show only secret references, labels, and validation status.

Alternative: encrypted local secret storage. That is stronger, but it adds key management before the local onboarding path exists.

### Persist display-safe operation state

Workspace operations should persist display-safe state under ignored `.formless/operations/` so a browser refresh can recover active or recently completed onboarding, auth, save, check, push, and deploy progress. Secret material and raw adapter or tool output must not be persisted there.

Alternative: keep operation state process-local. That is smaller but makes auth URL handoff and long-running deploys brittle across browser refreshes.

### Build browser onboarding as React-first flow orchestration

Workspace onboarding should be implemented as a local React flow shell for this
change, not as a new schema-declared workflow language. The flow shell can own
step order, progress display, gateway operation calls, auth URL handoff, and
local-only branching. Steps that write schema records should reuse generated
create/edit field controls, create-field authoring facts, defaults,
`visibleWhen`, field editor selection, and Authority-backed validation instead
of duplicating form logic in onboarding-specific components.

The flow should keep future schema-defined setup in mind by separating
orchestration from field rendering and mutation submission. A later change can
define app-schema setup flows for cases such as "new Site app" onboarding,
where the user fills key fields and the runtime populates a default Site
template. This change should not add that schema language because it would need
step models, cross-record writes, action binding, template defaults, persisted
progress, and gateway-operation semantics beyond workspace bootstrap.

Alternative: define schema-declared onboarding flows now. That would align with
schema-as-data earlier, but it broadens this change from workspace gateway and
control-plane source into a new workflow capability.

### Keep app content archives, note future record alignment

For this change, control-plane intent becomes record source and app content remains in app archives. Future work should evaluate moving app content records into deterministic record source too, so the workspace format fully matches schema-as-data across control-plane and installed app data.

Alternative: move app content records to record files now. That would align the model sooner, but it broadens this change beyond onboarding, gateway, and control-plane source.

### Use `formless dev` as the browser-first bootstrap mode

`formless dev` should be able to start in an empty or layout-only workspace and
mount onboarding UI. The browser can initialize the workspace source, then
create control-plane records and app installs through normal Authority-backed
actions. `formless onboard` should be removed rather than retained as an alias.
There should be one local bootstrap entry: start the local runtime, then finish
workspace initialization in the browser.

Alternative: keep `formless onboard` as an alias. That preserves a familiar
command name, but it keeps a second onboarding story beside browser-owned
workspace initialization.

## Risks / Trade-offs

- Local gateway endpoint is too powerful -> keep routes local-profile-only,
  require owner session for browser mutation, require same-origin and CSRF
  checks for cookie-auth mutation, reserve admin bearer for non-browser callers,
  and expose only named operations.
- Workspace source and local Authority drift -> keep explicit save/check semantics and report stale source before push/deploy.
- Long-running deploys are hard to observe -> give every operation an id, status, timestamps, summary, logs, and event stream or polling endpoint.
- Removing schema-owned deployment history means generated record views no
  longer show attempts/evidence/drift -> gateway operation status and
  deployment runtime status endpoints must return the display data the browser
  needs.
- Captured auth output can leak secrets -> expose only expected Cloudflare/Alchemy authorization URLs and redact raw adapter or tool output before operation events.
- API availability may lag Alchemy CLI behavior -> keep Alchemy credential setup behind a Formless adapter that can use APIs where available and otherwise own the local OAuth wrapper.
- Cloudflare API token creation requires high-privilege bootstrap credentials -> keep token creation out of first browser onboarding and deploy through Alchemy profile OAuth credentials.
- Record files and app archives can disagree -> validate install ids, package keys, archive package facts, and referenced `route` records before composing restore archives.
- Browser-triggered deploys blur trust boundaries -> gateway owns credentials and returns display-safe summaries only.

## Migration Plan

1. Replace the existing v1 manifest parser with layout-only v1 parsing and reject intent keys.
2. Add deterministic control-plane record source read/write helpers.
3. Remove deployment execution history entities from schema-owned
   control-plane source and stop mirroring runtime attempts/evidence/drift into
   workspace-restored records.
4. Rework workspace restore, save, check, pull, push, and deploy composition around record source plus app archives.
5. Add local workspace gateway routes and shared operation progress.
6. Add browser-initiated Cloudflare OAuth profile setup with captured Alchemy authorization URL events.
7. Wire browser onboarding and instance management UI to gateway operations.
8. Remove `formless onboard` and rewire remaining CLI commands to the shared
   operation layer.
9. Remove existing v1 manifest source tests and update specs.

Rollback during development is a code revert plus regenerating workspace source from Authority or remote pull. There is no compatibility migration promise for existing v1 workspace source shape in this change.

## Open Questions

None.

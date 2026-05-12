# PRD 25: Authority operation module

Status: shipped
Current chunk: complete
Last updated: 2026-05-12

Start after PRD 24 public Site chrome polish.

## Goal

Deepen Authority route handling before the Site publish workflow adds production write guards.

This PRD owns:

- an Authority operation module behind the HTTP route adapter;
- operation-level read/write dispatch;
- operation-level validation and storage orchestration;
- committed-write notification staying behind the existing write notifier;
- behavior-preserving tests for current Authority routes.

This PRD does not add production authorization, new endpoints, new storage tables, or Site publish behavior.

## Problem

The Authority route handler is still too broad.

Current behavior:

- `src/worker/authority.ts` parses routes.
- `src/worker/authority.ts` initializes source storage.
- `src/worker/authority.ts` branches on every HTTP method and path.
- `src/worker/authority.ts` runs snapshot, schema, mutation, action, reset, sync, and tree operations.
- `src/worker/authority.ts` wires committed-write notification for every write branch.
- `src/worker/authority-validation.ts` owns validation, but route branches still know the write workflow.

That shape works for current local development, but PRD 26 needs production write safety around schema writes, snapshot restore, reset, generated mutations, and actions. Adding that guard directly to every route branch would spread one policy across many shallow branches.

## Solution

Add an Authority operation module that turns parsed route facts plus request body/query facts into read or write operations.

The Durable Object remains the HTTP adapter:

- parse the URL and method;
- read JSON bodies;
- map `BadRequestError` to HTTP 400;
- return `Response` objects;
- keep WebSocket lifecycle hooks where Cloudflare requires them.

The operation module owns operation selection and execution:

- bootstrap;
- schema read and write;
- snapshot export and restore;
- public Site tree read;
- sync read;
- mutation write;
- action write;
- reset schema;
- reset seed.

Writes still pass through the committed-write notifier before returning. Replayed writes still return existing responses without push notification. Failed validation still does not commit or broadcast.

## Source Map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Authority routes: `src/worker/authority.ts`.
- Authority validation: `src/worker/authority-validation.ts`.
- Authority action runtime: `src/worker/actions.ts`.
- Storage writes and snapshots: `src/worker/storage.ts`.
- Worker source app registry: `src/worker/schema-apps.ts`.
- Site tree projection: `src/site/tree.ts`.
- Protocol types: `src/shared/protocol.ts`.
- Authority tests: `src/worker/authority.test.ts`.
- Authority write test helpers: `src/test/authority-write.ts`.
- Store snapshot PRD: `prd/15-store-snapshot-export-restore.md`.
- Site publish workflow PRD: `prd/26-site-editing-publish-workflow.md`.

Owned files:

- `prd/25-authority-operation-module.md`.

Likely changed files:

- `src/worker/authority.ts`.
- `src/worker/authority-operations.ts`.
- `src/worker/authority-validation.ts`.
- `src/worker/authority.test.ts`.
- `src/test/authority-write.ts`.

Possible changed files:

- `src/worker/storage.ts` only if write outcome plumbing needs a small helper.
- `src/site/tree.ts` only if public tree operation needs a tiny adapter, not projection behavior changes.

## Requirements

### Route Behavior

- Keep current API paths unchanged.
- Keep current HTTP methods unchanged.
- Keep current response shapes unchanged.
- Keep current HTTP status mapping unchanged.
- Keep WebSocket sync route behavior unchanged.
- Keep public Site tree reads public and read-only.
- Keep schema-keyed authority instances.
- Keep source initialization behavior unchanged.
- Keep request JSON parsing in the HTTP adapter.
- Keep response creation in the HTTP adapter.

### Operation Behavior

- Authority operations can execute read operations.
- Authority operations can execute write operations.
- Write operations return through the committed-write notifier.
- Replayed mutation writes do not notify.
- Replayed action writes do not notify.
- Failed validation does not notify.
- Failed validation does not commit storage changes.
- Snapshot restore remains one committed Authority write.
- Reset schema remains one committed Authority write when validation passes.
- Reset seed remains one committed Authority write.
- Mutation create after-create hooks keep current behavior.
- Unique constraints keep current behavior for create, patch, action-created records, and snapshot restore.
- Public Site tree projection keeps current warning and 404 behavior.

### Future Guard Fit

- Operation metadata should make production write guarding straightforward in PRD 26.
- Each operation should expose whether it is read-only or mutating.
- Each operation should expose the route path or operation kind needed for audit/error messages.
- Guard policy should not be implemented in this PRD.
- The operation module should not know deployment secrets or environment authorization config.
- The operation module should leave room for PRD 26 to reject protected writes before storage reads or mutations.

### Module Shape

- The HTTP adapter should be thin enough to scan in one pass.
- The operation module interface should be smaller than the implementation it hides.
- Validation helpers should stay in `authority-validation` unless moving them improves locality.
- Storage write outcome semantics should stay in `storage`.
- The operation module should not become a generic web framework.
- The operation module should not introduce adapters with only one implementation unless the Authority and tests both use the seam.

## Implementation Decisions

| ID      | Decision                                                    | Reason                                                                 | Evidence                                         |
| ------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------ |
| AOM-D1  | Keep `FormlessAuthority` as the HTTP adapter.               | Cloudflare still owns `fetch` and WebSocket lifecycle entrypoints.     | `src/worker/authority.ts`                        |
| AOM-D2  | Put operation selection and execution behind one module.    | Production write safety needs one operation seam before PRD 26.        | `prd/26-site-editing-publish-workflow.md`        |
| AOM-D3  | Preserve `AuthorityWriteModule` notification semantics.     | Push sync depends on committed versus replayed write outcomes.         | `prd/05-authority-write-module.md`               |
| AOM-D4  | Keep validation in `authority-validation` where it is deep. | It already owns mutation, schema, snapshot, and record validation.     | `src/worker/authority-validation.ts`             |
| AOM-D5  | Keep public tree projection in the Site tree module.        | Tree behavior is projection logic, not route plumbing.                 | `src/site/tree.ts`                               |
| AOM-D6  | Do not add the production admin guard here.                 | The guard is a policy consumer of operation metadata in PRD 26.        | User direction 2026-05-12                        |
| AOM-D7  | Keep API and storage behavior unchanged.                    | This is a locality refactor, not product behavior.                     | `doc/current.md`, `src/worker/authority.test.ts` |
| AOM-D8  | Test through route behavior and operation interface seams.  | The interface is the test surface; private helper order is not stable. | `src/test/authority-write.ts`                    |
| AOM-D9  | Lock operation metadata as route-selected facts.            | PRD 26 needs read/write classification before protected write work.    | Operation Metadata Contract below                |
| AOM-D10 | Keep WebSocket sync adapter-owned.                          | Cloudflare owns WebSocket upgrade and lifecycle hooks.                 | `src/worker/authority.ts`                        |

### Deep Modules

- **Authority operation module:** accepts parsed route/app facts and request facts, executes the matching read/write operation, and returns typed response bodies plus write outcome metadata where needed.
- **Authority write notifier:** existing committed-write seam that sends sync to hibernatable sockets after committed writes.

### Operation Metadata Contract

AOM-02 should expose these route-selected facts before storage writes run:

| Kind              | Method and path          | Mode  | Request facts owned by adapter |
| ----------------- | ------------------------ | ----- | ------------------------------ |
| `bootstrap`       | `GET /bootstrap`         | read  | none                           |
| `readSchema`      | `GET /schema`            | read  | none                           |
| `exportSnapshot`  | `GET /snapshot`          | read  | none                           |
| `siteTree`        | `GET /tree/:slug`        | read  | slug from path                 |
| `sync`            | `GET /sync`              | read  | `after`, `schemaUpdatedAt`     |
| `writeSchema`     | `POST /schema`           | write | parsed JSON body               |
| `restoreSnapshot` | `POST /snapshot/restore` | write | parsed JSON body               |
| `mutation`        | `POST /mutations`        | write | parsed JSON body               |
| `action`          | `POST /actions`          | write | parsed JSON body               |
| `resetSchema`     | `POST /reset/schema`     | write | parsed JSON body               |
| `resetSeed`       | `POST /reset/seed`       | write | parsed JSON body               |

Metadata must include `kind`, route path, and `mode`.
Write metadata must be available before write storage reads or mutations.
`GET /sync/ws` stays adapter-owned because Cloudflare owns WebSocket upgrade and lifecycle hooks.

## Testing Decisions

- Keep existing authority route tests as behavior coverage.
- Add operation module tests only where they reduce repeated route setup or expose operation metadata.
- Test that mutation replay still returns without broadcast.
- Test that action replay still returns without broadcast.
- Test that failed validation still returns 400 without broadcast.
- Test that committed schema, snapshot restore, mutation, action, reset schema, and reset seed writes still broadcast.
- Test that public tree reads remain read-only and schema-key restricted to Site.
- Test operation metadata for read-only versus mutating operations because PRD 26 will rely on it.
- Do not assert private helper call order.
- Browser smoke is not required unless rendered app behavior changes.

## Chunks

| ID     | Status  | Depends on | Main files                    | Acceptance                                                                                                       |
| ------ | ------- | ---------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| AOM-01 | shipped | none       | tests, PRD                    | Current Authority route/write behavior is characterized and operation metadata requirements are locked.          |
| AOM-02 | shipped | AOM-01     | authority operation module    | Authority route branches delegate operation selection/execution with unchanged responses and write semantics.    |
| AOM-03 | shipped | AOM-02     | authority tests, test helpers | Route tests and operation tests prove committed, replayed, failed, read-only, and Site tree behavior.            |
| AOM-04 | shipped | AOM-03     | PRD                           | `devstate check` passes; browser smoke is skipped unless rendered app behavior changed; PRD evidence is current. |

## Parallel Shipping

Can ship in parallel with:

- public renderer work that avoids `src/worker/authority.ts`;
- generated authoring work that avoids Authority write routes;
- docs steward work that does not edit this PRD.

Should coordinate with:

- PRD 26 publish workflow;
- snapshot export/restore route changes;
- push sync protocol changes;
- mutation/action/storage write changes.

Avoid parallel edits with:

- production admin guard work;
- broad authority validation rewrites;
- storage table rewrites.

## Blockers

- None.

## Out of Scope

- Do not add production authorization.
- Do not add deploy or publish scripts.
- Do not add Site seed promotion.
- Do not add new API paths.
- Do not remove existing API paths.
- Do not change storage table shape.
- Do not change snapshot envelope shape.
- Do not change sync protocol shape.
- Do not change public Site tree projection behavior.
- Do not change generated UI behavior.
- Do not change mutation or action request/response shapes.

## Promote after ship

- `doc/current.md`: note Authority operation module location: `src/worker/authority-operations.ts`.
- `doc/current.md`: note `src/worker/authority.ts` keeps HTTP response mapping and WebSocket handling while HTTP operation dispatch lives behind the module.
- `doc/current.md`: note operation metadata from `selectAuthorityOperation` exposes `kind`, route `path`, and read/write `mode` before write execution.
- `prd/26-site-editing-publish-workflow.md`: update dependency evidence after AOM ships.

## Evidence

- 2026-05-12: PRD created from architecture review sequencing. User direction: PRD 23 is in flight, add Authority operation module as PRD 25, and renumber the Site publish workflow to PRD 26.
- 2026-05-12: AOM-01 shipped. Added read-only HTTP broadcast characterization in `src/worker/authority.test.ts`; locked operation metadata contract above for AOM-02 and PRD 26.
- 2026-05-12: Devstate evidence after AOM-01: `.devstate/logs/service-test.txt` shows `src/worker/authority.test.ts` 93 passed; `.devstate/logs/check-vite.txt` shows formatting, lint, and type checks pass.
- 2026-05-12: AOM-02 shipped. Added `src/worker/authority-operations.ts`; `src/worker/authority.ts` now delegates non-WebSocket HTTP operation selection/execution and keeps JSON body parsing, `BadRequestError` HTTP mapping, response creation, and WebSocket sync handling.
- 2026-05-12: AOM-02 evidence: `devstate check` passed; `.devstate/logs/check-vite.txt` shows formatting, lint, and type checks pass; `.devstate/logs/service-test.txt` shows `src/worker/authority.test.ts` 93 passed. Browser smoke skipped because no rendered app behavior changed.
- 2026-05-12: AOM-03 shipped. Added `src/worker/authority-operations.test.ts` coverage for `selectAuthorityOperation` read/write metadata, sync request facts, invalid sync cursor rejection, and adapter-owned WebSocket/unknown route non-selection. Existing `src/worker/authority.test.ts` route coverage proves committed, replayed, failed-validation, read-only, and Site tree behavior.
- 2026-05-12: AOM-03 evidence: `devstate check` passed; `.devstate/logs/check-vite.txt` shows formatting, lint, and type checks pass across 193 files; `.devstate/logs/service-test.txt` shows `src/worker/authority-operations.test.ts` 5 passed. Browser smoke skipped because no rendered app behavior changed.
- 2026-05-12: AOM-04 shipped. PRD status, blockers, decisions, evidence, and promote notes are current.
- 2026-05-12: AOM-04 evidence: `devstate check` passed; `.devstate/status.md` reports checks ok, web service ready at `https://25-authority-operation-module.formless.local`, and watcher tests passing.
- 2026-05-12: AOM-04 evidence: requested `tmp/devstate.json`, `tmp/test.txt`, and `tmp/check.txt` were not present; available devstate evidence lives in `.devstate/status.md`, `.devstate/status.json`, and `.devstate/logs/`.
- 2026-05-12: AOM-04 evidence: no rendered app behavior changed; browser smoke skipped.

## PRD status notes

- AOM-04 shipped 2026-05-12.
- Current chunk: complete.
- Current blocker: none.
- Decisions: no new decisions for AOM-04.
- Promote notes are ready in `Promote after ship`.
- PRD complete; no next ready chunk.

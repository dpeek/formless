# PRD 02: WebSocket push sync

Status: active
Current chunk: WS-03 authority write notifications
Last updated: 2026-05-05

## Goal

Support push sync from the Durable Object authority to browser replicas.

The first release should:

- use one WebSocket stream per schema key;
- keep HTTP as the mutation, action, schema, and reset write path;
- push committed changes to other open browser replicas;
- catch up a reconnected browser from its stored cursor;
- allow Cloudflare Durable Object hibernation.

## Source map

- Route workstream: `prd/01-schema-routes.md`.
- Worker dispatch: `src/worker/index.ts`.
- Authority routes and Durable Object class: `src/worker/authority.ts`.
- Authority storage and change cursor: `src/worker/storage.ts`.
- Shared wire types: `src/shared/protocol.ts`.
- Client API and sync merge code: `src/client/sync.ts`.
- Client local DB: `src/client/db.ts`.
- Client store merge code: `src/client/store.ts`.
- Client cross-tab broadcast: `src/client/broadcast.ts`.
- Home route sync startup: `src/app/routes/home.tsx`.
- Status line: `src/app/routes/status-line.tsx`, `src/client/sync-status.ts`.
- Worker config: `wrangler.jsonc`.
- Worker tests: `src/worker/authority.test.ts`.
- Client tests: `src/client/sync.test.ts`, `src/client/store.test.ts`.
- Cloudflare hibernation reference: `https://developers.cloudflare.com/durable-objects/best-practices/websockets/`.
- Cloudflare Durable Object state reference: `https://developers.cloudflare.com/durable-objects/api/state/`.

## Dependencies

- `prd/01-schema-routes.md` SR-02 must own keyed worker dispatch.
- `prd/01-schema-routes.md` SR-04 must own keyed IndexedDB, keyed sync URLs, and keyed broadcast channels before browser enablement.
- Push sync must not reintroduce global `/api/*` paths.

## Decisions

| ID     | Decision                                                         | Reason                                                                                          | Evidence                                                                         |
| ------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| WS-D1  | Use `GET /api/:schemaKey/sync/ws`.                               | Sync stream belongs to the same app boundary as bootstrap, sync, mutations, actions, and reset. | `prd/01-schema-routes.md`, `src/worker/index.ts`, `src/client/sync.ts`           |
| WS-D2  | Keep writes on HTTP for the first push-sync release.             | Mutation/action/schema writes already have validation, replay, atomic storage, and tests.       | `src/worker/authority.ts`, `src/worker/storage.ts`, `src/worker/actions.ts`      |
| WS-D3  | Push only authority-committed state.                             | Browser replicas are local-first caches, not authoritative stores.                              | `doc/overview.md`, `doc/current.md`, `src/client/db.ts`, `src/worker/storage.ts` |
| WS-D4  | Reuse `SyncResponse` for pushed record/schema payloads.          | Existing client merge code already handles changes, cursor advancement, and schema refresh.     | `src/shared/protocol.ts`, `src/client/sync.ts`, `src/client/store.ts`            |
| WS-D5  | Use `DurableObjectState.acceptWebSocket(server)`.                | This is the Cloudflare hibernation path for server-side Durable Object WebSockets.              | Cloudflare Durable Object WebSocket docs                                         |
| WS-D6  | Do not keep canonical socket state only in memory.               | Hibernation re-runs the constructor and clears in-memory fields.                                | Cloudflare hibernation docs                                                      |
| WS-D7  | Store per-socket cursor and schema timestamp in socket metadata. | `serializeAttachment` survives hibernation and is enough for reconnect/catch-up.                | Cloudflare Durable Object state docs, `src/shared/protocol.ts`                   |
| WS-D8  | Keep polling as fallback during rollout.                         | Local dev, tests, and older browsers can keep existing behavior while socket support settles.   | `src/client/sync.ts`, `src/app/routes/home.tsx`                                  |
| WS-D9  | Keep pushed sync merge schema-keyed.                             | Client DB, store, and broadcast state are keyed by schema app.                                  | `src/client/sync.ts`, `src/client/sync.test.ts`                                  |
| WS-D10 | Store schema key on accepted socket tags.                        | Hibernated handlers can recover the app source without in-memory state.                         | `src/worker/authority.ts`                                                        |

## Wire protocol

Client messages:

```ts
type SyncSocketClientMessage =
  | {
      type: "hello";
      cursor: number;
      schemaUpdatedAt: string | null;
    }
  | {
      type: "sync-requested";
      cursor: number;
      schemaUpdatedAt: string | null;
    };
```

Server messages:

```ts
type SyncSocketServerMessage =
  | {
      type: "sync";
      payload: SyncResponse;
    }
  | {
      type: "error";
      message: string;
    };
```

Socket attachment:

```ts
type SyncSocketAttachment = {
  cursor: number;
  schemaUpdatedAt: string | null;
};
```

## Rules

- No push-sync work edits `doc/current.md` or `doc/roadmap.md`.
- Put shipped global-doc facts under `Promote after ship`.
- Preserve flat records.
- Do not add client-generated conflict resolution in this PRD.
- Do not add users, sessions, permissions, or auth.
- Do not persist per-client cursor rows in SQLite for the first release.
- Do not depend on in-memory socket maps for correctness.
- Do not use `ws.accept()` or socket event listeners in the Durable Object.
- Do not send schema snapshots when the socket attachment has the current `schemaUpdatedAt`.
- Keep HTTP polling fallback until WebSocket browser smoke is stable.

## Chunks

| ID    | Status  | Depends on          | Main files                                             | Acceptance                                                                |
| ----- | ------- | ------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| WS-01 | shipped | none                | `src/shared/protocol.ts`, `src/client/sync.ts`         | Shared socket protocol exists and sync merge code is reusable.            |
| WS-02 | shipped | PRD 01 SR-02, WS-01 | `src/worker/index.ts`, `src/worker/authority.ts`       | `/api/:schemaKey/sync/ws` accepts hibernatable WebSockets and catches up. |
| WS-03 | ready   | WS-02               | `src/worker/authority.ts`, `src/worker/storage.ts`     | Committed mutations, actions, and schema writes push sync messages.       |
| WS-04 | pending | PRD 01 SR-04, WS-03 | `src/client/sync.ts`, `src/client/broadcast.ts`        | Client opens keyed socket, merges pushed sync messages, and falls back.   |
| WS-05 | pending | PRD 01 SR-05, WS-04 | `src/app/routes/home.tsx`, `src/client/sync-status.ts` | Home route starts push sync for the active schema key.                    |
| WS-06 | pending | WS-05               | tests, Browser Use                                     | Two-tab browser smoke proves push updates and route isolation.            |
| WS-07 | pending | WS-06               | `prd/02-websocket-push-sync.md`                        | PRD status and promote notes reflect shipped behavior.                    |

## Shipped chunks

### WS-01 shared push-sync protocol

Status: shipped 2026-05-05.

Goal: prepare the protocol and client merge seam without changing runtime behavior.

Outcome:

- Added `SyncSocketClientMessage`, `SyncSocketServerMessage`, and `SyncSocketAttachment` to `src/shared/protocol.ts`.
- Added `isSyncSocketClientMessage`, `isSyncSocketServerMessage`, and `isSyncSocketAttachment`.
- Added `applySyncResponse(schemaKey, response)` in `src/client/sync.ts`.
- `syncClient` still builds the keyed `/sync` URL, fetches HTTP sync, and delegates the merge to `applySyncResponse`.
- No WebSocket opens in WS-01.

Evidence:

- `src/shared/protocol.test.ts` covers socket message and attachment validation.
- `src/client/sync.test.ts` covers pushed record sync and schema-only sync merge.
- `bun run test` passed.
- `bun run check` passed.

### WS-02 hibernatable socket route

Status: shipped 2026-05-05.

Goal: add a server-side socket endpoint that can hibernate and catch up one client.

Outcome:

- Existing keyed worker dispatch reaches `GET /api/:schemaKey/sync/ws`.
- The authority rejects non-GET requests and no-upgrade requests.
- The authority creates a `WebSocketPair`, stores initial `{ cursor: 0, schemaUpdatedAt: null }`, and accepts the server socket with `this.ctx.acceptWebSocket(server, [app.key])`.
- Socket messages are handled through `webSocketMessage`.
- `hello` and `sync-requested` messages send a `SyncResponse` built from `getChangesAfter(storage, cursor)`.
- Current schema timestamps omit schema from the pushed message.
- Successful sends update the socket attachment cursor and schema timestamp.
- Malformed socket messages send an error and close the socket.
- HTTP remains the write path.
- No write broadcasting is added in WS-02.

Evidence:

- `src/worker/authority.test.ts` covers task and rate-card socket upgrades.
- `src/worker/authority.test.ts` covers missing schema key `404`, no-upgrade `426`, and non-GET `405`.
- `src/worker/authority.test.ts` compares stale-cursor socket catch-up with HTTP sync.
- `src/worker/authority.test.ts` covers current-schema omission and malformed socket errors.
- `bun run test` passed.
- `bun run check` passed.

## Current chunk

### WS-03 authority write notifications

Goal: push committed state after authority writes.

Tasks:

- [ ] Reuse the `sendSyncToSocket(...)` helper in the authority.
- [ ] Add a `broadcastSync()` helper that loops `this.ctx.getWebSockets()`.
- [ ] Call `broadcastSync()` after successful create mutations.
- [ ] Call `broadcastSync()` after successful patch mutations.
- [ ] Call `broadcastSync()` after successful actions.
- [ ] Call `broadcastSync()` after successful schema writes.
- [ ] Reuse the same helper for reset endpoints after PRD 01 SR-03.
- [ ] Catch per-socket send failures and continue sending to other sockets.

Acceptance checks:

- [ ] Two sockets on `/api/tasks/sync/ws` receive a task create.
- [ ] A socket on `/api/rates/sync/ws` does not receive task changes.
- [ ] Schema save sends a schema-only sync message when no record cursor changed.
- [ ] Failed mutation validation does not push.
- [ ] Mutation replay does not duplicate change rows.

## Later chunks

### WS-04 keyed browser push client

Goal: let the browser use push sync while preserving polling fallback.

Tasks:

- [ ] Add `startPushSync(schemaKey, options)` in `src/client/sync.ts`.
- [ ] Build socket URL from the active schema key.
- [ ] Send `hello` with local cursor and schema timestamp on open.
- [ ] Merge `sync` messages with `applySyncResponse`.
- [ ] Update sync status on open, close, reconnect, and fallback.
- [ ] Reconnect with bounded backoff.
- [ ] Fall back to `startPollingSync` when WebSocket construction or connection fails.
- [ ] Keep `requestSync()` working by sending `sync-requested` when the socket is open, otherwise polling once.
- [ ] Keep broadcast channel names keyed by schema key after PRD 01 SR-04.

Acceptance checks:

- [ ] Client opens `/api/tasks/sync/ws` from `/tasks`.
- [ ] Client opens `/api/rates/sync/ws` from `/rates`.
- [ ] Pushed changes land in the selected IndexedDB database.
- [ ] Cross-tab local events still refresh mounted stores.
- [ ] Polling fallback still merges changes when socket fails.

### WS-05 route enablement

Goal: make the active app route use push sync.

Tasks:

- [ ] Replace `startPollingSync` startup in `HomeRoute` with push-first sync startup.
- [ ] Stop the socket when route schema key changes or route unmounts.
- [ ] Reset selected view/query/context state only through the route-key logic from PRD 01.
- [ ] Keep schema editor using explicit fetch/save flows.
- [ ] Surface simple sync status text for pushed, reconnecting, polling fallback, and error states.

Acceptance checks:

- [ ] `/tasks` opens a task push-sync connection.
- [ ] `/rates` opens a rate push-sync connection.
- [ ] Switching routes closes the old schema socket.
- [ ] The app still works when WebSocket fallback polling is active.

### WS-06 browser smoke and cleanup

Goal: prove user-visible push sync.

Browser smoke:

- [ ] Start app with `bun dev`.
- [ ] Open `/tasks` in two browser contexts.
- [ ] Create a task in context A.
- [ ] Confirm context B updates without waiting for polling.
- [ ] Open `/rates` in one context.
- [ ] Create or edit a rate-card record.
- [ ] Confirm task contexts do not receive rate-card records.
- [ ] Reload a stale task context and confirm catch-up from cursor.
- [ ] Kill the dev server.

Cleanup:

- [ ] Keep polling fallback.
- [ ] Remove only obsolete polling-only startup code.
- [ ] Keep route-keyed API code owned by PRD 01.

### WS-07 PRD status and promotion notes

Goal: record shipped facts for a later docs/steward pass.

Tasks:

- [ ] Mark shipped chunks.
- [ ] Add final decisions.
- [ ] Add blockers if any remain.
- [ ] Add promote notes.

## Open questions

| ID    | Question                                           | Default answer                                                                          |
| ----- | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| WS-O1 | Should clients submit writes over WebSocket later? | Not in this PRD. Keep HTTP writes first.                                                |
| WS-O2 | Should the server cap catch-up size?               | Not initially. `changes` are append-only today. Add `resync` later if compaction lands. |
| WS-O3 | Should app-level ping/pong be automatic?           | Use Cloudflare auto-response only if the browser sends app-level keepalive messages.    |
| WS-O4 | Should schema editor use push sync?                | It should receive schema updates through the same socket when mounted later.            |

## Success criteria

- `bun run test`.
- `bun run check`.
- Browser smoke with Browser Use.
- Server uses hibernatable Durable Object WebSockets.
- Two browser replicas for the same schema key converge after one writes.
- Different schema keys stay isolated.
- Polling fallback still works.

## Non-goals

- No CRDT layer.
- No optimistic remote write queue.
- No WebSocket write transport in the first release.
- No auth, users, roles, or permissions.
- No cross-app push stream.
- No schema discovery stream.
- No change compaction.
- No D1/R2/Queue integration.

## Promote after ship

Add to `doc/current.md` after ship:

- Push sync protocol types: `SyncSocketClientMessage`, `SyncSocketServerMessage`, `SyncSocketAttachment`.
- Client pushed sync merge helper: `applySyncResponse(schemaKey, response)`.
- Push sync route: `/api/:schemaKey/sync/ws`.
- Durable Object accepts hibernatable WebSockets.
- Server sync socket handles `hello` and `sync-requested`.
- Server sync socket catches up from client cursor.
- Server sync socket omits schema when the client timestamp is current.
- HTTP remains the write path.
- Browser opens push sync per active schema key.
- Polling remains fallback.

Add to `doc/roadmap.md` after ship if it remains first-release scope:

- Browser replicas receive authority-pushed changes.
- Push sync is keyed by schema app.
- Push sync preserves route isolation.

## Blockers

- None for WS-03.
- PRD 01 SR-02 and SR-04 are shipped.

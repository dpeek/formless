# PRD 02: WebSocket push sync

Status: shipped
Current chunk: complete
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

| ID     | Decision                                                            | Reason                                                                                                            | Evidence                                                                         |
| ------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| WS-D1  | Use `GET /api/:schemaKey/sync/ws`.                                  | Sync stream belongs to the same app boundary as bootstrap, sync, mutations, actions, and reset.                   | `prd/01-schema-routes.md`, `src/worker/index.ts`, `src/client/sync.ts`           |
| WS-D2  | Keep writes on HTTP for the first push-sync release.                | Mutation/action/schema writes already have validation, replay, atomic storage, and tests.                         | `src/worker/authority.ts`, `src/worker/storage.ts`, `src/worker/actions.ts`      |
| WS-D3  | Push only authority-committed state.                                | Browser replicas are local-first caches, not authoritative stores.                                                | `doc/overview.md`, `doc/current.md`, `src/client/db.ts`, `src/worker/storage.ts` |
| WS-D4  | Reuse `SyncResponse` for pushed record/schema payloads.             | Existing client merge code already handles changes, cursor advancement, and schema refresh.                       | `src/shared/protocol.ts`, `src/client/sync.ts`, `src/client/store.ts`            |
| WS-D5  | Use `DurableObjectState.acceptWebSocket(server)`.                   | This is the Cloudflare hibernation path for server-side Durable Object WebSockets.                                | Cloudflare Durable Object WebSocket docs                                         |
| WS-D6  | Do not keep canonical socket state only in memory.                  | Hibernation re-runs the constructor and clears in-memory fields.                                                  | Cloudflare hibernation docs                                                      |
| WS-D7  | Store per-socket cursor and schema timestamp in socket metadata.    | `serializeAttachment` survives hibernation and is enough for reconnect/catch-up.                                  | Cloudflare Durable Object state docs, `src/shared/protocol.ts`                   |
| WS-D8  | Remove browser polling fallback after push sync ships.              | Backwards compatibility is not required; one browser sync transport keeps client behavior easier to reason about. | `src/client/sync.ts`, `src/client/sync.test.ts`                                  |
| WS-D9  | Keep pushed sync merge schema-keyed.                                | Client DB, store, and broadcast state are keyed by schema app.                                                    | `src/client/sync.ts`, `src/client/sync.test.ts`                                  |
| WS-D10 | Store schema key on accepted socket tags.                           | Hibernated handlers can recover the app source without in-memory state.                                           | `src/worker/authority.ts`                                                        |
| WS-D11 | Broadcast from committed authority write paths only.                | Validation failures and mutation replay do not commit new state.                                                  | `src/worker/authority.ts`, `src/worker/authority.test.ts`                        |
| WS-D12 | Treat each socket send as best effort.                              | One stale socket must not block other replicas from receiving committed state.                                    | `src/worker/authority.ts`                                                        |
| WS-D13 | Home routes start push sync after bootstrap and stop it on cleanup. | Bootstrap still seeds the local replica before the push stream catches up; route cleanup owns socket lifetime.    | `src/app/routes/home.tsx`, `src/client/sync.test.ts`                             |

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
- Keep HTTP `/sync` as an explicit pull helper.
- Do not keep browser polling fallback after WebSocket browser smoke is stable.

## Chunks

| ID    | Status  | Depends on          | Main files                                             | Acceptance                                                                |
| ----- | ------- | ------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| WS-01 | shipped | none                | `src/shared/protocol.ts`, `src/client/sync.ts`         | Shared socket protocol exists and sync merge code is reusable.            |
| WS-02 | shipped | PRD 01 SR-02, WS-01 | `src/worker/index.ts`, `src/worker/authority.ts`       | `/api/:schemaKey/sync/ws` accepts hibernatable WebSockets and catches up. |
| WS-03 | shipped | WS-02               | `src/worker/authority.ts`, `src/worker/storage.ts`     | Committed mutations, actions, and schema writes push sync messages.       |
| WS-04 | shipped | PRD 01 SR-04, WS-03 | `src/client/sync.ts`, `src/client/broadcast.ts`        | Client opens keyed socket and merges pushed sync messages.                |
| WS-05 | shipped | PRD 01 SR-05, WS-04 | `src/app/routes/home.tsx`, `src/client/sync-status.ts` | Home route starts push sync for the active schema key.                    |
| WS-06 | shipped | WS-05               | tests, Browser Use                                     | Browser smoke proves push updates and route isolation.                    |
| WS-07 | shipped | WS-06               | `prd/02-websocket-push-sync.md`                        | PRD status and promote notes reflect shipped behavior.                    |

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

### WS-03 authority write notifications

Status: shipped 2026-05-05.

Goal: push committed state after authority writes.

Outcome:

- Added `broadcastSync(source)` on the authority.
- `broadcastSync(source)` loops `this.ctx.getWebSockets()`.
- Each socket send reuses `sendSyncToSocket(...)`.
- Socket attachments are read with `deserializeAttachment()` and validated before use.
- Per-socket send failures are caught so later sockets still receive sync.
- Successful create mutations broadcast after storage commits.
- Successful patch mutations broadcast after storage commits.
- Successful actions broadcast after storage commits.
- Successful schema writes broadcast after storage commits.
- Reset schema and reset seed endpoints call the same broadcast helper after storage commits.
- Mutation replay returns the stored response without broadcasting.
- Failed validation returns an error without broadcasting.

Acceptance checks:

- Two sockets on `/api/tasks/sync/ws` receive a task create.
- A socket on `/api/rates/sync/ws` does not receive task changes.
- Schema save sends a schema-only sync message when no record cursor changed.
- Failed mutation validation does not push.
- Mutation replay does not duplicate change rows or push a replay message.

Evidence:

- `src/worker/authority.test.ts` covers same-schema create broadcast to two sockets.
- `src/worker/authority.test.ts` covers task/rate socket isolation.
- `src/worker/authority.test.ts` covers patch and action broadcast.
- `src/worker/authority.test.ts` covers schema-only broadcast.
- `src/worker/authority.test.ts` covers failed validation and replay no-broadcast behavior.
- `bun run test` passed.
- `bun run check` passed.

Blockers:

- None.

### WS-04 keyed browser push client

Status: shipped 2026-05-05.

Goal: let the browser use push sync.

Outcome:

- Added `startPushSync(schemaKey, options)` in `src/client/sync.ts`.
- Push sync builds `/api/:schemaKey/sync/ws` WebSocket URLs from the active schema key.
- Open sockets send `hello` with the local cursor and schema timestamp.
- Server `sync` messages are validated with `isSyncSocketServerMessage`.
- Pushed sync payloads merge through `applySyncResponse(schemaKey, response)`.
- Sync status updates on connecting, open, reconnecting, connection issue, server error, and malformed message error.
- Open sockets handle `requestSync(schemaKey)` by sending `sync-requested`.
- Opened socket closes reconnect with bounded backoff.
- Broadcast channel names remain keyed as `formless:${schemaKey}`.
- Post-ship cleanup removed browser polling fallback.

Acceptance checks:

- Client opens `/api/tasks/sync/ws` for `tasks`.
- Client opens `/api/rates/sync/ws` for `rates`.
- Pushed changes land in the selected IndexedDB database.
- Cross-tab local events still refresh mounted stores.
- WebSocket construction or pre-open connection failure surfaces a sync error.

Evidence:

- `src/client/sync.test.ts` covers keyed task and rate socket URLs.
- `src/client/sync.test.ts` covers `hello` messages with local cursor and schema timestamp.
- `src/client/sync.test.ts` covers pushed sync merge into the selected local database.
- `src/client/sync.test.ts` covers `requestSync` over open sockets.
- `src/client/sync.test.ts` covers reconnect after an opened socket closes.
- `src/client/sync.test.ts` covers socket cleanup on stop.
- Existing broadcast tests still cover same-schema refresh and other-schema isolation.
- `bun run test` passed.
- `bun run check` passed.

Blockers:

- None.

### WS-05 route enablement

Status: shipped 2026-05-05.

Goal: make the active app route use push sync.

Outcome:

- `HomeRoute` starts `startPushSync(schemaKey)` after route-keyed hydrate and bootstrap.
- Route cleanup stops the active push sync socket and route broadcast listener.
- Route-keyed view, query, and context reset logic stays unchanged.
- Schema editor routes still use explicit `hydrateClientStore`, `fetchActiveSchema`, and `saveActiveSchema` flows.
- Socket `sync` messages update the global status text to `Pushed sync received.`.
- Existing push client status text covers connecting, connected, reconnecting, server errors, and malformed messages.

Acceptance checks:

- `/tasks` opens a task push-sync connection.
- `/rates` opens a rate push-sync connection.
- Switching routes closes the old schema socket through the route cleanup callback.
- HTTP `/sync` remains available as an explicit pull helper.

Evidence:

- Browser Use opened `/tasks` and showed `Pushed sync received.` with the task cursor.
- Browser Use opened `/rates` and showed `Pushed sync received.` with the rate cursor.
- `src/client/sync.test.ts` covers `startPushSync` stop closing the socket.
- `src/client/sync.test.ts` push-sync coverage still passes.
- `bun run test` passed.
- `bun run check` passed.

Blockers:

- None.

## Current chunk

### WS-05 route enablement

Goal: make the active app route use push sync.

Tasks:

- [x] Replace `startPollingSync` startup in `HomeRoute` with push-first sync startup.
- [x] Stop the socket when route schema key changes or route unmounts.
- [x] Reset selected view/query/context state only through the route-key logic from PRD 01.
- [x] Keep schema editor using explicit fetch/save flows.
- [x] Surface simple sync status text for pushed, reconnecting, and error states.

Acceptance checks:

- [x] `/tasks` opens a task push-sync connection.
- [x] `/rates` opens a rate push-sync connection.
- [x] Switching routes closes the old schema socket.
- [x] HTTP `/sync` remains available as an explicit pull helper.

## Later chunks

### WS-06 browser smoke and cleanup

Goal: prove user-visible push sync.

Browser smoke:

- [x] Start app with `bun start`.
- [x] Open `/tasks` in Browser Use.
- [x] Create a task through the active route.
- [x] Confirm task push via local WebSocket smoke without waiting for polling.
- [x] Open `/rates` in Browser Use.
- [x] Create a rate-card resource through the active route.
- [x] Confirm task sockets do not receive rate-card records.
- [x] Open a stale task socket and confirm catch-up from cursor.
- [x] Leave the agent dev server running for the next agent.

Cleanup:

- [x] Remove polling fallback.
- [x] Remove obsolete polling-only startup code.
- [x] Keep route-keyed API code owned by PRD 01.

Status: shipped 2026-05-05.

Outcome:

- Browser Use verified the visible `/tasks` and `/rates` routes report pushed sync status.
- The in-app Browser Use backend exposed one live tab in this session, so the multi-replica smoke used direct local WebSocket clients against the same `https://hazel.formless.local` dev server.
- Two task sockets received the same committed task create.
- A rates socket received a committed resource create.
- A task socket stayed quiet for the rates resource create.
- A stale task socket caught up from cursor `0`.

Evidence:

- Browser Use status on `/tasks`: `Schema v1 · Cursor 5 · Pushed sync received.`
- Browser Use status on `/rates`: `Schema v1 · Cursor 17 · Pushed sync received.`
- Local WebSocket smoke created task `Socket smoke 1777955488467` and both task sockets received cursor `8`.
- Local WebSocket smoke created resource `Socket resource 1777955488480`; the rates socket received cursor `23`.
- Local WebSocket smoke confirmed no task socket message for the rates mutation.
- Local WebSocket smoke confirmed stale task catch-up to cursor `8` with `8` changes.
- `bun run test` passed.
- `bun run check` passed.

Blockers:

- None.

### WS-07 PRD status and promotion notes

Goal: record shipped facts for a later docs/steward pass.

Tasks:

- [x] Mark shipped chunks.
- [x] Add final decisions.
- [x] Add blockers if any remain.
- [x] Add promote notes.

Status: shipped 2026-05-05.

Outcome:

- PRD status is `shipped`.
- Chunk table marks WS-01 through WS-07 shipped.
- Final route-enable decision is recorded.
- Promote notes include server, client, route, and status-line shipped facts.
- Post-ship cleanup removes browser polling fallback.
- Blockers are clear.

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
- HTTP `/sync` still works as an explicit pull helper.

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
- Authority broadcasts committed create mutation, patch mutation, action, schema write, and reset sync messages.
- Authority broadcast uses hibernatable WebSockets from `ctx.getWebSockets()`.
- Authority broadcast catches per-socket send failures.
- Failed validation and mutation replay do not broadcast.
- HTTP remains the write path.
- Client push sync entrypoint: `startPushSync(schemaKey, options)`.
- Browser opens push sync per active schema key.
- Browser push sync no longer keeps polling fallback.
- Home route starts push sync after route-keyed bootstrap.
- Home route stops push sync when the route schema key changes or unmounts.
- Developer status line can show pushed, reconnecting, and error states.

Add to `doc/roadmap.md` after ship if it remains first-release scope:

- Browser replicas receive authority-pushed changes.
- Push sync is keyed by schema app.
- Push sync preserves route isolation.
- Remove `Keep polling fallback while push sync ships`.

## Blockers

- None through WS-07.
- PRD 01 SR-02 and SR-04 are shipped.

# Authority, Storage, And Sync

Last updated: 2026-05-19

## Current Facts

- Authority worker dispatch: `src/worker/index.ts`.
- Authority instances: `FORMLESS_AUTHORITY.idFromName(schemaKey)`.
- Authority routes: `src/worker/authority.ts`.
- Authority operation selection: `src/worker/authority-operations.ts`.
- Authority validation: `src/worker/authority-validation.ts`.
- Authority admin guard: `src/worker/authority-admin-guard.ts`.
- Storage code: `src/worker/storage.ts`.
- Storage tables: `records`, `changes`, `app_schema`, `action_executions`.
- HTTP remains the write path.
- Current API paths: `/api/:schemaKey/bootstrap`, `/api/:schemaKey/schema`, `/api/:schemaKey/tree/:slug`, `/api/:schemaKey/sync`, `/api/:schemaKey/sync/ws`, `/api/:schemaKey/mutations`, `/api/:schemaKey/actions`, `/api/:schemaKey/reset/schema`, `/api/:schemaKey/reset/seed`.
- Snapshot API paths: `/api/:schemaKey/snapshot`, `/api/:schemaKey/snapshot/restore`.
- Site media API paths include `/api/site/media/images` and `/api/site/media/*`.
- Reset code: `src/worker/authority.ts`, `src/worker/storage.ts`, `src/client/sync.ts`.

## Writes

- Authority committed write notifier: `AuthorityWriteModule` in `src/worker/authority.ts`.
- Storage write outcome helpers: `WriteOutcome`, `committedWrite`, `replayedWrite` in `src/worker/storage.ts`.
- Authority broadcasts committed create, patch, action, schema write, reset schema, and reset seed sync messages.
- Replayed mutation and action writes return stored responses without push notification.
- Failed validation and mutation replay do not broadcast.
- Snapshot restore is an authority write.
- Snapshot restore preserves monotonic sync cursors.

## Push Sync

- Push sync route: `/api/:schemaKey/sync/ws`.
- Push sync client entrypoint: `startPushSync(schemaKey, options)` in `src/client/sync.ts`.
- Pushed sync merge helper: `applySyncResponse(schemaKey, response)` in `src/client/sync.ts`.
- Push sync protocol types: `SyncSocketClientMessage`, `SyncSocketServerMessage`, `SyncSocketAttachment`.
- Authority accepts hibernatable Durable Object WebSockets.
- Authority socket handles `hello` and `sync-requested`.
- Authority socket catches up from client cursor.
- Authority socket omits schema when client timestamp is current.
- Browser push sync has no polling fallback.

## Browser Replica

- Browser replica is a local IndexedDB copy keyed by schema key.
- Browser local DBs: `formless:tasks`, `formless:estii`, `formless:site`.
- Browser local stores: `meta`, `records`.
- Browser DB code: `src/client/db.ts`.
- Browser broadcast channels: `formless:tasks`, `formless:estii`, `formless:site`.
- Client store: `src/client/store.ts`.
- Browser replica projection module: `src/client/projections.ts`.
- Developer sync status source: `src/client/sync-status.ts`.
- Developer status line: `src/app/routes/status-line.tsx`.

## Key Tests

- Protocol tests: `src/shared/protocol.test.ts`.
- Sync tests: `src/client/sync.test.ts`.
- Local DB tests: `src/client/db.test.ts`.
- Store tests: `src/client/store.test.ts`.
- Projection tests: `src/client/projections.test.ts`.
- Authority tests: `src/worker/authority.test.ts`.
- Authority operation tests: `src/worker/authority-operations.test.ts`.
- Authority admin guard tests: `src/worker/authority-admin-guard.test.ts`.
- Storage tests: `src/worker/storage.test.ts`.
- Worker routing tests: `src/worker/routing.test.ts`.

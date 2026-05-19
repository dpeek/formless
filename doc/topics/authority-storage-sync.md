# Authority, Storage, And Sync

Last updated: 2026-05-19

## Current Facts

- Authority worker dispatch: `src/worker/index.ts`.
- Authority instances: `FORMLESS_AUTHORITY.idFromName(schemaKey)`.
- Authority routes: `src/worker/authority.ts`.
- Authority operation selection: `src/worker/authority-operations.ts`.
- Authority validation: `src/worker/authority-validation.ts`.
- Authority admin guard: `src/worker/authority-admin-guard.ts`.
- `selectAuthorityOperation` returns operation `kind`, route `path`, HTTP `method`, and read/write `mode`.
- `src/worker/authority.ts` keeps HTTP response mapping, JSON body parsing, and WebSocket lifecycle handling.
- Storage code: `src/worker/storage.ts`.
- Storage tables: `records`, `changes`, `app_schema`, `action_executions`.
- HTTP remains the write path.
- Current API paths: `/api/:schemaKey/bootstrap`, `/api/:schemaKey/schema`, `/api/:schemaKey/tree/:slug`, `/api/:schemaKey/sync`, `/api/:schemaKey/sync/ws`, `/api/:schemaKey/mutations`, `/api/:schemaKey/actions`, `/api/:schemaKey/reset/schema`, `/api/:schemaKey/reset/seed`.
- Snapshot API paths: `/api/:schemaKey/snapshot`, `/api/:schemaKey/snapshot/restore`.
- Site media API paths include `/api/site/media/images` and `/api/site/media/*`.
- Site media route handling runs before Authority dispatch in `src/worker/index.ts`.
- Site media upload and restore use the `FORMLESS_MEDIA` R2 binding, not Durable Object storage.
- Site media upload and restore use the same admin bearer-token guard as authority writes.
- Site media reads are public and do not touch the Authority Durable Object.
- Authority responses default to `Cache-Control: no-store` when an operation does not set cache headers.
- Public Site tree API reads use `Cache-Control: no-store`.
- Reset code: `src/worker/authority.ts`, `src/worker/storage.ts`, `src/client/sync.ts`.
- Fresh authority bootstrap initializes storage from source schema and source seed records when no stored schema exists.
- Source seed records produce create rows in `changes` during source bootstrap and reset seed.
- Reset schema restores the source schema, validates existing records, prunes fields no longer in schema, and preserves records.
- Normal schema updates reject removing or renaming fields.
- Source schema reset can remove retired fields and emits patch changes for pruned stored values.
- Reset seed clears records, changes, action executions, and the active schema before writing source schema and source seed records.
- Snapshot protocol parser: `parseStoreSnapshot` in `src/shared/protocol.ts`.
- Snapshot JSON fields: `kind`, `version`, `schemaKey`, `exportedAt`, `schemaUpdatedAt`, `sourceCursor`, `schema`, `records`.
- Snapshot export reads authority storage, not browser IndexedDB.
- Snapshot restore validates the envelope, schema key, schema, records, references, timestamps, and unique constraints before commit.
- Snapshot restore returns a bootstrap-shaped response.
- Client snapshot restore saves the selected local replica through `src/client/sync.ts`.
- Write operations require `Authorization: Bearer <FORMLESS_ADMIN_TOKEN>` when `FORMLESS_ADMIN_TOKEN` is configured.
- Read operations stay public when the admin token is configured.
- Unauthorized writes return `401` before JSON body parsing, storage setup, or operation execution.

## Writes

- Authority committed write notifier: `AuthorityWriteModule` in `src/worker/authority.ts`.
- Storage write outcome helpers: `WriteOutcome`, `committedWrite`, `replayedWrite` in `src/worker/storage.ts`.
- Authority write notification uses `ctx.getWebSockets()`.
- Authority broadcasts committed create, patch, delete, action, schema write, reset schema, and reset seed sync messages.
- Authority broadcast is best effort per socket; one stale socket does not block later sockets.
- Replayed mutation and action writes return stored responses without push notification.
- Failed validation and mutation replay do not broadcast.
- Delete mutation storage writer: `deleteStoredRecordOutcome` in `src/worker/storage.ts`.
- Delete mutations soft-delete by setting `deletedAt`.
- Delete mutations keep the record row, `id`, `entity`, `values`, and `createdAt`.
- Delete mutations append an `op: "delete"` change row with the tombstoned record payload.
- Delete validation rejects deletes when an active record references the target through a schema reference field.
- Tombstoned referencing records do not block delete validation.
- Replayed delete mutation IDs do not insert duplicate changes.
- Snapshot restore is an authority write.
- Snapshot restore preserves monotonic sync cursors.
- Snapshot restore clears `action_executions`.

## Push Sync

- Push sync route: `/api/:schemaKey/sync/ws`.
- Push sync client entrypoint: `startPushSync(schemaKey, options)` in `src/client/sync.ts`.
- Pushed sync merge helper: `applySyncResponse(schemaKey, response)` in `src/client/sync.ts`.
- Push sync protocol types: `SyncSocketClientMessage`, `SyncSocketServerMessage`, `SyncSocketAttachment`.
- Authority accepts hibernatable Durable Object WebSockets.
- Authority socket handles `hello` and `sync-requested`.
- Authority socket catches up from client cursor.
- Accepted sockets store cursor and schema timestamp in serialized socket attachments.
- Authority socket omits schema when client timestamp is current.
- Browser push sync has no polling fallback.

## Browser Replica

- Browser replica is a local IndexedDB copy keyed by schema key.
- Browser local DBs: `formless:tasks`, `formless:estii`, `formless:site`.
- Browser local stores: `meta`, `records`.
- Browser DB code: `src/client/db.ts`.
- Browser broadcast channels: `formless:tasks`, `formless:estii`, `formless:site`.
- When `VITE_FORMLESS_SITE_PROJECT_ID` is set, browser DB and broadcast names include the project id: `formless:<projectId>:<schemaKey>`.
- Client store: `src/client/store.ts`.
- Browser replica projection module: `src/client/projections.ts`.
- Browser replica projection inputs use `BrowserReplicaProjectionSnapshot` from `src/client/projections.ts`.
- Projection selectors own query ids, query options, query counts, reference options, reference counts, aggregate values, and readiness warnings.
- Store hooks in `src/client/store.ts` adapt projection selectors.
- Browser replica mutation, hydration, merge, delete reconciliation, and subscriptions stay in `src/client/store.ts`.
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

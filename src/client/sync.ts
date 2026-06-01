import { listenForClientEvents, publishClientEvent } from "./broadcast.ts";
import { appStorageIdentityForClientTarget, type ClientAppTarget } from "./app-target.ts";
import { packageAppFactsForKey } from "../shared/app-installs.ts";
import { FORMLESS_RUNTIME_PROTOCOL_VERSION } from "../shared/deploy-metadata.ts";
import {
  deleteClientDb,
  mergeChanges,
  readCursor,
  readSchemaUpdatedAt,
  saveBootstrapResponse,
  saveSchema,
} from "./db.ts";
import {
  applyBootstrapResponse,
  applyChanges,
  applySchemaSave,
  resetClientStore,
} from "./store.ts";
import { setSyncStatus } from "./sync-status.ts";
import { createActionId, createMutationId } from "../shared/ids.ts";
import {
  FORMLESS_CLIENT_PACKAGE_REVISION_HEADER,
  FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER,
  FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER,
  FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER,
  isSyncSocketServerMessage,
  type ActionRequest,
  type ActionResponse,
  type BootstrapResponse,
  type CreateMutation,
  type DeleteMutation,
  type EntityName,
  type MutationResponse,
  type PatchMutation,
  type RecordValues,
  type SchemaResponse,
  type SchemaUpdateResponse,
  type StoreSnapshot,
  type SyncResponse,
  type SyncSocketClientMessage,
  type SyncSocketServerMessage,
} from "../shared/protocol.ts";
import type { AppSchema } from "../shared/schema.ts";

const DEFAULT_RECONNECT_INITIAL_DELAY_MS = 500;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 5000;
const WEB_SOCKET_OPEN_READY_STATE = 1;

type SyncWebSocket = {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
};

type StartPushSyncOptions = {
  onSynced?: () => void;
  reconnectInitialDelayMs?: number;
  reconnectMaxDelayMs?: number;
  socketFactory?: (url: string) => SyncWebSocket;
};

export async function bootstrapClient(target: ClientAppTarget, fetcher: typeof fetch = fetch) {
  const identity = appStorageIdentityForClientTarget(target);
  const response = await fetchJson<BootstrapResponse>(fetcher, apiPath(identity, "bootstrap"));

  await saveBootstrapResponse(identity, response);
  applyBootstrapResponse(response, identity);
  notifyLocalDataChanged(identity, { schemaChanged: true });

  return response;
}

export async function syncClient(target: ClientAppTarget, fetcher: typeof fetch = fetch) {
  const identity = appStorageIdentityForClientTarget(target);
  const cursor = await readCursor(identity);
  const schemaUpdatedAt = await readSchemaUpdatedAt(identity);
  const url = syncUrl(identity, cursor, schemaUpdatedAt);
  const response = await fetchJson<SyncResponse>(fetcher, url);

  await applySyncResponse(identity, response, { currentCursor: cursor });

  return response;
}

export async function applySyncResponse(
  target: ClientAppTarget,
  response: SyncResponse,
  options: { currentCursor?: number } = {},
) {
  const identity = appStorageIdentityForClientTarget(target);
  const cursor = options.currentCursor ?? (await readCursor(identity));
  const schemaChanged = Boolean(response.schema && response.schemaUpdatedAt);

  if (response.schema && response.schemaUpdatedAt) {
    await saveSchema(identity, response.schema, response.schemaUpdatedAt);
    applySchemaSave(response.schema, response.schemaUpdatedAt, identity);
  }

  if (response.changes.length > 0 || response.cursor !== cursor) {
    await mergeChanges(identity, response.changes, response.cursor);
    applyChanges(response.changes, response.cursor, identity);
  }

  if (response.changes.length > 0 || response.cursor !== cursor || schemaChanged) {
    notifyLocalDataChanged(identity, { schemaChanged });
  }

  return response;
}

export async function fetchActiveSchema(target: ClientAppTarget, fetcher: typeof fetch = fetch) {
  const identity = appStorageIdentityForClientTarget(target);
  const response = await fetchJson<SchemaResponse>(fetcher, apiPath(identity, "schema"));

  await saveSchema(identity, response.schema, response.updatedAt);
  applySchemaSave(response.schema, response.updatedAt, identity);
  notifySchemaChanged(identity);

  return response;
}

export async function saveActiveSchema(
  target: ClientAppTarget,
  schema: AppSchema,
  fetcher: typeof fetch = fetch,
) {
  const identity = appStorageIdentityForClientTarget(target);
  const response = await postJson<SchemaUpdateResponse>(fetcher, apiPath(identity, "schema"), {
    schema,
  });

  await saveSchema(identity, response.schema, response.updatedAt);
  applySchemaSave(response.schema, response.updatedAt, identity);
  notifySchemaChanged(identity);

  return response;
}

export async function exportStoreSnapshot(target: ClientAppTarget, fetcher: typeof fetch = fetch) {
  const identity = appStorageIdentityForClientTarget(target);

  return fetchJson<StoreSnapshot>(fetcher, apiPath(identity, "snapshot"));
}

export async function restoreStoreSnapshot(
  target: ClientAppTarget,
  snapshot: unknown,
  fetcher: typeof fetch = fetch,
) {
  const identity = appStorageIdentityForClientTarget(target);
  const response = await postJson<BootstrapResponse>(
    fetcher,
    apiPath(identity, "snapshot/restore"),
    snapshot,
  );

  await saveBootstrapResponse(identity, response);
  applyBootstrapResponse(response, identity);
  notifyLocalDataChanged(identity, { schemaChanged: true });

  return response;
}

export async function submitCreateMutation(
  target: ClientAppTarget,
  entity: EntityName,
  values: RecordValues,
  fetcher: typeof fetch = fetch,
) {
  const identity = appStorageIdentityForClientTarget(target);
  const mutation: CreateMutation = {
    mutationId: createMutationId(),
    entity,
    op: "create",
    values,
  };

  const response = await postJson<MutationResponse>(
    fetcher,
    apiPath(identity, "mutations"),
    mutation,
    { writeCompatibilityTarget: identity },
  );

  await mergeChanges(identity, response.changes, response.cursor);
  applyChanges(response.changes, response.cursor, identity);
  notifyLocalDataChanged(identity);

  return response;
}

export async function submitPatchMutation(
  target: ClientAppTarget,
  entity: EntityName,
  recordId: string,
  values: Partial<RecordValues>,
  fetcher: typeof fetch = fetch,
) {
  const identity = appStorageIdentityForClientTarget(target);
  const mutation: PatchMutation = {
    mutationId: createMutationId(),
    entity,
    op: "patch",
    recordId,
    values,
  };

  const response = await postJson<MutationResponse>(
    fetcher,
    apiPath(identity, "mutations"),
    mutation,
    { writeCompatibilityTarget: identity },
  );

  await mergeChanges(identity, response.changes, response.cursor);
  applyChanges(response.changes, response.cursor, identity);
  notifyLocalDataChanged(identity);

  return response;
}

export async function submitDeleteMutation(
  target: ClientAppTarget,
  entity: EntityName,
  recordId: string,
  fetcher: typeof fetch = fetch,
) {
  const identity = appStorageIdentityForClientTarget(target);
  const mutation: DeleteMutation = {
    mutationId: createMutationId(),
    entity,
    op: "delete",
    recordId,
  };

  const response = await postJson<MutationResponse>(
    fetcher,
    apiPath(identity, "mutations"),
    mutation,
    { writeCompatibilityTarget: identity },
  );

  await mergeChanges(identity, response.changes, response.cursor);
  applyChanges(response.changes, response.cursor, identity);
  notifyLocalDataChanged(identity);

  return response;
}

export async function submitAction(
  target: ClientAppTarget,
  entity: EntityName,
  actionName: string,
  inputOrFetcher?: ActionRequest["input"] | typeof fetch,
  maybeFetcher?: typeof fetch,
) {
  const identity = appStorageIdentityForClientTarget(target);
  const input = typeof inputOrFetcher === "function" ? undefined : inputOrFetcher;
  const fetcher = typeof inputOrFetcher === "function" ? inputOrFetcher : (maybeFetcher ?? fetch);
  const action: ActionRequest = {
    actionId: createActionId(),
    entity,
    action: actionName,
    ...(input === undefined ? {} : { input }),
  };

  const response = await postJson<ActionResponse>(fetcher, apiPath(identity, "actions"), action, {
    writeCompatibilityTarget: identity,
  });

  await mergeChanges(identity, response.changes, response.cursor);
  applyChanges(response.changes, response.cursor, identity);
  notifyLocalDataChanged(identity);

  return response;
}

export async function resetSourceSchema(target: ClientAppTarget, fetcher: typeof fetch = fetch) {
  const identity = appStorageIdentityForClientTarget(target);
  const response = await postJson<BootstrapResponse>(
    fetcher,
    apiPath(identity, "reset/schema"),
    {},
  );

  await saveBootstrapResponse(identity, response);
  applyBootstrapResponse(response, identity);
  notifyLocalDataChanged(identity, { schemaChanged: true });

  return response;
}

export async function resetSeedData(target: ClientAppTarget, fetcher: typeof fetch = fetch) {
  const identity = appStorageIdentityForClientTarget(target);
  const response = await postJson<BootstrapResponse>(fetcher, apiPath(identity, "reset/seed"), {});

  resetClientStore();
  await deleteClientDb(identity);
  await saveBootstrapResponse(identity, response);
  applyBootstrapResponse(response, identity);
  notifyLocalDataChanged(identity, { schemaChanged: true });

  return response;
}

export function startPushSync(target: ClientAppTarget, options: StartPushSyncOptions = {}) {
  const identity = appStorageIdentityForClientTarget(target);
  const onSynced = options.onSynced;
  const reconnectInitialDelayMs =
    options.reconnectInitialDelayMs ?? DEFAULT_RECONNECT_INITIAL_DELAY_MS;
  const reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS;
  const socketFactory = options.socketFactory ?? createWebSocket;
  let stopped = false;
  let socket: SyncWebSocket | undefined;
  let reconnectTimerId: ReturnType<typeof setTimeout> | undefined;
  let reconnectDelayMs = reconnectInitialDelayMs;
  let stopListening = () => {};

  function connect() {
    if (stopped) {
      return;
    }

    setSyncStatus({ state: "syncing", message: "Connecting push sync..." });

    let nextSocket: SyncWebSocket;

    try {
      nextSocket = socketFactory(syncWebSocketUrl(identity));
    } catch {
      setSyncStatus({ state: "error", message: "Push sync unavailable." });
      return;
    }

    socket = nextSocket;
    let opened = false;

    nextSocket.onopen = () => {
      if (stopped || socket !== nextSocket) {
        return;
      }

      opened = true;
      reconnectDelayMs = reconnectInitialDelayMs;
      setSyncStatus({ state: "idle", message: "Push sync connected." });
      void sendSyncSocketClientMessage(identity, nextSocket, "hello").catch(() => {
        if (!stopped && socket === nextSocket) {
          nextSocket.close();
        }
      });
    };

    nextSocket.onmessage = (event) => {
      if (stopped || socket !== nextSocket) {
        return;
      }

      void handleSyncSocketMessage(identity, event)
        .then((didApplySync) => {
          if (didApplySync && !stopped && socket === nextSocket) {
            onSynced?.();
          }
        })
        .catch((error: unknown) => {
          setSyncStatus({
            state: "error",
            message: error instanceof Error ? error.message : "Push sync failed.",
          });
        });
    };

    nextSocket.onerror = () => {
      if (stopped || socket !== nextSocket) {
        return;
      }

      if (!opened) {
        socket = undefined;
        setSyncStatus({ state: "error", message: "Push sync connection failed." });
        return;
      }

      setSyncStatus({ state: "syncing", message: "Push sync connection issue." });
    };

    nextSocket.onclose = () => {
      if (stopped || socket !== nextSocket) {
        return;
      }

      socket = undefined;

      if (!opened) {
        setSyncStatus({ state: "error", message: "Push sync connection failed." });
        return;
      }

      setSyncStatus({ state: "syncing", message: "Push sync reconnecting..." });
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (stopped) {
      return;
    }

    const delayMs = reconnectDelayMs;
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, reconnectMaxDelayMs);
    reconnectTimerId = globalThis.setTimeout(() => {
      reconnectTimerId = undefined;
      connect();
    }, delayMs);
  }

  function requestSocketSync() {
    const currentSocket = socket;

    if (currentSocket && currentSocket.readyState === WEB_SOCKET_OPEN_READY_STATE) {
      void sendSyncSocketClientMessage(identity, currentSocket, "sync-requested").catch(() => {
        if (!stopped && socket === currentSocket) {
          currentSocket.close();
        }
      });
    }
  }

  stopListening = listenForClientEvents(identity, (event) => {
    if (event.type === "sync-requested") {
      requestSocketSync();
    }
  });

  connect();

  return () => {
    stopped = true;
    stopListening();
    clearReconnectTimer();
    socket?.close();
    socket = undefined;
  };

  function clearReconnectTimer() {
    if (reconnectTimerId !== undefined) {
      globalThis.clearTimeout(reconnectTimerId);
      reconnectTimerId = undefined;
    }
  }
}

export function requestSync(target: ClientAppTarget) {
  const identity = appStorageIdentityForClientTarget(target);

  publishClientEvent(identity, "sync-requested");
}

function createWebSocket(url: string): SyncWebSocket {
  return new WebSocket(url);
}

async function sendSyncSocketClientMessage(
  target: ClientAppTarget,
  socket: SyncWebSocket,
  type: SyncSocketClientMessage["type"],
) {
  const identity = appStorageIdentityForClientTarget(target);
  const message = {
    type,
    cursor: await readCursor(identity),
    schemaUpdatedAt: await readSchemaUpdatedAt(identity),
  } satisfies SyncSocketClientMessage;

  socket.send(JSON.stringify(message));
}

async function handleSyncSocketMessage(target: ClientAppTarget, event: MessageEvent) {
  const message = parseSyncSocketServerMessage(event.data);

  if (!message) {
    throw new Error("Malformed sync socket message.");
  }

  if (message.type === "error") {
    setSyncStatus({ state: "error", message: message.message });
    return false;
  }

  await applySyncResponse(target, message.payload);
  setSyncStatus({ state: "idle", message: "Pushed sync received." });
  return true;
}

function parseSyncSocketServerMessage(data: unknown): SyncSocketServerMessage | undefined {
  if (typeof data !== "string") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(data) as unknown;

    return isSyncSocketServerMessage(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function fetchJson<T>(fetcher: typeof fetch, url: string): Promise<T> {
  const response = await fetcher(url, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  });

  return parseJsonResponse<T>(response);
}

async function postJson<T>(
  fetcher: typeof fetch,
  url: string,
  body: unknown,
  options: { writeCompatibilityTarget?: ClientAppTarget } = {},
): Promise<T> {
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
  });

  if (options.writeCompatibilityTarget) {
    await addBrowserReplicaWriteHeaders(headers, options.writeCompatibilityTarget);
  }

  const response = await fetcher(url, {
    credentials: "same-origin",
    headers,
    body: JSON.stringify(body),
    method: "POST",
  });

  return parseJsonResponse<T>(response);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const message = isErrorResponse(body)
      ? body.error
      : `Request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return body as T;
}

async function addBrowserReplicaWriteHeaders(headers: Headers, target: ClientAppTarget) {
  const identity = appStorageIdentityForClientTarget(target);
  const schemaUpdatedAt = await readSchemaUpdatedAt(identity);
  const packageFacts = packageAppFactsForKey(identity.packageAppKey);

  headers.set(FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER, String(FORMLESS_RUNTIME_PROTOCOL_VERSION));

  if (schemaUpdatedAt) {
    headers.set(FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER, schemaUpdatedAt);
  }

  if (packageFacts) {
    headers.set(FORMLESS_CLIENT_PACKAGE_REVISION_HEADER, String(packageFacts.packageRevision));
    headers.set(FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER, packageFacts.sourceSchemaHash);
  }
}

function notifyLocalDataChanged(
  target: ClientAppTarget,
  options: { schemaChanged?: boolean } = {},
) {
  publishClientEvent(target, "records-updated");
  publishClientEvent(target, "cursor-updated");
  if (options.schemaChanged) {
    publishClientEvent(target, "schema-updated");
  }
}

function notifySchemaChanged(target: ClientAppTarget) {
  publishClientEvent(target, "schema-updated");
}

function isErrorResponse(value: unknown): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "error" in value &&
    typeof value.error === "string"
  );
}

function apiPath(target: ClientAppTarget, path: string) {
  const identity = appStorageIdentityForClientTarget(target);

  return `${identity.apiRoutePrefix}/${path}`;
}

function syncUrl(target: ClientAppTarget, cursor: number, schemaUpdatedAt: string | null) {
  const params = new URLSearchParams({ after: String(cursor) });

  if (schemaUpdatedAt) {
    params.set("schemaUpdatedAt", schemaUpdatedAt);
  }

  return `${apiPath(target, "sync")}?${params.toString()}`;
}

function syncWebSocketUrl(target: ClientAppTarget) {
  const baseUrl =
    typeof globalThis.location === "undefined" ? "http://localhost/" : globalThis.location.href;
  const url = new URL(apiPath(target, "sync/ws"), baseUrl);

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  return url.toString();
}

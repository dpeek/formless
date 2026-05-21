import { listenForClientEvents, publishClientEvent } from "./broadcast.ts";
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
import type { SchemaKey } from "../shared/schema-apps.ts";
import type {
  ActionRequest,
  ActionResponse,
  BootstrapResponse,
  CreateMutation,
  DeleteMutation,
  EntityName,
  MutationResponse,
  PatchMutation,
  RecordValues,
  SchemaResponse,
  SchemaUpdateResponse,
  StoreSnapshot,
  SyncSocketClientMessage,
  SyncSocketServerMessage,
  SyncResponse,
} from "../shared/protocol.ts";
import { isSyncSocketServerMessage } from "../shared/protocol.ts";
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

export async function bootstrapClient(schemaKey: SchemaKey, fetcher: typeof fetch = fetch) {
  const response = await fetchJson<BootstrapResponse>(fetcher, apiPath(schemaKey, "bootstrap"));

  await saveBootstrapResponse(schemaKey, response);
  applyBootstrapResponse(response, schemaKey);
  notifyLocalDataChanged(schemaKey, { schemaChanged: true });

  return response;
}

export async function syncClient(schemaKey: SchemaKey, fetcher: typeof fetch = fetch) {
  const cursor = await readCursor(schemaKey);
  const schemaUpdatedAt = await readSchemaUpdatedAt(schemaKey);
  const url = syncUrl(schemaKey, cursor, schemaUpdatedAt);
  const response = await fetchJson<SyncResponse>(fetcher, url);

  await applySyncResponse(schemaKey, response, { currentCursor: cursor });

  return response;
}

export async function applySyncResponse(
  schemaKey: SchemaKey,
  response: SyncResponse,
  options: { currentCursor?: number } = {},
) {
  const cursor = options.currentCursor ?? (await readCursor(schemaKey));
  const schemaChanged = Boolean(response.schema && response.schemaUpdatedAt);

  if (response.schema && response.schemaUpdatedAt) {
    await saveSchema(schemaKey, response.schema, response.schemaUpdatedAt);
    applySchemaSave(response.schema, response.schemaUpdatedAt, schemaKey);
  }

  if (response.changes.length > 0 || response.cursor !== cursor) {
    await mergeChanges(schemaKey, response.changes, response.cursor);
    applyChanges(response.changes, response.cursor, schemaKey);
  }

  if (response.changes.length > 0 || response.cursor !== cursor || schemaChanged) {
    notifyLocalDataChanged(schemaKey, { schemaChanged });
  }

  return response;
}

export async function fetchActiveSchema(schemaKey: SchemaKey, fetcher: typeof fetch = fetch) {
  const response = await fetchJson<SchemaResponse>(fetcher, apiPath(schemaKey, "schema"));

  await saveSchema(schemaKey, response.schema, response.updatedAt);
  applySchemaSave(response.schema, response.updatedAt, schemaKey);
  notifySchemaChanged(schemaKey);

  return response;
}

export async function saveActiveSchema(
  schemaKey: SchemaKey,
  schema: AppSchema,
  fetcher: typeof fetch = fetch,
) {
  const response = await postJson<SchemaUpdateResponse>(fetcher, apiPath(schemaKey, "schema"), {
    schema,
  });

  await saveSchema(schemaKey, response.schema, response.updatedAt);
  applySchemaSave(response.schema, response.updatedAt, schemaKey);
  notifySchemaChanged(schemaKey);

  return response;
}

export async function exportStoreSnapshot(schemaKey: SchemaKey, fetcher: typeof fetch = fetch) {
  return fetchJson<StoreSnapshot>(fetcher, apiPath(schemaKey, "snapshot"));
}

export async function restoreStoreSnapshot(
  schemaKey: SchemaKey,
  snapshot: unknown,
  fetcher: typeof fetch = fetch,
) {
  const response = await postJson<BootstrapResponse>(
    fetcher,
    apiPath(schemaKey, "snapshot/restore"),
    snapshot,
  );

  await saveBootstrapResponse(schemaKey, response);
  applyBootstrapResponse(response, schemaKey);
  notifyLocalDataChanged(schemaKey, { schemaChanged: true });

  return response;
}

export async function submitCreateMutation(
  schemaKey: SchemaKey,
  entity: EntityName,
  values: RecordValues,
  fetcher: typeof fetch = fetch,
) {
  const mutation: CreateMutation = {
    mutationId: createMutationId(),
    entity,
    op: "create",
    values,
  };

  const response = await postJson<MutationResponse>(
    fetcher,
    apiPath(schemaKey, "mutations"),
    mutation,
  );

  await mergeChanges(schemaKey, response.changes, response.cursor);
  applyChanges(response.changes, response.cursor, schemaKey);
  notifyLocalDataChanged(schemaKey);

  return response;
}

export async function submitPatchMutation(
  schemaKey: SchemaKey,
  entity: EntityName,
  recordId: string,
  values: Partial<RecordValues>,
  fetcher: typeof fetch = fetch,
) {
  const mutation: PatchMutation = {
    mutationId: createMutationId(),
    entity,
    op: "patch",
    recordId,
    values,
  };

  const response = await postJson<MutationResponse>(
    fetcher,
    apiPath(schemaKey, "mutations"),
    mutation,
  );

  await mergeChanges(schemaKey, response.changes, response.cursor);
  applyChanges(response.changes, response.cursor, schemaKey);
  notifyLocalDataChanged(schemaKey);

  return response;
}

export async function submitDeleteMutation(
  schemaKey: SchemaKey,
  entity: EntityName,
  recordId: string,
  fetcher: typeof fetch = fetch,
) {
  const mutation: DeleteMutation = {
    mutationId: createMutationId(),
    entity,
    op: "delete",
    recordId,
  };

  const response = await postJson<MutationResponse>(
    fetcher,
    apiPath(schemaKey, "mutations"),
    mutation,
  );

  await mergeChanges(schemaKey, response.changes, response.cursor);
  applyChanges(response.changes, response.cursor, schemaKey);
  notifyLocalDataChanged(schemaKey);

  return response;
}

export async function submitAction(
  schemaKey: SchemaKey,
  entity: EntityName,
  actionName: string,
  inputOrFetcher?: ActionRequest["input"] | typeof fetch,
  maybeFetcher?: typeof fetch,
) {
  const input = typeof inputOrFetcher === "function" ? undefined : inputOrFetcher;
  const fetcher = typeof inputOrFetcher === "function" ? inputOrFetcher : (maybeFetcher ?? fetch);
  const action: ActionRequest = {
    actionId: createActionId(),
    entity,
    action: actionName,
    ...(input === undefined ? {} : { input }),
  };

  const response = await postJson<ActionResponse>(fetcher, apiPath(schemaKey, "actions"), action);

  await mergeChanges(schemaKey, response.changes, response.cursor);
  applyChanges(response.changes, response.cursor, schemaKey);
  notifyLocalDataChanged(schemaKey);

  return response;
}

export async function resetSourceSchema(schemaKey: SchemaKey, fetcher: typeof fetch = fetch) {
  const response = await postJson<BootstrapResponse>(
    fetcher,
    apiPath(schemaKey, "reset/schema"),
    {},
  );

  await saveBootstrapResponse(schemaKey, response);
  applyBootstrapResponse(response, schemaKey);
  notifyLocalDataChanged(schemaKey, { schemaChanged: true });

  return response;
}

export async function resetSeedData(schemaKey: SchemaKey, fetcher: typeof fetch = fetch) {
  const response = await postJson<BootstrapResponse>(fetcher, apiPath(schemaKey, "reset/seed"), {});

  resetClientStore();
  await deleteClientDb(schemaKey);
  await saveBootstrapResponse(schemaKey, response);
  applyBootstrapResponse(response, schemaKey);
  notifyLocalDataChanged(schemaKey, { schemaChanged: true });

  return response;
}

export function startPushSync(schemaKey: SchemaKey, options: StartPushSyncOptions = {}) {
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
      nextSocket = socketFactory(syncWebSocketUrl(schemaKey));
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
      void sendSyncSocketClientMessage(schemaKey, nextSocket, "hello").catch(() => {
        if (!stopped && socket === nextSocket) {
          nextSocket.close();
        }
      });
    };

    nextSocket.onmessage = (event) => {
      if (stopped || socket !== nextSocket) {
        return;
      }

      void handleSyncSocketMessage(schemaKey, event)
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
      void sendSyncSocketClientMessage(schemaKey, currentSocket, "sync-requested").catch(() => {
        if (!stopped && socket === currentSocket) {
          currentSocket.close();
        }
      });
    }
  }

  stopListening = listenForClientEvents(schemaKey, (event) => {
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

export function requestSync(schemaKey: SchemaKey) {
  publishClientEvent(schemaKey, "sync-requested");
}

function createWebSocket(url: string): SyncWebSocket {
  return new WebSocket(url);
}

async function sendSyncSocketClientMessage(
  schemaKey: SchemaKey,
  socket: SyncWebSocket,
  type: SyncSocketClientMessage["type"],
) {
  const message = {
    type,
    cursor: await readCursor(schemaKey),
    schemaUpdatedAt: await readSchemaUpdatedAt(schemaKey),
  } satisfies SyncSocketClientMessage;

  socket.send(JSON.stringify(message));
}

async function handleSyncSocketMessage(schemaKey: SchemaKey, event: MessageEvent) {
  const message = parseSyncSocketServerMessage(event.data);

  if (!message) {
    throw new Error("Malformed sync socket message.");
  }

  if (message.type === "error") {
    setSyncStatus({ state: "error", message: message.message });
    return false;
  }

  await applySyncResponse(schemaKey, message.payload);
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

async function postJson<T>(fetcher: typeof fetch, url: string, body: unknown): Promise<T> {
  const response = await fetcher(url, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
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

function notifyLocalDataChanged(schemaKey: SchemaKey, options: { schemaChanged?: boolean } = {}) {
  publishClientEvent(schemaKey, "records-updated");
  publishClientEvent(schemaKey, "cursor-updated");
  if (options.schemaChanged) {
    publishClientEvent(schemaKey, "schema-updated");
  }
}

function notifySchemaChanged(schemaKey: SchemaKey) {
  publishClientEvent(schemaKey, "schema-updated");
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

function apiPath(schemaKey: SchemaKey, path: string) {
  return `/api/${schemaKey}/${path}`;
}

function syncUrl(schemaKey: SchemaKey, cursor: number, schemaUpdatedAt: string | null) {
  const params = new URLSearchParams({ after: String(cursor) });

  if (schemaUpdatedAt) {
    params.set("schemaUpdatedAt", schemaUpdatedAt);
  }

  return `${apiPath(schemaKey, "sync")}?${params.toString()}`;
}

function syncWebSocketUrl(schemaKey: SchemaKey) {
  const baseUrl =
    typeof globalThis.location === "undefined" ? "http://localhost/" : globalThis.location.href;
  const url = new URL(apiPath(schemaKey, "sync/ws"), baseUrl);

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  return url.toString();
}

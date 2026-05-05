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
import { createActionId, createMutationId } from "../shared/ids.ts";
import type { SchemaKey } from "../shared/schema-apps.ts";
import type {
  ActionRequest,
  ActionResponse,
  BootstrapResponse,
  CreateMutation,
  EntityName,
  MutationResponse,
  PatchMutation,
  RecordValues,
  SchemaResponse,
  SchemaUpdateResponse,
  SyncResponse,
} from "../shared/protocol.ts";
import type { AppSchema } from "../shared/schema.ts";

const DEFAULT_POLL_INTERVAL_MS = 1500;

export async function bootstrapClient(schemaKey: SchemaKey, fetcher: typeof fetch = fetch) {
  const response = await fetchJson<BootstrapResponse>(fetcher, apiPath(schemaKey, "bootstrap"));

  await saveBootstrapResponse(schemaKey, response);
  applyBootstrapResponse(response);
  notifyLocalDataChanged(schemaKey, { schemaChanged: true });

  return response;
}

export async function syncClient(schemaKey: SchemaKey, fetcher: typeof fetch = fetch) {
  const cursor = await readCursor(schemaKey);
  const schemaUpdatedAt = await readSchemaUpdatedAt(schemaKey);
  const url = syncUrl(schemaKey, cursor, schemaUpdatedAt);
  const response = await fetchJson<SyncResponse>(fetcher, url);

  const schemaChanged = Boolean(response.schema && response.schemaUpdatedAt);

  if (response.schema && response.schemaUpdatedAt) {
    await saveSchema(schemaKey, response.schema, response.schemaUpdatedAt);
    applySchemaSave(response.schema, response.schemaUpdatedAt);
  }

  if (response.changes.length > 0 || response.cursor !== cursor) {
    await mergeChanges(schemaKey, response.changes, response.cursor);
    applyChanges(response.changes, response.cursor);
  }

  if (response.changes.length > 0 || response.cursor !== cursor || schemaChanged) {
    notifyLocalDataChanged(schemaKey, { schemaChanged });
  }

  return response;
}

export async function fetchActiveSchema(schemaKey: SchemaKey, fetcher: typeof fetch = fetch) {
  const response = await fetchJson<SchemaResponse>(fetcher, apiPath(schemaKey, "schema"));

  await saveSchema(schemaKey, response.schema, response.updatedAt);
  applySchemaSave(response.schema, response.updatedAt);
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
  applySchemaSave(response.schema, response.updatedAt);
  notifySchemaChanged(schemaKey);

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
  applyChanges(response.changes, response.cursor);
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
  applyChanges(response.changes, response.cursor);
  notifyLocalDataChanged(schemaKey);

  return response;
}

export async function submitAction(
  schemaKey: SchemaKey,
  entity: EntityName,
  actionName: string,
  fetcher: typeof fetch = fetch,
) {
  const action: ActionRequest = {
    actionId: createActionId(),
    entity,
    action: actionName,
  };

  const response = await postJson<ActionResponse>(fetcher, apiPath(schemaKey, "actions"), action);

  await mergeChanges(schemaKey, response.changes, response.cursor);
  applyChanges(response.changes, response.cursor);
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
  applyBootstrapResponse(response);
  notifyLocalDataChanged(schemaKey, { schemaChanged: true });

  return response;
}

export async function resetSeedData(schemaKey: SchemaKey, fetcher: typeof fetch = fetch) {
  const response = await postJson<BootstrapResponse>(fetcher, apiPath(schemaKey, "reset/seed"), {});

  resetClientStore();
  await deleteClientDb(schemaKey);
  await saveBootstrapResponse(schemaKey, response);
  applyBootstrapResponse(response);
  notifyLocalDataChanged(schemaKey, { schemaChanged: true });

  return response;
}

export function startPollingSync(
  schemaKey: SchemaKey,
  options: { intervalMs?: number; fetcher?: typeof fetch } = {},
) {
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const fetcher = options.fetcher ?? fetch;
  const stopListening = listenForClientEvents(schemaKey, (event) => {
    if (event.type === "sync-requested") {
      void syncClient(schemaKey, fetcher);
    }
  });

  void syncClient(schemaKey, fetcher);

  const intervalId = window.setInterval(() => {
    void syncClient(schemaKey, fetcher);
  }, intervalMs);

  return () => {
    stopListening();
    window.clearInterval(intervalId);
  };
}

export function requestSync(schemaKey: SchemaKey) {
  publishClientEvent(schemaKey, "sync-requested");
}

async function fetchJson<T>(fetcher: typeof fetch, url: string): Promise<T> {
  const response = await fetcher(url, {
    headers: {
      Accept: "application/json",
    },
  });

  return parseJsonResponse<T>(response);
}

async function postJson<T>(fetcher: typeof fetch, url: string, body: unknown): Promise<T> {
  const response = await fetcher(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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

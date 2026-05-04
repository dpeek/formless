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

export async function bootstrapClient(fetcher: typeof fetch = fetch) {
  const response = await fetchJson<BootstrapResponse>(fetcher, "/api/bootstrap");

  await saveBootstrapResponse(response);
  applyBootstrapResponse(response);
  await notifyLocalDataChanged({ schemaChanged: true });

  return response;
}

export async function syncClient(fetcher: typeof fetch = fetch) {
  const cursor = await readCursor();
  const schemaUpdatedAt = await readSchemaUpdatedAt();
  const url = syncUrl(cursor, schemaUpdatedAt);
  const response = await fetchJson<SyncResponse>(fetcher, url);

  const schemaChanged = Boolean(response.schema && response.schemaUpdatedAt);

  if (response.schema && response.schemaUpdatedAt) {
    await saveSchema(response.schema, response.schemaUpdatedAt);
    applySchemaSave(response.schema, response.schemaUpdatedAt);
  }

  if (response.changes.length > 0 || response.cursor !== cursor) {
    await mergeChanges(response.changes, response.cursor);
    applyChanges(response.changes, response.cursor);
  }

  if (response.changes.length > 0 || response.cursor !== cursor || schemaChanged) {
    await notifyLocalDataChanged({ schemaChanged });
  }

  return response;
}

export async function fetchActiveSchema(fetcher: typeof fetch = fetch) {
  const response = await fetchJson<SchemaResponse>(fetcher, "/api/schema");

  await saveSchema(response.schema, response.updatedAt);
  applySchemaSave(response.schema, response.updatedAt);
  await notifySchemaChanged();

  return response;
}

export async function saveActiveSchema(schema: AppSchema, fetcher: typeof fetch = fetch) {
  const response = await postJson<SchemaUpdateResponse>(fetcher, "/api/schema", { schema });

  await saveSchema(response.schema, response.updatedAt);
  applySchemaSave(response.schema, response.updatedAt);
  await notifySchemaChanged();

  return response;
}

export async function submitCreateMutation(
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

  const response = await postJson<MutationResponse>(fetcher, "/api/mutations", mutation);

  await mergeChanges(response.changes, response.cursor);
  applyChanges(response.changes, response.cursor);
  await notifyLocalDataChanged();

  return response;
}

export async function submitPatchMutation(
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

  const response = await postJson<MutationResponse>(fetcher, "/api/mutations", mutation);

  await mergeChanges(response.changes, response.cursor);
  applyChanges(response.changes, response.cursor);
  await notifyLocalDataChanged();

  return response;
}

export async function submitAction(
  entity: EntityName,
  actionName: string,
  fetcher: typeof fetch = fetch,
) {
  const action: ActionRequest = {
    actionId: createActionId(),
    entity,
    action: actionName,
  };

  const response = await postJson<ActionResponse>(fetcher, "/api/actions", action);

  await mergeChanges(response.changes, response.cursor);
  applyChanges(response.changes, response.cursor);
  await notifyLocalDataChanged();

  return response;
}

export type DevResetSchema = "default" | "rate-card";

export async function resetRemoteData(
  schemaOrFetcher: DevResetSchema | typeof fetch = "default",
  fetcher: typeof fetch = fetch,
) {
  const schema = typeof schemaOrFetcher === "function" ? "default" : schemaOrFetcher;
  const resolvedFetcher = typeof schemaOrFetcher === "function" ? schemaOrFetcher : fetcher;
  const response = await postJson<BootstrapResponse>(resolvedFetcher, "/api/dev/reset", {
    schema,
  });

  resetClientStore();
  await deleteClientDb();
  await saveBootstrapResponse(response);
  applyBootstrapResponse(response);
  await notifyLocalDataChanged({ schemaChanged: true });

  return response;
}

export function startPollingSync(options: { intervalMs?: number; fetcher?: typeof fetch } = {}) {
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const fetcher = options.fetcher ?? fetch;
  const stopListening = listenForClientEvents((event) => {
    if (event.type === "sync-requested") {
      void syncClient(fetcher);
    }
  });

  void syncClient(fetcher);

  const intervalId = window.setInterval(() => {
    void syncClient(fetcher);
  }, intervalMs);

  return () => {
    stopListening();
    window.clearInterval(intervalId);
  };
}

export function requestSync() {
  publishClientEvent("sync-requested");
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

async function notifyLocalDataChanged(options: { schemaChanged?: boolean } = {}) {
  publishClientEvent("records-updated");
  publishClientEvent("cursor-updated");
  if (options.schemaChanged) {
    publishClientEvent("schema-updated");
  }
}

async function notifySchemaChanged() {
  publishClientEvent("schema-updated");
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

function syncUrl(cursor: number, schemaUpdatedAt: string | null) {
  const params = new URLSearchParams({ after: String(cursor) });

  if (schemaUpdatedAt) {
    params.set("schemaUpdatedAt", schemaUpdatedAt);
  }

  return `/api/sync?${params.toString()}`;
}

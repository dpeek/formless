import { listenForClientEvents, publishClientEvent } from "./broadcast.ts";
import { mergeChanges, mergeRecords, readCursor, saveBootstrapResponse } from "./db.ts";
import { refreshClientStateFromDb } from "./state.ts";
import { createMutationId } from "../shared/ids.ts";
import type {
  BootstrapResponse,
  CreateMutation,
  EntityName,
  MutationResponse,
  RecordValues,
  SyncResponse,
} from "../shared/protocol.ts";

const DEFAULT_POLL_INTERVAL_MS = 1500;

export async function bootstrapClient(fetcher: typeof fetch = fetch) {
  const response = await fetchJson<BootstrapResponse>(fetcher, "/api/bootstrap");

  await saveBootstrapResponse(response);
  notifyLocalDataChanged();

  return response;
}

export async function syncClient(fetcher: typeof fetch = fetch) {
  const cursor = await readCursor();
  const response = await fetchJson<SyncResponse>(fetcher, `/api/sync?after=${cursor}`);

  if (response.changes.length > 0 || response.cursor !== cursor) {
    await mergeChanges(response.changes, response.cursor);
    notifyLocalDataChanged();
  }

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

  await mergeRecords([response.record], response.cursor);
  notifyLocalDataChanged();

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

function notifyLocalDataChanged() {
  void refreshClientStateFromDb();
  publishClientEvent("records-updated");
  publishClientEvent("cursor-updated");
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

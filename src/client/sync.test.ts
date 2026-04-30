import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { publishClientEvent } from "./broadcast.ts";
import { deleteClientDb, mergeRecords, readLocalSnapshot, saveBootstrapResponse } from "./db.ts";
import { appSchema } from "./schema.ts";
import {
  connectBroadcastToClientStore,
  getClientStoreSnapshot,
  refreshClientStoreFromDb,
  resetClientStore,
  subscribeToClientStore,
  subscribeToClientStoreSelector,
} from "./store.ts";
import {
  bootstrapClient,
  fetchActiveSchema,
  resetRemoteData,
  saveActiveSchema,
  submitAction,
  submitCreateMutation,
  submitPatchMutation,
  syncClient,
} from "./sync.ts";
import type {
  ActionResponse,
  BootstrapResponse,
  ChangeRow,
  MutationResponse,
  SchemaResponse,
  SchemaUpdateResponse,
  StoredRecord,
  SyncResponse,
} from "../shared/protocol.ts";
import type { AppSchema } from "../shared/schema.ts";

beforeEach(async () => {
  await deleteClientDb();
  resetClientStore();
});

describe("client sync", () => {
  it("bootstraps local state from the authority", async () => {
    await bootstrapClient(
      jsonFetcher("/api/bootstrap", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
        records: [record("record-1", "First")],
        cursor: 1,
      } satisfies BootstrapResponse),
    );

    const snapshot = await readLocalSnapshot();

    expect(snapshot.schema).toEqual(appSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:00:00.000Z");
    expect(snapshot.records).toEqual([record("record-1", "First")]);
    expect(snapshot.cursor).toBe(1);
  });

  it("merges incremental sync records and advances the cursor", async () => {
    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });

    await syncClient(
      jsonFetcher("/api/sync?after=1&schemaUpdatedAt=2026-04-28T00%3A00%3A00.000Z", {
        changes: [change(2, "record-2", "Second")],
        cursor: 2,
      } satisfies SyncResponse),
    );

    const snapshot = await readLocalSnapshot();

    expect(snapshot.records.map((storedRecord) => storedRecord.id)).toEqual([
      "record-1",
      "record-2",
    ]);
    expect(snapshot.cursor).toBe(2);
  });

  it("requests sync without schema metadata when no schema is cached", async () => {
    await syncClient(
      jsonFetcher("/api/sync?after=0", {
        changes: [],
        cursor: 0,
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      } satisfies SyncResponse),
    );

    const snapshot = await readLocalSnapshot();

    expect(snapshot.schema).toEqual(appSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:00:00.000Z");
  });

  it("merges schema returned by polling sync", async () => {
    const nextSchema = schemaWithSummary();

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [],
      cursor: 0,
    });

    await syncClient(
      jsonFetcher("/api/sync?after=0&schemaUpdatedAt=2026-04-28T00%3A00%3A00.000Z", {
        changes: [],
        cursor: 0,
        schema: nextSchema,
        schemaUpdatedAt: "2026-04-28T00:01:00.000Z",
      } satisfies SyncResponse),
    );

    const snapshot = await readLocalSnapshot();

    expect(snapshot.schema).toEqual(nextSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:01:00.000Z");
  });

  it("merges accepted create mutations into local state", async () => {
    const acceptedRecord = record("record-1", "First");

    const response = await submitCreateMutation(
      "task",
      { title: "First", done: false },
      async (input, init) => {
        const mutation = parseRequestBody(init?.body);

        expect(input).toBe("/api/mutations");
        expect(init?.method).toBe("POST");
        expect(mutation).toMatchObject({
          entity: "task",
          op: "create",
          values: { title: "First", done: false },
        });

        return Response.json({
          record: acceptedRecord,
          cursor: 1,
          mutationId: mutation.mutationId,
        } satisfies MutationResponse);
      },
    );

    const snapshot = await readLocalSnapshot();

    expect(response.record).toEqual(acceptedRecord);
    expect(snapshot.records).toEqual([acceptedRecord]);
    expect(snapshot.cursor).toBe(1);
  });

  it("posts patch mutations and merges accepted records", async () => {
    const acceptedRecord = record("record-1", "First", true);

    const response = await submitPatchMutation(
      "task",
      "record-1",
      { done: true },
      async (input, init) => {
        const mutation = parseRequestBody(init?.body);

        expect(input).toBe("/api/mutations");
        expect(init?.method).toBe("POST");
        expect(mutation).toMatchObject({
          entity: "task",
          op: "patch",
          recordId: "record-1",
          values: { done: true },
        });

        return Response.json({
          record: acceptedRecord,
          cursor: 2,
          mutationId: mutation.mutationId,
        } satisfies MutationResponse);
      },
    );

    const snapshot = await readLocalSnapshot();

    expect(response.record).toEqual(acceptedRecord);
    expect(snapshot.records).toEqual([acceptedRecord]);
    expect(snapshot.cursor).toBe(2);
  });

  it("merges remote patched records", async () => {
    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First", false)],
      cursor: 1,
    });

    await syncClient(
      jsonFetcher("/api/sync?after=1&schemaUpdatedAt=2026-04-28T00%3A00%3A00.000Z", {
        changes: [change(2, "record-1", "First", true, "patch")],
        cursor: 2,
      } satisfies SyncResponse),
    );

    const snapshot = await readLocalSnapshot();

    expect(snapshot.records).toEqual([record("record-1", "First", true)]);
    expect(snapshot.cursor).toBe(2);
  });

  it("submits actions and merges tombstones into local state", async () => {
    const tombstone = {
      ...record("record-1", "Done", true),
      deletedAt: "2026-04-28T00:01:00.000Z",
    };

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "Done", true)],
      cursor: 1,
    });
    await refreshClientStoreFromDb();

    const response = await submitAction("task", "clearCompletedTasks", async (input, init) => {
      const action = parseActionRequestBody(init?.body);

      expect(input).toBe("/api/actions");
      expect(init?.method).toBe("POST");
      expect(action).toMatchObject({
        entity: "task",
        action: "clearCompletedTasks",
      });

      return Response.json({
        actionId: action.actionId,
        changes: [actionChange(2, tombstone, action.actionId)],
        cursor: 2,
      } satisfies ActionResponse);
    });

    const snapshot = await readLocalSnapshot();
    const storeSnapshot = getClientStoreSnapshot();

    expect(response.changes[0]?.payload).toEqual(tombstone);
    expect(snapshot.records).toEqual([tombstone]);
    expect(storeSnapshot.recordsById["record-1"]).toEqual(tombstone);
    expect(storeSnapshot.recordIdsByEntity.task ?? []).toEqual([]);
    expect(storeSnapshot.cursor).toBe(2);
  });

  it("keeps tombstoned records in IndexedDB while hiding them from active selectors", async () => {
    const tombstone = {
      ...record("record-1", "Done", true),
      deletedAt: "2026-04-28T00:01:00.000Z",
    };

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "Done", true), record("record-2", "Open")],
      cursor: 1,
    });
    await refreshClientStoreFromDb();

    await syncClient(
      jsonFetcher("/api/sync?after=1&schemaUpdatedAt=2026-04-28T00%3A00%3A00.000Z", {
        changes: [actionChange(2, tombstone, "action-1")],
        cursor: 2,
      } satisfies SyncResponse),
    );

    const snapshot = await readLocalSnapshot();
    const storeSnapshot = getClientStoreSnapshot();

    expect(snapshot.records).toContainEqual(tombstone);
    expect(storeSnapshot.recordsById["record-1"]).toEqual(tombstone);
    expect(storeSnapshot.recordIdsByEntity.task).toEqual(["record-2"]);
  });

  it("fetches and caches the active schema", async () => {
    const nextSchema = schemaWithSummary();

    await fetchActiveSchema(
      jsonFetcher("/api/schema", {
        schema: nextSchema,
        updatedAt: "2026-04-28T00:00:00.000Z",
      } satisfies SchemaResponse),
    );

    const snapshot = await readLocalSnapshot();

    expect(snapshot.schema).toEqual(nextSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:00:00.000Z");
  });

  it("saves accepted schema updates into local state", async () => {
    const nextSchema = schemaWithSummary();

    const response = await saveActiveSchema(nextSchema, async (input, init) => {
      expect(input).toBe("/api/schema");
      expect(init?.method).toBe("POST");
      expect(parsePlainRequestBody(init?.body)).toEqual({ schema: nextSchema });

      return Response.json({
        schema: nextSchema,
        updatedAt: "2026-04-28T00:00:00.000Z",
      } satisfies SchemaUpdateResponse);
    });

    const snapshot = await readLocalSnapshot();

    expect(response.schema).toEqual(nextSchema);
    expect(snapshot.schema).toEqual(nextSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:00:00.000Z");
  });

  it("resets remote data and reseeds the local replica from the reset response", async () => {
    const acceptedRecord = record("record-2", "Second");

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });

    const response = await resetRemoteData(
      jsonFetcher("/api/dev/reset", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:01:00.000Z",
        records: [acceptedRecord],
        cursor: 2,
      } satisfies BootstrapResponse),
    );
    const snapshot = await readLocalSnapshot();
    const storeSnapshot = getClientStoreSnapshot();

    expect(response.records).toEqual([acceptedRecord]);
    expect(snapshot.records).toEqual([acceptedRecord]);
    expect(snapshot.cursor).toBe(2);
    expect(storeSnapshot.recordsById["record-1"]).toBeUndefined();
    expect(storeSnapshot.recordsById["record-2"]).toEqual(acceptedRecord);
    expect(storeSnapshot.cursor).toBe(2);
  });

  it("refreshes schema state from broadcast events", async () => {
    const states = [getClientStoreSnapshot()];
    const unsubscribe = subscribeToClientStore(() => states.push(getClientStoreSnapshot()));
    const stopBroadcast = connectBroadcastToClientStore();
    const nextSchema = schemaWithSummary();

    try {
      await saveActiveSchema(
        nextSchema,
        jsonFetcher("/api/schema", {
          schema: nextSchema,
          updatedAt: "2026-04-28T00:00:00.000Z",
        } satisfies SchemaUpdateResponse),
      );

      await waitFor(() =>
        states.some((state) => state.schema?.entities.task.label === "Planner task"),
      );
      expect(states.at(-1)?.schema).toEqual(nextSchema);
    } finally {
      stopBroadcast();
      unsubscribe();
    }
  });

  it("refreshes state from broadcast events without remounting routes", async () => {
    const states = [getClientStoreSnapshot()];
    const unsubscribe = subscribeToClientStore(() => states.push(getClientStoreSnapshot()));
    const stopBroadcast = connectBroadcastToClientStore();

    try {
      await mergeRecords([record("record-1", "First")], 1);
      publishClientEvent("records-updated");

      await waitFor(() => states.some((state) => state.recordIdsByEntity.task?.length === 1));
      expect(states.at(-1)?.recordsById["record-1"]).toEqual(record("record-1", "First"));
    } finally {
      stopBroadcast();
      unsubscribe();
    }
  });

  it("preserves selector identities when refreshing unchanged data from IndexedDB", async () => {
    const notifications: unknown[] = [];

    await bootstrapClient(
      jsonFetcher("/api/bootstrap", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
        records: [record("record-1", "First")],
        cursor: 1,
      } satisfies BootstrapResponse),
    );
    const before = getClientStoreSnapshot();
    const unsubscribeSchema = subscribeToClientStoreSelector(
      (snapshot) => snapshot.schema,
      (value) => notifications.push(value),
    );
    const unsubscribeRecord = subscribeToClientStoreSelector(
      (snapshot) => snapshot.recordsById["record-1"],
      (value) => notifications.push(value),
    );
    const unsubscribeIds = subscribeToClientStoreSelector(
      (snapshot) => snapshot.recordIdsByEntity.task,
      (value) => notifications.push(value),
    );

    try {
      await refreshClientStoreFromDb();

      const after = getClientStoreSnapshot();

      expect(notifications).toEqual([]);
      expect(after.schema).toBe(before.schema);
      expect(after.recordsById["record-1"]).toBe(before.recordsById["record-1"]);
      expect(after.recordIdsByEntity.task).toBe(before.recordIdsByEntity.task);
    } finally {
      unsubscribeSchema();
      unsubscribeRecord();
      unsubscribeIds();
    }
  });
});

function jsonFetcher(expectedPath: string, body: unknown): typeof fetch {
  return async (input) => {
    expect(input).toBe(expectedPath);

    return Response.json(body);
  };
}

function parseRequestBody(body: BodyInit | null | undefined) {
  if (typeof body !== "string") {
    throw new Error("Expected a string request body.");
  }

  const parsed = JSON.parse(body) as unknown;

  expect(parsed).toEqual(
    expect.objectContaining({
      mutationId: expect.any(String),
    }),
  );

  return parsed as { mutationId: string };
}

function parseActionRequestBody(body: BodyInit | null | undefined) {
  if (typeof body !== "string") {
    throw new Error("Expected a string request body.");
  }

  const parsed = JSON.parse(body) as unknown;

  expect(parsed).toEqual(
    expect.objectContaining({
      actionId: expect.any(String),
    }),
  );

  return parsed as { actionId: string; entity: string; action: string };
}

function parsePlainRequestBody(body: BodyInit | null | undefined) {
  if (typeof body !== "string") {
    throw new Error("Expected a string request body.");
  }

  return JSON.parse(body) as unknown;
}

function schemaWithSummary() {
  return {
    version: 1,
    entities: {
      task: {
        label: "Planner task",
        fields: {
          title: { type: "text", required: true },
          done: { type: "boolean", required: true, default: false },
          dueDate: { type: "date", required: false },
          notes: { type: "text", required: false },
        },
        mutations: defaultMutations(),
        actions: appSchema.entities.task.actions,
      },
    },
    queries: appSchema.queries,
    itemViews: appSchema.itemViews,
    views: appSchema.views,
  } satisfies AppSchema;
}

function defaultMutations(): AppSchema["entities"][string]["mutations"] {
  return {
    create: { enabled: true },
    patch: { enabled: true },
    delete: { enabled: false },
  };
}

function record(id: string, title: string, done = false): StoredRecord {
  return {
    id,
    entity: "task",
    values: { title, done },
    createdAt: `2026-04-28T00:00:0${id.at(-1)}.000Z`,
  };
}

function change(
  seq: number,
  recordId: string,
  title: string,
  done = false,
  op: "create" | "patch" = "create",
): ChangeRow {
  return {
    seq,
    mutationId: `mutation-${seq}`,
    op,
    entity: "task",
    recordId,
    payload: record(recordId, title, done),
    createdAt: `2026-04-28T00:00:0${seq}.000Z`,
  };
}

function actionChange(seq: number, payload: StoredRecord, actionId: string): ChangeRow {
  return {
    seq,
    mutationId: actionId,
    op: "action",
    entity: payload.entity,
    recordId: payload.id,
    payload,
    createdAt: `2026-04-28T00:00:0${seq}.000Z`,
  };
}

async function waitFor(predicate: () => boolean) {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > 1000) {
      throw new Error("Timed out waiting for condition.");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { publishClientEvent } from "./broadcast.ts";
import { deleteClientDb, mergeRecords, readLocalSnapshot, saveBootstrapResponse } from "./db.ts";
import {
  connectBroadcastToClientStore,
  getClientStoreSnapshot,
  refreshClientStoreFromDb,
  resetClientStore,
  subscribeToClientStore,
  subscribeToClientStoreSelector,
} from "./store.ts";
import {
  applySyncResponse,
  bootstrapClient,
  exportStoreSnapshot,
  fetchActiveSchema,
  resetSeedData,
  resetSourceSchema,
  requestSync,
  restoreStoreSnapshot,
  saveActiveSchema,
  startPushSync,
  submitAction,
  submitCreateMutation,
  submitDeleteMutation,
  submitPatchMutation,
  syncClient,
} from "./sync.ts";
import { STORE_SNAPSHOT_KIND, STORE_SNAPSHOT_VERSION } from "../shared/protocol.ts";
import { installedAppStorageIdentity } from "../shared/app-storage-identity.ts";
import { instanceControlPlaneClientTarget } from "./app-target.ts";
import type {
  ActionResponse,
  BootstrapResponse,
  ChangeRow,
  MutationResponse,
  SchemaResponse,
  SchemaUpdateResponse,
  StoreSnapshot,
  StoredRecord,
  SyncSocketClientMessage,
  SyncSocketServerMessage,
  SyncResponse,
} from "../shared/protocol.ts";
import type { AppSchema } from "../shared/schema.ts";
import {
  rateSourceSchema as rateCardSchema,
  taskSourceSchema as appSchema,
} from "../test/schema-apps.ts";

beforeEach(async () => {
  await deleteClientDb("tasks");
  await deleteClientDb("estii");
  await deleteClientDb(instanceControlPlaneClientTarget());
  await deleteClientDb(installedSiteIdentity("personal"));
  await deleteClientDb(installedSiteIdentity("docs"));
  await deleteClientDb(installedTasksIdentity("work"));
  await deleteClientDb(installedTasksIdentity("team"));
  await deleteClientDb(installedEstiiIdentity("rates"));
  await deleteClientDb(installedEstiiIdentity("alt-rates"));
  resetClientStore();
});

describe("client sync", () => {
  it("bootstraps local state from the authority", async () => {
    await bootstrapClient(
      "tasks",
      jsonFetcher("/api/tasks/bootstrap", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
        records: [record("record-1", "First")],
        cursor: 1,
      } satisfies BootstrapResponse),
    );

    const snapshot = await readLocalSnapshot("tasks");

    expect(snapshot.schema).toEqual(appSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:00:00.000Z");
    expect(snapshot.records).toEqual([record("record-1", "First")]);
    expect(snapshot.cursor).toBe(1);
  });

  it("bootstraps rate data into the Estii local database only", async () => {
    await bootstrapClient(
      "estii",
      jsonFetcher("/api/estii/bootstrap", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
        records: [record("record-2", "Rate")],
        cursor: 2,
      } satisfies BootstrapResponse),
    );

    expect((await readLocalSnapshot("tasks")).records).toEqual([]);
    expect((await readLocalSnapshot("estii")).records).toEqual([record("record-2", "Rate")]);
  });

  it("bootstraps installed app data into the selected install replica only", async () => {
    const personal = installedSiteIdentity("personal");
    const docs = installedSiteIdentity("docs");

    await bootstrapClient(
      personal,
      jsonFetcher("/api/app-installs/site/personal/bootstrap", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
        records: [record("record-1", "Personal")],
        cursor: 1,
      } satisfies BootstrapResponse),
    );

    expect((await readLocalSnapshot(personal)).records).toEqual([record("record-1", "Personal")]);
    expect((await readLocalSnapshot(docs)).records).toEqual([]);
    expect(getClientStoreSnapshot()).toMatchObject({
      activeClientStorageName: "formless:app:personal",
      activeSchemaKey: "site",
    });
  });

  it("bootstraps the instance control-plane client target through its runtime API", async () => {
    const controlPlaneTarget = instanceControlPlaneClientTarget();

    await bootstrapClient(
      controlPlaneTarget,
      jsonFetcher("/api/formless/control-plane/bootstrap", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
        records: [record("install-1", "Personal Site")],
        cursor: 1,
      } satisfies BootstrapResponse),
    );

    expect((await readLocalSnapshot(controlPlaneTarget)).records).toEqual([
      record("install-1", "Personal Site"),
    ]);
    expect(getClientStoreSnapshot()).toMatchObject({
      activeClientStorageName: "formless:instance:control-plane",
      activeSchemaKey: "instance-control-plane",
    });
  });

  it("bootstraps installed Tasks into an install-scoped replica only", async () => {
    const work = installedTasksIdentity("work");
    const team = installedTasksIdentity("team");

    await bootstrapClient(
      work,
      jsonFetcher("/api/app-installs/tasks/work/bootstrap", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
        records: [record("record-1", "Work task")],
        cursor: 1,
      } satisfies BootstrapResponse),
    );

    expect((await readLocalSnapshot(work)).records).toEqual([record("record-1", "Work task")]);
    expect((await readLocalSnapshot(team)).records).toEqual([]);
    expect((await readLocalSnapshot("tasks")).records).toEqual([]);
    expect(getClientStoreSnapshot()).toMatchObject({
      activeClientStorageName: "formless:app:work",
      activeSchemaKey: "tasks",
    });
  });

  it("bootstraps installed Estii into an install-scoped replica only", async () => {
    const rates = installedEstiiIdentity("rates");
    const altRates = installedEstiiIdentity("alt-rates");
    const rate = rateRecord("rate-1", "resource-1", "card-1");

    await bootstrapClient(
      rates,
      jsonFetcher("/api/app-installs/estii/rates/bootstrap", {
        schema: rateCardSchema,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
        records: [rate],
        cursor: 1,
      } satisfies BootstrapResponse),
    );

    expect((await readLocalSnapshot(rates)).records).toEqual([rate]);
    expect((await readLocalSnapshot(altRates)).records).toEqual([]);
    expect((await readLocalSnapshot("estii")).records).toEqual([]);
    expect(getClientStoreSnapshot()).toMatchObject({
      activeClientStorageName: "formless:app:rates",
      activeSchemaKey: "estii",
    });
  });

  it("merges incremental sync records and advances the cursor", async () => {
    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });

    await syncClient(
      "tasks",
      jsonFetcher("/api/tasks/sync?after=1&schemaUpdatedAt=2026-04-28T00%3A00%3A00.000Z", {
        changes: [change(2, "record-2", "Second")],
        cursor: 2,
      } satisfies SyncResponse),
    );

    const snapshot = await readLocalSnapshot("tasks");

    expect(snapshot.records.map((storedRecord) => storedRecord.id)).toEqual([
      "record-1",
      "record-2",
    ]);
    expect(snapshot.cursor).toBe(2);
  });

  it("requests sync without schema metadata when no schema is cached", async () => {
    await syncClient(
      "tasks",
      jsonFetcher("/api/tasks/sync?after=0", {
        changes: [],
        cursor: 0,
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      } satisfies SyncResponse),
    );

    const snapshot = await readLocalSnapshot("tasks");

    expect(snapshot.schema).toEqual(appSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:00:00.000Z");
  });

  it("merges schema returned by HTTP sync", async () => {
    const nextSchema = schemaWithSummary();

    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [],
      cursor: 0,
    });

    await syncClient(
      "tasks",
      jsonFetcher("/api/tasks/sync?after=0&schemaUpdatedAt=2026-04-28T00%3A00%3A00.000Z", {
        changes: [],
        cursor: 0,
        schema: nextSchema,
        schemaUpdatedAt: "2026-04-28T00:01:00.000Z",
      } satisfies SyncResponse),
    );

    const snapshot = await readLocalSnapshot("tasks");

    expect(snapshot.schema).toEqual(nextSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:01:00.000Z");
  });

  it("applies pushed sync responses and advances the cursor", async () => {
    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });
    await refreshClientStoreFromDb("tasks");

    await applySyncResponse("tasks", {
      changes: [change(2, "record-2", "Second")],
      cursor: 2,
    } satisfies SyncResponse);

    const snapshot = await readLocalSnapshot("tasks");
    const storeSnapshot = getClientStoreSnapshot();

    expect(snapshot.records.map((storedRecord) => storedRecord.id)).toEqual([
      "record-1",
      "record-2",
    ]);
    expect(snapshot.cursor).toBe(2);
    expect(storeSnapshot.recordsById["record-2"]).toEqual(record("record-2", "Second"));
    expect(storeSnapshot.cursor).toBe(2);
  });

  it("applies schema-only pushed sync responses", async () => {
    const nextSchema = schemaWithSummary();

    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [],
      cursor: 1,
    });
    await refreshClientStoreFromDb("tasks");

    await applySyncResponse("tasks", {
      changes: [],
      cursor: 1,
      schema: nextSchema,
      schemaUpdatedAt: "2026-04-28T00:01:00.000Z",
    } satisfies SyncResponse);

    const snapshot = await readLocalSnapshot("tasks");
    const storeSnapshot = getClientStoreSnapshot();

    expect(snapshot.schema).toEqual(nextSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:01:00.000Z");
    expect(snapshot.cursor).toBe(1);
    expect(storeSnapshot.schema).toEqual(nextSchema);
    expect(storeSnapshot.schemaUpdatedAt).toBe("2026-04-28T00:01:00.000Z");
  });

  it("opens a keyed push sync socket and sends hello with local sync state", async () => {
    const sockets = fakeSocketFactory();

    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });

    const stop = startPushSync("tasks", { socketFactory: sockets.create });

    try {
      expect(new URL(sockets.instances[0]?.url ?? "").pathname).toBe("/api/tasks/sync/ws");

      sockets.instances[0]?.open();

      await waitFor(() => sockets.instances[0]?.sentMessages.length === 1);
      expect(parseSocketClientMessage(sockets.instances[0]?.sentMessages[0])).toEqual({
        type: "hello",
        cursor: 1,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      });
    } finally {
      stop();
    }
  });

  it("opens rate-card push sync on the Estii schema key", () => {
    const sockets = fakeSocketFactory();
    const stop = startPushSync("estii", { socketFactory: sockets.create });

    try {
      expect(new URL(sockets.instances[0]?.url ?? "").pathname).toBe("/api/estii/sync/ws");
    } finally {
      stop();
    }
  });

  it("opens installed app push sync on the install API path", () => {
    const sockets = fakeSocketFactory();
    const stop = startPushSync(installedSiteIdentity("personal"), {
      socketFactory: sockets.create,
    });

    try {
      expect(new URL(sockets.instances[0]?.url ?? "").pathname).toBe(
        "/api/app-installs/site/personal/sync/ws",
      );
    } finally {
      stop();
    }
  });

  it("opens installed Tasks push sync on the Tasks install API path", () => {
    const sockets = fakeSocketFactory();
    const stop = startPushSync(installedTasksIdentity("work"), {
      socketFactory: sockets.create,
    });

    try {
      expect(new URL(sockets.instances[0]?.url ?? "").pathname).toBe(
        "/api/app-installs/tasks/work/sync/ws",
      );
    } finally {
      stop();
    }
  });

  it("opens installed Estii push sync on the Estii install API path", () => {
    const sockets = fakeSocketFactory();
    const stop = startPushSync(installedEstiiIdentity("rates"), {
      socketFactory: sockets.create,
    });

    try {
      expect(new URL(sockets.instances[0]?.url ?? "").pathname).toBe(
        "/api/app-installs/estii/rates/sync/ws",
      );
    } finally {
      stop();
    }
  });

  it("merges pushed sync messages into the selected local database", async () => {
    const sockets = fakeSocketFactory();

    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });
    await refreshClientStoreFromDb("tasks");

    const stop = startPushSync("tasks", { socketFactory: sockets.create });

    try {
      sockets.instances[0]?.open();

      sockets.instances[0]?.receive({
        type: "sync",
        payload: {
          changes: [change(2, "record-2", "Second")],
          cursor: 2,
        },
      });

      await waitFor(() => getClientStoreSnapshot().cursor === 2);

      const taskSnapshot = await readLocalSnapshot("tasks");
      const rateSnapshot = await readLocalSnapshot("estii");

      expect(taskSnapshot.records.map((storedRecord) => storedRecord.id)).toEqual([
        "record-1",
        "record-2",
      ]);
      expect(rateSnapshot.records).toEqual([]);
      expect(getClientStoreSnapshot().recordsById["record-2"]).toEqual(
        record("record-2", "Second"),
      );
    } finally {
      stop();
    }
  });

  it("applies WebSocket hello catch-up payloads with schema timestamps", async () => {
    const sockets = fakeSocketFactory();
    const nextSchema = schemaWithSummary();

    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });
    await refreshClientStoreFromDb("tasks");

    const stop = startPushSync("tasks", { socketFactory: sockets.create });

    try {
      sockets.instances[0]?.open();

      await waitFor(() => sockets.instances[0]?.sentMessages.length === 1);
      expect(parseSocketClientMessage(sockets.instances[0]?.sentMessages[0])).toEqual({
        type: "hello",
        cursor: 1,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      });

      sockets.instances[0]?.receive({
        type: "sync",
        payload: {
          changes: [change(2, "record-2", "Second")],
          cursor: 2,
          schema: nextSchema,
          schemaUpdatedAt: "2026-04-28T00:01:00.000Z",
        },
      });

      await waitFor(() => getClientStoreSnapshot().cursor === 2);

      const snapshot = await readLocalSnapshot("tasks");
      const storeSnapshot = getClientStoreSnapshot();

      expect(snapshot.schema).toEqual(nextSchema);
      expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:01:00.000Z");
      expect(snapshot.records.map((storedRecord) => storedRecord.id)).toEqual([
        "record-1",
        "record-2",
      ]);
      expect(snapshot.cursor).toBe(2);
      expect(storeSnapshot.schema).toEqual(nextSchema);
      expect(storeSnapshot.recordsById["record-2"]).toEqual(record("record-2", "Second"));
      expect(storeSnapshot.cursor).toBe(2);
    } finally {
      stop();
    }
  });

  it("notifies callers after pushed sync messages are applied", async () => {
    const sockets = fakeSocketFactory();
    let syncedCount = 0;

    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });
    await refreshClientStoreFromDb("tasks");

    const stop = startPushSync("tasks", {
      onSynced: () => {
        syncedCount += 1;
      },
      socketFactory: sockets.create,
    });

    try {
      sockets.instances[0]?.open();

      sockets.instances[0]?.receive({
        type: "sync",
        payload: {
          changes: [change(2, "record-2", "Second")],
          cursor: 2,
        },
      });

      await waitFor(() => syncedCount === 1);

      expect(getClientStoreSnapshot().cursor).toBe(2);
      expect(getClientStoreSnapshot().recordsById["record-2"]).toEqual(
        record("record-2", "Second"),
      );
    } finally {
      stop();
    }
  });

  it("sends sync-requested over an open push sync socket", async () => {
    const sockets = fakeSocketFactory();

    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });

    const stop = startPushSync("tasks", { socketFactory: sockets.create });

    try {
      sockets.instances[0]?.open();
      await waitFor(() => sockets.instances[0]?.sentMessages.length === 1);

      requestSync("tasks");

      await waitFor(() => sockets.instances[0]?.sentMessages.length === 2);
      expect(parseSocketClientMessage(sockets.instances[0]?.sentMessages[1])).toEqual({
        type: "sync-requested",
        cursor: 1,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      });
    } finally {
      stop();
    }
  });

  it("reconnects push sync after an opened socket closes", async () => {
    const sockets = fakeSocketFactory();
    const stop = startPushSync("tasks", {
      reconnectInitialDelayMs: 1,
      reconnectMaxDelayMs: 2,
      socketFactory: sockets.create,
    });

    try {
      sockets.instances[0]?.open();
      await waitFor(() => sockets.instances[0]?.sentMessages.length === 1);
      sockets.instances[0]?.closeFromServer();

      await waitFor(() => sockets.instances.length === 2);
      expect(new URL(sockets.instances[1]?.url ?? "").pathname).toBe("/api/tasks/sync/ws");
    } finally {
      stop();
    }
  });

  it("closes the push sync socket when stopped", async () => {
    const sockets = fakeSocketFactory();
    const stop = startPushSync("tasks", { socketFactory: sockets.create });

    sockets.instances[0]?.open();
    await waitFor(() => sockets.instances[0]?.sentMessages.length === 1);
    stop();

    expect(sockets.instances[0]?.readyState).toBe(3);
  });

  it("merges accepted create mutations into local state", async () => {
    const acceptedRecord = record("record-1", "First");

    const response = await submitCreateMutation(
      "tasks",
      "task",
      { title: "First", done: false },
      async (input, init) => {
        const mutation = parseRequestBody(init?.body);

        expect(input).toBe("/api/tasks/mutations");
        expect(init?.method).toBe("POST");
        expect(mutation).toMatchObject({
          entity: "task",
          op: "create",
          values: { title: "First", done: false },
        });

        return Response.json({
          record: acceptedRecord,
          changes: [mutationChange(1, mutation.mutationId, acceptedRecord, "create")],
          cursor: 1,
          mutationId: mutation.mutationId,
        } satisfies MutationResponse);
      },
    );

    const snapshot = await readLocalSnapshot("tasks");

    expect(response.record).toEqual(acceptedRecord);
    expect(snapshot.records).toEqual([acceptedRecord]);
    expect(snapshot.cursor).toBe(1);
  });

  it("posts patch mutations and merges accepted records", async () => {
    const acceptedRecord = record("record-1", "First", true);

    const response = await submitPatchMutation(
      "tasks",
      "task",
      "record-1",
      { done: true },
      async (input, init) => {
        const mutation = parseRequestBody(init?.body);

        expect(input).toBe("/api/tasks/mutations");
        expect(init?.method).toBe("POST");
        expect(mutation).toMatchObject({
          entity: "task",
          op: "patch",
          recordId: "record-1",
          values: { done: true },
        });

        return Response.json({
          record: acceptedRecord,
          changes: [mutationChange(2, mutation.mutationId, acceptedRecord, "patch")],
          cursor: 2,
          mutationId: mutation.mutationId,
        } satisfies MutationResponse);
      },
    );

    const snapshot = await readLocalSnapshot("tasks");

    expect(response.record).toEqual(acceptedRecord);
    expect(snapshot.records).toEqual([acceptedRecord]);
    expect(snapshot.cursor).toBe(2);
  });

  it("posts delete mutations and merges accepted tombstones", async () => {
    const activeRecord = record("record-1", "First", false);
    const tombstone = {
      ...activeRecord,
      deletedAt: "2026-04-28T00:01:00.000Z",
    };

    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [activeRecord],
      cursor: 1,
    });
    await refreshClientStoreFromDb("tasks");

    const response = await submitDeleteMutation(
      "tasks",
      "task",
      "record-1",
      async (input, init) => {
        const mutation = parseRequestBody(init?.body);

        expect(input).toBe("/api/tasks/mutations");
        expect(init?.method).toBe("POST");
        expect(mutation).toMatchObject({
          entity: "task",
          op: "delete",
          recordId: "record-1",
        });
        expect(mutation).not.toHaveProperty("values");

        return Response.json({
          record: tombstone,
          changes: [mutationChange(2, mutation.mutationId, tombstone, "delete")],
          cursor: 2,
          mutationId: mutation.mutationId,
        } satisfies MutationResponse);
      },
    );

    const snapshot = await readLocalSnapshot("tasks");
    const storeSnapshot = getClientStoreSnapshot();

    expect(response.record).toEqual(tombstone);
    expect(snapshot.records).toEqual([tombstone]);
    expect(storeSnapshot.recordsById["record-1"]).toEqual(tombstone);
    expect(storeSnapshot.recordIdsByEntity.task ?? []).toEqual([]);
    expect(snapshot.cursor).toBe(2);
  });

  it("merges all records returned by an accepted create mutation before advancing cursor", async () => {
    const primaryRecord = record("record-1", "First");
    const lifecycleRecord = record("record-2", "Lifecycle");

    await submitCreateMutation(
      "tasks",
      "task",
      { title: "First", done: false },
      async (_input, init) => {
        const mutation = parseRequestBody(init?.body);

        return Response.json({
          record: primaryRecord,
          changes: [
            mutationChange(1, mutation.mutationId, primaryRecord, "create"),
            mutationChange(2, mutation.mutationId, lifecycleRecord, "action"),
          ],
          cursor: 2,
          mutationId: mutation.mutationId,
        } satisfies MutationResponse);
      },
    );

    const snapshot = await readLocalSnapshot("tasks");
    const storeSnapshot = getClientStoreSnapshot();

    expect(snapshot.records).toEqual([primaryRecord, lifecycleRecord]);
    expect(storeSnapshot.recordsById[lifecycleRecord.id]).toEqual(lifecycleRecord);
    expect(snapshot.cursor).toBe(2);
  });

  it("merges remote patched records", async () => {
    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First", false)],
      cursor: 1,
    });

    await syncClient(
      "tasks",
      jsonFetcher("/api/tasks/sync?after=1&schemaUpdatedAt=2026-04-28T00%3A00%3A00.000Z", {
        changes: [change(2, "record-1", "First", true, "patch")],
        cursor: 2,
      } satisfies SyncResponse),
    );

    const snapshot = await readLocalSnapshot("tasks");

    expect(snapshot.records).toEqual([record("record-1", "First", true)]);
    expect(snapshot.cursor).toBe(2);
  });

  it("merges HTTP catch-up tombstones without replacing current schema metadata", async () => {
    const activeRecord = record("record-1", "Done", true);
    const openRecord = record("record-2", "Open", false);
    const tombstone = {
      ...activeRecord,
      deletedAt: "2026-04-28T00:01:00.000Z",
    };

    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [activeRecord, openRecord],
      cursor: 3,
    });
    await refreshClientStoreFromDb("tasks");

    await syncClient(
      "tasks",
      jsonFetcher("/api/tasks/sync?after=3&schemaUpdatedAt=2026-04-28T00%3A00%3A00.000Z", {
        changes: [mutationChange(4, "mutation-http-delete-catchup", tombstone, "delete")],
        cursor: 4,
      } satisfies SyncResponse),
    );

    const snapshot = await readLocalSnapshot("tasks");
    const storeSnapshot = getClientStoreSnapshot();

    expect(snapshot.schema).toEqual(appSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:00:00.000Z");
    expect(snapshot.records).toContainEqual(tombstone);
    expect(storeSnapshot.recordsById[activeRecord.id]).toEqual(tombstone);
    expect(storeSnapshot.recordIdsByEntity.task).toEqual([openRecord.id]);
    expect(snapshot.cursor).toBe(4);
    expect(storeSnapshot.cursor).toBe(4);
  });

  it("submits actions and merges tombstones into local state", async () => {
    const tombstone = {
      ...record("record-1", "Done", true),
      deletedAt: "2026-04-28T00:01:00.000Z",
    };

    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "Done", true)],
      cursor: 1,
    });
    await refreshClientStoreFromDb("tasks");

    const response = await submitAction(
      "tasks",
      "task",
      "clearCompletedTasks",
      async (input, init) => {
        const action = parseActionRequestBody(init?.body);

        expect(input).toBe("/api/tasks/actions");
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
      },
    );

    const snapshot = await readLocalSnapshot("tasks");
    const storeSnapshot = getClientStoreSnapshot();

    expect(response.changes[0]?.payload).toEqual(tombstone);
    expect(snapshot.records).toEqual([tombstone]);
    expect(storeSnapshot.recordsById["record-1"]).toEqual(tombstone);
    expect(storeSnapshot.recordIdsByEntity.task ?? []).toEqual([]);
    expect(storeSnapshot.cursor).toBe(2);
  });

  it("uses installed Tasks API paths for sync, writes, actions, snapshots, and resets", async () => {
    const work = installedTasksIdentity("work");
    const createdRecord = record("record-2", "Created in work");
    const tombstone = {
      ...createdRecord,
      deletedAt: "2026-04-28T00:03:00.000Z",
    };
    const restoredRecord = record("record-4", "Restored work");

    await saveBootstrapResponse(work, {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "Existing work")],
      cursor: 1,
    });
    await refreshClientStoreFromDb(work);

    await syncClient(
      work,
      jsonFetcher(
        "/api/app-installs/tasks/work/sync?after=1&schemaUpdatedAt=2026-04-28T00%3A00%3A00.000Z",
        {
          changes: [change(2, "record-2", "Created in work")],
          cursor: 2,
        } satisfies SyncResponse,
      ),
    );

    await submitCreateMutation(
      work,
      "task",
      { title: "Created in work", done: false },
      async (input, init) => {
        const mutation = parseRequestBody(init?.body);

        expect(input).toBe("/api/app-installs/tasks/work/mutations");
        expect(init?.method).toBe("POST");

        return Response.json({
          record: createdRecord,
          changes: [mutationChange(3, mutation.mutationId, createdRecord, "create")],
          cursor: 3,
          mutationId: mutation.mutationId,
        } satisfies MutationResponse);
      },
    );

    await submitAction(work, "task", "clearCompletedTasks", async (input, init) => {
      const action = parseActionRequestBody(init?.body);

      expect(input).toBe("/api/app-installs/tasks/work/actions");
      expect(init?.method).toBe("POST");

      return Response.json({
        actionId: action.actionId,
        changes: [actionChange(4, tombstone, action.actionId)],
        cursor: 4,
      } satisfies ActionResponse);
    });

    const exported = await exportStoreSnapshot(
      work,
      jsonFetcher(
        "/api/app-installs/tasks/work/snapshot",
        storeSnapshot({ records: [tombstone], sourceCursor: 4 }),
      ),
    );
    const restored = await restoreStoreSnapshot(
      work,
      storeSnapshot({ records: [restoredRecord], sourceCursor: 4 }),
      async (input, init) => {
        expect(input).toBe("/api/app-installs/tasks/work/snapshot/restore");
        expect(init?.method).toBe("POST");

        return Response.json({
          schema: appSchema,
          schemaUpdatedAt: "2026-04-28T00:04:00.000Z",
          records: [restoredRecord],
          cursor: 5,
        } satisfies BootstrapResponse);
      },
    );

    await resetSourceSchema(
      work,
      jsonFetcher("/api/app-installs/tasks/work/reset/schema", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:05:00.000Z",
        records: [restoredRecord],
        cursor: 6,
      } satisfies BootstrapResponse),
    );

    const reset = await resetSeedData(
      work,
      jsonFetcher("/api/app-installs/tasks/work/reset/seed", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:06:00.000Z",
        records: [record("record-5", "Seeded work")],
        cursor: 7,
      } satisfies BootstrapResponse),
    );

    expect(exported.records).toEqual([tombstone]);
    expect(restored.records).toEqual([restoredRecord]);
    expect(reset.records).toEqual([record("record-5", "Seeded work")]);
    expect((await readLocalSnapshot("tasks")).records).toEqual([]);
    expect((await readLocalSnapshot(work)).records).toEqual([record("record-5", "Seeded work")]);
    expect(getClientStoreSnapshot()).toMatchObject({
      activeClientStorageName: "formless:app:work",
      activeSchemaKey: "tasks",
      cursor: 7,
    });
  });

  it("uses installed Estii API paths for sync, writes, actions, snapshots, and resets", async () => {
    const rates = installedEstiiIdentity("rates");
    const existingRate = rateRecord("rate-1", "resource-1", "card-1");
    const syncedRate = rateRecord("rate-2", "resource-2", "card-1");
    const createdResource = resourceRecord("resource-2", "Writer");
    const actionRate = rateRecord("rate-3", createdResource.id, "card-2");
    const restoredRate = rateRecord("rate-4", "resource-4", "card-2");

    await saveBootstrapResponse(rates, {
      schema: rateCardSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [existingRate],
      cursor: 1,
    });
    await refreshClientStoreFromDb(rates);

    await syncClient(
      rates,
      jsonFetcher(
        "/api/app-installs/estii/rates/sync?after=1&schemaUpdatedAt=2026-04-28T00%3A00%3A00.000Z",
        {
          changes: [mutationChange(2, "mutation-rate-sync", syncedRate, "create")],
          cursor: 2,
        } satisfies SyncResponse,
      ),
    );

    await submitCreateMutation(
      rates,
      "resource",
      { name: "Writer", kind: "role", unit: "day" },
      async (input, init) => {
        const mutation = parseRequestBody(init?.body);

        expect(input).toBe("/api/app-installs/estii/rates/mutations");
        expect(init?.method).toBe("POST");

        return Response.json({
          record: createdResource,
          changes: [mutationChange(3, mutation.mutationId, createdResource, "create")],
          cursor: 3,
          mutationId: mutation.mutationId,
        } satisfies MutationResponse);
      },
    );

    await submitAction(rates, "rate", "regenerateMissingRates", async (input, init) => {
      const action = parseActionRequestBody(init?.body);

      expect(input).toBe("/api/app-installs/estii/rates/actions");
      expect(init?.method).toBe("POST");
      expect(action).toMatchObject({
        entity: "rate",
        action: "regenerateMissingRates",
      });

      return Response.json({
        actionId: action.actionId,
        changes: [actionChange(4, actionRate, action.actionId)],
        cursor: 4,
      } satisfies ActionResponse);
    });

    const exported = await exportStoreSnapshot(
      rates,
      jsonFetcher(
        "/api/app-installs/estii/rates/snapshot",
        storeSnapshot({
          schemaKey: "estii",
          schema: rateCardSchema,
          records: [actionRate],
          sourceCursor: 4,
        }),
      ),
    );
    const restored = await restoreStoreSnapshot(
      rates,
      storeSnapshot({
        schemaKey: "estii",
        schema: rateCardSchema,
        records: [restoredRate],
        sourceCursor: 4,
      }),
      async (input, init) => {
        expect(input).toBe("/api/app-installs/estii/rates/snapshot/restore");
        expect(init?.method).toBe("POST");

        return Response.json({
          schema: rateCardSchema,
          schemaUpdatedAt: "2026-04-28T00:04:00.000Z",
          records: [restoredRate],
          cursor: 5,
        } satisfies BootstrapResponse);
      },
    );

    await resetSourceSchema(
      rates,
      jsonFetcher("/api/app-installs/estii/rates/reset/schema", {
        schema: rateCardSchema,
        schemaUpdatedAt: "2026-04-28T00:05:00.000Z",
        records: [restoredRate],
        cursor: 6,
      } satisfies BootstrapResponse),
    );

    const reset = await resetSeedData(
      rates,
      jsonFetcher("/api/app-installs/estii/rates/reset/seed", {
        schema: rateCardSchema,
        schemaUpdatedAt: "2026-04-28T00:06:00.000Z",
        records: [rateRecord("rate-5", "resource-5", "card-2")],
        cursor: 7,
      } satisfies BootstrapResponse),
    );

    expect(exported.records).toEqual([actionRate]);
    expect(restored.records).toEqual([restoredRate]);
    expect(reset.records).toEqual([rateRecord("rate-5", "resource-5", "card-2")]);
    expect((await readLocalSnapshot("estii")).records).toEqual([]);
    expect((await readLocalSnapshot(rates)).records).toEqual([
      rateRecord("rate-5", "resource-5", "card-2"),
    ]);
    expect(getClientStoreSnapshot()).toMatchObject({
      activeClientStorageName: "formless:app:rates",
      activeSchemaKey: "estii",
      cursor: 7,
    });
  });

  it("submits rate-card actions to the Estii API and merges created rates", async () => {
    const createdRate = rateRecord("rate-1", "resource-1", "card-1");

    await saveBootstrapResponse("estii", {
      schema: rateCardSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [],
      cursor: 0,
    });
    await refreshClientStoreFromDb("estii");

    const response = await submitAction(
      "estii",
      "rate",
      "regenerateMissingRates",
      async (input, init) => {
        const action = parseActionRequestBody(init?.body);

        expect(input).toBe("/api/estii/actions");
        expect(init?.method).toBe("POST");
        expect(action).toMatchObject({
          entity: "rate",
          action: "regenerateMissingRates",
        });
        expect(action).not.toHaveProperty("input");

        return Response.json({
          actionId: action.actionId,
          changes: [actionChange(1, createdRate, action.actionId)],
          cursor: 1,
        } satisfies ActionResponse);
      },
    );

    const taskSnapshot = await readLocalSnapshot("tasks");
    const rateSnapshot = await readLocalSnapshot("estii");
    const storeSnapshot = getClientStoreSnapshot();

    expect(response.changes[0]?.payload).toEqual(createdRate);
    expect(taskSnapshot.records).toEqual([]);
    expect(rateSnapshot.records).toEqual([createdRate]);
    expect(storeSnapshot.recordsById[createdRate.id]).toEqual(createdRate);
    expect(storeSnapshot.recordIdsByEntity.rate).toEqual([createdRate.id]);
    expect(storeSnapshot.cursor).toBe(1);
  });

  it("keeps tombstoned records in IndexedDB while hiding them from active selectors", async () => {
    const tombstone = {
      ...record("record-1", "Done", true),
      deletedAt: "2026-04-28T00:01:00.000Z",
    };

    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "Done", true), record("record-2", "Open")],
      cursor: 1,
    });
    await refreshClientStoreFromDb("tasks");

    await syncClient(
      "tasks",
      jsonFetcher("/api/tasks/sync?after=1&schemaUpdatedAt=2026-04-28T00%3A00%3A00.000Z", {
        changes: [actionChange(2, tombstone, "action-1")],
        cursor: 2,
      } satisfies SyncResponse),
    );

    const snapshot = await readLocalSnapshot("tasks");
    const storeSnapshot = getClientStoreSnapshot();

    expect(snapshot.records).toContainEqual(tombstone);
    expect(storeSnapshot.recordsById["record-1"]).toEqual(tombstone);
    expect(storeSnapshot.recordIdsByEntity.task).toEqual(["record-2"]);
  });

  it("fetches and caches the active schema", async () => {
    const nextSchema = schemaWithSummary();

    await fetchActiveSchema(
      "tasks",
      jsonFetcher("/api/tasks/schema", {
        schema: nextSchema,
        updatedAt: "2026-04-28T00:00:00.000Z",
      } satisfies SchemaResponse),
    );

    const snapshot = await readLocalSnapshot("tasks");

    expect(snapshot.schema).toEqual(nextSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:00:00.000Z");
  });

  it("saves accepted schema updates into local state", async () => {
    const nextSchema = schemaWithSummary();

    const response = await saveActiveSchema("tasks", nextSchema, async (input, init) => {
      expect(input).toBe("/api/tasks/schema");
      expect(init?.method).toBe("POST");
      expect(parsePlainRequestBody(init?.body)).toEqual({ schema: nextSchema });

      return Response.json({
        schema: nextSchema,
        updatedAt: "2026-04-28T00:00:00.000Z",
      } satisfies SchemaUpdateResponse);
    });

    const snapshot = await readLocalSnapshot("tasks");

    expect(response.schema).toEqual(nextSchema);
    expect(snapshot.schema).toEqual(nextSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:00:00.000Z");
  });

  it("exports store snapshots from the schema-keyed authority", async () => {
    const snapshot = storeSnapshot({
      records: [record("record-1", "First")],
      sourceCursor: 3,
    });

    const response = await exportStoreSnapshot(
      "tasks",
      jsonFetcher("/api/tasks/snapshot", snapshot),
    );

    expect(response).toEqual(snapshot);
  });

  it("exports store snapshots from an installed app authority", async () => {
    const snapshot = storeSnapshot({
      schemaKey: "site",
      records: [record("record-1", "Personal")],
      sourceCursor: 3,
    });

    const response = await exportStoreSnapshot(
      installedSiteIdentity("personal"),
      jsonFetcher("/api/app-installs/site/personal/snapshot", snapshot),
    );

    expect(response).toEqual(snapshot);
  });

  it("restores store snapshots and replaces the selected local replica", async () => {
    const restoredRecord = record("record-2", "Restored");
    const restoredSchema = schemaWithSummary();
    const requestSnapshot = storeSnapshot({
      records: [restoredRecord],
      schema: restoredSchema,
    });

    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "Old")],
      cursor: 1,
    });
    await refreshClientStoreFromDb("tasks");

    const response = await restoreStoreSnapshot("tasks", requestSnapshot, async (input, init) => {
      expect(input).toBe("/api/tasks/snapshot/restore");
      expect(init?.method).toBe("POST");
      expect(parsePlainRequestBody(init?.body)).toEqual(requestSnapshot);

      return Response.json({
        schema: restoredSchema,
        schemaUpdatedAt: "2026-04-28T00:02:00.000Z",
        records: [restoredRecord],
        cursor: 4,
      } satisfies BootstrapResponse);
    });
    const snapshot = await readLocalSnapshot("tasks");
    const clientSnapshot = getClientStoreSnapshot();

    expect(response.records).toEqual([restoredRecord]);
    expect(snapshot.schema).toEqual(restoredSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:02:00.000Z");
    expect(snapshot.records).toEqual([restoredRecord]);
    expect(snapshot.cursor).toBe(4);
    expect(clientSnapshot.recordsById["record-1"]).toBeUndefined();
    expect(clientSnapshot.recordsById["record-2"]).toEqual(restoredRecord);
    expect(clientSnapshot.cursor).toBe(4);
  });

  it("keeps the selected local replica unchanged when snapshot restore fails", async () => {
    const existingRecord = record("record-1", "Old");

    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [existingRecord],
      cursor: 1,
    });
    await refreshClientStoreFromDb("tasks");

    try {
      await restoreStoreSnapshot("tasks", storeSnapshot(), async () =>
        Response.json({ error: 'Store snapshot schemaKey must be "tasks".' }, { status: 400 }),
      );
      throw new Error("Expected restore to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Store snapshot schemaKey must be "tasks".');
    }

    const snapshot = await readLocalSnapshot("tasks");
    const clientSnapshot = getClientStoreSnapshot();

    expect(snapshot.records).toEqual([existingRecord]);
    expect(snapshot.cursor).toBe(1);
    expect(clientSnapshot.recordsById["record-1"]).toEqual(existingRecord);
    expect(clientSnapshot.cursor).toBe(1);
  });

  it("resets source schema without deleting the selected local database", async () => {
    const acceptedRecord = record("record-2", "Second");

    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });

    const response = await resetSourceSchema(
      "tasks",
      jsonFetcher("/api/tasks/reset/schema", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:01:00.000Z",
        records: [acceptedRecord],
        cursor: 2,
      } satisfies BootstrapResponse),
    );
    const snapshot = await readLocalSnapshot("tasks");
    const storeSnapshot = getClientStoreSnapshot();

    expect(response.records).toEqual([acceptedRecord]);
    expect(snapshot.records).toEqual([acceptedRecord]);
    expect(snapshot.cursor).toBe(2);
    expect(storeSnapshot.recordsById["record-1"]).toBeUndefined();
    expect(storeSnapshot.recordsById["record-2"]).toEqual(acceptedRecord);
    expect(storeSnapshot.cursor).toBe(2);
  });

  it("resets seed data and reseeds only the selected local database", async () => {
    const acceptedRecord = record("record-2", "Second");

    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });
    await saveBootstrapResponse("estii", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-3", "Rate")],
      cursor: 3,
    });

    const response = await resetSeedData(
      "estii",
      jsonFetcher("/api/estii/reset/seed", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:01:00.000Z",
        records: [acceptedRecord],
        cursor: 2,
      } satisfies BootstrapResponse),
    );
    const taskSnapshot = await readLocalSnapshot("tasks");
    const rateSnapshot = await readLocalSnapshot("estii");
    const storeSnapshot = getClientStoreSnapshot();

    expect(response.records).toEqual([acceptedRecord]);
    expect(taskSnapshot.records).toEqual([record("record-1", "First")]);
    expect(rateSnapshot.records).toEqual([acceptedRecord]);
    expect(rateSnapshot.cursor).toBe(2);
    expect(storeSnapshot.recordsById["record-1"]).toBeUndefined();
    expect(storeSnapshot.recordsById["record-2"]).toEqual(acceptedRecord);
    expect(storeSnapshot.cursor).toBe(2);
  });

  it("resets seed data for one installed app replica", async () => {
    const personal = installedSiteIdentity("personal");
    const docs = installedSiteIdentity("docs");
    const acceptedRecord = record("record-2", "Personal reset");

    await saveBootstrapResponse(personal, {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "Personal old")],
      cursor: 1,
    });
    await saveBootstrapResponse(docs, {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-3", "Docs")],
      cursor: 3,
    });

    const response = await resetSeedData(
      personal,
      jsonFetcher("/api/app-installs/site/personal/reset/seed", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:01:00.000Z",
        records: [acceptedRecord],
        cursor: 2,
      } satisfies BootstrapResponse),
    );

    expect(response.records).toEqual([acceptedRecord]);
    expect((await readLocalSnapshot(personal)).records).toEqual([acceptedRecord]);
    expect((await readLocalSnapshot(docs)).records).toEqual([record("record-3", "Docs")]);
    expect(getClientStoreSnapshot()).toMatchObject({
      activeClientStorageName: "formless:app:personal",
      activeSchemaKey: "site",
    });
  });

  it("can request the rate-card source schema reset", async () => {
    await resetSourceSchema("estii", async (input, init) => {
      expect(input).toBe("/api/estii/reset/schema");
      expect(init?.method).toBe("POST");
      expect(parsePlainRequestBody(init?.body)).toEqual({});

      return Response.json({
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:01:00.000Z",
        records: [],
        cursor: 0,
      } satisfies BootstrapResponse);
    });
  });

  it("refreshes schema state from broadcast events", async () => {
    const states = [getClientStoreSnapshot()];
    const unsubscribe = subscribeToClientStore(() => states.push(getClientStoreSnapshot()));
    const stopBroadcast = connectBroadcastToClientStore("tasks");
    const nextSchema = schemaWithSummary();

    try {
      await saveActiveSchema(
        "tasks",
        nextSchema,
        jsonFetcher("/api/tasks/schema", {
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
    const stopBroadcast = connectBroadcastToClientStore("tasks");

    try {
      await mergeRecords("tasks", [record("record-1", "First")], 1);
      publishClientEvent("tasks", "records-updated");

      await waitFor(() => states.some((state) => state.recordIdsByEntity.task?.length === 1));
      expect(states.at(-1)?.recordsById["record-1"]).toEqual(record("record-1", "First"));
    } finally {
      stopBroadcast();
      unsubscribe();
    }
  });

  it("ignores broadcast events for another schema key", async () => {
    const states = [getClientStoreSnapshot()];
    const unsubscribe = subscribeToClientStore(() => states.push(getClientStoreSnapshot()));
    const stopBroadcast = connectBroadcastToClientStore("tasks");

    try {
      await mergeRecords("estii", [record("record-2", "Rate")], 1);
      publishClientEvent("estii", "records-updated");

      await delay(20);
      expect(states).toEqual([getClientStoreSnapshot()]);

      await mergeRecords("tasks", [record("record-1", "First")], 1);
      publishClientEvent("tasks", "records-updated");

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
      "tasks",
      jsonFetcher("/api/tasks/bootstrap", {
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
      await refreshClientStoreFromDb("tasks");

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

function fakeSocketFactory() {
  const instances: FakeSyncSocket[] = [];

  return {
    instances,
    create: (url: string) => {
      const socket = new FakeSyncSocket(url);

      instances.push(socket);

      return socket;
    },
  };
}

class FakeSyncSocket {
  readonly url: string;
  readyState = 0;
  sentMessages: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    if (this.readyState === 3) {
      return;
    }

    this.readyState = 3;
    this.onclose?.(new Event("close") as CloseEvent);
  }

  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  receive(message: SyncSocketServerMessage) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
  }

  closeFromServer() {
    this.close();
  }
}

function parseSocketClientMessage(data: string | undefined): SyncSocketClientMessage {
  if (!data) {
    throw new Error("Expected a socket client message.");
  }

  return JSON.parse(data) as SyncSocketClientMessage;
}

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
          ...appSchema.entities.task.fields,
          notes: { type: "text", required: false },
        },
        mutations: defaultMutations(),
        actions: appSchema.entities.task.actions,
      },
    },
    queries: appSchema.queries,
    itemViews: appSchema.itemViews,
    tableViews: appSchema.tableViews,
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

function storeSnapshot(overrides: Partial<StoreSnapshot> = {}): StoreSnapshot {
  return {
    kind: STORE_SNAPSHOT_KIND,
    version: STORE_SNAPSHOT_VERSION,
    schemaKey: "tasks",
    exportedAt: "2026-04-28T00:01:00.000Z",
    schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
    sourceCursor: 1,
    schema: appSchema,
    records: [],
    ...overrides,
  };
}

function installedSiteIdentity(installId: string) {
  const identity = installedAppStorageIdentity({ installId, packageAppKey: "site" });

  if (!identity) {
    throw new Error(`Expected installed Site identity for ${installId}.`);
  }

  return identity;
}

function installedTasksIdentity(installId: string) {
  const identity = installedAppStorageIdentity({ installId, packageAppKey: "tasks" });

  if (!identity) {
    throw new Error(`Expected installed Tasks identity for ${installId}.`);
  }

  return identity;
}

function installedEstiiIdentity(installId: string) {
  const identity = installedAppStorageIdentity({ installId, packageAppKey: "estii" });

  if (!identity) {
    throw new Error(`Expected installed Estii identity for ${installId}.`);
  }

  return identity;
}

function record(id: string, title: string, done = false): StoredRecord {
  return {
    id,
    entity: "task",
    values: { title, done },
    createdAt: `2026-04-28T00:00:0${id.at(-1)}.000Z`,
  };
}

function resourceRecord(id: string, name: string): StoredRecord {
  return {
    id,
    entity: "resource",
    values: {
      name,
      kind: "role",
      unit: "day",
    },
    createdAt: `2026-04-28T00:00:0${id.at(-1)}.000Z`,
  };
}

function rateRecord(id: string, resourceId: string, cardId: string): StoredRecord {
  return {
    id,
    entity: "rate",
    values: {
      resource: resourceId,
      card: cardId,
      cost: 0,
      costUnit: "day",
      price: 0,
      priceSet: true,
      currency: "usd",
    },
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

function mutationChange(
  seq: number,
  mutationId: string,
  payload: StoredRecord,
  op: "create" | "patch" | "delete" | "action",
): ChangeRow {
  return {
    seq,
    mutationId,
    op,
    entity: payload.entity,
    recordId: payload.id,
    payload,
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

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  deleteClientDb,
  saveBootstrapResponse,
  saveSchema,
  mergeChanges,
  mergeRecords,
  readCursor,
  readLocalSnapshot,
} from "./db.ts";
import type { BootstrapResponse, ChangeRow, StoredRecord } from "../shared/protocol.ts";
import type { AppSchema } from "../shared/schema.ts";
import { taskSourceSchema as appSchema } from "../test/schema-apps.ts";

beforeEach(async () => {
  await deleteClientDb("tasks");
  await deleteClientDb("estii");
});

describe("client db", () => {
  it("stores bootstrap schema, records, cursor, and last-sync metadata", async () => {
    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 7,
    } satisfies BootstrapResponse);

    const snapshot = await readLocalSnapshot("tasks");

    expect(snapshot.schema).toEqual(appSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:00:00.000Z");
    expect(snapshot.records).toEqual([record("record-1", "First")]);
    expect(snapshot.cursor).toBe(7);
    expect(snapshot.lastSyncedAt).toEqual(expect.any(String));
  });

  it("stores each schema key in its own IndexedDB database", async () => {
    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "Task")],
      cursor: 1,
    });
    await saveBootstrapResponse("estii", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-2", "Rate")],
      cursor: 2,
    });

    await deleteRawDatabase("formless:estii");

    expect((await readLocalSnapshot("tasks")).records).toEqual([record("record-1", "Task")]);
    expect(await readLocalSnapshot("estii")).toMatchObject({
      schema: null,
      records: [],
      cursor: 0,
    });
  });

  it("merges records and advances the cursor", async () => {
    await mergeRecords("tasks", [record("record-1", "First")], 1);
    await mergeChanges("tasks", [change(2, "record-2", "Second", true)], 2);

    const snapshot = await readLocalSnapshot("tasks");

    expect(snapshot.records.map((storedRecord) => storedRecord.id)).toEqual([
      "record-1",
      "record-2",
    ]);
    expect(snapshot.cursor).toBe(2);
    expect(await readCursor("tasks")).toBe(2);
  });

  it("updates the cached schema without replacing records", async () => {
    const nextSchema = {
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

    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });
    await saveSchema("tasks", nextSchema, "2026-04-28T00:01:00.000Z");

    const snapshot = await readLocalSnapshot("tasks");

    expect(snapshot.schema).toEqual(nextSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:01:00.000Z");
    expect(snapshot.records).toEqual([record("record-1", "First")]);
    expect(snapshot.cursor).toBe(1);
  });

  it("stores and merges boolean record values", async () => {
    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First", false)],
      cursor: 1,
    });
    await mergeChanges("tasks", [change(2, "record-1", "First", true)], 2);

    const snapshot = await readLocalSnapshot("tasks");

    expect(snapshot.records).toEqual([record("record-1", "First", true)]);
    expect(typeof snapshot.records[0]?.values.done).toBe("boolean");
  });

  it("stores and merges number record values", async () => {
    await saveBootstrapResponse("tasks", {
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [recordWithEstimate("record-1", "First", 2)],
      cursor: 1,
    });
    await mergeChanges("tasks", [changeWithEstimate(2, "record-1", "First", 3)], 2);

    const snapshot = await readLocalSnapshot("tasks");

    expect(snapshot.records).toEqual([recordWithEstimate("record-1", "First", 3)]);
    expect(typeof snapshot.records[0]?.values.estimate).toBe("number");
  });
});

function record(id: string, title: string, done = false): StoredRecord {
  return {
    id,
    entity: "task",
    values: { title, done },
    createdAt: `2026-04-28T00:00:0${id.at(-1)}.000Z`,
  };
}

function deleteRawDatabase(name: string) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Could not delete ${name}.`));
    request.onblocked = () => reject(new Error(`${name} delete was blocked.`));
  });
}

function recordWithEstimate(id: string, title: string, estimate: number): StoredRecord {
  return {
    ...record(id, title),
    values: { title, done: false, estimate },
  };
}

function defaultMutations(): AppSchema["entities"][string]["mutations"] {
  return {
    create: { enabled: true },
    patch: { enabled: true },
    delete: { enabled: false },
  };
}

function change(seq: number, recordId: string, title: string, done = false): ChangeRow {
  return {
    seq,
    mutationId: `mutation-${seq}`,
    op: seq === 2 && recordId === "record-1" ? "patch" : "create",
    entity: "task",
    recordId,
    payload: record(recordId, title, done),
    createdAt: `2026-04-28T00:00:0${seq}.000Z`,
  };
}

function changeWithEstimate(
  seq: number,
  recordId: string,
  title: string,
  estimate: number,
): ChangeRow {
  return {
    ...change(seq, recordId, title, false),
    payload: recordWithEstimate(recordId, title, estimate),
  };
}

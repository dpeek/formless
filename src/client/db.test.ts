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
import { appSchema } from "./schema.ts";
import type { BootstrapResponse, ChangeRow, StoredRecord } from "../shared/protocol.ts";
import type { AppSchema } from "../shared/schema.ts";

beforeEach(async () => {
  await deleteClientDb();
});

describe("client db", () => {
  it("stores bootstrap schema, records, cursor, and last-sync metadata", async () => {
    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 7,
    } satisfies BootstrapResponse);

    const snapshot = await readLocalSnapshot();

    expect(snapshot.schema).toEqual(appSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:00:00.000Z");
    expect(snapshot.records).toEqual([record("record-1", "First")]);
    expect(snapshot.cursor).toBe(7);
    expect(snapshot.lastSyncedAt).toEqual(expect.any(String));
  });

  it("merges records and advances the cursor", async () => {
    await mergeRecords([record("record-1", "First")], 1);
    await mergeChanges([change(2, "record-2", "Second", true)], 2);

    const snapshot = await readLocalSnapshot();

    expect(snapshot.records.map((storedRecord) => storedRecord.id)).toEqual([
      "record-1",
      "record-2",
    ]);
    expect(snapshot.cursor).toBe(2);
    expect(await readCursor()).toBe(2);
  });

  it("updates the cached schema without replacing records", async () => {
    const nextSchema = {
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
        },
      },
      views: appSchema.views,
      aggregates: {},
    } satisfies AppSchema;

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });
    await saveSchema(nextSchema, "2026-04-28T00:01:00.000Z");

    const snapshot = await readLocalSnapshot();

    expect(snapshot.schema).toEqual(nextSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:01:00.000Z");
    expect(snapshot.records).toEqual([record("record-1", "First")]);
    expect(snapshot.cursor).toBe(1);
  });

  it("stores and merges boolean record values", async () => {
    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First", false)],
      cursor: 1,
    });
    await mergeChanges([change(2, "record-1", "First", true)], 2);

    const snapshot = await readLocalSnapshot();

    expect(snapshot.records).toEqual([record("record-1", "First", true)]);
    expect(typeof snapshot.records[0]?.values.done).toBe("boolean");
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

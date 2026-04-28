import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  saveBootstrapResponse,
  mergeChanges,
  mergeRecords,
  readCursor,
  readLocalSnapshot,
} from "./db.ts";
import { appSchema } from "./schema.ts";
import type { BootstrapResponse, ChangeRow, StoredRecord } from "../shared/protocol.ts";

beforeEach(async () => {
  await deleteClientDb();
});

describe("client db", () => {
  it("stores bootstrap schema, records, cursor, and last-sync metadata", async () => {
    await saveBootstrapResponse({
      schema: appSchema,
      records: [record("record-1", "First")],
      cursor: 7,
    } satisfies BootstrapResponse);

    const snapshot = await readLocalSnapshot();

    expect(snapshot.schema).toEqual(appSchema);
    expect(snapshot.records).toEqual([record("record-1", "First")]);
    expect(snapshot.cursor).toBe(7);
    expect(snapshot.lastSyncedAt).toEqual(expect.any(String));
  });

  it("merges records and advances the cursor", async () => {
    await mergeRecords([record("record-1", "First")], 1);
    await mergeChanges([change(2, "record-2", "Second")], 2);

    const snapshot = await readLocalSnapshot();

    expect(snapshot.records.map((storedRecord) => storedRecord.id)).toEqual([
      "record-1",
      "record-2",
    ]);
    expect(snapshot.cursor).toBe(2);
    expect(await readCursor()).toBe(2);
  });
});

function record(id: string, text: string): StoredRecord {
  return {
    id,
    entity: "note",
    values: { text },
    createdAt: `2026-04-28T00:00:0${id.at(-1)}.000Z`,
  };
}

function change(seq: number, recordId: string, text: string): ChangeRow {
  return {
    seq,
    mutationId: `mutation-${seq}`,
    op: "create",
    entity: "note",
    recordId,
    payload: record(recordId, text),
    createdAt: `2026-04-28T00:00:0${seq}.000Z`,
  };
}

function deleteClientDb() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("formless");

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not delete IndexedDB."));
    request.onblocked = () => reject(new Error("IndexedDB delete was blocked."));
  });
}

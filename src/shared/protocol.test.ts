import { describe, expect, it } from "vite-plus/test";
import {
  STORE_SNAPSHOT_KIND,
  STORE_SNAPSHOT_VERSION,
  isSyncSocketAttachment,
  isSyncSocketClientMessage,
  isSyncSocketServerMessage,
  parseStoreSnapshot,
  type ChangeRow,
  type StoreSnapshot,
  type StoredRecord,
  type SyncResponse,
} from "./protocol.ts";
import { taskSourceSchema as appSchema } from "../test/schema-apps.ts";

describe("push sync protocol", () => {
  it("validates client socket messages", () => {
    expect(
      isSyncSocketClientMessage({
        type: "hello",
        cursor: 1,
        schemaUpdatedAt: null,
      }),
    ).toBe(true);
    expect(
      isSyncSocketClientMessage({
        type: "sync-requested",
        cursor: 2,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      }),
    ).toBe(true);

    expect(
      isSyncSocketClientMessage({
        type: "hello",
        cursor: -1,
        schemaUpdatedAt: null,
      }),
    ).toBe(false);
    expect(
      isSyncSocketClientMessage({
        type: "schema-updated",
        cursor: 1,
        schemaUpdatedAt: null,
      }),
    ).toBe(false);
  });

  it("validates server socket messages", () => {
    expect(
      isSyncSocketServerMessage({
        type: "sync",
        payload: {
          changes: [change(1, record("record-1"))],
          cursor: 1,
          schema: appSchema,
          schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
        } satisfies SyncResponse,
      }),
    ).toBe(true);
    expect(
      isSyncSocketServerMessage({
        type: "error",
        message: "Malformed sync message.",
      }),
    ).toBe(true);

    expect(
      isSyncSocketServerMessage({
        type: "sync",
        payload: {
          changes: [],
          cursor: Number.NaN,
        },
      }),
    ).toBe(false);
    expect(
      isSyncSocketServerMessage({
        type: "error",
        message: 400,
      }),
    ).toBe(false);
  });

  it("validates hibernation socket attachments", () => {
    expect(
      isSyncSocketAttachment({
        cursor: 1,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      isSyncSocketAttachment({
        cursor: 0,
        schemaUpdatedAt: null,
      }),
    ).toBe(true);

    expect(
      isSyncSocketAttachment({
        cursor: 1.5,
        schemaUpdatedAt: null,
      }),
    ).toBe(false);
    expect(
      isSyncSocketAttachment({
        cursor: 1,
        schemaUpdatedAt: 123,
      }),
    ).toBe(false);
  });
});

describe("store snapshot protocol", () => {
  it("parses the supported version 1 envelope", () => {
    const snapshot = storeSnapshot({
      records: [
        record("record-1"),
        {
          ...record("record-2"),
          deletedAt: "2026-04-29T00:00:00.000Z",
        },
      ],
    });

    expect(parseStoreSnapshot(snapshot, "tasks")).toEqual(snapshot);
  });

  it("rejects bad kind, version, and schema key shape", () => {
    expect(() =>
      parseStoreSnapshot({
        ...storeSnapshot(),
        kind: "formless.other",
      }),
    ).toThrow('Store snapshot kind must be "formless.storeSnapshot".');

    expect(() =>
      parseStoreSnapshot({
        ...storeSnapshot(),
        version: 2,
      }),
    ).toThrow("Store snapshot version must be 1.");

    expect(() =>
      parseStoreSnapshot({
        ...storeSnapshot(),
        schemaKey: "",
      }),
    ).toThrow("Store snapshot schemaKey must be a non-empty string.");

    expect(() => parseStoreSnapshot(storeSnapshot(), "rates")).toThrow(
      'Store snapshot schemaKey must be "rates".',
    );
  });

  it("rejects unsupported envelope shapes", () => {
    expect(() =>
      parseStoreSnapshot({
        ...storeSnapshot(),
        sourceCursor: 1.5,
      }),
    ).toThrow("Store snapshot sourceCursor must be a non-negative integer.");

    expect(() =>
      parseStoreSnapshot({
        ...storeSnapshot(),
        records: [{ ...record("record-1"), createdAt: 123 }],
      }),
    ).toThrow("Store snapshot records[0] must be a stored record.");

    expect(() =>
      parseStoreSnapshot({
        ...storeSnapshot(),
        extra: true,
      }),
    ).toThrow('Store snapshot has unsupported key "extra".');
  });
});

function storeSnapshot(overrides: Partial<StoreSnapshot> = {}): StoreSnapshot {
  return {
    kind: STORE_SNAPSHOT_KIND,
    version: STORE_SNAPSHOT_VERSION,
    schemaKey: "tasks",
    exportedAt: "2026-04-28T00:00:00.000Z",
    schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
    sourceCursor: 7,
    schema: appSchema,
    records: [record("record-1")],
    ...overrides,
  };
}

function record(id: string): StoredRecord {
  return {
    id,
    entity: "task",
    values: { title: "First", done: false },
    createdAt: "2026-04-28T00:00:01.000Z",
  };
}

function change(seq: number, payload: StoredRecord): ChangeRow {
  return {
    seq,
    mutationId: `mutation-${seq}`,
    op: "create",
    entity: payload.entity,
    recordId: payload.id,
    payload,
    createdAt: `2026-04-28T00:00:0${seq}.000Z`,
  };
}

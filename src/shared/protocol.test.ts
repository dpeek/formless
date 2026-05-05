import { describe, expect, it } from "vite-plus/test";
import {
  isSyncSocketAttachment,
  isSyncSocketClientMessage,
  isSyncSocketServerMessage,
  type ChangeRow,
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

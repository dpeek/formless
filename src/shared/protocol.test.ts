import { describe, expect, it } from "vite-plus/test";
import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  isSyncSocketAttachment,
  isSyncSocketClientMessage,
  isSyncSocketServerMessage,
  parseCreateAppInstallRequest,
  parseOwnerSetupCompleteRequest,
  parseOwnerSetupToken,
  parseStorageSnapshot,
  type ChangeRow,
  type OwnerSetupCompleteRequest,
  type StorageSnapshot,
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
        type: "sync",
        payload: {
          changes: [
            change(2, { ...record("record-2"), deletedAt: "2026-04-28T00:00:02.000Z" }, "delete"),
          ],
          cursor: 2,
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

describe("owner setup protocol", () => {
  it("parses URL-safe setup tokens", () => {
    const token = "abcDEF0123456789_-abcDEF0123456789_-";

    expect(parseOwnerSetupToken(` ${token} `)).toBe(token);
  });

  it("rejects missing, short, oversized, and unsafe setup tokens", () => {
    expect(() => parseOwnerSetupToken(undefined)).toThrow("Owner setup token must be a string.");
    expect(() => parseOwnerSetupToken("short-token")).toThrow(
      "Owner setup token must be at least 32 characters.",
    );
    expect(() => parseOwnerSetupToken("a".repeat(513))).toThrow(
      "Owner setup token must be at most 512 characters.",
    );
    expect(() => parseOwnerSetupToken("abcDEF0123456789_-abcDEF0123456789_~")).toThrow(
      "Owner setup token must be URL-safe.",
    );
  });

  it("parses complete requests with the first owner identity", () => {
    const request = {
      setupToken: "abcDEF0123456789_-abcDEF0123456789_-",
      owner: {
        name: "  Ada Owner  ",
        email: "  ada@example.com  ",
      },
    };

    expect(parseOwnerSetupCompleteRequest(request)).toEqual({
      setupToken: request.setupToken,
      owner: {
        name: "Ada Owner",
        email: "ada@example.com",
      },
    } satisfies OwnerSetupCompleteRequest);
  });

  it("rejects unsupported complete request shapes", () => {
    expect(() => parseOwnerSetupCompleteRequest({ owner: { name: "Ada" } })).toThrow(
      'Owner setup request must include "setupToken".',
    );
    expect(() =>
      parseOwnerSetupCompleteRequest({
        setupToken: "abcDEF0123456789_-abcDEF0123456789_-",
        owner: { name: "" },
      }),
    ).toThrow("Owner setup owner name must be a non-empty string.");
    expect(() =>
      parseOwnerSetupCompleteRequest({
        setupToken: "abcDEF0123456789_-abcDEF0123456789_-",
        owner: { name: "Ada", role: "admin" },
      }),
    ).toThrow('Owner setup owner has unsupported key "role".');
    expect(() =>
      parseOwnerSetupCompleteRequest({
        setupToken: "abcDEF0123456789_-abcDEF0123456789_-",
        owner: { name: "Ada" },
        redirectTo: "/admin",
      }),
    ).toThrow('Owner setup request has unsupported key "redirectTo".');
  });
});

describe("app install protocol", () => {
  it("parses create app install requests", () => {
    expect(
      parseCreateAppInstallRequest({
        packageAppKey: " site ",
        installId: " personal ",
        label: " Personal Site ",
      }),
    ).toEqual({
      packageAppKey: "site",
      installId: "personal",
      label: "Personal Site",
    });
  });

  it("rejects unsupported create install request shapes", () => {
    expect(() => parseCreateAppInstallRequest({ installId: "personal", label: "Site" })).toThrow(
      'App install request must include "packageAppKey".',
    );
    expect(() =>
      parseCreateAppInstallRequest({
        packageAppKey: "site",
        installId: "personal",
        label: "Site",
        route: "/apps/personal",
      }),
    ).toThrow('App install request has unsupported key "route".');
  });
});

describe("storage snapshot protocol", () => {
  it("parses the supported version 1 envelope", () => {
    const snapshot = storageSnapshot({
      records: [
        record("record-1"),
        {
          ...record("record-2"),
          deletedAt: "2026-04-29T00:00:00.000Z",
        },
      ],
    });

    expect(
      parseStorageSnapshot(snapshot, {
        schemaKey: "tasks",
        storageIdentity: "app:work",
      }),
    ).toEqual(snapshot);
  });

  it("rejects bad kind, version, storage identity, and schema key shape", () => {
    expect(() =>
      parseStorageSnapshot({
        ...storageSnapshot(),
        kind: "formless.other",
      }),
    ).toThrow('Storage snapshot kind must be "formless.storageSnapshot".');

    expect(() =>
      parseStorageSnapshot({
        ...storageSnapshot(),
        version: 2,
      }),
    ).toThrow("Storage snapshot version must be 1.");

    expect(() =>
      parseStorageSnapshot({
        ...storageSnapshot(),
        storageIdentity: "",
      }),
    ).toThrow("Storage snapshot storageIdentity must be a non-empty string.");

    expect(() => parseStorageSnapshot(storageSnapshot(), { storageIdentity: "app:other" })).toThrow(
      'Storage snapshot storageIdentity must be "app:other".',
    );

    expect(() =>
      parseStorageSnapshot({
        ...storageSnapshot(),
        schemaKey: "",
      }),
    ).toThrow("Storage snapshot schemaKey must be a non-empty string.");

    expect(() => parseStorageSnapshot(storageSnapshot(), { schemaKey: "rates" })).toThrow(
      'Storage snapshot schemaKey must be "rates".',
    );
  });

  it("rejects unsupported envelope shapes", () => {
    expect(() =>
      parseStorageSnapshot({
        ...storageSnapshot(),
        sourceCursor: 1.5,
      }),
    ).toThrow("Storage snapshot sourceCursor must be a non-negative integer.");

    expect(() =>
      parseStorageSnapshot({
        ...storageSnapshot(),
        records: [{ ...record("record-1"), createdAt: 123 }],
      }),
    ).toThrow("Storage snapshot records[0] must be a stored record.");

    expect(() =>
      parseStorageSnapshot({
        ...storageSnapshot(),
        extra: true,
      }),
    ).toThrow('Storage snapshot has unsupported key "extra".');
  });
});

function storageSnapshot(overrides: Partial<StorageSnapshot> = {}): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: "app:work",
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

function change(seq: number, payload: StoredRecord, op: ChangeRow["op"] = "create"): ChangeRow {
  return {
    seq,
    mutationId: `mutation-${seq}`,
    op,
    entity: payload.entity,
    recordId: payload.id,
    payload,
    createdAt: `2026-04-28T00:00:0${seq}.000Z`,
  };
}

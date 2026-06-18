import { parseAppSchema } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";

import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  isFieldValue,
  isRecordValues,
  isStoredRecord,
  parseStorageSnapshot,
  type StorageSnapshot,
  type StoredRecord,
} from "./index.ts";

const appSchema = parseAppSchema({
  version: 1,
  entities: {
    task: {
      label: "Task",
      fields: {
        title: {
          type: "text",
          required: true,
          label: "Title",
        },
        done: {
          type: "boolean",
          required: true,
          label: "Done",
          default: false,
        },
      },
      mutations: {
        create: {
          enabled: true,
        },
        patch: {
          enabled: true,
        },
        delete: {
          enabled: false,
        },
      },
    },
  },
  queries: {
    taskAll: { label: "Tasks", entity: "task", expression: { kind: "all" } },
  },
  itemViews: {
    taskItem: {
      entity: "task",
      fields: {
        title: { editor: "text", commit: "field-commit" },
      },
    },
  },
  tableViews: {},
  views: {
    taskList: {
      type: "collection",
      label: "Tasks",
      entity: "task",
      queries: [{ query: "taskAll" }],
      defaultQuery: "taskAll",
      result: { type: "list", itemView: "taskItem" },
    },
  },
  screens: {
    home: {
      type: "workspace",
      label: "Home",
      layout: {
        type: "stack",
        sections: [{ id: "tasks", type: "collection", view: "taskList" }],
      },
    },
  },
});

describe("storage snapshot package", () => {
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
        records: [{ ...record("record-1"), updatedAt: 123 }],
      }),
    ).toThrow("Storage snapshot records[0] must be a stored record.");

    expect(() =>
      parseStorageSnapshot({
        ...storageSnapshot(),
        extra: true,
      }),
    ).toThrow('Storage snapshot has unsupported key "extra".');
  });

  it("validates flat stored records and record values", () => {
    expect(isFieldValue("title")).toBe(true);
    expect(isFieldValue(true)).toBe(true);
    expect(isFieldValue(7)).toBe(true);
    expect(isFieldValue(Number.NaN)).toBe(false);
    expect(isRecordValues({ title: "First", done: false, estimate: 3 })).toBe(true);
    expect(isRecordValues({ nested: { bad: true } })).toBe(false);
    expect(isStoredRecord(record("record-1"))).toBe(true);
    expect(isStoredRecord({ ...record("record-1"), values: { nested: {} } })).toBe(false);
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
    updatedAt: "2026-04-28T00:00:01.000Z",
  };
}

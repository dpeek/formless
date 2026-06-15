import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  applyBootstrapResponse,
  applyChanges,
  applyRecordMerge,
  applySchemaSave,
  getClientStoreSnapshot,
  resetClientStore,
  selectClientStoreSchemaKey,
  subscribeToClientStoreSelector,
} from "./store.ts";
import { instanceControlPlaneClientTarget } from "./app-target.ts";
import type { BootstrapResponse, StoredRecord } from "../shared/protocol.ts";
import type { AppSchema } from "@dpeek/formless-schema";
import { taskSourceSchema as appSchema } from "../test/schema-apps.ts";

beforeEach(() => {
  resetClientStore();
});

describe("client store", () => {
  it("normalizes bootstrap records by ID and entity", () => {
    applyBootstrapResponse(bootstrap([record("record-1", "First"), record("record-2", "Second")]));

    const snapshot = getClientStoreSnapshot();

    expect(snapshot.hydrated).toBe(true);
    expect(snapshot.recordsById["record-1"]).toEqual(record("record-1", "First"));
    expect(snapshot.recordIdsByEntity.task).toEqual(["record-1", "record-2"]);
    expect(snapshot.cursor).toBe(1);
  });

  it("preserves unrelated record and entity ID array identity on patch", () => {
    applyBootstrapResponse(
      bootstrap([
        record("record-1", "First"),
        record("record-2", "Second"),
        record("note-1", "Note", false, "note"),
      ]),
    );
    const before = getClientStoreSnapshot();

    applyRecordMerge([record("record-1", "Updated")], 2);
    const after = getClientStoreSnapshot();

    expect(after.recordsById["record-1"]).not.toBe(before.recordsById["record-1"]);
    expect(after.recordsById["record-2"]).toBe(before.recordsById["record-2"]);
    expect(after.recordsById["note-1"]).toBe(before.recordsById["note-1"]);
    expect(after.recordIdsByEntity.task).toBe(before.recordIdsByEntity.task);
    expect(after.recordIdsByEntity.note).toBe(before.recordIdsByEntity.note);
  });

  it("appends only the created entity ID array", () => {
    applyBootstrapResponse(
      bootstrap([record("record-1", "First"), record("note-1", "Note", false, "note")]),
    );
    const before = getClientStoreSnapshot();

    applyRecordMerge([record("record-2", "Second")], 2);
    const after = getClientStoreSnapshot();

    expect(after.recordIdsByEntity.task).toEqual(["record-1", "record-2"]);
    expect(after.recordIdsByEntity.task).not.toBe(before.recordIdsByEntity.task);
    expect(after.recordIdsByEntity.note).toBe(before.recordIdsByEntity.note);
  });

  it("preserves record identity on schema updates", () => {
    const nextSchema = schemaWithSummary();

    applyBootstrapResponse(bootstrap([record("record-1", "First")]));
    const before = getClientStoreSnapshot();

    applySchemaSave(nextSchema, "2026-04-28T00:01:00.000Z");
    const after = getClientStoreSnapshot();

    expect(after.schema).toEqual(nextSchema);
    expect(after.recordsById["record-1"]).toBe(before.recordsById["record-1"]);
    expect(after.recordIdsByEntity.task).toBe(before.recordIdsByEntity.task);
  });

  it("cursor-only updates do not change schema or record identities", () => {
    applyBootstrapResponse(bootstrap([record("record-1", "First")]));
    const before = getClientStoreSnapshot();

    applyChanges([], 2);
    const after = getClientStoreSnapshot();

    expect(after.cursor).toBe(2);
    expect(after.schema).toBe(before.schema);
    expect(after.recordsById).toBe(before.recordsById);
    expect(after.recordIdsByEntity).toBe(before.recordIdsByEntity);
  });

  it("ignores stale responses for an inactive schema key", () => {
    selectClientStoreSchemaKey("site");

    applyBootstrapResponse(bootstrap([record("record-1", "First")]), "tasks");

    expect(getClientStoreSnapshot().activeSchemaKey).toBe("site");
    expect(getClientStoreSnapshot().recordsById).toEqual({});

    applyBootstrapResponse(bootstrap([record("record-2", "Site")]), "site");

    expect(getClientStoreSnapshot().recordsById["record-2"]).toEqual(record("record-2", "Site"));
  });

  it("tracks the runtime-owned control-plane schema key for its client target", () => {
    const controlPlaneTarget = instanceControlPlaneClientTarget();

    applyBootstrapResponse(bootstrap([record("install-1", "Personal Site")]), controlPlaneTarget);

    expect(getClientStoreSnapshot()).toMatchObject({
      activeClientStorageName: "formless:instance:control-plane",
      activeSchemaKey: "instance-control-plane",
    });
    expect(getClientStoreSnapshot().recordsById["install-1"]).toEqual(
      record("install-1", "Personal Site"),
    );
  });
});

describe("client store selectors", () => {
  it("notifies a changed field subscriber only for that field", () => {
    const titleValues: unknown[] = [];
    const doneValues: unknown[] = [];

    applyBootstrapResponse(bootstrap([record("record-1", "First", false)]));
    const unsubscribeTitle = subscribeToClientStoreSelector(
      (snapshot) => snapshot.recordsById["record-1"]?.values.title,
      (value) => titleValues.push(value),
    );
    const unsubscribeDone = subscribeToClientStoreSelector(
      (snapshot) => snapshot.recordsById["record-1"]?.values.done,
      (value) => doneValues.push(value),
    );

    try {
      applyRecordMerge([record("record-1", "Updated", false)], 2);

      expect(titleValues).toEqual(["Updated"]);
      expect(doneValues).toEqual([]);
    } finally {
      unsubscribeTitle();
      unsubscribeDone();
    }
  });

  it("does not notify another record subscriber when one record changes", () => {
    const values: unknown[] = [];

    applyBootstrapResponse(bootstrap([record("record-1", "First"), record("record-2", "Second")]));
    const unsubscribe = subscribeToClientStoreSelector(
      (snapshot) => snapshot.recordsById["record-2"],
      (value) => values.push(value),
    );

    try {
      applyRecordMerge([record("record-1", "Updated")], 2);

      expect(values).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  it("does not notify a record created-at subscriber when only field values change", () => {
    const values: unknown[] = [];

    applyBootstrapResponse(bootstrap([record("record-1", "First")]));
    const unsubscribe = subscribeToClientStoreSelector(
      (snapshot) => snapshot.recordsById["record-1"]?.createdAt,
      (value) => values.push(value),
    );

    try {
      applyRecordMerge([record("record-1", "Updated")], 2);

      expect(values).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  it("changes entity record IDs on create but not patch", () => {
    const idLists: string[][] = [];

    applyBootstrapResponse(bootstrap([record("record-1", "First")]));
    const unsubscribe = subscribeToClientStoreSelector(
      (snapshot) => snapshot.recordIdsByEntity.task,
      (value) => idLists.push(value),
    );

    try {
      applyRecordMerge([record("record-1", "Updated")], 2);
      applyRecordMerge([record("record-2", "Second")], 3);

      expect(idLists).toEqual([["record-1", "record-2"]]);
    } finally {
      unsubscribe();
    }
  });
});

function bootstrap(records: StoredRecord[], schema: AppSchema = appSchema): BootstrapResponse {
  return {
    schema,
    schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
    records,
    cursor: 1,
  };
}

function record(id: string, title: string, done = false, entity = "task"): StoredRecord {
  return {
    id,
    entity,
    values: { title, done },
    createdAt: `2026-04-28T00:00:0${id.at(-1)}.000Z`,
  };
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
        mutations: {
          create: { enabled: true },
          patch: { enabled: true },
          delete: { enabled: false },
        },
        actions: appSchema.entities.task.actions,
      },
    },
    queries: appSchema.queries,
    itemViews: appSchema.itemViews,
    tableViews: appSchema.tableViews,
    views: appSchema.views,
  } satisfies AppSchema;
}

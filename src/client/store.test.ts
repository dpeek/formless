import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  applyBootstrapResponse,
  applyChanges,
  applyRecordMerge,
  applySchemaSave,
  createEntityRecordCountMatchingQuerySelector,
  createEntityRecordOptionsMatchingQuerySelector,
  createReferenceOptionsSelector,
  getClientStoreSnapshot,
  resetClientStore,
  subscribeToClientStoreSelector,
} from "./store.ts";
import { appSchema } from "./schema.ts";
import type { BootstrapResponse, StoredRecord } from "../shared/protocol.ts";
import type { AppSchema } from "../shared/schema.ts";

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

  it("changes the home view model on schema update but not record patch", () => {
    const models: unknown[] = [];

    applyBootstrapResponse(bootstrap([record("record-1", "First")]));
    const unsubscribe = subscribeToClientStoreSelector(
      (snapshot) => snapshot.homeViewModel,
      (value) => models.push(value),
    );

    try {
      applyRecordMerge([record("record-1", "Updated")], 2);
      applySchemaSave(schemaWithSummary(), "2026-04-28T00:01:00.000Z");

      expect(models).toHaveLength(1);
      expect((models[0] as { entity: { label: string } }).entity.label).toBe("Planner task");
    } finally {
      unsubscribe();
    }
  });

  it("count selectors update after create", () => {
    const counts: number[] = [];

    applyBootstrapResponse(bootstrap([record("record-1", "First", false)]));
    const unsubscribe = subscribeToClientStoreSelector(
      createEntityRecordCountMatchingQuerySelector("task", activeQuery),
      (value) => counts.push(value),
    );

    try {
      applyRecordMerge([record("record-2", "Second", false)], 2);

      expect(counts).toEqual([2]);
    } finally {
      unsubscribe();
    }
  });

  it("count selectors update after patching done", () => {
    const counts: number[] = [];

    applyBootstrapResponse(
      bootstrap([record("record-1", "First", false), record("record-2", "Second", false)]),
    );
    const unsubscribe = subscribeToClientStoreSelector(
      createEntityRecordCountMatchingQuerySelector("task", activeQuery),
      (value) => counts.push(value),
    );

    try {
      applyRecordMerge([record("record-1", "First", true)], 2);

      expect(counts).toEqual([1]);
    } finally {
      unsubscribe();
    }
  });

  it("count selectors update after tombstoning records through action changes", () => {
    const counts: number[] = [];

    applyBootstrapResponse(bootstrap([record("record-1", "First", true)]));
    const unsubscribe = subscribeToClientStoreSelector(
      createEntityRecordCountMatchingQuerySelector("task", completedQuery),
      (value) => counts.push(value),
    );

    try {
      applyChanges(
        [
          {
            seq: 2,
            mutationId: "action-1",
            op: "action",
            entity: "task",
            recordId: "record-1",
            payload: {
              ...record("record-1", "First", true),
              deletedAt: "2026-04-28T00:02:00.000Z",
            },
            createdAt: "2026-04-28T00:02:00.000Z",
          },
        ],
        2,
      );

      expect(counts).toEqual([0]);
    } finally {
      unsubscribe();
    }
  });

  it("count selectors do not notify when unrelated record fields change", () => {
    const counts: number[] = [];

    applyBootstrapResponse(bootstrap([record("record-1", "First", false)]));
    const unsubscribe = subscribeToClientStoreSelector(
      createEntityRecordCountMatchingQuerySelector("task", activeQuery),
      (value) => counts.push(value),
    );

    try {
      applyRecordMerge([record("record-1", "Updated", false)], 2);

      expect(counts).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  it("returns stable reference options from active target records", () => {
    const selector = createReferenceOptionsSelector("resource", "title");
    const activeResource = record("resource-1", "Designer", false, "resource");
    const deletedResource = {
      ...record("resource-2", "Archived", false, "resource"),
      deletedAt: "2026-04-28T00:02:00.000Z",
    };

    applyBootstrapResponse(
      bootstrap([activeResource, deletedResource, record("record-1", "Task")]),
    );
    const first = selector(getClientStoreSnapshot());

    applyRecordMerge([record("record-1", "Updated task")], 2);
    const afterUnrelatedPatch = selector(getClientStoreSnapshot());

    applyRecordMerge([record("resource-1", "Engineer", false, "resource")], 3);
    const afterLabelPatch = selector(getClientStoreSnapshot());

    expect(first).toEqual([{ id: "resource-1", label: "Designer" }]);
    expect(afterUnrelatedPatch).toBe(first);
    expect(afterLabelPatch).toEqual([{ id: "resource-1", label: "Engineer" }]);
    expect(afterLabelPatch).not.toBe(first);
  });

  it("filters options through context query values", () => {
    const selector = createEntityRecordOptionsMatchingQuerySelector(
      "rate",
      cardScopedRateQuery,
      "name",
      { today: "2026-05-01", values: { card: "card-1" } },
    );

    applyBootstrapResponse(
      bootstrap([rateRecord("rate-1", "card-1"), rateRecord("rate-2", "card-2")]),
    );

    expect(selector(getClientStoreSnapshot())).toEqual([{ id: "rate-1", label: "rate-1" }]);
  });

  it("does not reuse stale IDs after context values change", () => {
    const context = { today: "2026-05-01", values: { card: "card-1" } };
    const selector = createEntityRecordOptionsMatchingQuerySelector(
      "rate",
      cardScopedRateQuery,
      "name",
      context,
    );

    applyBootstrapResponse(
      bootstrap([rateRecord("rate-1", "card-1"), rateRecord("rate-2", "card-2")]),
    );
    const first = selector(getClientStoreSnapshot());

    context.values.card = "card-2";
    const second = selector(getClientStoreSnapshot());

    expect(first).toEqual([{ id: "rate-1", label: "rate-1" }]);
    expect(second).toEqual([{ id: "rate-2", label: "rate-2" }]);
  });

  it("counts scoped records for the current context value", () => {
    const context = { today: "2026-05-01", values: { card: "card-1" } };
    const selector = createEntityRecordCountMatchingQuerySelector(
      "rate",
      cardScopedRateQuery,
      context,
    );

    applyBootstrapResponse(
      bootstrap([
        rateRecord("rate-1", "card-1"),
        rateRecord("rate-2", "card-1"),
        rateRecord("rate-3", "card-2"),
      ]),
    );

    expect(selector(getClientStoreSnapshot())).toBe(2);

    context.values.card = "card-2";

    expect(selector(getClientStoreSnapshot())).toBe(1);
  });

  it("keeps tombstoned context and child records out of scoped options", () => {
    const cardSelector = createEntityRecordOptionsMatchingQuerySelector(
      "card",
      { kind: "all" },
      "name",
    );
    const rateSelector = createEntityRecordOptionsMatchingQuerySelector(
      "rate",
      cardScopedRateQuery,
      "name",
      { today: "2026-05-01", values: { card: "card-1" } },
    );

    applyBootstrapResponse(
      bootstrap([
        cardRecord("card-1", "Default"),
        { ...cardRecord("card-2", "Archived"), deletedAt: "2026-04-28T00:02:00.000Z" },
        rateRecord("rate-1", "card-1"),
        { ...rateRecord("rate-2", "card-1"), deletedAt: "2026-04-28T00:02:00.000Z" },
      ]),
    );

    expect(cardSelector(getClientStoreSnapshot())).toEqual([{ id: "card-1", label: "Default" }]);
    expect(rateSelector(getClientStoreSnapshot())).toEqual([{ id: "rate-1", label: "rate-1" }]);
  });
});

const activeQuery = {
  kind: "where",
  ref: { kind: "value", name: "done" },
  op: "eq",
  value: false,
} as const;

const completedQuery = {
  kind: "where",
  ref: { kind: "value", name: "done" },
  op: "eq",
  value: true,
} as const;

const cardScopedRateQuery = {
  kind: "where",
  ref: { kind: "value", name: "card" },
  op: "eq",
  value: { kind: "context", name: "card" },
} as const;

function bootstrap(records: StoredRecord[]): BootstrapResponse {
  return {
    schema: appSchema,
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

function cardRecord(id: string, name: string): StoredRecord {
  return {
    id,
    entity: "card",
    values: { name },
    createdAt: `2026-04-28T00:00:0${id.at(-1)}.000Z`,
  };
}

function rateRecord(id: string, card: string): StoredRecord {
  return {
    id,
    entity: "rate",
    values: { card },
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
    views: appSchema.views,
  } satisfies AppSchema;
}

import { describe, expect, it } from "vite-plus/test";
import {
  createAggregateValueMatchingQuerySelector,
  createEntityRecordCountMatchingQuerySelector,
  createEntityRecordCountReferencingFieldSelector,
  createEntityRecordIdsMatchingQuerySelector,
  createEntityRecordOptionsMatchingQuerySelector,
  createRecordReadinessWarningsSelector,
  createReferenceOptionsSelector,
  EMPTY_RECORD_IDS,
  type BrowserReplicaProjectionSnapshot,
} from "./projections.ts";
import type { StoredRecord } from "@dpeek/formless-storage";

describe("browser replica projections", () => {
  it("selects matching entity record IDs and keeps deleted records out", () => {
    const selector = createEntityRecordIdsMatchingQuerySelector("task", activeQuery);
    const snapshot = projectionSnapshot([
      record("task-1", "task", { done: false }),
      record("task-2", "task", { done: true }),
      { ...record("task-3", "task", { done: false }), deletedAt: "2026-04-28T00:04:00.000Z" },
      record("note-1", "note", { done: false }),
    ]);

    expect(selector(snapshot)).toEqual(["task-1"]);
  });

  it("returns the stored entity ID array for all queries", () => {
    const selector = createEntityRecordIdsMatchingQuerySelector("task", { kind: "all" });
    const snapshot = projectionSnapshot([
      record("task-1", "task", { done: false }),
      record("task-2", "task", { done: true }),
    ]);

    expect(selector(snapshot)).toBe(snapshot.recordIdsByEntity.task);
  });

  it("reuses filtered ID arrays when projection inputs do not change", () => {
    const selector = createEntityRecordIdsMatchingQuerySelector("task", activeQuery);
    const snapshot = projectionSnapshot([record("task-1", "task", { done: false })]);
    const first = selector(snapshot);
    const repeated = selector(snapshot);
    const unrelatedPatch = {
      recordsById: {
        ...snapshot.recordsById,
        "note-1": record("note-1", "note", { done: true }),
      },
      recordIdsByEntity: snapshot.recordIdsByEntity,
    };
    const afterUnrelatedPatch = selector(unrelatedPatch);

    expect(repeated).toBe(first);
    expect(afterUnrelatedPatch).toBe(first);
  });

  it("uses mutable query context values in the projection cache key", () => {
    const context = { today: "2026-05-01", values: { card: "card-1" } };
    const selector = createEntityRecordOptionsMatchingQuerySelector(
      "rate",
      cardScopedRateQuery,
      "name",
      context,
    );
    const snapshot = projectionSnapshot([
      record("rate-1", "rate", { card: "card-1" }),
      record("rate-2", "rate", { card: "card-2" }),
    ]);

    const first = selector(snapshot);
    context.values.card = "card-2";
    const second = selector(snapshot);

    expect(first).toEqual([{ id: "rate-1", label: "rate-1" }]);
    expect(second).toEqual([{ id: "rate-2", label: "rate-2" }]);
    expect(second).not.toBe(first);
  });

  it("returns stable empty results for missing entities", () => {
    const idSelector = createEntityRecordIdsMatchingQuerySelector("task", { kind: "all" });
    const optionSelector = createReferenceOptionsSelector("task", "title");
    const snapshot = projectionSnapshot([record("note-1", "note", { title: "Note" })]);

    const firstIds = idSelector(snapshot);
    const secondIds = idSelector(snapshot);
    const firstOptions = optionSelector(snapshot);
    const secondOptions = optionSelector(snapshot);

    expect(firstIds).toBe(EMPTY_RECORD_IDS);
    expect(secondIds).toBe(firstIds);
    expect(firstOptions).toEqual([]);
    expect(secondOptions).toBe(firstOptions);
  });

  it("reuses reference options when labels are unchanged and updates changed labels", () => {
    const selector = createReferenceOptionsSelector("resource", "title");
    const snapshot = projectionSnapshot([
      record("resource-1", "resource", { title: "Designer" }),
      { ...record("resource-2", "resource", { title: "Archived" }), deletedAt },
      record("task-1", "task", { title: "Task" }),
    ]);
    const first = selector(snapshot);
    const unrelatedPatch = {
      recordsById: {
        ...snapshot.recordsById,
        "task-1": record("task-1", "task", { title: "Updated task" }),
      },
      recordIdsByEntity: snapshot.recordIdsByEntity,
    };
    const afterUnrelatedPatch = selector(unrelatedPatch);
    const labelPatch = projectionSnapshot([
      record("resource-1", "resource", { title: "Engineer" }),
      record("task-1", "task", { title: "Updated task" }),
    ]);
    const afterLabelPatch = selector(labelPatch);

    expect(first).toEqual([{ id: "resource-1", label: "Designer" }]);
    expect(afterUnrelatedPatch).toBe(first);
    expect(afterLabelPatch).toEqual([{ id: "resource-1", label: "Engineer" }]);
    expect(afterLabelPatch).not.toBe(first);
  });

  it("falls back to record IDs for missing or blank reference option labels", () => {
    const selector = createReferenceOptionsSelector("resource", "title");
    const snapshot = projectionSnapshot([
      record("resource-1", "resource", { title: "   " }),
      record("resource-2", "resource", { name: "Engineer" }),
    ]);

    expect(selector(snapshot)).toEqual([
      { id: "resource-1", label: "resource-1" },
      { id: "resource-2", label: "resource-2" },
    ]);
  });

  it("counts entity filters and active references from the replica snapshot", () => {
    const activeCount = createEntityRecordCountMatchingQuerySelector("task", activeQuery);
    const blockReferenceCount = createEntityRecordCountReferencingFieldSelector(
      "block-placement",
      "block",
      "block-1",
    );
    const snapshot = projectionSnapshot([
      record("task-1", "task", { done: false }),
      record("task-2", "task", { done: true }),
      record("placement-1", "block-placement", { block: "block-1" }),
      record("placement-2", "block-placement", { block: "block-2" }),
      {
        ...record("placement-3", "block-placement", { block: "block-1" }),
        deletedAt: "2026-04-28T00:04:00.000Z",
      },
    ]);

    expect(activeCount(snapshot)).toBe(1);
    expect(blockReferenceCount(snapshot)).toBe(1);
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
    const snapshot = projectionSnapshot([
      record("card-1", "card", { name: "Default" }),
      { ...record("card-2", "card", { name: "Archived" }), deletedAt },
      record("rate-1", "rate", { card: "card-1" }),
      { ...record("rate-2", "rate", { card: "card-1" }), deletedAt },
    ]);

    expect(cardSelector(snapshot)).toEqual([{ id: "card-1", label: "Default" }]);
    expect(rateSelector(snapshot)).toEqual([{ id: "rate-1", label: "rate-1" }]);
  });

  it("evaluates aggregate values from matching local query records", () => {
    const selector = createAggregateValueMatchingQuerySelector(
      "rate",
      cardScopedRateQuery,
      {
        query: "ratesForSelectedCard",
        function: "sum",
        value: { kind: "field", field: "cost" },
      },
      {},
      { today: "2026-05-01", values: { card: "card-1" } },
    );
    const snapshot = projectionSnapshot([
      record("rate-1", "rate", { card: "card-1", cost: 325, price: 475 }),
      record("rate-2", "rate", { card: "card-1", cost: 450, price: 600 }),
      record("rate-3", "rate", { card: "card-2", cost: 750, price: 900 }),
    ]);

    expect(selector(snapshot)).toBe(775);
  });

  it("evaluates aggregate computed values and skips invalid runtime values", () => {
    const selector = createAggregateValueMatchingQuerySelector(
      "rate",
      { kind: "all" },
      {
        query: "rateAll",
        function: "average",
        value: { kind: "computed", computedValue: "rateMargin" },
      },
      {
        rateMargin: {
          entity: "rate",
          type: "number",
          expression: {
            kind: "binary",
            op: "divide",
            left: {
              kind: "binary",
              op: "subtract",
              left: { kind: "field", field: "price" },
              right: { kind: "field", field: "cost" },
            },
            right: { kind: "field", field: "price" },
          },
        },
      },
    );
    const snapshot = projectionSnapshot([
      record("rate-1", "rate", { card: "card-1", cost: 300, price: 600 }),
      record("rate-2", "rate", { card: "card-1", cost: 100, price: 0 }),
    ]);

    expect(selector(snapshot)).toBe(0.5);
  });

  it("reuses readiness warning arrays and updates when references resolve", () => {
    const selector = createRecordReadinessWarningsSelector("placement-1");
    const snapshot = projectionSnapshot([
      record("placement-1", "block-placement", { parent: "parent-1", block: "block-1", order: 0 }),
    ]);

    const first = selector(snapshot);
    const repeated = selector(snapshot);
    const resolvedSnapshot = projectionSnapshot([
      record("placement-1", "block-placement", { parent: "parent-1", block: "block-1", order: 0 }),
      record("block-1", "block", { type: "link", label: "Home" }),
    ]);
    const afterResolvedReference = selector(resolvedSnapshot);
    const repeatedEmpty = selector(resolvedSnapshot);

    expect(first).toEqual([
      {
        code: "placement-block-child",
        message: "Placement should point to a live child block.",
      },
    ]);
    expect(repeated).toBe(first);
    expect(afterResolvedReference).toEqual([]);
    expect(repeatedEmpty).toBe(afterResolvedReference);
  });
});

const activeQuery = {
  kind: "where",
  ref: { kind: "value", name: "done" },
  op: "eq",
  value: false,
} as const;

const cardScopedRateQuery = {
  kind: "where",
  ref: { kind: "value", name: "card" },
  op: "eq",
  value: { kind: "context", name: "card" },
} as const;

const deletedAt = "2026-04-28T00:04:00.000Z";

function projectionSnapshot(records: StoredRecord[]): BrowserReplicaProjectionSnapshot {
  return {
    recordsById: Object.fromEntries(records.map((item) => [item.id, item])),
    recordIdsByEntity: records.reduce<Record<string, string[]>>((idsByEntity, item) => {
      if (item.deletedAt) {
        return idsByEntity;
      }

      idsByEntity[item.entity] = [...(idsByEntity[item.entity] ?? []), item.id];

      return idsByEntity;
    }, {}),
  };
}

function record(id: string, entity: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity,
    values,
    createdAt: `2026-04-28T00:00:0${id.at(-1)}.000Z`,
  };
}

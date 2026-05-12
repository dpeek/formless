import { describe, expect, it } from "vite-plus/test";
import {
  createEntityRecordCountMatchingQuerySelector,
  createEntityRecordCountReferencingFieldSelector,
  createEntityRecordIdsMatchingQuerySelector,
  createEntityRecordOptionsMatchingQuerySelector,
  createReferenceOptionsSelector,
  EMPTY_RECORD_IDS,
  type BrowserReplicaProjectionSnapshot,
} from "./projections.ts";
import type { StoredRecord } from "../shared/protocol.ts";

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

  it("counts entity filters and active references from the replica snapshot", () => {
    const activeCount = createEntityRecordCountMatchingQuerySelector("task", activeQuery);
    const blockReferenceCount = createEntityRecordCountReferencingFieldSelector(
      "blockPlacement",
      "block",
      "block-1",
    );
    const snapshot = projectionSnapshot([
      record("task-1", "task", { done: false }),
      record("task-2", "task", { done: true }),
      record("placement-1", "blockPlacement", { block: "block-1" }),
      record("placement-2", "blockPlacement", { block: "block-2" }),
      {
        ...record("placement-3", "blockPlacement", { block: "block-1" }),
        deletedAt: "2026-04-28T00:04:00.000Z",
      },
    ]);

    expect(activeCount(snapshot)).toBe(1);
    expect(blockReferenceCount(snapshot)).toBe(1);
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

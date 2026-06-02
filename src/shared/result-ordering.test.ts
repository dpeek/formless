import { describe, expect, it } from "vite-plus/test";
import type { StoredRecord } from "./protocol.ts";
import {
  calculateOrderingDragMovePlan,
  calculateOrderingMovePlan,
  rebalanceOrderingRanks,
  sortRecordIdsByOrdering,
} from "./result-ordering.ts";

describe("result ordering ranks", () => {
  it("sorts records by numeric rank with stable fallback", () => {
    const recordsById = recordsByIdFrom([
      placementRecord("a", { order: 2000 }),
      placementRecord("b", { order: 1000 }),
      placementRecord("c", { order: 1000 }),
      placementRecord("d", { order: "legacy" }),
    ]);

    expect(sortRecordIdsByOrdering(["a", "b", "c", "d"], recordsById, "order")).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
  });

  it("sorts scoped records within stable scope groups", () => {
    const recordsById = recordsByIdFrom([
      placementRecord("header", { slot: "header", order: 1000 }),
      placementRecord("main-a", { slot: "main", order: 2000 }),
      placementRecord("main-b", { slot: "main", order: 500 }),
      placementRecord("footer", { slot: "footer", order: 1000 }),
    ]);

    expect(
      sortRecordIdsByOrdering(["header", "main-a", "main-b", "footer"], recordsById, "order", [
        "slot",
      ]),
    ).toEqual(["header", "main-b", "main-a", "footer"]);
  });

  it("calculates sparse one-row patches for top, up, down, and bottom moves", () => {
    const recordsById = recordsByIdFrom([
      placementRecord("a", { order: 1000 }),
      placementRecord("b", { order: 2000 }),
      placementRecord("c", { order: 3000 }),
    ]);
    const orderedRecordIds = ["a", "b", "c"];

    expect(moveRank("b", "top", orderedRecordIds, recordsById)).toBe(500);
    expect(moveRank("b", "up", orderedRecordIds, recordsById)).toBe(500);
    expect(moveRank("b", "down", orderedRecordIds, recordsById)).toBe(4000);
    expect(moveRank("b", "bottom", orderedRecordIds, recordsById)).toBe(4000);
  });

  it("keeps move availability inside ordering scope", () => {
    const recordsById = recordsByIdFrom([
      placementRecord("a", { parent: "page-1", slot: "main", order: 1000 }),
      placementRecord("b", { parent: "page-1", slot: "main", order: 2000 }),
      placementRecord("c", { parent: "page-1", slot: "footer", order: 1500 }),
      placementRecord("d", { parent: "page-2", slot: "main", order: 1500 }),
    ]);
    const orderedRecordIds = sortRecordIdsByOrdering(["a", "b", "c", "d"], recordsById, "order");

    expect(moveRank("b", "top", orderedRecordIds, recordsById, ["parent", "slot"])).toBe(500);
    expect(
      calculateOrderingMovePlan({
        direction: "up",
        fieldName: "order",
        orderedRecordIds,
        recordId: "c",
        recordsById,
        scopeFields: ["parent", "slot"],
        rankOptions: { min: 0 },
      }),
    ).toEqual({ kind: "unavailable", reason: "already-at-boundary" });
  });

  it("calculates drag-drop patches inside ordering scope", () => {
    const recordsById = recordsByIdFrom([
      placementRecord("a", { parent: "page-1", slot: "main", order: 1000 }),
      placementRecord("b", { parent: "page-1", slot: "main", order: 2000 }),
      placementRecord("c", { parent: "page-1", slot: "main", order: 3000 }),
      placementRecord("d", { parent: "page-1", slot: "footer", order: 1500 }),
    ]);
    const orderedRecordIds = sortRecordIdsByOrdering(["a", "b", "c", "d"], recordsById, "order", [
      "parent",
      "slot",
    ]);

    expect(
      calculateOrderingDragMovePlan({
        fieldName: "order",
        orderedRecordIds,
        recordId: "a",
        recordsById,
        scopeFields: ["parent", "slot"],
        targetIndex: 2,
        rankOptions: { min: 0 },
      }),
    ).toEqual({ kind: "patch", recordId: "a", rank: 4000 });
    expect(
      calculateOrderingDragMovePlan({
        fieldName: "order",
        orderedRecordIds,
        recordId: "d",
        recordsById,
        scopeFields: ["parent", "slot"],
        targetIndex: 1,
        rankOptions: { min: 0 },
      }),
    ).toEqual({ kind: "unavailable", reason: "outside-scope" });
  });

  it("isolates rebalance ranks when no safe rank gap remains", () => {
    const recordsById = recordsByIdFrom([
      placementRecord("a", { order: 0 }),
      placementRecord("b", { order: 1 }),
      placementRecord("c", { order: 2 }),
    ]);

    expect(
      calculateOrderingMovePlan({
        direction: "top",
        fieldName: "order",
        orderedRecordIds: ["a", "b", "c"],
        recordId: "b",
        recordsById,
        scopeFields: [],
        rankOptions: { min: 0 },
      }),
    ).toEqual({
      kind: "rebalance",
      updates: [
        { recordId: "b", rank: 1000 },
        { recordId: "a", rank: 2000 },
        { recordId: "c", rank: 3000 },
      ],
    });
    expect(rebalanceOrderingRanks(["b", "a", "c"], { min: 0 })).toEqual([
      { recordId: "b", rank: 1000 },
      { recordId: "a", rank: 2000 },
      { recordId: "c", rank: 3000 },
    ]);
  });
});

function moveRank(
  recordId: string,
  direction: "top" | "up" | "down" | "bottom",
  orderedRecordIds: string[],
  recordsById: Record<string, StoredRecord>,
  scopeFields: string[] = [],
) {
  const plan = calculateOrderingMovePlan({
    direction,
    fieldName: "order",
    orderedRecordIds,
    recordId,
    recordsById,
    scopeFields,
    rankOptions: { min: 0 },
  });

  if (plan.kind !== "patch") {
    throw new Error(`Expected patch plan, received "${plan.kind}".`);
  }

  return plan.rank;
}

function recordsByIdFrom(records: StoredRecord[]) {
  return Object.fromEntries(records.map((record) => [record.id, record]));
}

function placementRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity: "block-placement",
    values: {
      parent: "page-1",
      slot: "main",
      ...values,
    },
    createdAt: `2026-05-07T00:00:${id}.000Z`,
  };
}

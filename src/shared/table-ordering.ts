import type { StoredRecord } from "./protocol.ts";

export type OrderingMoveDirection = "top" | "up" | "down" | "bottom";

export type OrderingMovePatchPlan = {
  kind: "patch";
  recordId: string;
  rank: number;
};

export type OrderingMoveUnavailablePlan = {
  kind: "unavailable";
  reason: "missing-record" | "outside-scope" | "already-at-boundary";
};

export type OrderingMoveRebalancePlan = {
  kind: "rebalance";
  updates: OrderingRankUpdate[];
};

export type OrderingMovePlan =
  | OrderingMovePatchPlan
  | OrderingMoveUnavailablePlan
  | OrderingMoveRebalancePlan;

export type OrderingRankUpdate = {
  recordId: string;
  rank: number;
};

export type OrderingRankOptions = {
  min?: number;
  max?: number;
  spacing?: number;
};

const DEFAULT_RANK_SPACING = 1000;

export function sortRecordIdsByOrdering(
  recordIds: string[],
  recordsById: Record<string, StoredRecord>,
  fieldName: string,
  scopeFields: string[] = [],
) {
  const stableIndexByRecordId = new Map(recordIds.map((recordId, index) => [recordId, index]));
  const rankSort = (leftRecordId: string, rightRecordId: string) =>
    compareRecordIdsByOrderingRank(
      leftRecordId,
      rightRecordId,
      recordsById,
      fieldName,
      stableIndexByRecordId,
    );

  if (scopeFields.length > 0) {
    return groupRecordIdsByScope(recordIds, recordsById, scopeFields).flatMap((group) =>
      [...group].sort(rankSort),
    );
  }

  return [...recordIds].sort(rankSort);
}

export function calculateOrderingMovePlan({
  direction,
  fieldName,
  orderedRecordIds,
  recordId,
  recordsById,
  scopeFields,
  rankOptions = {},
}: {
  direction: OrderingMoveDirection;
  fieldName: string;
  orderedRecordIds: string[];
  recordId: string;
  recordsById: Record<string, StoredRecord>;
  scopeFields: string[];
  rankOptions?: OrderingRankOptions;
}): OrderingMovePlan {
  const sourceRecord = recordsById[recordId];

  if (!sourceRecord) {
    return { kind: "unavailable", reason: "missing-record" };
  }

  const groupRecordIds = orderingScopeRecordIds(
    orderedRecordIds,
    recordsById,
    sourceRecord,
    scopeFields,
  );
  const currentIndex = groupRecordIds.indexOf(recordId);

  if (currentIndex === -1) {
    return { kind: "unavailable", reason: "outside-scope" };
  }

  const targetIndex = targetMoveIndex(currentIndex, groupRecordIds.length, direction);

  return calculateOrderingRepositionPlan({
    currentIndex,
    fieldName,
    groupRecordIds,
    recordId,
    recordsById,
    rankOptions,
    targetIndex,
  });
}

export function calculateOrderingDragMovePlan({
  fieldName,
  orderedRecordIds,
  recordId,
  recordsById,
  scopeFields,
  targetIndex,
  rankOptions = {},
}: {
  fieldName: string;
  orderedRecordIds: string[];
  recordId: string;
  recordsById: Record<string, StoredRecord>;
  scopeFields: string[];
  targetIndex: number;
  rankOptions?: OrderingRankOptions;
}): OrderingMovePlan {
  const sourceRecord = recordsById[recordId];

  if (!sourceRecord) {
    return { kind: "unavailable", reason: "missing-record" };
  }

  const groupRecordIds = orderingScopeRecordIds(
    orderedRecordIds,
    recordsById,
    sourceRecord,
    scopeFields,
  );
  const currentIndex = groupRecordIds.indexOf(recordId);

  if (currentIndex === -1 || targetIndex < 0 || targetIndex >= groupRecordIds.length) {
    return { kind: "unavailable", reason: "outside-scope" };
  }

  return calculateOrderingRepositionPlan({
    currentIndex,
    fieldName,
    groupRecordIds,
    recordId,
    recordsById,
    rankOptions,
    targetIndex,
  });
}

function calculateOrderingRepositionPlan({
  currentIndex,
  fieldName,
  groupRecordIds,
  recordId,
  recordsById,
  rankOptions,
  targetIndex,
}: {
  currentIndex: number;
  fieldName: string;
  groupRecordIds: string[];
  recordId: string;
  recordsById: Record<string, StoredRecord>;
  rankOptions: OrderingRankOptions;
  targetIndex: number;
}): OrderingMovePlan {
  if (targetIndex === currentIndex) {
    return { kind: "unavailable", reason: "already-at-boundary" };
  }

  const movedGroupRecordIds = moveRecordId(groupRecordIds, currentIndex, targetIndex);
  const nextIndex = movedGroupRecordIds.indexOf(recordId);
  const beforeRank = rankForRecordId(movedGroupRecordIds[nextIndex - 1], recordsById, fieldName);
  const afterRank = rankForRecordId(movedGroupRecordIds[nextIndex + 1], recordsById, fieldName);
  const rank = rankBetween(beforeRank, afterRank, rankOptions);

  if (rank === undefined) {
    return {
      kind: "rebalance",
      updates: rebalanceOrderingRanks(movedGroupRecordIds, rankOptions),
    };
  }

  return {
    kind: "patch",
    recordId,
    rank,
  };
}

export function rebalanceOrderingRanks(
  orderedRecordIds: string[],
  { min, max, spacing = DEFAULT_RANK_SPACING }: OrderingRankOptions = {},
): OrderingRankUpdate[] {
  if (orderedRecordIds.length === 0) {
    return [];
  }

  const lowerBound = Number.isFinite(min) ? (min as number) : 0;
  const upperBound = Number.isFinite(max) ? (max as number) : undefined;

  if (upperBound !== undefined) {
    const availableGap = upperBound - lowerBound;
    const boundedSpacing = availableGap / (orderedRecordIds.length + 1);

    return orderedRecordIds.map((recordId, index) => ({
      recordId,
      rank: lowerBound + boundedSpacing * (index + 1),
    }));
  }

  return orderedRecordIds.map((recordId, index) => ({
    recordId,
    rank: lowerBound + spacing * (index + 1),
  }));
}

function orderingScopeRecordIds(
  orderedRecordIds: string[],
  recordsById: Record<string, StoredRecord>,
  sourceRecord: StoredRecord,
  scopeFields: string[],
) {
  return orderedRecordIds.filter((candidateRecordId) => {
    const candidateRecord = recordsById[candidateRecordId];

    return (
      candidateRecord && recordsHaveSameOrderingScope(sourceRecord, candidateRecord, scopeFields)
    );
  });
}

function groupRecordIdsByScope(
  recordIds: string[],
  recordsById: Record<string, StoredRecord>,
  scopeFields: string[],
) {
  const groupKeys: string[] = [];
  const groupsByKey = new Map<string, string[]>();

  for (const recordId of recordIds) {
    const groupKey = orderingScopeKey(recordsById[recordId], scopeFields);
    let group = groupsByKey.get(groupKey);

    if (!group) {
      group = [];
      groupsByKey.set(groupKey, group);
      groupKeys.push(groupKey);
    }

    group.push(recordId);
  }

  return groupKeys.map((groupKey) => groupsByKey.get(groupKey) ?? []);
}

function orderingScopeKey(record: StoredRecord | undefined, scopeFields: string[]) {
  if (!record) {
    return "__missing__";
  }

  return JSON.stringify(scopeFields.map((fieldName) => record.values[fieldName]));
}

function recordsHaveSameOrderingScope(
  leftRecord: StoredRecord,
  rightRecord: StoredRecord,
  scopeFields: string[],
) {
  return scopeFields.every(
    (fieldName) => leftRecord.values[fieldName] === rightRecord.values[fieldName],
  );
}

function rankValue(record: StoredRecord | undefined, fieldName: string) {
  const value = record?.values[fieldName];

  return typeof value === "number" && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function compareRecordIdsByOrderingRank(
  leftRecordId: string,
  rightRecordId: string,
  recordsById: Record<string, StoredRecord>,
  fieldName: string,
  stableIndexByRecordId: Map<string, number>,
) {
  const leftRank = rankValue(recordsById[leftRecordId], fieldName);
  const rightRank = rankValue(recordsById[rightRecordId], fieldName);
  const rankComparison = leftRank - rightRank;

  if (rankComparison !== 0) {
    return rankComparison;
  }

  return (
    (stableIndexByRecordId.get(leftRecordId) ?? 0) - (stableIndexByRecordId.get(rightRecordId) ?? 0)
  );
}

function rankForRecordId(
  recordId: string | undefined,
  recordsById: Record<string, StoredRecord>,
  fieldName: string,
) {
  if (recordId === undefined) {
    return undefined;
  }

  const rank = rankValue(recordsById[recordId], fieldName);

  return Number.isFinite(rank) ? rank : undefined;
}

function targetMoveIndex(
  currentIndex: number,
  groupSize: number,
  direction: OrderingMoveDirection,
) {
  if (direction === "top") {
    return 0;
  }

  if (direction === "up") {
    return Math.max(0, currentIndex - 1);
  }

  if (direction === "down") {
    return Math.min(groupSize - 1, currentIndex + 1);
  }

  return groupSize - 1;
}

function moveRecordId(recordIds: string[], fromIndex: number, toIndex: number) {
  const nextRecordIds = [...recordIds];
  const [recordId] = nextRecordIds.splice(fromIndex, 1);

  if (recordId === undefined) {
    return recordIds;
  }

  nextRecordIds.splice(toIndex, 0, recordId);

  return nextRecordIds;
}

function rankBetween(
  beforeRank: number | undefined,
  afterRank: number | undefined,
  { min, max, spacing = DEFAULT_RANK_SPACING }: OrderingRankOptions,
) {
  if (beforeRank !== undefined && afterRank !== undefined) {
    return finiteMidpoint(beforeRank, afterRank);
  }

  if (beforeRank === undefined && afterRank !== undefined) {
    if (min !== undefined) {
      return finiteMidpoint(min, afterRank);
    }

    return afterRank - spacing;
  }

  if (beforeRank !== undefined && afterRank === undefined) {
    if (max !== undefined) {
      return finiteMidpoint(beforeRank, max);
    }

    return beforeRank + spacing;
  }

  return undefined;
}

function finiteMidpoint(left: number, right: number) {
  const midpoint = (left + right) / 2;

  if (!Number.isFinite(midpoint) || midpoint === left || midpoint === right) {
    return undefined;
  }

  return midpoint;
}

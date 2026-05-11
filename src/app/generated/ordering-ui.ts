import type { ResultOrderingConfig } from "../../client/views.ts";
import { submitPatchMutation } from "../../client/sync.ts";
import type { StoredRecord } from "../../shared/protocol.ts";
import type { SchemaKey } from "../../shared/schema-apps.ts";
import {
  calculateOrderingDragMovePlan,
  calculateOrderingMovePlan,
  sortRecordIdsByOrdering,
  type OrderingMoveDirection,
  type OrderingMovePatchPlan,
  type OrderingMovePlan,
  type OrderingRankOptions,
} from "../../shared/result-ordering.ts";

export type { OrderingMoveDirection };

export type ResultOrderingContext = {
  canPatch: boolean;
  entityName: string;
  orderedRecordIds: string[];
  ordering: ResultOrderingConfig;
  recordsById: Record<string, StoredRecord>;
};

export type OrderingMoveMenuItem = {
  direction: OrderingMoveDirection;
  label: string;
  plan: OrderingMovePlan;
  disabled: boolean;
  disabledReason?: string;
};

export type ResultOrderingDragFact = {
  index: number;
  scopeKey: string;
};

export type ResultOrderingDragData = {
  type: typeof ORDERING_DND_TYPE;
  recordId: string;
  scopeKey: string;
};

export const ORDERING_DND_TYPE = "formless-result-ordering";

export function selectOrderedResultRecordIds(
  recordIds: string[],
  recordsById: Record<string, StoredRecord>,
  ordering: ResultOrderingConfig | undefined,
) {
  if (!ordering) {
    return recordIds;
  }

  return sortRecordIdsByOrdering(
    recordIds,
    recordsById,
    ordering.fieldName,
    ordering.scope.map((field) => field.fieldName),
  );
}

export function selectResultOrderingContext({
  canPatch,
  entityName,
  ordering,
  recordIds,
  recordsById,
}: {
  canPatch: boolean;
  entityName: string;
  ordering: ResultOrderingConfig | undefined;
  recordIds: string[];
  recordsById: Record<string, StoredRecord>;
}): ResultOrderingContext | undefined {
  if (!ordering) {
    return undefined;
  }

  return {
    canPatch,
    entityName,
    orderedRecordIds: selectOrderedResultRecordIds(recordIds, recordsById, ordering),
    ordering,
    recordsById,
  };
}

export function selectOrderingDragFacts(
  orderingContext: ResultOrderingContext | undefined,
): Map<string, ResultOrderingDragFact> | undefined {
  if (!orderingContext?.ordering.presentations.includes("dragHandle")) {
    return undefined;
  }

  const indexesByScopeKey = new Map<string, number>();
  const facts = new Map<string, ResultOrderingDragFact>();
  const scopeFields = orderingContext.ordering.scope.map((field) => field.fieldName);

  for (const recordId of orderingContext.orderedRecordIds) {
    const rawScopeKey = orderingScopeKey(orderingContext.recordsById[recordId], scopeFields);
    const scopeKey = `${orderingContext.entityName}:${orderingContext.ordering.fieldName}:${rawScopeKey}`;
    const index = indexesByScopeKey.get(scopeKey) ?? 0;

    facts.set(recordId, { index, scopeKey });
    indexesByScopeKey.set(scopeKey, index + 1);
  }

  return facts;
}

function orderingScopeKey(record: StoredRecord | undefined, scopeFields: string[]) {
  if (!record) {
    return "__missing__";
  }

  return JSON.stringify(scopeFields.map((fieldName) => record.values[fieldName]));
}

export function parseOrderingDragData(value: unknown): ResultOrderingDragData | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const data = value as Record<string, unknown>;

  if (
    data.type !== ORDERING_DND_TYPE ||
    typeof data.recordId !== "string" ||
    typeof data.scopeKey !== "string"
  ) {
    return undefined;
  }

  return {
    type: ORDERING_DND_TYPE,
    recordId: data.recordId,
    scopeKey: data.scopeKey,
  };
}

export function calculateOrderingDragMovePlanForContext({
  orderingContext,
  recordId,
  targetIndex,
}: {
  orderingContext: ResultOrderingContext;
  recordId: string;
  targetIndex: number;
}): OrderingMovePlan {
  return calculateOrderingDragMovePlan({
    fieldName: orderingContext.ordering.fieldName,
    orderedRecordIds: orderingContext.orderedRecordIds,
    recordId,
    recordsById: orderingContext.recordsById,
    scopeFields: orderingContext.ordering.scope.map((field) => field.fieldName),
    targetIndex,
    rankOptions: orderingRankOptions(orderingContext.ordering),
  });
}

export function selectOrderingMoveMenuItems({
  includeOrdering,
  orderingContext,
  sourceRecordId,
}: {
  includeOrdering: boolean;
  orderingContext: ResultOrderingContext | undefined;
  sourceRecordId: string;
}): OrderingMoveMenuItem[] {
  if (!includeOrdering || !orderingContext) {
    return [];
  }

  return orderingMoveDirections().map(({ direction, label }) => {
    const plan = calculateOrderingMovePlan({
      direction,
      fieldName: orderingContext.ordering.fieldName,
      orderedRecordIds: orderingContext.orderedRecordIds,
      recordId: sourceRecordId,
      recordsById: orderingContext.recordsById,
      scopeFields: orderingContext.ordering.scope.map((field) => field.fieldName),
      rankOptions: orderingRankOptions(orderingContext.ordering),
    });
    const disabledReason = orderingMoveDisabledReason(direction, plan, orderingContext.canPatch);

    return {
      direction,
      label,
      plan,
      disabled: disabledReason !== undefined,
      ...(disabledReason === undefined ? {} : { disabledReason }),
    };
  });
}

function orderingMoveDirections(): Array<{ direction: OrderingMoveDirection; label: string }> {
  return [
    { direction: "top", label: "Move to top" },
    { direction: "up", label: "Move up" },
    { direction: "down", label: "Move down" },
    { direction: "bottom", label: "Move to bottom" },
  ];
}

function orderingMoveDisabledReason(
  direction: OrderingMoveDirection,
  plan: OrderingMovePlan,
  canPatch: boolean,
) {
  if (!canPatch) {
    return "Editing is disabled";
  }

  if (plan.kind === "patch") {
    return undefined;
  }

  if (plan.kind === "rebalance") {
    return "Rebalance required";
  }

  if (plan.reason === "already-at-boundary") {
    return direction === "top" || direction === "up" ? "Already first" : "Already last";
  }

  return "Move unavailable";
}

export function orderingMoveAriaLabel(item: OrderingMoveMenuItem) {
  if (item.disabled && item.disabledReason) {
    return `${item.label}: ${item.disabledReason}`;
  }

  return item.label;
}

export async function submitOrderingPatch(
  schemaKey: SchemaKey,
  orderingContext: ResultOrderingContext,
  plan: OrderingMovePatchPlan,
) {
  await submitPatchMutation(schemaKey, orderingContext.entityName, plan.recordId, {
    [orderingContext.ordering.fieldName]: plan.rank,
  });
}

function orderingRankOptions(ordering: ResultOrderingConfig): OrderingRankOptions {
  return {
    ...(ordering.field.min === undefined ? {} : { min: ordering.field.min }),
    ...(ordering.field.max === undefined ? {} : { max: ordering.field.max }),
  };
}

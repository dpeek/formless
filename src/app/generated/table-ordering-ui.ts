import type { TableOrderingConfig, InvokeActionTableColumnConfig } from "../../client/views.ts";
import type { StoredRecord } from "../../shared/protocol.ts";
import {
  calculateOrderingMovePlan,
  type OrderingMoveDirection,
  type OrderingMovePlan,
} from "../../shared/table-ordering.ts";

export type TableOrderingContext = {
  canPatch: boolean;
  entityName: string;
  orderedRecordIds: string[];
  ordering: TableOrderingConfig;
  recordsById: Record<string, StoredRecord>;
};

export type OrderingMoveMenuItem = {
  direction: OrderingMoveDirection;
  label: string;
  plan: OrderingMovePlan;
  disabled: boolean;
  disabledReason?: string;
};

export type TableOrderingDragFact = {
  index: number;
  scopeKey: string;
};

export type TableOrderingDragData = {
  type: typeof ORDERING_DND_TYPE;
  recordId: string;
  scopeKey: string;
};

export const ORDERING_DND_TYPE = "formless-table-ordering";

export function selectOrderingDragFacts(
  orderedRecordIds: string[],
  recordsById: Record<string, StoredRecord>,
  entityName: string,
  ordering: TableOrderingConfig,
) {
  const indexesByScopeKey = new Map<string, number>();
  const facts = new Map<string, TableOrderingDragFact>();
  const scopeFields = ordering.scope.map((field) => field.fieldName);

  for (const recordId of orderedRecordIds) {
    const rawScopeKey = orderingScopeKey(recordsById[recordId], scopeFields);
    const scopeKey = `${entityName}:${ordering.fieldName}:${rawScopeKey}`;
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

export function parseOrderingDragData(value: unknown): TableOrderingDragData | undefined {
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

export function selectOrderingMoveMenuItems(
  column: InvokeActionTableColumnConfig,
  sourceRecordId: string,
  orderingContext: TableOrderingContext | undefined,
): OrderingMoveMenuItem[] {
  if (!column.includeOrdering || !column.ordering || !orderingContext) {
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
      rankOptions: {
        ...(orderingContext.ordering.field.min === undefined
          ? {}
          : { min: orderingContext.ordering.field.min }),
        ...(orderingContext.ordering.field.max === undefined
          ? {}
          : { max: orderingContext.ordering.field.max }),
      },
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

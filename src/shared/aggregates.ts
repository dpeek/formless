import { getEntityFieldCatalog } from "./fields.ts";
import {
  matchesQuery,
  parseQueryExpression,
  type QueryEvaluationContext,
  type QueryExpression,
} from "./query.ts";
import type { StoredRecord } from "./protocol.ts";
import type { EntitySchema } from "./schema.ts";

export type CollectionAggregateSchema = {
  type: "count";
  label: string;
  entity: string;
  query: QueryExpression;
};

export function parseCollectionAggregates(
  value: unknown,
  entities: Record<string, EntitySchema>,
): Record<string, CollectionAggregateSchema> {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error("Schema aggregates must be an object.");
  }

  return Object.fromEntries(
    Object.entries(value).map(([aggregateName, aggregate]) => {
      if (aggregateName.trim() === "") {
        throw new Error("Aggregate names must be non-empty.");
      }

      return [aggregateName, parseCollectionAggregate(aggregateName, aggregate, entities)];
    }),
  );
}

export function parseCollectionAggregate(
  aggregateName: string,
  value: unknown,
  entities: Record<string, EntitySchema>,
): CollectionAggregateSchema {
  if (!isRecord(value)) {
    throw new Error(`Aggregate "${aggregateName}" must be an object.`);
  }

  assertExactAggregateKeys(aggregateName, value);

  if (value.type !== "count") {
    throw new Error(`Aggregate "${aggregateName}" type must be "count".`);
  }

  if (typeof value.label !== "string" || value.label.trim() === "") {
    throw new Error(`Aggregate "${aggregateName}" label must be a non-empty string.`);
  }

  if (typeof value.entity !== "string" || value.entity.trim() === "") {
    throw new Error(`Aggregate "${aggregateName}" must include an entity.`);
  }

  const entity = entities[value.entity];
  if (!entity) {
    throw new Error(`Aggregate "${aggregateName}" references unknown entity "${value.entity}".`);
  }

  return {
    type: "count",
    label: value.label,
    entity: value.entity,
    query: parseQueryExpression(
      value.query,
      getEntityFieldCatalog(entity),
      `aggregate ${aggregateName}`,
    ),
  };
}

export function evaluateCollectionAggregate(
  records: StoredRecord[],
  aggregate: CollectionAggregateSchema,
  context?: QueryEvaluationContext,
): number {
  return evaluateCollectionAggregateValue(records, aggregate, context);
}

export function evaluateCollectionAggregateValue(
  records: StoredRecord[],
  aggregate: CollectionAggregateSchema,
  context?: QueryEvaluationContext,
): number {
  return records.filter((record) => {
    return record.entity === aggregate.entity && matchesQuery(record, aggregate.query, context);
  }).length;
}

function assertExactAggregateKeys(aggregateName: string, value: Record<string, unknown>) {
  const allowedKeys = ["type", "label", "entity", "query"];

  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`Aggregate "${aggregateName}" has unsupported key "${key}".`);
    }
  }

  for (const key of allowedKeys) {
    if (!(key in value)) {
      throw new Error(`Aggregate "${aggregateName}" must include "${key}".`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import { formatPlainNumber } from "./field-types.ts";
import type { StoredRecord } from "./protocol.ts";
import type { AggregateSchema, ComputedValueSchema } from "./schema-types.ts";

export type NumericExpressionOperator = "add" | "subtract" | "multiply" | "divide";

export type NumericExpression =
  | {
      kind: "field";
      field: string;
    }
  | {
      kind: "literal";
      value: number;
    }
  | {
      kind: "binary";
      op: NumericExpressionOperator;
      left: NumericExpression;
      right: NumericExpression;
    };

export function evaluateNumericExpression(
  expression: NumericExpression,
  record: StoredRecord,
): number | undefined {
  if (expression.kind === "field") {
    return finiteNumberOrUndefined(record.values[expression.field]);
  }

  if (expression.kind === "literal") {
    return finiteNumberOrUndefined(expression.value);
  }

  const left = evaluateNumericExpression(expression.left, record);
  const right = evaluateNumericExpression(expression.right, record);

  if (left === undefined || right === undefined) {
    return undefined;
  }

  if (expression.op === "add") {
    return finiteNumberOrUndefined(left + right);
  }

  if (expression.op === "subtract") {
    return finiteNumberOrUndefined(left - right);
  }

  if (expression.op === "multiply") {
    return finiteNumberOrUndefined(left * right);
  }

  if (expression.op === "divide") {
    if (right === 0) {
      return undefined;
    }

    return finiteNumberOrUndefined(left / right);
  }

  return undefined;
}

export function formatReadModelNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "";
  }

  return formatPlainNumber(value);
}

export function evaluateAggregate(
  aggregate: AggregateSchema,
  records: StoredRecord[],
  computedValues: Record<string, ComputedValueSchema> = {},
): number | undefined {
  if (aggregate.function === "count") {
    return records.length;
  }

  const values = records.flatMap((record) => {
    const value = evaluateAggregateValue(aggregate, record, computedValues);

    return value === undefined ? [] : [value];
  });

  if (aggregate.function === "sum") {
    return values.reduce((total, value) => total + value, 0);
  }

  if (values.length === 0) {
    return undefined;
  }

  if (aggregate.function === "average") {
    return values.reduce((total, value) => total + value, 0) / values.length;
  }

  if (aggregate.function === "min") {
    return Math.min(...values);
  }

  if (aggregate.function === "max") {
    return Math.max(...values);
  }

  return undefined;
}

function evaluateAggregateValue(
  aggregate: AggregateSchema,
  record: StoredRecord,
  computedValues: Record<string, ComputedValueSchema>,
) {
  if (aggregate.value?.kind === "field") {
    return finiteNumberOrUndefined(record.values[aggregate.value.field]);
  }

  if (aggregate.value?.kind === "computed") {
    const computedValue = computedValues[aggregate.value.computedValue];

    return computedValue === undefined
      ? undefined
      : evaluateNumericExpression(computedValue.expression, record);
  }

  return undefined;
}

function finiteNumberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

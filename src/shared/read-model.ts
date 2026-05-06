import { formatPlainNumber } from "./field-types.ts";
import type { StoredRecord } from "./protocol.ts";

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

function finiteNumberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

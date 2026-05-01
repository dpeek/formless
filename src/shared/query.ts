import {
  findAddressableField,
  formatFieldRef,
  isSystemFieldName,
  resolveRecordFieldValue,
  type AddressableField,
  type FieldRef,
} from "./fields.ts";
import { isDateBefore, isDateString, todayDateString } from "./date.ts";
import type { StoredRecord } from "./protocol.ts";

export type QueryOperator = "eq" | "before";
export type QueryDynamicValue = { kind: "today" };
export type QueryValue = string | boolean | number | QueryDynamicValue;

export type QueryExpression =
  | { kind: "all" }
  | { kind: "where"; ref: FieldRef; op: QueryOperator; value: QueryValue }
  | { kind: "and"; expressions: QueryExpression[] };

export type QueryEvaluationContext = {
  today: string;
};

export type QueryCapabilities = {
  operators: QueryOperator[];
  fieldKinds: FieldRef["kind"][];
  expressionKinds: QueryExpression["kind"][];
  dynamicValues: QueryDynamicValue["kind"][];
};

// Schema parsing verifies query shape and field validity. Capability checks are
// a separate adapter boundary for valid queries that a backend may not support.
export const portableQueryCapabilities = {
  operators: ["eq", "before"],
  fieldKinds: ["value", "system"],
  expressionKinds: ["all", "where", "and"],
  dynamicValues: ["today"],
} satisfies QueryCapabilities;

export function defaultQueryEvaluationContext(): QueryEvaluationContext {
  return { today: todayDateString() };
}

export function parseQueryExpression(
  value: unknown,
  catalog: AddressableField[],
  contextLabel: string,
): QueryExpression {
  if (!isRecord(value)) {
    throw new Error(`Query "${contextLabel}" must be an object.`);
  }

  if (value.kind === "all") {
    assertExactKeys(value, ["kind"], contextLabel);

    return { kind: "all" };
  }

  if (value.kind === "and") {
    assertExactKeys(value, ["kind", "expressions"], contextLabel);

    if (!Array.isArray(value.expressions) || value.expressions.length === 0) {
      throw new Error(`Query "${contextLabel}" expressions must be a non-empty array.`);
    }

    return {
      kind: "and",
      expressions: value.expressions.map((expression, index) =>
        parseQueryExpression(expression, catalog, `${contextLabel}.expressions[${index}]`),
      ),
    };
  }

  if (value.kind === "where") {
    assertExactKeys(value, ["kind", "ref", "op", "value"], contextLabel);

    const ref = parseFieldRef(value.ref, contextLabel);
    const field = findAddressableField(catalog, ref);

    if (!field) {
      throw new Error(`Query "${contextLabel}" references unknown field "${formatFieldRef(ref)}".`);
    }

    const op = parseQueryOperator(value.op, field, contextLabel, ref);
    const queryValue = parseQueryValue(value.value, field, op, contextLabel, ref);

    return {
      kind: "where",
      ref,
      op,
      value: queryValue,
    };
  }

  throw new Error(`Query "${contextLabel}" has unsupported kind "${String(value.kind)}".`);
}

export function assertQuerySupported(
  query: QueryExpression,
  capabilities: QueryCapabilities,
  contextLabel = "query",
) {
  if (!capabilities.expressionKinds.includes(query.kind)) {
    throw new Error(`Query "${contextLabel}" uses unsupported expression kind "${query.kind}".`);
  }

  if (query.kind === "all") {
    return;
  }

  if (query.kind === "and") {
    for (const expression of query.expressions) {
      assertQuerySupported(expression, capabilities, contextLabel);
    }

    return;
  }

  if (!capabilities.fieldKinds.includes(query.ref.kind)) {
    throw new Error(
      `Query "${contextLabel}" field "${formatFieldRef(query.ref)}" uses unsupported field kind "${query.ref.kind}".`,
    );
  }

  if (!capabilities.operators.includes(query.op)) {
    throw new Error(
      `Query "${contextLabel}" field "${formatFieldRef(query.ref)}" uses unsupported operator "${query.op}".`,
    );
  }

  if (isQueryDynamicValue(query.value) && !capabilities.dynamicValues.includes(query.value.kind)) {
    throw new Error(
      `Query "${contextLabel}" field "${formatFieldRef(query.ref)}" uses unsupported dynamic value "${query.value.kind}".`,
    );
  }
}

export function matchesQuery(
  record: StoredRecord,
  query: QueryExpression,
  context?: QueryEvaluationContext,
): boolean {
  assertQuerySupported(query, portableQueryCapabilities, "local evaluation");

  if (record.deletedAt) {
    return false;
  }

  if (query.kind === "all") {
    return true;
  }

  if (query.kind === "and") {
    return query.expressions.every((expression) => matchesQuery(record, expression, context));
  }

  const fieldValue = resolveRecordFieldValue(record, query.ref);

  if (query.op === "eq") {
    return fieldValue === query.value;
  }

  if (typeof fieldValue !== "string" || !isDateString(fieldValue)) {
    return false;
  }

  return isDateBefore(
    fieldValue,
    resolveDateQueryValue(query.value, context ?? defaultQueryEvaluationContext()),
  );
}

function parseFieldRef(value: unknown, contextLabel: string): FieldRef {
  if (!isRecord(value)) {
    throw new Error(`Query "${contextLabel}" ref must be an object.`);
  }

  assertExactRefKeys(value, contextLabel);

  if (value.kind !== "value" && value.kind !== "system") {
    throw new Error(
      `Query "${contextLabel}" ref kind must be "value" or "system", got "${String(value.kind)}".`,
    );
  }

  if (typeof value.name !== "string" || value.name.trim() === "") {
    throw new Error(`Query "${contextLabel}" ref name must be a non-empty string.`);
  }

  if (value.kind === "system") {
    if (!isSystemFieldName(value.name)) {
      throw new Error(`Query "${contextLabel}" references unknown field "system.${value.name}".`);
    }

    return { kind: "system", name: value.name };
  }

  return { kind: "value", name: value.name };
}

function parseQueryOperator(
  value: unknown,
  field: AddressableField,
  contextLabel: string,
  ref: FieldRef,
): QueryOperator {
  if (!field.filterOps.includes(value as QueryOperator)) {
    throw new Error(
      `Query "${contextLabel}" field "${formatFieldRef(ref)}" does not support operator "${String(
        value,
      )}".`,
    );
  }

  return value as QueryOperator;
}

function parseQueryValue(
  value: unknown,
  field: AddressableField,
  op: QueryOperator,
  contextLabel: string,
  ref: FieldRef,
): QueryValue {
  if (op === "before") {
    if (field.type !== "date") {
      throw new Error(
        `Query "${contextLabel}" field "${formatFieldRef(ref)}" does not support operator "before".`,
      );
    }

    return parseDateBeforeQueryValue(value, contextLabel, ref);
  }

  if (field.type === "boolean") {
    if (typeof value !== "boolean") {
      throw new Error(
        `Query "${contextLabel}" field "${formatFieldRef(ref)}" requires a boolean value.`,
      );
    }

    return value;
  }

  if (field.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(
        `Query "${contextLabel}" field "${formatFieldRef(ref)}" requires a finite number value.`,
      );
    }

    return value;
  }

  if (typeof value !== "string") {
    throw new Error(
      `Query "${contextLabel}" field "${formatFieldRef(ref)}" requires a string value.`,
    );
  }

  if (field.type === "date" && !isDateString(value)) {
    throw new Error(
      `Query "${contextLabel}" field "${formatFieldRef(ref)}" must be a YYYY-MM-DD date.`,
    );
  }

  if (field.type === "reference" && value === "") {
    throw new Error(
      `Query "${contextLabel}" field "${formatFieldRef(ref)}" requires a non-empty string value.`,
    );
  }

  if (field.type === "enum" && !Object.hasOwn(field.values ?? {}, value)) {
    throw new Error(
      `Query "${contextLabel}" field "${formatFieldRef(ref)}" must be a known enum value.`,
    );
  }

  return value;
}

function parseDateBeforeQueryValue(
  value: unknown,
  contextLabel: string,
  ref: FieldRef,
): string | QueryDynamicValue {
  if (typeof value === "string") {
    if (!isDateString(value)) {
      throw new Error(
        `Query "${contextLabel}" field "${formatFieldRef(ref)}" must be a YYYY-MM-DD date.`,
      );
    }

    return value;
  }

  if (!isRecord(value)) {
    throw new Error(
      `Query "${contextLabel}" field "${formatFieldRef(ref)}" requires a YYYY-MM-DD date or { kind: "today" }.`,
    );
  }

  assertExactQueryDynamicValueKeys(value, contextLabel, ref);

  if (value.kind !== "today") {
    throw new Error(
      `Query "${contextLabel}" field "${formatFieldRef(ref)}" has unsupported dynamic value "${String(
        value.kind,
      )}".`,
    );
  }

  return { kind: "today" };
}

function resolveDateQueryValue(value: QueryValue, context: QueryEvaluationContext) {
  if (isQueryDynamicValue(value)) {
    if (!isDateString(context.today)) {
      throw new Error("Query evaluation context today must be a YYYY-MM-DD date.");
    }

    return context.today;
  }

  if (typeof value !== "string" || !isDateString(value)) {
    throw new Error("Date before query value must be a YYYY-MM-DD date.");
  }

  return value;
}

function isQueryDynamicValue(value: QueryValue): value is QueryDynamicValue {
  return typeof value === "object" && value.kind === "today";
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowedKeys: string[],
  contextLabel: string,
) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`Query "${contextLabel}" has unsupported key "${key}".`);
    }
  }

  for (const key of allowedKeys) {
    if (!(key in value)) {
      throw new Error(`Query "${contextLabel}" must include "${key}".`);
    }
  }
}

function assertExactRefKeys(value: Record<string, unknown>, contextLabel: string) {
  const allowedKeys = ["kind", "name"];

  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`Query "${contextLabel}" ref has unsupported key "${key}".`);
    }
  }

  for (const key of allowedKeys) {
    if (!(key in value)) {
      throw new Error(`Query "${contextLabel}" ref must include "${key}".`);
    }
  }
}

function assertExactQueryDynamicValueKeys(
  value: Record<string, unknown>,
  contextLabel: string,
  ref: FieldRef,
) {
  const allowedKeys = ["kind"];

  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(
        `Query "${contextLabel}" field "${formatFieldRef(ref)}" dynamic value has unsupported key "${key}".`,
      );
    }
  }

  if (!("kind" in value)) {
    throw new Error(
      `Query "${contextLabel}" field "${formatFieldRef(ref)}" dynamic value must include "kind".`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import {
  findAddressableField,
  formatFieldRef,
  isSystemFieldName,
  resolveRecordFieldValue,
  type AddressableField,
  type AddressableFieldType,
  type FieldRef,
} from "./fields.ts";
import { isDateString } from "./date.ts";
import type { StoredRecord } from "./protocol.ts";

export type QueryOperator = "eq";
export type QueryValue = string | boolean;

export type QueryExpression =
  | { kind: "all" }
  | { kind: "where"; ref: FieldRef; op: "eq"; value: QueryValue };

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

  if (value.kind === "where") {
    assertExactKeys(value, ["kind", "ref", "op", "value"], contextLabel);

    const ref = parseFieldRef(value.ref, contextLabel);
    const field = findAddressableField(catalog, ref);

    if (!field) {
      throw new Error(`Query "${contextLabel}" references unknown field "${formatFieldRef(ref)}".`);
    }

    const op = parseQueryOperator(value.op, field, contextLabel, ref);
    const queryValue = parseQueryValue(value.value, field.type, contextLabel, ref);

    return {
      kind: "where",
      ref,
      op,
      value: queryValue,
    };
  }

  throw new Error(`Query "${contextLabel}" has unsupported kind "${String(value.kind)}".`);
}

export function matchesQuery(record: StoredRecord, query: QueryExpression) {
  if (record.deletedAt) {
    return false;
  }

  if (query.kind === "all") {
    return true;
  }

  return resolveRecordFieldValue(record, query.ref) === query.value;
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
  fieldType: AddressableFieldType,
  contextLabel: string,
  ref: FieldRef,
): QueryValue {
  if (fieldType === "boolean") {
    if (typeof value !== "boolean") {
      throw new Error(
        `Query "${contextLabel}" field "${formatFieldRef(ref)}" requires a boolean value.`,
      );
    }

    return value;
  }

  if (typeof value !== "string") {
    throw new Error(
      `Query "${contextLabel}" field "${formatFieldRef(ref)}" requires a string value.`,
    );
  }

  if (fieldType === "date" && !isDateString(value)) {
    throw new Error(
      `Query "${contextLabel}" field "${formatFieldRef(ref)}" must be a YYYY-MM-DD date.`,
    );
  }

  return value;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

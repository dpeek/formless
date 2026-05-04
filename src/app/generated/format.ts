import type { TableColumnConfig } from "../../client/views.ts";
import type { FieldValue } from "../../shared/protocol.ts";
import type { FieldSchema } from "../../shared/schema.ts";

export function formatFieldDisplayValue(column: TableColumnConfig, value: FieldValue | undefined) {
  if (value === undefined || value === "") {
    return "";
  }

  if (column.field.type === "enum" && typeof value === "string") {
    return column.field.values[value]?.label ?? value;
  }

  if (column.field.type === "boolean") {
    return value === true ? "Yes" : value === false ? "No" : String(value);
  }

  if (typeof value === "number") {
    if (column.format === "currency") {
      return `$${value.toFixed(2)}`;
    }

    if (column.format === "percent") {
      return `${formatPlainNumber(value * 100)}%`;
    }

    if (column.format === "number") {
      return formatPlainNumber(value);
    }
  }

  return String(value);
}

export function formatPlainNumber(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2).replace(/\.?0+$/, "");
}

export function fieldValueToInputValue(value: FieldValue | undefined) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return "";
}

export function inputValueToFieldValue(field: FieldSchema, value: string): FieldValue {
  return field.type === "number" ? numberInputValueToFieldValue(value) : value;
}

export function numberInputValueToFieldValue(value: string): FieldValue {
  return value === "" ? "" : Number(value);
}

export function numberInputAttributes(field: FieldSchema) {
  if (field.type !== "number") {
    return {};
  }

  return {
    max: field.max,
    min: field.min,
    step: field.integer ? "1" : "any",
  };
}

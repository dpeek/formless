import type {
  ComputedTableColumnConfig,
  FieldTableColumnConfig,
  HomeSummarySlotConfig,
  ReferenceFieldTableColumnConfig,
} from "../../client/views.ts";
import type { FieldValue } from "../../shared/protocol.ts";
import type { FieldSchema, TableColumnFormat } from "../../shared/schema.ts";
import {
  createInputValueToFieldValue as createInputValueToFieldValuePrimitive,
  fieldInputAttributes,
  fieldValueToInputValue as fieldValueToInputValuePrimitive,
  formatFieldDisplayPrimitive,
  formatPlainNumber,
  inputValueToFieldValue as inputValueToFieldValuePrimitive,
  numberInputValueToFieldValue as numberInputValueToFieldValuePrimitive,
  parseNumberInputValue,
} from "../../shared/field-types.ts";

const readModelNumberField = {
  type: "number",
  required: false,
} satisfies FieldSchema;

export function formatFieldDisplayValue(
  column: FieldTableColumnConfig | ReferenceFieldTableColumnConfig,
  value: FieldValue | undefined,
) {
  if (value === undefined || value === "") {
    return "";
  }

  return formatFieldDisplayPrimitive(column.field, value, { format: column.format });
}

export function formatComputedDisplayValue(
  column: ComputedTableColumnConfig,
  value: number | undefined,
) {
  return formatReadModelDisplayValue(column.format, value);
}

export function formatAggregateDisplayValue(
  slot: HomeSummarySlotConfig,
  value: number | undefined,
) {
  return formatReadModelDisplayValue(slot.format, value);
}

function formatReadModelDisplayValue(format: TableColumnFormat, value: number | undefined) {
  if (value === undefined) {
    return "";
  }

  return formatFieldDisplayPrimitive(readModelNumberField, value, { format });
}

export { formatPlainNumber };

export function createInputValueToFieldValue(
  field: FieldSchema,
  value: string | undefined,
  provided: boolean,
) {
  return createInputValueToFieldValuePrimitive(field, value, provided);
}

export function fieldValueToInputValue(field: FieldSchema, value: FieldValue | undefined) {
  return fieldValueToInputValuePrimitive(field, value);
}

export function inputValueToFieldValue(field: FieldSchema, value: string): FieldValue {
  return inputValueToFieldValuePrimitive(field, value);
}

export function numberInputValueToFieldValue(value: string): FieldValue {
  return numberInputValueToFieldValuePrimitive(value);
}

export function numberInputAttributes(field: FieldSchema) {
  return fieldInputAttributes(field);
}

export function encodeNumberEditorInputValue(value: number | "", format: TableColumnFormat) {
  if (value === "") {
    return "";
  }

  if (format === "currency") {
    return `$${value.toFixed(2)}`;
  }

  if (format === "percent") {
    return `${formatPlainNumber(value * 100)}%`;
  }

  return formatPlainNumber(value);
}

export function decodeNumberEditorInputValue(value: string, format: TableColumnFormat) {
  const input = value.trim();

  if (input === "") {
    return { kind: "valid" as const, value: "" as const };
  }

  const numberInput =
    format === "currency"
      ? input.replace(/[$]/g, "")
      : format === "percent"
        ? input.replace(/%$/, "")
        : input;
  const result = parseNumberInputValue(numberInput.trim());

  if (result.kind === "valid") {
    return {
      kind: "valid" as const,
      value: format === "percent" ? result.value / 100 : result.value,
    };
  }

  return { kind: "invalid" as const, message: "Enter a finite number." };
}

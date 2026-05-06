import type {
  ComputedTableColumnConfig,
  FieldTableColumnConfig,
  ReferenceFieldTableColumnConfig,
} from "../../client/views.ts";
import type { FieldValue } from "../../shared/protocol.ts";
import type { FieldSchema } from "../../shared/schema.ts";
import {
  createInputValueToFieldValue as createInputValueToFieldValuePrimitive,
  fieldInputAttributes,
  fieldValueToInputValue as fieldValueToInputValuePrimitive,
  formatFieldDisplayPrimitive,
  formatPlainNumber,
  inputValueToFieldValue as inputValueToFieldValuePrimitive,
  numberInputValueToFieldValue as numberInputValueToFieldValuePrimitive,
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
  if (value === undefined) {
    return "";
  }

  return formatFieldDisplayPrimitive(readModelNumberField, value, { format: column.format });
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

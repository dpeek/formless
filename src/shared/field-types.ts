import { isDateString } from "./date.ts";
import type { FieldValue, RecordValues } from "./protocol.ts";
import type { QueryOperator } from "./query.ts";
import type { FieldCommitPolicy, FieldEditor, FieldSchema } from "./schema.ts";

export type AuthorityFieldValueResult = { kind: "set"; value: FieldValue } | { kind: "omit" };

export type FieldTypeBehavior<TField extends FieldSchema = FieldSchema> = {
  type: TField["type"];
  filterOps: readonly QueryOperator[];
  editors: readonly FieldEditor[];
  defaultEditor: FieldEditor;
  defaultCommit: FieldCommitPolicy;
  validatesExistingStoredValues: boolean;
  createDefaultValue: (field: TField) => FieldValue | undefined;
  hasCreateDefault: (field: TField) => boolean;
  formatDisplayValue: (field: TField, value: FieldValue) => string;
  validateAuthorityValue: (
    fieldName: string,
    field: TField,
    value: unknown,
    provided: boolean,
  ) => AuthorityFieldValueResult;
  isValidStoredValue: (value: RecordValues[string], field: TField) => boolean;
};

export const fieldTypeBehaviors = {
  text: {
    type: "text",
    filterOps: ["eq"],
    editors: ["text"],
    defaultEditor: "text",
    defaultCommit: "field-commit",
    validatesExistingStoredValues: false,
    createDefaultValue: () => undefined,
    hasCreateDefault: () => false,
    formatDisplayValue: formatStringDisplayValue,
    validateAuthorityValue: validateStringAuthorityValue,
    isValidStoredValue: (value, field) =>
      typeof value === "string" && (!field.required || value.trim() !== ""),
  },
  boolean: {
    type: "boolean",
    filterOps: ["eq"],
    editors: ["boolean"],
    defaultEditor: "boolean",
    defaultCommit: "immediate",
    validatesExistingStoredValues: false,
    createDefaultValue: (field) => field.default,
    hasCreateDefault: (field) => typeof field.default === "boolean",
    formatDisplayValue: (_field, value) =>
      value === true ? "Yes" : value === false ? "No" : String(value),
    validateAuthorityValue: validateBooleanAuthorityValue,
    isValidStoredValue: (value) => typeof value === "boolean",
  },
  date: {
    type: "date",
    filterOps: ["eq", "before"],
    editors: ["date"],
    defaultEditor: "date",
    defaultCommit: "field-commit",
    validatesExistingStoredValues: false,
    createDefaultValue: () => undefined,
    hasCreateDefault: () => false,
    formatDisplayValue: formatStringDisplayValue,
    validateAuthorityValue: validateDateAuthorityValue,
    isValidStoredValue: (value, field) =>
      typeof value === "string" && (!field.required || value.trim() !== "") && isDateString(value),
  },
  number: {
    type: "number",
    filterOps: ["eq"],
    editors: ["number"],
    defaultEditor: "number",
    defaultCommit: "field-commit",
    validatesExistingStoredValues: true,
    createDefaultValue: (field) => field.default,
    hasCreateDefault: (field) => typeof field.default === "number",
    formatDisplayValue: (_field, value) => String(value),
    validateAuthorityValue: validateNumberAuthorityValue,
    isValidStoredValue: isValidNumberFieldValue,
  },
  enum: {
    type: "enum",
    filterOps: ["eq"],
    editors: ["enum"],
    defaultEditor: "enum",
    defaultCommit: "immediate",
    validatesExistingStoredValues: false,
    createDefaultValue: (field) => field.default,
    hasCreateDefault: (field) => typeof field.default === "string",
    formatDisplayValue: (field, value) =>
      typeof value === "string" ? (field.values[value]?.label ?? value) : String(value),
    validateAuthorityValue: validateEnumAuthorityValue,
    isValidStoredValue: (value) => typeof value === "string" && value !== "",
  },
  reference: {
    type: "reference",
    filterOps: ["eq"],
    editors: ["reference"],
    defaultEditor: "reference",
    defaultCommit: "immediate",
    validatesExistingStoredValues: true,
    createDefaultValue: () => undefined,
    hasCreateDefault: () => false,
    formatDisplayValue: formatStringDisplayValue,
    validateAuthorityValue: validateReferenceAuthorityValue,
    isValidStoredValue: (value) => typeof value === "string" && value.trim() !== "",
  },
} satisfies {
  [Type in FieldSchema["type"]]: FieldTypeBehavior<Extract<FieldSchema, { type: Type }>>;
};

export const fieldEditors = [
  "text",
  "boolean",
  "date",
  "number",
  "enum",
  "reference",
] satisfies FieldEditor[];

export const fieldCommitPolicies = ["immediate", "field-commit"] satisfies FieldCommitPolicy[];

export function getFieldTypeBehavior<TField extends FieldSchema>(
  field: TField,
): FieldTypeBehavior<TField> {
  return fieldTypeBehaviors[field.type] as FieldTypeBehavior<TField>;
}

export function isFieldEditor(value: unknown): value is FieldEditor {
  return fieldEditors.includes(value as FieldEditor);
}

export function isFieldCommitPolicy(value: unknown): value is FieldCommitPolicy {
  return fieldCommitPolicies.includes(value as FieldCommitPolicy);
}

export function fieldHasCreateDefault(field: FieldSchema) {
  return getFieldTypeBehavior(field).hasCreateDefault(field);
}

export function fieldCreateDefaultValue(field: FieldSchema) {
  return getFieldTypeBehavior(field).createDefaultValue(field);
}

export function formatFieldDisplayPrimitive(field: FieldSchema, value: FieldValue) {
  return getFieldTypeBehavior(field).formatDisplayValue(field, value);
}

export function shouldValidateExistingFieldValue(field: FieldSchema) {
  return field.required || getFieldTypeBehavior(field).validatesExistingStoredValues;
}

export function validateAuthorityFieldValue(
  fieldName: string,
  field: FieldSchema,
  value: unknown,
  provided: boolean,
) {
  return getFieldTypeBehavior(field).validateAuthorityValue(fieldName, field, value, provided);
}

export function isValidStoredFieldValue(
  value: RecordValues[string] | undefined,
  field: FieldSchema,
) {
  if (value === undefined) {
    return !field.required || fieldHasCreateDefault(field);
  }

  return getFieldTypeBehavior(field).isValidStoredValue(value, field);
}

function validateStringAuthorityValue(
  fieldName: string,
  field: Extract<FieldSchema, { type: "text" }>,
  value: unknown,
) {
  return validateTextLikeAuthorityValue(fieldName, field, value, undefined);
}

function formatStringDisplayValue(_field: FieldSchema, value: FieldValue) {
  return String(value);
}

function validateDateAuthorityValue(
  fieldName: string,
  field: Extract<FieldSchema, { type: "date" }>,
  value: unknown,
) {
  return validateTextLikeAuthorityValue(fieldName, field, value, (fieldValue) => {
    if (fieldValue !== "" && !isDateString(fieldValue)) {
      throw new Error(`Field "${fieldName}" must be a YYYY-MM-DD date.`);
    }
  });
}

function validateTextLikeAuthorityValue(
  fieldName: string,
  field: Extract<FieldSchema, { type: "text" | "date" }>,
  value: unknown,
  validate?: (value: string) => void,
): AuthorityFieldValueResult {
  if (typeof value !== "string") {
    if (field.required) {
      throw new Error(`Field "${fieldName}" is required.`);
    }

    return { kind: "omit" };
  }

  if (field.required && value.trim() === "") {
    throw new Error(`Field "${fieldName}" cannot be empty.`);
  }

  validate?.(value);

  if (value !== "" || field.required) {
    return { kind: "set", value };
  }

  return { kind: "omit" };
}

function validateBooleanAuthorityValue(
  fieldName: string,
  field: Extract<FieldSchema, { type: "boolean" }>,
  value: unknown,
  provided: boolean,
): AuthorityFieldValueResult {
  if (typeof value === "boolean") {
    return { kind: "set", value };
  }

  if (provided) {
    throw new Error(`Field "${fieldName}" must be a boolean.`);
  }

  if (typeof field.default === "boolean") {
    return { kind: "set", value: field.default };
  }

  if (field.required) {
    throw new Error(`Field "${fieldName}" is required.`);
  }

  return { kind: "omit" };
}

function validateEnumAuthorityValue(
  fieldName: string,
  field: Extract<FieldSchema, { type: "enum" }>,
  value: unknown,
  provided: boolean,
): AuthorityFieldValueResult {
  if (provided) {
    if (typeof value !== "string") {
      throw new Error(`Field "${fieldName}" must be a known enum value.`);
    }

    if (value === "") {
      if (field.required) {
        throw new Error(`Field "${fieldName}" cannot be empty.`);
      }

      return { kind: "omit" };
    }

    if (!Object.hasOwn(field.values, value)) {
      throw new Error(`Field "${fieldName}" must be a known enum value.`);
    }

    return { kind: "set", value };
  }

  if (field.default !== undefined) {
    return { kind: "set", value: field.default };
  }

  if (field.required) {
    throw new Error(`Field "${fieldName}" is required.`);
  }

  return { kind: "omit" };
}

function validateNumberAuthorityValue(
  fieldName: string,
  field: Extract<FieldSchema, { type: "number" }>,
  value: unknown,
  provided: boolean,
): AuthorityFieldValueResult {
  if (provided) {
    if (value === "") {
      if (field.required) {
        throw new Error(`Field "${fieldName}" cannot be empty.`);
      }

      return { kind: "omit" };
    }

    validateNumberFieldValue(fieldName, value, field);

    return { kind: "set", value };
  }

  if (field.default !== undefined) {
    return { kind: "set", value: field.default };
  }

  if (field.required) {
    throw new Error(`Field "${fieldName}" is required.`);
  }

  return { kind: "omit" };
}

function validateReferenceAuthorityValue(
  fieldName: string,
  field: Extract<FieldSchema, { type: "reference" }>,
  value: unknown,
  provided: boolean,
): AuthorityFieldValueResult {
  if (!provided) {
    if (field.required) {
      throw new Error(`Field "${fieldName}" is required.`);
    }

    return { kind: "omit" };
  }

  if (typeof value !== "string") {
    throw new Error(`Field "${fieldName}" must be a reference ID.`);
  }

  if (value.trim() === "") {
    if (field.required) {
      throw new Error(`Field "${fieldName}" cannot be empty.`);
    }

    return { kind: "omit" };
  }

  return { kind: "set", value };
}

function validateNumberFieldValue(
  fieldName: string,
  value: unknown,
  field: Extract<FieldSchema, { type: "number" }>,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Field "${fieldName}" must be a finite number.`);
  }

  if (field.min !== undefined && value < field.min) {
    throw new Error(`Field "${fieldName}" must be greater than or equal to ${field.min}.`);
  }

  if (field.max !== undefined && value > field.max) {
    throw new Error(`Field "${fieldName}" must be less than or equal to ${field.max}.`);
  }

  if (field.integer && !Number.isInteger(value)) {
    throw new Error(`Field "${fieldName}" must be an integer.`);
  }
}

function isValidNumberFieldValue(
  value: RecordValues[string],
  field: Extract<FieldSchema, { type: "number" }>,
) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    (field.min === undefined || value >= field.min) &&
    (field.max === undefined || value <= field.max) &&
    (!field.integer || Number.isInteger(value))
  );
}

import { assertExactKeys, isRecord, parseRequiredNonEmptyString } from "./schema-parse-helpers.ts";
import { parseFieldCommitPolicy, parseFieldEditor } from "./schema-view-field-parser.ts";
import type {
  CreateViewFieldSchema,
  EntitySchema,
  FieldSchema,
  FieldVisibilityConditionSchema,
  FieldVisibilityValue,
  ViewFieldSchema,
} from "./schema-types.ts";

export function parseListViewFields(
  viewName: string,
  entityName: string,
  value: unknown,
  entity: EntitySchema,
): Record<string, ViewFieldSchema> {
  if (!isRecord(value)) {
    throw new Error(`View "${viewName}" fields must be an object.`);
  }

  return Object.fromEntries(
    Object.entries(value).map(([fieldName, field]) => [
      fieldName,
      parseListViewField(viewName, entityName, fieldName, field, entity),
    ]),
  );
}

function parseListViewField(
  viewName: string,
  entityName: string,
  fieldName: string,
  value: unknown,
  entity: EntitySchema,
): ViewFieldSchema {
  if (!isRecord(value)) {
    throw new Error(`View field "${viewName}.${fieldName}" must be an object.`);
  }

  const allowedKeys = new Set(["editor", "commit", "visibleWhen"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`View field "${viewName}.${fieldName}" has unsupported key "${key}".`);
    }
  }

  const field = entity.fields[fieldName];
  if (!field) {
    throw new Error(`View "${viewName}" references unknown field "${entityName}.${fieldName}".`);
  }

  const context = `View field "${viewName}.${fieldName}"`;
  const editor = parseFieldEditor(context, value.editor, field);
  const commit = parseFieldCommitPolicy(context, value.commit, field);
  const visibleWhen = parseFieldVisibilityCondition(context, value.visibleWhen, entity);

  return {
    editor,
    commit,
    ...(visibleWhen === undefined ? {} : { visibleWhen }),
  };
}

export function parseCreateViewFields(
  viewName: string,
  entityName: string,
  value: unknown,
  entity: EntitySchema,
): Record<string, CreateViewFieldSchema> {
  if (!isRecord(value)) {
    throw new Error(`View "${viewName}" fields must be an object.`);
  }

  return Object.fromEntries(
    Object.entries(value).map(([fieldName, field]) => [
      fieldName,
      parseCreateViewField(viewName, entityName, fieldName, field, entity),
    ]),
  );
}

function parseCreateViewField(
  viewName: string,
  entityName: string,
  fieldName: string,
  value: unknown,
  entity: EntitySchema,
): CreateViewFieldSchema {
  if (!isRecord(value)) {
    throw new Error(`View field "${viewName}.${fieldName}" must be an object.`);
  }

  const allowedKeys = new Set(["editor", "visibleWhen"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`View field "${viewName}.${fieldName}" has unsupported key "${key}".`);
    }
  }

  const field = entity.fields[fieldName];
  if (!field) {
    throw new Error(`View "${viewName}" references unknown field "${entityName}.${fieldName}".`);
  }

  const context = `View field "${viewName}.${fieldName}"`;
  const editor = parseFieldEditor(context, value.editor, field);
  const visibleWhen = parseFieldVisibilityCondition(context, value.visibleWhen, entity);

  return {
    editor,
    ...(visibleWhen === undefined ? {} : { visibleWhen }),
  };
}

function parseFieldVisibilityCondition(
  context: string,
  value: unknown,
  entity: EntitySchema,
): FieldVisibilityConditionSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} visibleWhen must be an object.`);
  }

  assertExactKeys(`${context} visibleWhen`, value, ["field", "values"]);

  const fieldName = parseRequiredNonEmptyString(`${context} visibleWhen field`, value.field);
  const field = entity.fields[fieldName];

  if (!field) {
    throw new Error(`${context} visibleWhen references unknown field "${fieldName}".`);
  }

  if (!Array.isArray(value.values) || value.values.length === 0) {
    throw new Error(`${context} visibleWhen values must be a non-empty array.`);
  }

  return {
    field: fieldName,
    values: value.values.map((candidate, index) =>
      parseFieldVisibilityValue(`${context} visibleWhen values[${index}]`, candidate, field),
    ),
  };
}

export function parseFieldVisibilityValue(
  context: string,
  value: unknown,
  field: FieldSchema,
): FieldVisibilityValue {
  if (field.type === "boolean") {
    if (typeof value !== "boolean") {
      throw new Error(`${context} must be a boolean.`);
    }

    return value;
  }

  if (field.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${context} must be a finite number.`);
    }

    return value;
  }

  if (typeof value !== "string") {
    throw new Error(`${context} must be a string.`);
  }

  if (field.type === "enum" && value !== "" && !Object.hasOwn(field.values, value)) {
    throw new Error(`${context} must be a known enum value.`);
  }

  return value;
}

export function assertViewHasFields(viewName: string, fields: Record<string, unknown>) {
  if (Object.keys(fields).length === 0) {
    throw new Error(`View "${viewName}" must define at least one field.`);
  }
}

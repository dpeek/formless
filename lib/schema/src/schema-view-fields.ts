import { assertExactKeys, isRecord, parseRequiredNonEmptyString } from "./schema-parse-helpers.ts";
import { parseFieldCommitPolicy, parseFieldEditor } from "./schema-view-field-parser.ts";
import type {
  CreateViewFieldSchema,
  EntitySchema,
  FieldPresentationSchema,
  FieldSchema,
  FieldVisibilityConditionSchema,
  FieldVisibilityValue,
  ViewFieldSchema,
} from "./types.ts";

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

  const allowedKeys = new Set(["editor", "commit", "visibleWhen", "presentation"]);
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
  const presentation = parseOptionalFieldPresentation(context, value.presentation, field);

  return {
    editor,
    commit,
    ...(visibleWhen === undefined ? {} : { visibleWhen }),
    ...(presentation === undefined ? {} : { presentation }),
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

  const allowedKeys = new Set(["editor", "visibleWhen", "presentation"]);
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
  const presentation = parseOptionalFieldPresentation(context, value.presentation, field);

  return {
    editor,
    ...(visibleWhen === undefined ? {} : { visibleWhen }),
    ...(presentation === undefined ? {} : { presentation }),
  };
}

export function parseOptionalFieldPresentation(
  context: string,
  value: unknown,
  field: FieldSchema,
): FieldPresentationSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} presentation must be an object.`);
  }

  assertExactKeys(`${context} presentation`, value, [], ["list", "mode", "trigger", "visibility"]);

  const list = parseOptionalFieldPresentationEnumContent(context, "list", value.list, field);
  const mode = parseOptionalFieldPresentationMode(context, value.mode, field);
  const trigger = parseOptionalFieldPresentationEnumContent(
    context,
    "trigger",
    value.trigger,
    field,
  );
  const visibility = parseOptionalFieldPresentationVisibility(context, value.visibility, field);

  if (
    list === undefined &&
    mode === undefined &&
    trigger === undefined &&
    visibility === undefined
  ) {
    throw new Error(
      `${context} presentation must include "list", "mode", "trigger", or "visibility".`,
    );
  }

  return {
    ...(list === undefined ? {} : { list }),
    ...(mode === undefined ? {} : { mode }),
    ...(trigger === undefined ? {} : { trigger }),
    ...(visibility === undefined ? {} : { visibility }),
  };
}

function parseOptionalFieldPresentationEnumContent(
  context: string,
  key: "list" | "trigger",
  value: unknown,
  field: FieldSchema,
): FieldPresentationSchema["list"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "icon" && value !== "label" && value !== "both") {
    throw new Error(`${context} presentation ${key} must be "icon", "label", or "both".`);
  }

  if (field.type !== "enum") {
    throw new Error(`${context} presentation ${key} requires an enum field.`);
  }

  return value;
}

function parseOptionalFieldPresentationMode(
  context: string,
  value: unknown,
  field: FieldSchema,
): FieldPresentationSchema["mode"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "iconOnly" && value !== "completion") {
    throw new Error(`${context} presentation mode must be "iconOnly" or "completion".`);
  }

  if (value === "iconOnly" && field.type !== "enum") {
    throw new Error(`${context} iconOnly presentation requires an enum field.`);
  }

  if (value === "completion" && field.type !== "boolean") {
    throw new Error(`${context} completion presentation requires a boolean field.`);
  }

  return value;
}

function parseOptionalFieldPresentationVisibility(
  context: string,
  value: unknown,
  field: FieldSchema,
): FieldPresentationSchema["visibility"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "valueOrInteraction") {
    throw new Error(`${context} presentation visibility must be "valueOrInteraction".`);
  }

  if (field.type !== "date" || field.required) {
    throw new Error(`${context} valueOrInteraction visibility requires an optional date field.`);
  }

  return value;
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

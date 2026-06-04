import { isDateString } from "./date.ts";
import {
  createInputValueToFieldValue,
  fieldCreateDefaultValue,
  fieldHasCreateDefault,
  fieldValueToInputValue,
} from "./field-types.ts";
import type { RecordValues } from "./types.ts";
import type { QueryEvaluationContext } from "./types.ts";
import { assertExactKeys, isRecord } from "./schema-parse-helpers.ts";
import type {
  CreateDefaultValueSchema,
  CreateViewFieldSchema,
  CreateViewSchema,
  EntitySchema,
  FieldVisibilityConditionSchema,
  FieldVisibilityValue,
  FieldSchema,
} from "./types.ts";

export type CreateDefaultFieldConfig = {
  fieldName: string;
  field: FieldSchema;
  visibleWhen?: FieldVisibilityConditionSchema;
};

export type CreateDefaultConfig = CreateDefaultFieldConfig & {
  value: CreateDefaultValueSchema;
};

export type CreateDefaultUnionConfig<TField extends CreateDefaultFieldConfig> = {
  discriminatorFieldName: string;
  discriminatorField: Extract<FieldSchema, { type: "enum" }>;
  variants: Array<{
    variantValue: string;
    presentation: {
      fields: TField[];
    };
  }>;
  fallback?: {
    presentation: {
      fields: TField[];
    };
  };
};

export function parseCreateViewDefaults(
  viewName: string,
  entityName: string,
  value: unknown,
  entity: EntitySchema,
  fields: Record<string, CreateViewFieldSchema>,
): Record<string, CreateDefaultValueSchema> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`Create view "${viewName}" defaults must be an object.`);
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new Error(`Create view "${viewName}" defaults must not be empty.`);
  }

  return Object.fromEntries(
    entries.map(([fieldName, defaultValue]) => [
      fieldName,
      parseCreateViewDefault(viewName, entityName, fieldName, defaultValue, entity, fields),
    ]),
  );
}

export function createViewRequiresContextDefaults(createView: CreateViewSchema) {
  return createViewContextDefaultEntries(createView).length > 0;
}

export function createViewContextDefaultEntries(createView: CreateViewSchema) {
  return Object.entries(createView.defaults ?? {}).filter(
    (entry): entry is [string, Extract<CreateDefaultValueSchema, { kind: "context" }>] =>
      entry[1].kind === "context",
  );
}

export function assertCreateViewIncludesRequiredFields(
  viewName: string,
  fields: Record<string, CreateViewFieldSchema>,
  defaults: Record<string, CreateDefaultValueSchema>,
  entity: EntitySchema,
) {
  for (const [fieldName, field] of Object.entries(entity.fields)) {
    if (
      field.required &&
      !(fieldName in fields) &&
      !(fieldName in defaults) &&
      !fieldHasCreateDefault(field)
    ) {
      throw new Error(`Create view "${viewName}" must include required field "${fieldName}".`);
    }
  }
}

export function resolveCreateValues<TField extends CreateDefaultFieldConfig>({
  defaults = [],
  fields,
  formData,
  queryContext,
  union,
}: {
  formData: FormData;
  fields: TField[];
  union?: CreateDefaultUnionConfig<TField>;
  defaults?: CreateDefaultConfig[];
  queryContext?: QueryEvaluationContext;
}): RecordValues {
  const values = getVisibleCreateValues(
    formData,
    selectCreateFieldsForFormData(fields, union, formData, defaults, queryContext),
  );

  return applyCreateDefaultValues(values, defaults, queryContext);
}

export function applyCreateDefaultValues(
  values: RecordValues,
  defaults: CreateDefaultConfig[],
  queryContext?: QueryEvaluationContext,
): RecordValues {
  const resolvedValues = { ...values };

  for (const defaultConfig of defaults) {
    if (Object.hasOwn(resolvedValues, defaultConfig.fieldName)) {
      continue;
    }

    if (defaultConfig.value.kind === "context") {
      resolvedValues[defaultConfig.fieldName] = resolveContextDefaultValue(
        defaultConfig.fieldName,
        defaultConfig.value.name,
        queryContext,
      );
    } else {
      resolvedValues[defaultConfig.fieldName] = defaultConfig.value.value;
    }
  }

  return resolvedValues;
}

export function createDefaultsAreResolved(
  defaults: CreateDefaultConfig[],
  queryContext?: QueryEvaluationContext,
) {
  try {
    for (const defaultConfig of defaults) {
      if (defaultConfig.value.kind === "context") {
        resolveContextDefaultValue(defaultConfig.fieldName, defaultConfig.value.name, queryContext);
      }
    }

    return true;
  } catch {
    return false;
  }
}

export function selectCreateFieldsForDiscriminator<TField extends CreateDefaultFieldConfig>(
  baseFields: TField[],
  union: CreateDefaultUnionConfig<TField> | undefined,
  discriminatorValue: string | undefined,
): TField[] {
  const presentation = selectActiveCreateUnionPresentation(union, discriminatorValue);

  if (presentation === undefined) {
    return baseFields;
  }

  return appendNewFields(baseFields, presentation.presentation.fields);
}

export function selectCreateFieldsForFormData<TField extends CreateDefaultFieldConfig>(
  baseFields: TField[],
  union: CreateDefaultUnionConfig<TField> | undefined,
  formData: FormData,
  defaults: CreateDefaultConfig[] = [],
  queryContext?: QueryEvaluationContext,
): TField[] {
  if (union === undefined) {
    return selectCreateFieldsForVisibility(baseFields, (fieldName) =>
      fieldInputValueForCreateVisibility(fieldName, baseFields, formData, defaults, queryContext),
    );
  }

  const formValue = formData.get(union.discriminatorFieldName);
  const discriminatorValue =
    typeof formValue === "string" ? formValue : initialCreateDiscriminatorValue(union, defaults);

  const fields = selectCreateFieldsForDiscriminator(baseFields, union, discriminatorValue);

  return selectCreateFieldsForVisibility(fields, (fieldName) =>
    fieldInputValueForCreateVisibility(fieldName, fields, formData, defaults, queryContext),
  );
}

export function selectCreateFieldsForInputValues<TField extends CreateDefaultFieldConfig>(
  fields: TField[],
  inputValues: Record<string, FieldVisibilityValue | undefined>,
): TField[] {
  return selectCreateFieldsForVisibility(fields, (fieldName) => {
    const inputValue = inputValues[fieldName];

    if (inputValue !== undefined) {
      return inputValue;
    }

    const fieldConfig = fields.find((candidate) => candidate.fieldName === fieldName);

    if (fieldConfig && fieldHasCreateDefault(fieldConfig.field)) {
      return fieldValueToInputValue(fieldConfig.field, fieldCreateDefaultValue(fieldConfig.field));
    }

    return "";
  });
}

export function initialCreateDiscriminatorValue(
  union: CreateDefaultUnionConfig<CreateDefaultFieldConfig> | undefined,
  defaults: CreateDefaultConfig[] = [],
): string | undefined {
  if (union === undefined) {
    return undefined;
  }

  const defaultConfig = defaults.find(
    (candidate) => candidate.fieldName === union.discriminatorFieldName,
  );

  if (defaultConfig?.value.kind === "literal" && typeof defaultConfig.value.value === "string") {
    return defaultConfig.value.value;
  }

  return (
    union.discriminatorField.default ??
    (union.discriminatorField.required ? Object.keys(union.discriminatorField.values)[0] : "")
  );
}

export function resolveContextDefaultValue(
  fieldName: string,
  contextName: string,
  queryContext?: QueryEvaluationContext,
): string {
  const value = queryContext?.values?.[contextName];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `Create default for "${fieldName}" requires selected context "${contextName}".`,
    );
  }

  return value;
}

function parseCreateViewDefault(
  viewName: string,
  entityName: string,
  fieldName: string,
  value: unknown,
  entity: EntitySchema,
  fields: Record<string, CreateViewFieldSchema>,
): CreateDefaultValueSchema {
  const context = `Create view "${viewName}" default "${fieldName}"`;

  if (fieldName.trim() === "") {
    throw new Error(`Create view "${viewName}" default field names must be non-empty.`);
  }

  const field = entity.fields[fieldName];
  if (!field) {
    throw new Error(`${context} references unknown field "${entityName}.${fieldName}".`);
  }

  if (fieldName in fields) {
    throw new Error(`${context} must not also appear in fields.`);
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.kind === "context") {
    assertExactKeys(context, value, ["kind", "name"]);

    if (typeof value.name !== "string" || value.name.trim() === "") {
      throw new Error(`${context} name must be a non-empty string.`);
    }

    if (field.type !== "reference") {
      throw new Error(`${context} requires a reference field.`);
    }

    return { kind: "context", name: value.name };
  }

  if (value.kind === "literal") {
    assertExactKeys(context, value, ["kind", "value"]);

    if (field.type === "reference") {
      throw new Error(`${context} requires a scalar field.`);
    }

    const literalValue = parseCreateLiteralDefaultValue(context, field, value.value);

    return { kind: "literal", value: literalValue };
  }

  if (!("kind" in value)) {
    throw new Error(`${context} must include "kind".`);
  }

  if (typeof value.kind === "string") {
    throw new Error(`${context} has unsupported kind "${String(value.kind)}".`);
  }

  throw new Error(`${context} kind must be a string.`);
}

function parseCreateLiteralDefaultValue(
  context: string,
  field: Exclude<FieldSchema, { type: "reference" }>,
  value: unknown,
) {
  if (field.type === "text") {
    if (typeof value !== "string") {
      throw new Error(`${context} literal value must be a string.`);
    }

    if (field.required && value.trim() === "") {
      throw new Error(`${context} literal value cannot be empty.`);
    }

    return value;
  }

  if (field.type === "date") {
    if (typeof value !== "string") {
      throw new Error(`${context} literal value must be a YYYY-MM-DD date.`);
    }

    if (value === "") {
      if (field.required) {
        throw new Error(`${context} literal value cannot be empty.`);
      }

      return value;
    }

    if (!isDateString(value)) {
      throw new Error(`${context} literal value must be a YYYY-MM-DD date.`);
    }

    return value;
  }

  if (field.type === "boolean") {
    if (typeof value !== "boolean") {
      throw new Error(`${context} literal value must be a boolean.`);
    }

    return value;
  }

  if (field.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${context} literal value must be a finite number.`);
    }

    if (field.min !== undefined && value < field.min) {
      throw new Error(`${context} literal value must be greater than or equal to ${field.min}.`);
    }

    if (field.max !== undefined && value > field.max) {
      throw new Error(`${context} literal value must be less than or equal to ${field.max}.`);
    }

    if (field.integer && !Number.isInteger(value)) {
      throw new Error(`${context} literal value must be an integer.`);
    }

    return value;
  }

  if (typeof value !== "string") {
    throw new Error(`${context} literal value must be a known enum value.`);
  }

  if (value === "") {
    if (field.required) {
      throw new Error(`${context} literal value cannot be empty.`);
    }

    return value;
  }

  if (!Object.hasOwn(field.values, value)) {
    throw new Error(`${context} literal value must be a known enum value.`);
  }

  return value;
}

function getVisibleCreateValues<TField extends CreateDefaultFieldConfig>(
  formData: FormData,
  fields: TField[],
): RecordValues {
  const values: RecordValues = {};

  for (const { field, fieldName } of fields) {
    const value = formData.get(fieldName);
    values[fieldName] = createInputValueToFieldValue(
      field,
      typeof value === "string" ? value : undefined,
      formData.has(fieldName),
    );
  }

  return values;
}

function selectCreateFieldsForVisibility<TField extends CreateDefaultFieldConfig>(
  fields: TField[],
  valueForField: (fieldName: string) => FieldVisibilityValue | undefined,
): TField[] {
  return fields.filter((field) => {
    const condition = field.visibleWhen;

    if (condition === undefined) {
      return true;
    }

    return condition.values.includes(valueForField(condition.field) ?? "");
  });
}

function fieldInputValueForCreateVisibility<TField extends CreateDefaultFieldConfig>(
  fieldName: string,
  fields: TField[],
  formData: FormData,
  defaults: CreateDefaultConfig[],
  queryContext?: QueryEvaluationContext,
): FieldVisibilityValue {
  const formValue = formData.get(fieldName);

  if (typeof formValue === "string") {
    return formValue;
  }

  const defaultConfig = defaults.find((candidate) => candidate.fieldName === fieldName);

  if (defaultConfig?.value.kind === "literal") {
    return defaultConfig.value.value;
  }

  if (defaultConfig?.value.kind === "context") {
    return queryContext?.values?.[defaultConfig.value.name] ?? "";
  }

  const fieldConfig = fields.find((candidate) => candidate.fieldName === fieldName);

  if (fieldConfig && fieldHasCreateDefault(fieldConfig.field)) {
    return fieldValueToInputValue(fieldConfig.field, fieldCreateDefaultValue(fieldConfig.field));
  }

  return "";
}

function selectActiveCreateUnionPresentation<TField extends CreateDefaultFieldConfig>(
  union: CreateDefaultUnionConfig<TField> | undefined,
  discriminatorValue: string | undefined,
) {
  if (union === undefined) {
    return undefined;
  }

  return (
    union.variants.find((variant) => variant.variantValue === discriminatorValue) ?? union.fallback
  );
}

function appendNewFields<TField extends { fieldName: string }>(
  baseFields: TField[],
  variantFields: TField[],
): TField[] {
  const fieldNames = new Set(baseFields.map((field) => field.fieldName));
  const newFields = variantFields.filter((field) => !fieldNames.has(field.fieldName));

  return newFields.length === 0 ? baseFields : [...baseFields, ...newFields];
}

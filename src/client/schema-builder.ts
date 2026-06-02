import {
  parseAppSchema,
  stringifySchema,
  type AppSchema,
  type EnumValueSchema,
  type FieldSchema,
  type TextFieldFormat,
} from "../shared/schema.ts";
import { isSchemaLocalEntityKey } from "../shared/schema-entity-names.ts";

export type SchemaBuilderDraft = {
  savedSchema: AppSchema;
  schema: AppSchema;
};

export type SchemaBuilderProjection = {
  entities: SchemaBuilderEntityProjection[];
};

export type SchemaBuilderEntityProjection = {
  key: string;
  keyLocked: boolean;
  label: string;
  saved: boolean;
  fields: SchemaBuilderFieldProjection[];
};

export type SchemaBuilderFieldProjection = {
  key: string;
  label: string;
  type: FieldSchema["type"];
  required: boolean;
  saved: boolean;
  keyLocked: boolean;
  referenceTargetLocked: boolean;
  typeLocked: boolean;
};

export type SchemaBuilderIntent =
  | {
      type: "createEntity";
      key: string;
      label?: string;
    }
  | {
      type: "updateEntityLabel";
      entityKey: string;
      label: string;
    }
  | {
      type: "addField";
      entityKey: string;
      fieldKey: string;
      fieldType: FieldSchema["type"];
      metadata?: SchemaBuilderFieldMetadataUpdate;
    }
  | {
      type: "updateFieldMetadata";
      entityKey: string;
      fieldKey: string;
      metadata: SchemaBuilderFieldMetadataUpdate;
    };

export type SchemaBuilderFieldMetadataUpdate = {
  default?: string | number | boolean | null;
  displayField?: string | null;
  format?: TextFieldFormat | null;
  integer?: boolean | null;
  label?: string;
  max?: number | null;
  min?: number | null;
  required?: boolean;
  to?: string;
  type?: FieldSchema["type"];
  values?: Record<string, EnumValueSchema>;
};

export type SchemaBuilderValidationIssue = {
  entityKey?: string;
  fieldKey?: string;
  message: string;
  scope: "schema" | "entity" | "field";
};

export type SchemaBuilderKeyValidationResult =
  | {
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

const builderKeyPattern = /^[A-Za-z][A-Za-z0-9]*$/;

export function createSchemaBuilderDraft(schema: AppSchema): SchemaBuilderDraft {
  return {
    savedSchema: cloneSchema(schema),
    schema: cloneSchema(schema),
  };
}

export function revertSchemaBuilderDraft(draft: SchemaBuilderDraft): SchemaBuilderDraft {
  return {
    savedSchema: cloneSchema(draft.savedSchema),
    schema: cloneSchema(draft.savedSchema),
  };
}

export function serializeSchemaBuilderDraft(draft: SchemaBuilderDraft): AppSchema {
  return parseAppSchema(cloneSchema(draft.schema));
}

export function isSchemaBuilderDraftDirty(draft: SchemaBuilderDraft): boolean {
  return stringifySchema(draft.schema) !== stringifySchema(draft.savedSchema);
}

export function validateSchemaBuilderDraft(
  draft: SchemaBuilderDraft,
): SchemaBuilderValidationIssue[] {
  try {
    serializeSchemaBuilderDraft(draft);
    return [];
  } catch (error) {
    return [schemaBuilderIssueFromError(error)];
  }
}

export function validateSchemaBuilderKey(
  kind: "entity" | "enum value" | "field",
  value: string,
): SchemaBuilderKeyValidationResult {
  const key = value.trim();

  if (key === "") {
    return { ok: false, message: `${capitalize(kind)} key is required.` };
  }

  if (kind === "entity") {
    if (!isSchemaLocalEntityKey(key)) {
      return {
        ok: false,
        message: "Entity key must be a singular kebab-case entity key.",
      };
    }

    return { ok: true };
  }

  if (!builderKeyPattern.test(key)) {
    return {
      ok: false,
      message: `${capitalize(kind)} key must start with a letter and use only letters and numbers.`,
    };
  }

  return { ok: true };
}

export function projectSchemaBuilderDraft(draft: SchemaBuilderDraft): SchemaBuilderProjection {
  return {
    entities: Object.entries(draft.schema.entities).map(([entityKey, entity]) => {
      const savedEntity = draft.savedSchema.entities[entityKey];

      return {
        key: entityKey,
        keyLocked: savedEntity !== undefined,
        label: entity.label,
        saved: savedEntity !== undefined,
        fields: Object.entries(entity.fields).map(([fieldKey, field]) => {
          const savedField = savedEntity?.fields[fieldKey];

          return {
            key: fieldKey,
            label: field.label ?? labelFromKey(fieldKey),
            type: field.type,
            required: field.required,
            saved: savedField !== undefined,
            keyLocked: savedField !== undefined,
            referenceTargetLocked: savedField?.type === "reference",
            typeLocked: savedField !== undefined,
          };
        }),
      };
    }),
  };
}

export function applySchemaBuilderIntent(
  draft: SchemaBuilderDraft,
  intent: SchemaBuilderIntent,
): SchemaBuilderDraft {
  return updateSchemaBuilderDraft(draft, (schema, savedSchema) => {
    if (intent.type === "createEntity") {
      createEntity(schema, intent);
      return;
    }

    if (intent.type === "updateEntityLabel") {
      updateEntityLabel(schema, intent.entityKey, intent.label);
      return;
    }

    if (intent.type === "addField") {
      addField(schema, intent);
      return;
    }

    if (intent.type === "updateFieldMetadata") {
      updateFieldMetadata(schema, savedSchema, intent.entityKey, intent.fieldKey, intent.metadata);
    }
  });
}

function updateSchemaBuilderDraft(
  draft: SchemaBuilderDraft,
  update: (schema: AppSchema, savedSchema: AppSchema) => void,
): SchemaBuilderDraft {
  const schema = cloneSchema(draft.schema);
  update(schema, draft.savedSchema);

  return {
    savedSchema: cloneSchema(draft.savedSchema),
    schema,
  };
}

function createEntity(
  schema: AppSchema,
  input: Extract<SchemaBuilderIntent, { type: "createEntity" }>,
) {
  const entityKey = cleanKey("entity", input.key);

  if (schema.entities[entityKey] !== undefined) {
    throw new Error(`Entity key "${entityKey}" already exists.`);
  }

  schema.entities[entityKey] = {
    label: cleanLabel(input.label ?? labelFromKey(entityKey), "Entity label"),
    fields: {},
    mutations: defaultMutationPolicy(),
  };
}

function updateEntityLabel(schema: AppSchema, entityKey: string, label: string) {
  const entity = getEntity(schema, entityKey);
  entity.label = cleanLabel(label, `Entity "${entityKey}" label`);
}

function addField(schema: AppSchema, input: Extract<SchemaBuilderIntent, { type: "addField" }>) {
  const entity = getEntity(schema, input.entityKey);
  const fieldKey = cleanKey("field", input.fieldKey);

  if (entity.fields[fieldKey] !== undefined) {
    throw new Error(`Field key "${input.entityKey}.${fieldKey}" already exists.`);
  }

  const field = createField(schema, fieldKey, input.fieldType, input.metadata ?? {});
  entity.fields[fieldKey] = field;
}

function updateFieldMetadata(
  schema: AppSchema,
  savedSchema: AppSchema,
  entityKey: string,
  fieldKey: string,
  metadata: SchemaBuilderFieldMetadataUpdate,
) {
  const entity = getEntity(schema, entityKey);
  const field = getField(schema, entityKey, fieldKey);
  const savedField = savedSchema.entities[entityKey]?.fields[fieldKey];
  const nextType = metadata.type ?? field.type;

  if (savedField !== undefined && nextType !== savedField.type) {
    throw new Error(`Saved field "${entityKey}.${fieldKey}" type is locked.`);
  }

  if (nextType !== field.type) {
    const nextField = createField(schema, fieldKey, nextType, {
      ...metadata,
      label: metadata.label ?? field.label ?? labelFromKey(fieldKey),
      required: metadata.required ?? field.required,
    });
    entity.fields[fieldKey] = nextField;
    return;
  }

  applyCommonFieldMetadata(field, metadata, fieldKey);
  applyTypedFieldMetadata(schema, savedField, entityKey, fieldKey, field, metadata);
}

function createField(
  schema: AppSchema,
  fieldKey: string,
  fieldType: FieldSchema["type"],
  metadata: SchemaBuilderFieldMetadataUpdate,
): FieldSchema {
  const required = metadata.required ?? false;
  const label = cleanLabel(metadata.label ?? labelFromKey(fieldKey), `Field "${fieldKey}" label`);

  if (fieldType === "text") {
    const field: Extract<FieldSchema, { type: "text" }> = { type: "text", required, label };
    applyTextMetadata(field, metadata);
    return field;
  }

  if (fieldType === "boolean") {
    const field: Extract<FieldSchema, { type: "boolean" }> = { type: "boolean", required, label };
    applyBooleanMetadata(field, metadata);
    return field;
  }

  if (fieldType === "date") {
    return { type: "date", required, label };
  }

  if (fieldType === "number") {
    const field: Extract<FieldSchema, { type: "number" }> = { type: "number", required, label };
    applyNumberMetadata(field, metadata);
    return field;
  }

  if (fieldType === "enum") {
    const field: Extract<FieldSchema, { type: "enum" }> = {
      type: "enum",
      required,
      label,
      values: metadata.values ?? { option: { label: "Option" } },
    };
    applyEnumMetadata(field, metadata);
    return field;
  }

  const target = metadata.to;
  if (target === undefined) {
    throw new Error(`Reference field "${fieldKey}" must choose a target entity.`);
  }

  const field: Extract<FieldSchema, { type: "reference" }> = {
    type: "reference",
    required,
    label,
    to: target,
  };
  applyReferenceMetadata(schema, undefined, fieldKey, field, metadata);
  return field;
}

function applyCommonFieldMetadata(
  field: FieldSchema,
  metadata: SchemaBuilderFieldMetadataUpdate,
  fieldKey: string,
) {
  if (metadata.label !== undefined) {
    field.label = cleanLabel(metadata.label, `Field "${fieldKey}" label`);
  }

  if (metadata.required !== undefined) {
    field.required = metadata.required;
  }
}

function applyTypedFieldMetadata(
  schema: AppSchema,
  savedField: FieldSchema | undefined,
  entityKey: string,
  fieldKey: string,
  field: FieldSchema,
  metadata: SchemaBuilderFieldMetadataUpdate,
) {
  if (field.type === "text") {
    applyTextMetadata(field, metadata);
    return;
  }

  if (field.type === "boolean") {
    applyBooleanMetadata(field, metadata);
    return;
  }

  if (field.type === "number") {
    applyNumberMetadata(field, metadata);
    return;
  }

  if (field.type === "enum") {
    applyEnumMetadata(field, metadata);
    return;
  }

  if (field.type === "reference") {
    applyReferenceMetadata(schema, savedField, `${entityKey}.${fieldKey}`, field, metadata);
  }
}

function applyTextMetadata(
  field: Extract<FieldSchema, { type: "text" }>,
  metadata: SchemaBuilderFieldMetadataUpdate,
) {
  if (!("format" in metadata)) {
    return;
  }

  if (metadata.format === null || metadata.format === undefined || metadata.format === "plain") {
    delete field.format;
    return;
  }

  field.format = metadata.format;
}

function applyBooleanMetadata(
  field: Extract<FieldSchema, { type: "boolean" }>,
  metadata: SchemaBuilderFieldMetadataUpdate,
) {
  if (!("default" in metadata)) {
    return;
  }

  if (metadata.default === null || metadata.default === undefined) {
    delete field.default;
    return;
  }

  if (typeof metadata.default !== "boolean") {
    throw new Error("Boolean default must be a boolean.");
  }

  field.default = metadata.default;
}

function applyNumberMetadata(
  field: Extract<FieldSchema, { type: "number" }>,
  metadata: SchemaBuilderFieldMetadataUpdate,
) {
  if ("min" in metadata) {
    if (metadata.min === null || metadata.min === undefined) {
      delete field.min;
    } else {
      field.min = metadata.min;
    }
  }

  if ("max" in metadata) {
    if (metadata.max === null || metadata.max === undefined) {
      delete field.max;
    } else {
      field.max = metadata.max;
    }
  }

  if ("integer" in metadata) {
    if (metadata.integer === null || metadata.integer === undefined) {
      delete field.integer;
    } else {
      field.integer = metadata.integer;
    }
  }

  if (!("default" in metadata)) {
    return;
  }

  if (metadata.default === null || metadata.default === undefined) {
    delete field.default;
    return;
  }

  if (typeof metadata.default !== "number") {
    throw new Error("Number default must be a number.");
  }

  field.default = metadata.default;
}

function applyEnumMetadata(
  field: Extract<FieldSchema, { type: "enum" }>,
  metadata: SchemaBuilderFieldMetadataUpdate,
) {
  if (metadata.values !== undefined) {
    field.values = mergeEnumValues(field.values, metadata.values);
  }

  if (!("default" in metadata)) {
    return;
  }

  if (metadata.default === null || metadata.default === undefined) {
    delete field.default;
    return;
  }

  if (typeof metadata.default !== "string") {
    throw new Error("Enum default must be an enum value key.");
  }

  field.default = metadata.default;
}

function applyReferenceMetadata(
  schema: AppSchema,
  savedField: FieldSchema | undefined,
  context: string,
  field: Extract<FieldSchema, { type: "reference" }>,
  metadata: SchemaBuilderFieldMetadataUpdate,
) {
  if (metadata.to !== undefined) {
    if (savedField?.type === "reference" && metadata.to !== savedField.to) {
      throw new Error(`Saved reference field "${context}" target is locked.`);
    }

    field.to = metadata.to;
  }

  validateReferenceTarget(schema, context, field.to);

  if (!("displayField" in metadata)) {
    return;
  }

  if (metadata.displayField === null || metadata.displayField === undefined) {
    delete field.displayField;
    return;
  }

  validateReferenceDisplayField(schema, context, field.to, metadata.displayField);
  field.displayField = metadata.displayField;
}

function mergeEnumValues(
  currentValues: Record<string, EnumValueSchema>,
  nextValues: Record<string, EnumValueSchema>,
) {
  return Object.fromEntries(
    Object.entries(nextValues).map(([valueKey, nextValue]) => {
      const currentValue = currentValues[valueKey];

      return [
        valueKey,
        {
          ...nextValue,
          ...(nextValue.presentation === undefined && currentValue?.presentation !== undefined
            ? { presentation: currentValue.presentation }
            : {}),
        },
      ];
    }),
  );
}

function schemaBuilderIssueFromError(error: unknown): SchemaBuilderValidationIssue {
  const message = error instanceof Error ? error.message : "Schema is invalid.";
  const fieldMatch = /^Field "([^".]+)\.([^"]+)"/.exec(message);

  if (fieldMatch) {
    return {
      scope: "field",
      entityKey: fieldMatch[1],
      fieldKey: fieldMatch[2],
      message,
    };
  }

  const entityMatch = /^Entity "([^"]+)"/.exec(message);

  if (entityMatch) {
    return {
      scope: "entity",
      entityKey: entityMatch[1],
      message,
    };
  }

  return { scope: "schema", message };
}

function getEntity(schema: AppSchema, entityKey: string) {
  const entity = schema.entities[entityKey];

  if (entity === undefined) {
    throw new Error(`Unknown entity "${entityKey}".`);
  }

  return entity;
}

function getField(schema: AppSchema, entityKey: string, fieldKey: string) {
  const entity = getEntity(schema, entityKey);
  const field = entity.fields[fieldKey];

  if (field === undefined) {
    throw new Error(`Unknown field "${entityKey}.${fieldKey}".`);
  }

  return field;
}

function validateReferenceTarget(schema: AppSchema, context: string, target: string) {
  if (schema.entities[target] === undefined) {
    throw new Error(`Reference field "${context}" target must be an existing entity.`);
  }
}

function validateReferenceDisplayField(
  schema: AppSchema,
  context: string,
  target: string,
  displayField: string,
) {
  const targetField = schema.entities[target]?.fields[displayField];

  if (targetField === undefined) {
    throw new Error(`Reference field "${context}" display field must exist on "${target}".`);
  }

  if (targetField.type !== "text") {
    throw new Error(`Reference field "${context}" display field must be a text field.`);
  }
}

function cleanKey(kind: "entity" | "enum value" | "field", value: string): string {
  const key = value.trim();
  const result = validateSchemaBuilderKey(kind, key);

  if (!result.ok) {
    throw new Error(result.message);
  }

  return key;
}

function cleanLabel(value: string, context: string): string {
  const label = value.trim();

  if (label === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return label;
}

function cloneSchema(schema: AppSchema): AppSchema {
  return structuredClone(schema);
}

function defaultMutationPolicy() {
  return {
    create: { enabled: true },
    patch: { enabled: true },
    delete: { enabled: false },
  };
}

function labelFromKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();

  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

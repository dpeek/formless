export type TextFieldSchema = {
  type: "text";
  required: boolean;
};

export type FieldSchema = TextFieldSchema;

export type EntitySchema = {
  label: string;
  fields: Record<string, FieldSchema>;
};

export type AppSchema = {
  version: number;
  entities: Record<string, EntitySchema>;
};

export function parseAppSchema(value: unknown): AppSchema {
  if (!isRecord(value)) {
    throw new Error("Schema must be an object.");
  }

  const version = value.version;
  if (version !== 1) {
    throw new Error("Schema version must be 1.");
  }

  const entities = parseEntities(value.entities);
  if (Object.keys(entities).length === 0) {
    throw new Error("Schema must define at least one entity.");
  }

  return { version, entities };
}

export function stringifySchema(schema: AppSchema) {
  return JSON.stringify(schema, null, 2);
}

function parseEntities(value: unknown): Record<string, EntitySchema> {
  if (!isRecord(value)) {
    throw new Error("Schema entities must be an object.");
  }

  return Object.fromEntries(
    Object.entries(value).map(([entityName, entity]) => [
      entityName,
      parseEntity(entityName, entity),
    ]),
  );
}

function parseEntity(entityName: string, value: unknown): EntitySchema {
  if (!isRecord(value)) {
    throw new Error(`Entity "${entityName}" must be an object.`);
  }

  const label = value.label;
  if (typeof label !== "string" || label.trim() === "") {
    throw new Error(`Entity "${entityName}" must have a label.`);
  }

  const fields = parseFields(entityName, value.fields);
  if (Object.keys(fields).length === 0) {
    throw new Error(`Entity "${entityName}" must define at least one field.`);
  }

  return { label, fields };
}

function parseFields(entityName: string, value: unknown): Record<string, FieldSchema> {
  if (!isRecord(value)) {
    throw new Error(`Entity "${entityName}" fields must be an object.`);
  }

  return Object.fromEntries(
    Object.entries(value).map(([fieldName, field]) => [
      fieldName,
      parseField(entityName, fieldName, field),
    ]),
  );
}

function parseField(entityName: string, fieldName: string, value: unknown): FieldSchema {
  if (!isRecord(value)) {
    throw new Error(`Field "${entityName}.${fieldName}" must be an object.`);
  }

  if (value.type !== "text") {
    throw new Error(`Field "${entityName}.${fieldName}" must use type "text".`);
  }

  if (typeof value.required !== "boolean") {
    throw new Error(`Field "${entityName}.${fieldName}" must declare whether it is required.`);
  }

  return {
    type: "text",
    required: value.required,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

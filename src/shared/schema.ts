export type TextFieldSchema = {
  type: "text";
  required: boolean;
  label?: string;
};

export type BooleanFieldSchema = {
  type: "boolean";
  required: boolean;
  label?: string;
  default?: boolean;
};

export type DateFieldSchema = {
  type: "date";
  required: boolean;
  label?: string;
};

export type FieldSchema = TextFieldSchema | BooleanFieldSchema | DateFieldSchema;

export type GenericMutationPolicy = {
  enabled: boolean;
};

export type DeleteMutationPolicy = {
  enabled: false;
};

export type EntityMutationPolicy = {
  create: GenericMutationPolicy;
  patch: GenericMutationPolicy;
  delete: DeleteMutationPolicy;
};

export type EntitySchema = {
  label: string;
  fields: Record<string, FieldSchema>;
  mutations: EntityMutationPolicy;
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

  const mutations = parseEntityMutations(entityName, value.mutations);

  return { label, fields, mutations };
}

function parseEntityMutations(entityName: string, value: unknown): EntityMutationPolicy {
  if (value === undefined) {
    return defaultMutationPolicy();
  }

  if (!isRecord(value)) {
    throw new Error(`Entity "${entityName}" mutations must be an object.`);
  }

  const allowedKeys = new Set(["create", "patch", "delete"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Entity "${entityName}" mutations has unsupported key "${key}".`);
    }
  }

  for (const key of allowedKeys) {
    if (!(key in value)) {
      throw new Error(`Entity "${entityName}" mutations must include "${key}".`);
    }
  }

  return {
    create: parseGenericMutationPolicy(entityName, "create", value.create),
    patch: parseGenericMutationPolicy(entityName, "patch", value.patch),
    delete: parseDeleteMutationPolicy(entityName, value.delete),
  };
}

function parseGenericMutationPolicy(
  entityName: string,
  mutationName: "create" | "patch",
  value: unknown,
): GenericMutationPolicy {
  if (!isRecord(value)) {
    throw new Error(`Entity "${entityName}" ${mutationName} mutation policy must be an object.`);
  }

  assertExactPolicyKeys(entityName, mutationName, value);

  if (typeof value.enabled !== "boolean") {
    throw new Error(`Entity "${entityName}" ${mutationName}.enabled must be a boolean.`);
  }

  return { enabled: value.enabled };
}

function parseDeleteMutationPolicy(entityName: string, value: unknown): DeleteMutationPolicy {
  if (!isRecord(value)) {
    throw new Error(`Entity "${entityName}" delete mutation policy must be an object.`);
  }

  assertExactPolicyKeys(entityName, "delete", value);

  if (value.enabled !== false) {
    throw new Error(
      `Entity "${entityName}" delete.enabled must be false until delete mutations are implemented.`,
    );
  }

  return { enabled: false };
}

function assertExactPolicyKeys(
  entityName: string,
  mutationName: "create" | "patch" | "delete",
  value: Record<string, unknown>,
) {
  for (const key of Object.keys(value)) {
    if (key !== "enabled") {
      throw new Error(
        `Entity "${entityName}" ${mutationName} mutation policy has unsupported key "${key}".`,
      );
    }
  }

  if (!("enabled" in value)) {
    throw new Error(`Entity "${entityName}" ${mutationName} mutation policy must include enabled.`);
  }
}

function defaultMutationPolicy(): EntityMutationPolicy {
  return {
    create: { enabled: true },
    patch: { enabled: true },
    delete: { enabled: false },
  };
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

  if (typeof value.required !== "boolean") {
    throw new Error(`Field "${entityName}.${fieldName}" must declare whether it is required.`);
  }

  const label = parseFieldLabel(entityName, fieldName, value.label);

  if (value.type === "text") {
    const field: TextFieldSchema = {
      type: "text",
      required: value.required,
    };

    if (label !== undefined) {
      field.label = label;
    }

    return field;
  }

  if (value.type === "boolean") {
    if ("default" in value && typeof value.default !== "boolean") {
      throw new Error(`Field "${entityName}.${fieldName}" boolean default must be a boolean.`);
    }

    const field: BooleanFieldSchema = {
      type: "boolean",
      required: value.required,
    };

    if (label !== undefined) {
      field.label = label;
    }

    if ("default" in value) {
      field.default = value.default as boolean;
    }

    return field;
  }

  if (value.type === "date") {
    const field: DateFieldSchema = {
      type: "date",
      required: value.required,
    };

    if (label !== undefined) {
      field.label = label;
    }

    return field;
  }

  throw new Error(
    `Field "${entityName}.${fieldName}" has unsupported type "${String(value.type)}".`,
  );
}

function parseFieldLabel(
  entityName: string,
  fieldName: string,
  value: unknown,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Field "${entityName}.${fieldName}" label must be a non-empty string.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

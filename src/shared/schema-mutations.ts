import { assertExactKeys, isRecord, parseRequiredNonEmptyString } from "./schema-parse-helpers.ts";
import type {
  AfterCreateHookSchema,
  CreateMutationPolicy,
  DeleteMutationPolicy,
  EntityMutationPolicy,
  GenericMutationPolicy,
} from "./schema-types.ts";

export function parseEntityMutations(entityName: string, value: unknown): EntityMutationPolicy {
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
    create: parseCreateMutationPolicy(entityName, value.create),
    patch: parseGenericMutationPolicy(entityName, "patch", value.patch),
    delete: parseDeleteMutationPolicy(entityName, value.delete),
  };
}

function parseCreateMutationPolicy(entityName: string, value: unknown): CreateMutationPolicy {
  if (!isRecord(value)) {
    throw new Error(`Entity "${entityName}" create mutation policy must be an object.`);
  }

  assertExactPolicyKeys(entityName, "create", value);

  if (typeof value.enabled !== "boolean") {
    throw new Error(`Entity "${entityName}" create.enabled must be a boolean.`);
  }

  const afterCreate = parseAfterCreateHooks(entityName, value.afterCreate);

  return {
    enabled: value.enabled,
    ...(afterCreate === undefined ? {} : { afterCreate }),
  };
}

function parseAfterCreateHooks(
  entityName: string,
  value: unknown,
): AfterCreateHookSchema[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Entity "${entityName}" create.afterCreate must be a non-empty array.`);
  }

  return value.map((hook, index) => parseAfterCreateHook(entityName, index, hook));
}

function parseAfterCreateHook(
  entityName: string,
  index: number,
  value: unknown,
): AfterCreateHookSchema {
  const context = `Entity "${entityName}" create.afterCreate hook ${index}`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["entity", "action"]);

  return {
    entity: parseRequiredNonEmptyString(`${context} entity`, value.entity),
    action: parseRequiredNonEmptyString(`${context} action`, value.action),
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
  const optionalKeys = mutationName === "create" ? new Set(["afterCreate"]) : new Set<string>();

  for (const key of Object.keys(value)) {
    if (key !== "enabled" && !optionalKeys.has(key)) {
      throw new Error(
        `Entity "${entityName}" ${mutationName} mutation policy has unsupported key "${key}".`,
      );
    }
  }

  if (!("enabled" in value)) {
    throw new Error(`Entity "${entityName}" ${mutationName} mutation policy must include enabled.`);
  }
}

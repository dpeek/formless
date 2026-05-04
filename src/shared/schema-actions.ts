import { fieldRefsEqual } from "./fields.ts";
import { collectQueryContextNames, type QueryExpression } from "./query.ts";
import { assertExactKeys, isRecord, parseRequiredNonEmptyString } from "./schema-parse-helpers.ts";
import type {
  ClearCompletedEntityActionSchema,
  CollectionQuerySchema,
  CreateMissingJoinRecordsEntityActionSchema,
  EntityActionJoinSchema,
  EntityActionJoinSourceSchema,
  EntityActionSchema,
  EntityActionTargetSchema,
  EntitySchema,
  FieldSchema,
} from "./schema-types.ts";

export function parseEntityActionsForEntities(
  entities: Record<string, EntitySchema>,
  actionInputsByEntity: Record<string, unknown>,
  queries: Record<string, CollectionQuerySchema>,
): Record<string, EntitySchema> {
  const parsedEntities = Object.fromEntries(
    Object.entries(entities).map(([entityName, entity]) => {
      const actions = parseEntityActions(
        entityName,
        actionInputsByEntity[entityName],
        entity,
        queries,
      );

      return [entityName, actions ? { ...entity, actions } : entity];
    }),
  );

  validateCreateAfterCreateHooks(parsedEntities);

  return parsedEntities;
}

function parseEntityActions(
  entityName: string,
  value: unknown,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
): Record<string, EntityActionSchema> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`Entity "${entityName}" actions must be an object.`);
  }

  const actions = Object.fromEntries(
    Object.entries(value).map(([actionName, action]) => {
      if (actionName.trim() === "") {
        throw new Error(`Entity "${entityName}" action names must be non-empty.`);
      }

      return [actionName, parseEntityAction(entityName, actionName, action, entity, queries)];
    }),
  );

  return Object.keys(actions).length > 0 ? actions : undefined;
}

function parseEntityAction(
  entityName: string,
  actionName: string,
  value: unknown,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
): EntityActionSchema {
  if (!isRecord(value)) {
    throw new Error(`Entity action "${entityName}.${actionName}" must be an object.`);
  }

  if (typeof value.label !== "string" || value.label.trim() === "") {
    throw new Error(
      `Entity action "${entityName}.${actionName}" label must be a non-empty string.`,
    );
  }

  if (value.kind === "clear-completed") {
    return parseClearCompletedEntityAction(entityName, actionName, value, entity, queries);
  }

  if (value.kind === "create-missing-join-records") {
    return parseCreateMissingJoinRecordsEntityAction(
      entityName,
      actionName,
      value,
      entity,
      queries,
    );
  }

  throw new Error(
    `Entity action "${entityName}.${actionName}" has unsupported kind "${String(value.kind)}".`,
  );
}

function parseClearCompletedEntityAction(
  entityName: string,
  actionName: string,
  value: Record<string, unknown>,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
): ClearCompletedEntityActionSchema {
  assertExactKeys(
    `Entity action "${entityName}.${actionName}"`,
    value,
    ["label", "kind"],
    ["target"],
  );

  if (entity.fields.done?.type !== "boolean") {
    throw new Error(
      `Entity action "${entityName}.${actionName}" kind "clear-completed" requires a boolean "done" field.`,
    );
  }

  const target = parseEntityActionTarget(entityName, actionName, value.target, queries);
  const targetQuery = queries[target.query];

  if (!targetQuery) {
    throw new Error(
      `Entity action "${entityName}.${actionName}" target references unknown query "${target.query}".`,
    );
  }

  if (!isClearCompletedTargetQuery(targetQuery.expression)) {
    throw new Error(
      `Entity action "${entityName}.${actionName}" kind "clear-completed" target must be value.done eq true.`,
    );
  }

  return {
    label: value.label as string,
    kind: "clear-completed",
    target,
  };
}

function parseCreateMissingJoinRecordsEntityAction(
  entityName: string,
  actionName: string,
  value: Record<string, unknown>,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
): CreateMissingJoinRecordsEntityActionSchema {
  assertExactKeys(`Entity action "${entityName}.${actionName}"`, value, ["label", "kind", "join"]);

  const join = parseEntityActionJoin(entityName, actionName, value.join, entity, queries);
  validateCreateMissingJoinRecordDefaults(entityName, actionName, entity, join);

  return {
    label: value.label as string,
    kind: "create-missing-join-records",
    join,
  };
}

function parseEntityActionJoin(
  entityName: string,
  actionName: string,
  value: unknown,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
): EntityActionJoinSchema {
  const context = `Entity action "${entityName}.${actionName}" join`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["left", "right"]);

  const left = parseEntityActionJoinSource(
    entityName,
    actionName,
    "left",
    value.left,
    entity,
    queries,
  );
  const right = parseEntityActionJoinSource(
    entityName,
    actionName,
    "right",
    value.right,
    entity,
    queries,
  );

  if (left.field === right.field) {
    throw new Error(`${context} fields must be different.`);
  }

  return { left, right };
}

function parseEntityActionJoinSource(
  entityName: string,
  actionName: string,
  side: "left" | "right",
  value: unknown,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
): EntityActionJoinSourceSchema {
  const context = `Entity action "${entityName}.${actionName}" join ${side}`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["field", "query"]);

  const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
  const queryName = parseRequiredNonEmptyString(`${context} query`, value.query);
  const field = entity.fields[fieldName];

  if (!field) {
    throw new Error(`${context} references unknown field "${entityName}.${fieldName}".`);
  }

  if (field.type !== "reference") {
    throw new Error(`${context} field "${fieldName}" must be a reference field.`);
  }

  const query = queries[queryName];
  if (!query) {
    throw new Error(`${context} references unknown query "${queryName}".`);
  }

  if (query.entity !== field.to) {
    throw new Error(`${context} query "${queryName}" must use entity "${field.to}".`);
  }

  if (collectQueryContextNames(query.expression).length > 0) {
    throw new Error(`${context} query "${queryName}" must not require context.`);
  }

  return {
    field: fieldName,
    query: queryName,
  };
}

function validateCreateMissingJoinRecordDefaults(
  entityName: string,
  actionName: string,
  entity: EntitySchema,
  join: EntityActionJoinSchema,
) {
  const joinFields = new Set([join.left.field, join.right.field]);

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    if (joinFields.has(fieldName) || !field.required || fieldHasCreateDefault(field)) {
      continue;
    }

    throw new Error(
      `Entity action "${entityName}.${actionName}" kind "create-missing-join-records" requires field "${fieldName}" to have a default.`,
    );
  }
}

function fieldHasCreateDefault(field: FieldSchema) {
  return (
    (field.type === "boolean" && field.default !== undefined) ||
    (field.type === "enum" && field.default !== undefined) ||
    (field.type === "number" && field.default !== undefined)
  );
}

function validateCreateAfterCreateHooks(entities: Record<string, EntitySchema>) {
  for (const [entityName, entity] of Object.entries(entities)) {
    for (const [index, hook] of (entity.mutations.create.afterCreate ?? []).entries()) {
      const context = `Entity "${entityName}" create.afterCreate hook ${index}`;
      const targetEntity = entities[hook.entity];

      if (!targetEntity) {
        throw new Error(`${context} references unknown entity "${hook.entity}".`);
      }

      const action = targetEntity.actions?.[hook.action];

      if (!action) {
        throw new Error(
          `${context} references unknown action "${hook.action}" for entity "${hook.entity}".`,
        );
      }

      if (action.kind !== "create-missing-join-records") {
        throw new Error(`${context} action must create missing join records.`);
      }
    }
  }
}

function parseEntityActionTarget(
  entityName: string,
  actionName: string,
  value: unknown,
  queries: Record<string, CollectionQuerySchema>,
): EntityActionTargetSchema {
  if (!isRecord(value)) {
    throw new Error(`Entity action "${entityName}.${actionName}" target must be an object.`);
  }

  assertExactKeys(`Entity action "${entityName}.${actionName}" target`, value, ["query"]);

  if (typeof value.query !== "string" || value.query.trim() === "") {
    throw new Error(`Entity action "${entityName}.${actionName}" target query must be a string.`);
  }

  const query = queries[value.query];
  if (!query) {
    throw new Error(
      `Entity action "${entityName}.${actionName}" target references unknown query "${value.query}".`,
    );
  }

  if (query.entity !== entityName) {
    throw new Error(
      `Entity action "${entityName}.${actionName}" target query "${value.query}" must use entity "${entityName}".`,
    );
  }

  if (collectQueryContextNames(query.expression).length > 0) {
    throw new Error(
      `Entity action "${entityName}.${actionName}" target query "${value.query}" must not require context.`,
    );
  }

  return {
    query: value.query,
  };
}

function isClearCompletedTargetQuery(query: QueryExpression) {
  return (
    query.kind === "where" &&
    query.op === "eq" &&
    query.value === true &&
    fieldRefsEqual(query.ref, { kind: "value", name: "done" })
  );
}

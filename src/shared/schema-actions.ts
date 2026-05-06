import { fieldRefsEqual } from "./fields.ts";
import { fieldHasCreateDefault } from "./field-types.ts";
import { collectQueryContextNames, type QueryExpression } from "./query.ts";
import { assertExactKeys, isRecord, parseRequiredNonEmptyString } from "./schema-parse-helpers.ts";
import type {
  ClearCompletedEntityActionSchema,
  CollectionQuerySchema,
  CreateMissingJoinRecordsEntityActionSchema,
  CreateSelectedJoinRecordEntityActionSchema,
  EntityActionCapabilities,
  EntityActionJoinSchema,
  EntityActionJoinSourceSchema,
  EntityActionKind,
  EntityActionSchema,
  EntityActionTargetSchema,
  EntitySchema,
  RelationshipSchema,
  RemoveSelectedJoinRecordsEntityActionSchema,
} from "./schema-types.ts";

type EntityActionParseContext = {
  entityName: string;
  actionName: string;
  entity: EntitySchema;
  queries: Record<string, CollectionQuerySchema>;
  relationships: Record<string, RelationshipSchema> | undefined;
};

type EntityActionKindModule<TAction extends EntityActionSchema = EntityActionSchema> = {
  kind: TAction["kind"];
  capabilities: EntityActionCapabilities;
  parse: (context: EntityActionParseContext, value: Record<string, unknown>) => TAction;
};

const entityActionKindModules = [
  {
    kind: "clear-completed",
    capabilities: { createAfterCreateHook: false },
    parse: parseClearCompletedEntityAction,
  },
  {
    kind: "create-missing-join-records",
    capabilities: { createAfterCreateHook: true },
    parse: parseCreateMissingJoinRecordsEntityAction,
  },
  {
    kind: "create-selected-join-record",
    capabilities: { createAfterCreateHook: false },
    parse: parseCreateSelectedJoinRecordEntityAction,
  },
  {
    kind: "remove-selected-join-records",
    capabilities: { createAfterCreateHook: false },
    parse: parseRemoveSelectedJoinRecordsEntityAction,
  },
] satisfies EntityActionKindModule[];

export function getEntityActionKindCapabilities(kind: EntityActionKind): EntityActionCapabilities {
  return requireEntityActionKindModule(kind).capabilities;
}

export function parseEntityActionsForEntities(
  entities: Record<string, EntitySchema>,
  actionInputsByEntity: Record<string, unknown>,
  queries: Record<string, CollectionQuerySchema>,
  relationships: Record<string, RelationshipSchema> | undefined,
): Record<string, EntitySchema> {
  const parsedEntities = Object.fromEntries(
    Object.entries(entities).map(([entityName, entity]) => {
      const actions = parseEntityActions(
        entityName,
        actionInputsByEntity[entityName],
        entity,
        queries,
        relationships,
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
  relationships: Record<string, RelationshipSchema> | undefined,
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

      return [
        actionName,
        parseEntityAction(entityName, actionName, action, entity, queries, relationships),
      ];
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
  relationships: Record<string, RelationshipSchema> | undefined,
): EntityActionSchema {
  if (!isRecord(value)) {
    throw new Error(`Entity action "${entityName}.${actionName}" must be an object.`);
  }

  if (typeof value.label !== "string" || value.label.trim() === "") {
    throw new Error(
      `Entity action "${entityName}.${actionName}" label must be a non-empty string.`,
    );
  }

  const actionKind = getEntityActionKindModule(value.kind);
  if (actionKind) {
    return actionKind.parse(
      {
        entityName,
        actionName,
        entity,
        queries,
        relationships,
      },
      value,
    );
  }

  throw new Error(
    `Entity action "${entityName}.${actionName}" has unsupported kind "${String(value.kind)}".`,
  );
}

function parseClearCompletedEntityAction(
  context: EntityActionParseContext,
  value: Record<string, unknown>,
): ClearCompletedEntityActionSchema {
  const { actionName, entity, entityName, queries } = context;

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
  context: EntityActionParseContext,
  value: Record<string, unknown>,
): CreateMissingJoinRecordsEntityActionSchema {
  const { actionName, entity, entityName, queries } = context;

  assertExactKeys(`Entity action "${entityName}.${actionName}"`, value, ["label", "kind", "join"]);

  const join = parseEntityActionJoin(entityName, actionName, value.join, entity, queries);
  validateCreateMissingJoinRecordDefaults(entityName, actionName, entity, join);

  return {
    label: value.label as string,
    kind: "create-missing-join-records",
    join,
  };
}

function parseCreateSelectedJoinRecordEntityAction(
  context: EntityActionParseContext,
  value: Record<string, unknown>,
): CreateSelectedJoinRecordEntityActionSchema {
  const { actionName, entity, entityName, relationships } = context;

  assertExactKeys(`Entity action "${entityName}.${actionName}"`, value, [
    "label",
    "kind",
    "relationship",
  ]);

  const relationshipName = parseRequiredNonEmptyString(
    `Entity action "${entityName}.${actionName}" relationship`,
    value.relationship,
  );
  const relationship = requireManyToManyActionRelationship(
    entityName,
    actionName,
    relationshipName,
    relationships,
  );
  validateCreateSelectedJoinRecordDefaults(entityName, actionName, entity, relationship);

  return {
    label: value.label as string,
    kind: "create-selected-join-record",
    relationship: relationshipName,
  };
}

function parseRemoveSelectedJoinRecordsEntityAction(
  context: EntityActionParseContext,
  value: Record<string, unknown>,
): RemoveSelectedJoinRecordsEntityActionSchema {
  const { actionName, entityName, relationships } = context;

  assertExactKeys(`Entity action "${entityName}.${actionName}"`, value, [
    "label",
    "kind",
    "relationship",
  ]);

  const relationshipName = parseRequiredNonEmptyString(
    `Entity action "${entityName}.${actionName}" relationship`,
    value.relationship,
  );
  requireManyToManyActionRelationship(entityName, actionName, relationshipName, relationships);

  return {
    label: value.label as string,
    kind: "remove-selected-join-records",
    relationship: relationshipName,
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

function validateCreateSelectedJoinRecordDefaults(
  entityName: string,
  actionName: string,
  entity: EntitySchema,
  relationship: Extract<RelationshipSchema, { kind: "manyToMany" }>,
) {
  validateJoinRecordDefaults(entityName, actionName, entity, [
    relationship.through.fromField,
    relationship.through.toField,
  ]);
}

function validateJoinRecordDefaults(
  entityName: string,
  actionName: string,
  entity: EntitySchema,
  joinFieldNames: string[],
) {
  const joinFields = new Set(joinFieldNames);

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    if (joinFields.has(fieldName) || !field.required || fieldHasCreateDefault(field)) {
      continue;
    }

    throw new Error(
      `Entity action "${entityName}.${actionName}" kind "create-selected-join-record" requires field "${fieldName}" to have a default.`,
    );
  }
}

function requireManyToManyActionRelationship(
  entityName: string,
  actionName: string,
  relationshipName: string,
  relationships: Record<string, RelationshipSchema> | undefined,
): Extract<RelationshipSchema, { kind: "manyToMany" }> {
  const relationship = relationships?.[relationshipName];

  if (!relationship) {
    throw new Error(
      `Entity action "${entityName}.${actionName}" references unknown relationship "${relationshipName}".`,
    );
  }

  if (relationship.kind !== "manyToMany") {
    throw new Error(
      `Entity action "${entityName}.${actionName}" relationship "${relationshipName}" must be manyToMany.`,
    );
  }

  if (relationship.through.entity !== entityName) {
    throw new Error(
      `Entity action "${entityName}.${actionName}" relationship "${relationshipName}" uses through entity "${relationship.through.entity}", not "${entityName}".`,
    );
  }

  return relationship;
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

      if (!getEntityActionCapabilities(action).createAfterCreateHook) {
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

function getEntityActionCapabilities(action: EntityActionSchema): EntityActionCapabilities {
  return getEntityActionKindCapabilities(action.kind);
}

function requireEntityActionKindModule(kind: EntityActionKind): EntityActionKindModule {
  const actionKind = getEntityActionKindModule(kind);

  if (!actionKind) {
    throw new Error(`Unsupported action kind "${kind}".`);
  }

  return actionKind;
}

function getEntityActionKindModule(kind: unknown): EntityActionKindModule | undefined {
  return entityActionKindModules.find((actionKind) => actionKind.kind === kind);
}

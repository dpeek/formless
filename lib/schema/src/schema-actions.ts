import { fieldRefsEqual } from "./fields.ts";
import { fieldHasCreateDefault } from "./field-types.ts";
import type { QueryExpression } from "./types.ts";
import { collectQueryContextNames } from "./query.ts";
import {
  assertExactKeys,
  isRecord,
  parseOptionalNonEmptyString,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import type {
  ActionAccessPolicySchema,
  ActionChallengePolicySchema,
  ActionOriginPolicySchema,
  ClearCompletedEntityActionSchema,
  CollectionQuerySchema,
  CreateMissingJoinRecordsEntityActionSchema,
  CreateSelectedJoinRecordEntityActionSchema,
  CreateTreeChildEntityActionSchema,
  EntityActionCapabilities,
  EntityActionExposureSchema,
  EntityActionJoinSchema,
  EntityActionJoinSourceSchema,
  EntityActionKind,
  EntityActionRuntimeMetadata,
  EntityActionSchemaForKind,
  EntityActionSchema,
  EntityActionTargetSchema,
  EntitySchema,
  PublicOperationEnumInputFieldSchema,
  PublicOperationInputContractSchema,
  PublicOperationInputFieldSchema,
  RelationshipSchema,
  RemoveSelectedJoinRecordsEntityActionSchema,
  RemoveTreePlacementEntityActionSchema,
  SchemaActionActorKind,
  SubscribeEntityActionSchema,
  TransitionStateEntityActionSchema,
} from "./types.ts";

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

type EntityActionKindModuleMap = {
  [Kind in EntityActionKind]: EntityActionKindModule<EntityActionSchemaForKind<Kind>>;
};

const entityActionKindModules = {
  "clear-completed": {
    kind: "clear-completed",
    capabilities: { createAfterCreateHook: false, publicExecution: false },
    parse: parseClearCompletedEntityAction,
  },
  "create-missing-join-records": {
    kind: "create-missing-join-records",
    capabilities: { createAfterCreateHook: true, publicExecution: false },
    parse: parseCreateMissingJoinRecordsEntityAction,
  },
  "create-selected-join-record": {
    kind: "create-selected-join-record",
    capabilities: { createAfterCreateHook: false, publicExecution: false },
    parse: parseCreateSelectedJoinRecordEntityAction,
  },
  "remove-selected-join-records": {
    kind: "remove-selected-join-records",
    capabilities: { createAfterCreateHook: false, publicExecution: false },
    parse: parseRemoveSelectedJoinRecordsEntityAction,
  },
  "create-tree-child": {
    kind: "create-tree-child",
    capabilities: { createAfterCreateHook: false, publicExecution: false },
    parse: parseCreateTreeChildEntityAction,
  },
  "remove-tree-placement": {
    kind: "remove-tree-placement",
    capabilities: { createAfterCreateHook: false, publicExecution: false },
    parse: parseRemoveTreePlacementEntityAction,
  },
  subscribe: {
    kind: "subscribe",
    capabilities: { createAfterCreateHook: false, publicExecution: true },
    parse: parseSubscribeEntityAction,
  },
  "transition-state": {
    kind: "transition-state",
    capabilities: { createAfterCreateHook: false, publicExecution: false },
    parse: parseTransitionStateEntityAction,
  },
} satisfies EntityActionKindModuleMap;

const publicOperationPolicyKeys = ["access", "publicInput"];

const schemaActionActorKinds = [
  "admin",
  "cliDeployer",
  "owner",
  "runner",
] as const satisfies readonly SchemaActionActorKind[];

export function getEntityActionKindCapabilities(kind: EntityActionKind): EntityActionCapabilities {
  return entityActionKindModules[kind].capabilities;
}

export function isEntityActionExposedToActor(
  action: EntityActionSchema,
  actorKind: SchemaActionActorKind,
) {
  return action.exposure?.actors.includes(actorKind) ?? true;
}

export function isEntityActionVisibleToBrowser(action: EntityActionSchema) {
  return (
    action.exposure === undefined ||
    action.exposure.actors.includes("admin") ||
    action.exposure.actors.includes("owner")
  );
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
    ["exposure", "target", ...publicOperationPolicyKeys],
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
    ...parseEntityActionPublicOptions(
      context,
      value,
      getEntityActionKindCapabilities("clear-completed"),
    ),
    ...parseEntityActionRuntimeMetadata(entityName, actionName, value, entity),
  };
}

function parseCreateMissingJoinRecordsEntityAction(
  context: EntityActionParseContext,
  value: Record<string, unknown>,
): CreateMissingJoinRecordsEntityActionSchema {
  const { actionName, entity, entityName, queries } = context;

  assertExactKeys(
    `Entity action "${entityName}.${actionName}"`,
    value,
    ["label", "kind", "join"],
    ["exposure", ...publicOperationPolicyKeys],
  );

  const join = parseEntityActionJoin(entityName, actionName, value.join, entity, queries);
  validateCreateMissingJoinRecordDefaults(entityName, actionName, entity, join);

  return {
    label: value.label as string,
    kind: "create-missing-join-records",
    join,
    ...parseEntityActionPublicOptions(
      context,
      value,
      getEntityActionKindCapabilities("create-missing-join-records"),
    ),
    ...parseEntityActionRuntimeMetadata(entityName, actionName, value, entity),
  };
}

function parseCreateSelectedJoinRecordEntityAction(
  context: EntityActionParseContext,
  value: Record<string, unknown>,
): CreateSelectedJoinRecordEntityActionSchema {
  const { actionName, entity, entityName, relationships } = context;

  assertExactKeys(
    `Entity action "${entityName}.${actionName}"`,
    value,
    ["label", "kind", "relationship"],
    ["exposure", ...publicOperationPolicyKeys],
  );

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
    ...parseEntityActionPublicOptions(
      context,
      value,
      getEntityActionKindCapabilities("create-selected-join-record"),
    ),
    ...parseEntityActionRuntimeMetadata(entityName, actionName, value, entity),
  };
}

function parseRemoveSelectedJoinRecordsEntityAction(
  context: EntityActionParseContext,
  value: Record<string, unknown>,
): RemoveSelectedJoinRecordsEntityActionSchema {
  const { actionName, entity, entityName, relationships } = context;

  assertExactKeys(
    `Entity action "${entityName}.${actionName}"`,
    value,
    ["label", "kind", "relationship"],
    ["exposure", ...publicOperationPolicyKeys],
  );

  const relationshipName = parseRequiredNonEmptyString(
    `Entity action "${entityName}.${actionName}" relationship`,
    value.relationship,
  );
  requireManyToManyActionRelationship(entityName, actionName, relationshipName, relationships);

  return {
    label: value.label as string,
    kind: "remove-selected-join-records",
    relationship: relationshipName,
    ...parseEntityActionPublicOptions(
      context,
      value,
      getEntityActionKindCapabilities("remove-selected-join-records"),
    ),
    ...parseEntityActionRuntimeMetadata(entityName, actionName, value, entity),
  };
}

function parseCreateTreeChildEntityAction(
  context: EntityActionParseContext,
  value: Record<string, unknown>,
): CreateTreeChildEntityActionSchema {
  const { actionName, entity, entityName, relationships } = context;

  assertExactKeys(
    `Entity action "${entityName}.${actionName}"`,
    value,
    ["label", "kind", "relationship", "childField"],
    ["exposure", "orderField", ...publicOperationPolicyKeys],
  );

  const relationshipName = parseRequiredNonEmptyString(
    `Entity action "${entityName}.${actionName}" relationship`,
    value.relationship,
  );
  const relationship = requireToManyActionRelationship(
    entityName,
    actionName,
    relationshipName,
    relationships,
  );
  const childFieldName = parseRequiredNonEmptyString(
    `Entity action "${entityName}.${actionName}" childField`,
    value.childField,
  );
  const childField = entity.fields[childFieldName];

  if (!childField) {
    throw new Error(
      `Entity action "${entityName}.${actionName}" childField references unknown field "${childFieldName}".`,
    );
  }

  if (childField.type !== "reference") {
    throw new Error(
      `Entity action "${entityName}.${actionName}" childField must be a reference field.`,
    );
  }

  if (childField.to !== relationship.from.entity) {
    throw new Error(
      `Entity action "${entityName}.${actionName}" childField must reference entity "${relationship.from.entity}".`,
    );
  }

  const orderFieldName = parseOptionalNonEmptyString(
    `Entity action "${entityName}.${actionName}" orderField`,
    value.orderField,
  );
  const orderField = orderFieldName === undefined ? undefined : entity.fields[orderFieldName];

  if (orderFieldName !== undefined && !orderField) {
    throw new Error(
      `Entity action "${entityName}.${actionName}" orderField references unknown field "${orderFieldName}".`,
    );
  }

  if (orderFieldName !== undefined && orderField?.type !== "number") {
    throw new Error(
      `Entity action "${entityName}.${actionName}" orderField must be a number field.`,
    );
  }

  return {
    label: value.label as string,
    kind: "create-tree-child",
    relationship: relationshipName,
    childField: childFieldName,
    ...(orderFieldName === undefined ? {} : { orderField: orderFieldName }),
    ...parseEntityActionPublicOptions(
      context,
      value,
      getEntityActionKindCapabilities("create-tree-child"),
    ),
    ...parseEntityActionRuntimeMetadata(entityName, actionName, value, entity),
  };
}

function parseRemoveTreePlacementEntityAction(
  context: EntityActionParseContext,
  value: Record<string, unknown>,
): RemoveTreePlacementEntityActionSchema {
  const { actionName, entity, entityName, relationships } = context;

  assertExactKeys(
    `Entity action "${entityName}.${actionName}"`,
    value,
    ["label", "kind", "relationship"],
    ["exposure", ...publicOperationPolicyKeys],
  );

  const relationshipName = parseRequiredNonEmptyString(
    `Entity action "${entityName}.${actionName}" relationship`,
    value.relationship,
  );
  requireToManyActionRelationship(entityName, actionName, relationshipName, relationships);

  return {
    label: value.label as string,
    kind: "remove-tree-placement",
    relationship: relationshipName,
    ...parseEntityActionPublicOptions(
      context,
      value,
      getEntityActionKindCapabilities("remove-tree-placement"),
    ),
    ...parseEntityActionRuntimeMetadata(entityName, actionName, value, entity),
  };
}

function parseSubscribeEntityAction(
  context: EntityActionParseContext,
  value: Record<string, unknown>,
): SubscribeEntityActionSchema {
  const { actionName, entity, entityName } = context;

  assertExactKeys(
    `Entity action "${entityName}.${actionName}"`,
    value,
    ["label", "kind"],
    ["exposure", ...publicOperationPolicyKeys],
  );

  return {
    label: value.label as string,
    kind: "subscribe",
    ...parseEntityActionPublicOptions(context, value, getEntityActionKindCapabilities("subscribe")),
    ...parseEntityActionRuntimeMetadata(entityName, actionName, value, entity),
  };
}

function parseTransitionStateEntityAction(
  context: EntityActionParseContext,
  value: Record<string, unknown>,
): TransitionStateEntityActionSchema {
  const { actionName, entity, entityName } = context;
  const actionContext = `Entity action "${entityName}.${actionName}"`;

  assertExactKeys(
    actionContext,
    value,
    ["label", "kind", "machine", "transition"],
    ["exposure", ...publicOperationPolicyKeys],
  );

  const machineName = parseRequiredNonEmptyString(`${actionContext} machine`, value.machine);
  const transitionName = parseRequiredNonEmptyString(
    `${actionContext} transition`,
    value.transition,
  );
  const stateMachine = entity.stateMachines?.[machineName];

  if (!stateMachine) {
    throw new Error(`${actionContext} references unknown state machine "${machineName}".`);
  }

  if (!stateMachine.transitions[transitionName]) {
    throw new Error(
      `${actionContext} references unknown transition "${machineName}.${transitionName}".`,
    );
  }

  return {
    label: value.label as string,
    kind: "transition-state",
    machine: machineName,
    transition: transitionName,
    ...parseEntityActionPublicOptions(
      context,
      value,
      getEntityActionKindCapabilities("transition-state"),
    ),
    ...parseEntityActionRuntimeMetadata(entityName, actionName, value, entity),
  };
}

function parseEntityActionPublicOptions(
  context: EntityActionParseContext,
  value: Record<string, unknown>,
  capabilities: EntityActionCapabilities,
): Pick<EntityActionSchema, "access" | "publicInput"> {
  const actionContext = `Entity action "${context.entityName}.${context.actionName}"`;
  const access = parseOptionalActionAccessPolicy(`${actionContext} access`, value.access);
  const publicInput = parseOptionalPublicOperationInputContract(
    `${actionContext} publicInput`,
    value.publicInput,
  );

  if (publicInput !== undefined && access === undefined) {
    throw new Error(`${actionContext} publicInput requires access.`);
  }

  if (access !== undefined) {
    if (!capabilities.publicExecution) {
      throw new Error(
        `${actionContext} kind "${String(value.kind)}" is not eligible for public execution.`,
      );
    }

    if (publicInput === undefined) {
      throw new Error(`${actionContext} with anonymous access must declare publicInput.`);
    }
  }

  return {
    ...(access === undefined ? {} : { access }),
    ...(publicInput === undefined ? {} : { publicInput }),
  };
}

function parseOptionalActionAccessPolicy(
  context: string,
  value: unknown,
): ActionAccessPolicySchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["actor", "challenge", "origin"]);

  if (value.actor !== "anonymous") {
    throw new Error(`${context} actor must be "anonymous".`);
  }

  return {
    actor: "anonymous",
    challenge: parseActionChallengePolicy(`${context} challenge`, value.challenge),
    origin: parseActionOriginPolicy(`${context} origin`, value.origin),
  };
}

function parseActionChallengePolicy(context: string, value: unknown): ActionChallengePolicySchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["kind"]);

  if (value.kind !== "turnstile") {
    throw new Error(`${context} kind must be "turnstile".`);
  }

  return { kind: "turnstile" };
}

function parseActionOriginPolicy(context: string, value: unknown): ActionOriginPolicySchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["kind"]);

  if (value.kind !== "same-origin") {
    throw new Error(`${context} kind must be "same-origin".`);
  }

  return { kind: "same-origin" };
}

function parseOptionalPublicOperationInputContract(
  context: string,
  value: unknown,
): PublicOperationInputContractSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["fields"]);

  return {
    fields: parsePublicOperationInputFields(`${context} fields`, value.fields),
  };
}

function parsePublicOperationInputFields(
  context: string,
  value: unknown,
): Record<string, PublicOperationInputFieldSchema> {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new Error(`${context} must not be empty.`);
  }

  return Object.fromEntries(
    entries.map(([fieldName, field]) => {
      if (fieldName.trim() === "") {
        throw new Error(`${context} names must be non-empty.`);
      }

      return [fieldName, parsePublicOperationInputField(`${context}.${fieldName}`, field)];
    }),
  );
}

function parsePublicOperationInputField(
  context: string,
  value: unknown,
): PublicOperationInputFieldSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (typeof value.required !== "boolean") {
    throw new Error(`${context} must declare whether it is required.`);
  }

  const label = parsePublicOperationInputFieldLabel(`${context} label`, value.label);

  if (value.type === "text") {
    assertExactKeys(context, value, ["type", "required"], ["label"]);
    return { type: "text", required: value.required, ...(label === undefined ? {} : { label }) };
  }

  if (value.type === "boolean") {
    assertExactKeys(context, value, ["type", "required"], ["label"]);
    return {
      type: "boolean",
      required: value.required,
      ...(label === undefined ? {} : { label }),
    };
  }

  if (value.type === "date") {
    assertExactKeys(context, value, ["type", "required"], ["label"]);
    return { type: "date", required: value.required, ...(label === undefined ? {} : { label }) };
  }

  if (value.type === "number") {
    assertExactKeys(context, value, ["type", "required"], ["label"]);
    return {
      type: "number",
      required: value.required,
      ...(label === undefined ? {} : { label }),
    };
  }

  if (value.type === "enum") {
    assertExactKeys(context, value, ["type", "required", "values"], ["label"]);
    return {
      type: "enum",
      required: value.required,
      values: parsePublicOperationEnumInputValues(`${context} values`, value.values),
      ...(label === undefined ? {} : { label }),
    };
  }

  throw new Error(`${context} has unsupported type "${String(value.type)}".`);
}

function parsePublicOperationInputFieldLabel(context: string, value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value;
}

function parsePublicOperationEnumInputValues(
  context: string,
  value: unknown,
): PublicOperationEnumInputFieldSchema["values"] {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new Error(`${context} must not be empty.`);
  }

  return Object.fromEntries(
    entries.map(([enumValue, enumValueSchema]) => {
      if (enumValue.trim() === "") {
        throw new Error(`${context} keys must be non-empty.`);
      }

      if (!isRecord(enumValueSchema)) {
        throw new Error(`${context}.${enumValue} must be an object.`);
      }

      assertExactKeys(`${context}.${enumValue}`, enumValueSchema, ["label"]);

      const label = enumValueSchema.label;
      if (typeof label !== "string" || label.trim() === "") {
        throw new Error(`${context}.${enumValue} label must be a non-empty string.`);
      }

      return [enumValue, { label }];
    }),
  );
}

function parseEntityActionRuntimeMetadata(
  entityName: string,
  actionName: string,
  value: Record<string, unknown>,
  entity: EntitySchema,
): EntityActionRuntimeMetadata {
  const exposure = parseEntityActionExposure(entityName, actionName, value.exposure, entity);

  return exposure === undefined ? {} : { exposure };
}

function parseEntityActionExposure(
  entityName: string,
  actionName: string,
  value: unknown,
  entity: EntitySchema,
): EntityActionExposureSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  const context = `Entity action "${entityName}.${actionName}" exposure`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["actors"], ["responseFields"]);

  const actors = parseActionActorKinds(`${context} actors`, value.actors);
  const responseFields = parseActionResponseFields(
    `${context} responseFields`,
    value.responseFields,
    entity,
    actors,
  );

  return {
    actors,
    ...(responseFields === undefined ? {} : { responseFields }),
  };
}

function parseActionActorKinds(context: string, value: unknown): SchemaActionActorKind[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} must be a non-empty array.`);
  }

  const actors = value.map((actor, index) => {
    if (!isSchemaActionActorKind(actor)) {
      throw new Error(`${context}[${index}] must be owner, admin, cliDeployer, or runner.`);
    }

    return actor;
  });

  if (new Set(actors).size !== actors.length) {
    throw new Error(`${context} must be unique.`);
  }

  return actors;
}

function parseActionResponseFields(
  context: string,
  value: unknown,
  entity: EntitySchema,
  actors: SchemaActionActorKind[],
): EntityActionExposureSchema["responseFields"] {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const fieldsByActor: Partial<Record<SchemaActionActorKind, string[]>> = {};

  for (const [actor, fields] of Object.entries(value)) {
    if (!isSchemaActionActorKind(actor)) {
      throw new Error(`${context} has unsupported actor "${actor}".`);
    }

    if (!actors.includes(actor)) {
      throw new Error(`${context}.${actor} must reference an exposed actor.`);
    }

    fieldsByActor[actor] = parseActionResponseFieldList(`${context}.${actor}`, fields, entity);
  }

  if (Object.keys(fieldsByActor).length === 0) {
    throw new Error(`${context} must not be empty.`);
  }

  return fieldsByActor;
}

function parseActionResponseFieldList(
  context: string,
  value: unknown,
  entity: EntitySchema,
): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} must be a non-empty array.`);
  }

  const fields = value.map((fieldName, index) => {
    const field = parseRequiredNonEmptyString(`${context}[${index}]`, fieldName);

    if (!entity.fields[field]) {
      throw new Error(`${context}[${index}] references unknown field "${field}".`);
    }

    return field;
  });

  if (new Set(fields).size !== fields.length) {
    throw new Error(`${context} must be unique.`);
  }

  return fields;
}

function isSchemaActionActorKind(value: unknown): value is SchemaActionActorKind {
  return schemaActionActorKinds.includes(value as SchemaActionActorKind);
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

function requireToManyActionRelationship(
  entityName: string,
  actionName: string,
  relationshipName: string,
  relationships: Record<string, RelationshipSchema> | undefined,
): Extract<RelationshipSchema, { kind: "toMany" }> {
  const relationship = relationships?.[relationshipName];

  if (!relationship) {
    throw new Error(
      `Entity action "${entityName}.${actionName}" references unknown relationship "${relationshipName}".`,
    );
  }

  if (relationship.kind !== "toMany") {
    throw new Error(
      `Entity action "${entityName}.${actionName}" relationship "${relationshipName}" must be toMany.`,
    );
  }

  if (relationship.to.entity !== entityName) {
    throw new Error(
      `Entity action "${entityName}.${actionName}" relationship "${relationshipName}" targets entity "${relationship.to.entity}", not "${entityName}".`,
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

function getEntityActionKindModule(kind: unknown): EntityActionKindModule | undefined {
  if (!isEntityActionKind(kind)) {
    return undefined;
  }

  return entityActionKindModules[kind];
}

function isEntityActionKind(kind: unknown): kind is EntityActionKind {
  return typeof kind === "string" && kind in entityActionKindModules;
}

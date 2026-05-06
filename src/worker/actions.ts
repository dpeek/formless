import type {
  ActionRequest,
  ActionRequestInput,
  ActionResponse,
  CreateSelectedJoinRecordActionInput,
  RemoveSelectedJoinRecordsActionInput,
  CreateMutation,
  RecordValues,
  StoredRecord,
} from "../shared/protocol.ts";
import { fieldCreateDefaultValue } from "../shared/field-types.ts";
import { matchesQuery } from "../shared/query.ts";
import type {
  AfterCreateHookSchema,
  AppSchema,
  EntityActionKind,
  EntityActionSchema,
  EntitySchema,
  ManyToManyRelationshipSchema,
} from "../shared/schema.ts";
import { assertUniqueConstraints } from "./constraints.ts";
import { BadRequestError } from "./errors.ts";
import {
  createRecordsForActionOutcome,
  type CreateMutationCausedRecordWriter,
  getActionResponseById,
  getActiveRecordsByEntity,
  getStoredRecord,
  replayedWrite,
  tombstoneRecordsForActionOutcome,
  type WriteOutcome,
} from "./storage.ts";

type EntityActionRequestInputValidationContext<TAction extends EntityActionSchema> = {
  actionName: string;
  entityName: string;
  entity: EntitySchema;
  action: TAction;
  value: unknown;
};

type EntityActionExecutionContext<TAction extends EntityActionSchema> = {
  storage: DurableObjectStorage;
  request: ActionRequest;
  schema: AppSchema;
  action: TAction;
};

type EntityActionCreateAfterCreateHookContext<TAction extends EntityActionSchema> = {
  storage: DurableObjectStorage;
  mutation: CreateMutation;
  schema: AppSchema;
  hook: AfterCreateHookSchema;
  action: TAction;
  createRecords: CreateMutationCausedRecordWriter;
};

type EntityActionKindRuntimeModule<TAction extends EntityActionSchema = EntityActionSchema> = {
  kind: TAction["kind"];
  validateInput: (
    context: EntityActionRequestInputValidationContext<TAction>,
  ) => ActionRequestInput | undefined;
  execute: (context: EntityActionExecutionContext<TAction>) => WriteOutcome<ActionResponse>;
  executeCreateAfterCreateHook?: (
    context: EntityActionCreateAfterCreateHookContext<TAction>,
  ) => void;
};

type EntityActionKindRuntimeModuleUnion = {
  [Kind in EntityActionKind]: EntityActionKindRuntimeModule<
    Extract<EntityActionSchema, { kind: Kind }>
  >;
}[EntityActionKind];

const entityActionKindRuntimeModules = [
  {
    kind: "clear-completed",
    validateInput: validateClearCompletedActionInput,
    execute: executeClearCompletedAction,
  },
  {
    kind: "create-missing-join-records",
    validateInput: validateNoActionInput,
    execute: executeCreateMissingJoinRecordsAction,
    executeCreateAfterCreateHook: executeCreateMissingJoinRecordsAfterCreateHook,
  },
  {
    kind: "create-selected-join-record",
    validateInput: validateCreateSelectedJoinRecordActionInput,
    execute: executeCreateSelectedJoinRecordAction,
  },
  {
    kind: "remove-selected-join-records",
    validateInput: validateRemoveSelectedJoinRecordsActionInput,
    execute: executeRemoveSelectedJoinRecordsAction,
  },
] satisfies EntityActionKindRuntimeModuleUnion[];

export function executeEntityAction(
  storage: DurableObjectStorage,
  request: ActionRequest,
  schema: AppSchema,
): ActionResponse {
  return executeEntityActionOutcome(storage, request, schema).response;
}

export function validateEntityActionRequest(value: unknown, schema: AppSchema): ActionRequest {
  if (!isRecord(value)) {
    throw new BadRequestError("Action request must be an object.");
  }

  if (typeof value.actionId !== "string" || value.actionId.trim() === "") {
    throw new BadRequestError("Action request must include a non-empty actionId.");
  }

  if (typeof value.entity !== "string" || value.entity.trim() === "") {
    throw new BadRequestError("Action request must include an entity.");
  }

  const entity = schema.entities[value.entity];
  if (!entity) {
    throw new BadRequestError(`Unknown entity "${value.entity}".`);
  }

  if (typeof value.action !== "string" || value.action.trim() === "") {
    throw new BadRequestError("Action request must include an action.");
  }

  const action = entity.actions?.[value.action];
  if (!action) {
    throw new BadRequestError(`Unknown action "${value.action}" for entity "${value.entity}".`);
  }

  const input = getEntityActionKindRuntimeModule(action).validateInput({
    actionName: value.action,
    entityName: value.entity,
    entity,
    action,
    value: value.input,
  });

  return {
    actionId: value.actionId,
    entity: value.entity,
    action: value.action,
    ...(input === undefined ? {} : { input }),
  };
}

export function executeEntityActionOutcome(
  storage: DurableObjectStorage,
  request: ActionRequest,
  schema: AppSchema,
): WriteOutcome<ActionResponse> {
  const replay = getActionResponseById(storage, request.actionId);
  if (replay) {
    return replayedWrite(replay);
  }

  const action = schema.entities[request.entity]?.actions?.[request.action];

  if (!action) {
    throw new Error(`Unsupported action "${request.action}".`);
  }

  return getEntityActionKindRuntimeModule(action).execute({ storage, request, schema, action });
}

export function executeCreateAfterCreateHooks(
  storage: DurableObjectStorage,
  mutation: CreateMutation,
  schema: AppSchema,
  createRecords: CreateMutationCausedRecordWriter,
) {
  const hooks = schema.entities[mutation.entity]?.mutations.create.afterCreate ?? [];

  for (const hook of hooks) {
    executeCreateAfterCreateHook(storage, mutation, schema, hook, createRecords);
  }
}

function executeCreateAfterCreateHook(
  storage: DurableObjectStorage,
  mutation: CreateMutation,
  schema: AppSchema,
  hook: AfterCreateHookSchema,
  createRecords: CreateMutationCausedRecordWriter,
) {
  const action = schema.entities[hook.entity]?.actions?.[hook.action];

  if (!action) {
    throw new Error(
      `Create hook "${mutation.entity}.${mutation.mutationId}" references unsupported action "${hook.entity}.${hook.action}".`,
    );
  }

  const actionModule = getEntityActionKindRuntimeModule(action);

  if (!actionModule.executeCreateAfterCreateHook) {
    throw new Error(
      `Create hook "${mutation.entity}.${mutation.mutationId}" references unsupported action "${hook.entity}.${hook.action}".`,
    );
  }

  actionModule.executeCreateAfterCreateHook({
    storage,
    mutation,
    schema,
    hook,
    action,
    createRecords,
  });
}

function executeClearCompletedAction(
  context: EntityActionExecutionContext<Extract<EntityActionSchema, { kind: "clear-completed" }>>,
) {
  const records = selectActionTargetRecords(
    context.storage,
    context.request,
    context.schema,
    context.action,
  );

  return executeActionEffect(context.storage, context.request, records);
}

function executeCreateMissingJoinRecordsAction(
  context: EntityActionExecutionContext<
    Extract<EntityActionSchema, { kind: "create-missing-join-records" }>
  >,
) {
  const values = selectMissingJoinRecordValues(
    context.storage,
    context.request,
    context.schema,
    context.action,
  );

  return createRecordsForActionOutcome(
    context.storage,
    context.request.actionId,
    context.request.entity,
    context.request.action,
    values,
    (entity, recordValues, options) => {
      assertUniqueConstraints(context.storage, context.schema, entity, recordValues, options);
    },
  );
}

function executeCreateSelectedJoinRecordAction(
  context: EntityActionExecutionContext<
    Extract<EntityActionSchema, { kind: "create-selected-join-record" }>
  >,
) {
  const values = selectSelectedJoinRecordValues(
    context.storage,
    context.request,
    context.schema,
    context.action,
  );

  return createRecordsForActionOutcome(
    context.storage,
    context.request.actionId,
    context.request.entity,
    context.request.action,
    [values],
    (entity, recordValues, options) => {
      assertUniqueConstraints(context.storage, context.schema, entity, recordValues, options);
    },
  );
}

function executeRemoveSelectedJoinRecordsAction(
  context: EntityActionExecutionContext<
    Extract<EntityActionSchema, { kind: "remove-selected-join-records" }>
  >,
) {
  const records = selectSelectedJoinRecords(
    context.storage,
    context.request,
    context.schema,
    context.action,
  );

  return executeActionEffect(context.storage, context.request, records);
}

function executeCreateMissingJoinRecordsAfterCreateHook(
  context: EntityActionCreateAfterCreateHookContext<
    Extract<EntityActionSchema, { kind: "create-missing-join-records" }>
  >,
) {
  const request: ActionRequest = {
    actionId: context.mutation.mutationId,
    entity: context.hook.entity,
    action: context.hook.action,
  };
  const values = selectMissingJoinRecordValues(
    context.storage,
    request,
    context.schema,
    context.action,
  );

  context.createRecords(context.hook.entity, values);
}

function validateClearCompletedActionInput(
  context: EntityActionRequestInputValidationContext<
    Extract<EntityActionSchema, { kind: "clear-completed" }>
  >,
) {
  if (context.entity.fields.done?.type !== "boolean") {
    throw new BadRequestError(
      `Action "${context.actionName}" requires entity "${context.entityName}" to have a boolean done field.`,
    );
  }

  return undefined;
}

function validateNoActionInput() {
  return undefined;
}

function validateCreateSelectedJoinRecordActionInput(
  context: EntityActionRequestInputValidationContext<
    Extract<EntityActionSchema, { kind: "create-selected-join-record" }>
  >,
): CreateSelectedJoinRecordActionInput {
  const value = context.value;

  if (!isRecord(value)) {
    throw new BadRequestError(
      `Action "${context.actionName}" requires input with fromRecordId and toRecordId.`,
    );
  }

  if (typeof value.fromRecordId !== "string" || value.fromRecordId.trim() === "") {
    throw new BadRequestError(
      `Action "${context.actionName}" input fromRecordId must be non-empty.`,
    );
  }

  if (typeof value.toRecordId !== "string" || value.toRecordId.trim() === "") {
    throw new BadRequestError(`Action "${context.actionName}" input toRecordId must be non-empty.`);
  }

  return {
    fromRecordId: value.fromRecordId,
    toRecordId: value.toRecordId,
  };
}

function validateRemoveSelectedJoinRecordsActionInput(
  context: EntityActionRequestInputValidationContext<
    Extract<EntityActionSchema, { kind: "remove-selected-join-records" }>
  >,
): RemoveSelectedJoinRecordsActionInput {
  const value = context.value;

  if (!isRecord(value) || !Array.isArray(value.recordIds)) {
    throw new BadRequestError(`Action "${context.actionName}" requires input with recordIds.`);
  }

  if (value.recordIds.length === 0) {
    throw new BadRequestError(`Action "${context.actionName}" input recordIds must not be empty.`);
  }

  const seen = new Set<string>();
  const recordIds = value.recordIds.map((recordId, index) => {
    if (typeof recordId !== "string" || recordId.trim() === "") {
      throw new BadRequestError(
        `Action "${context.actionName}" input recordIds[${index}] must be non-empty.`,
      );
    }

    if (seen.has(recordId)) {
      throw new BadRequestError(
        `Action "${context.actionName}" input recordIds must not contain duplicates.`,
      );
    }

    seen.add(recordId);

    return recordId;
  });

  return { recordIds };
}

function selectActionTargetRecords(
  storage: DurableObjectStorage,
  request: ActionRequest,
  schema: AppSchema,
  action: Extract<EntityActionSchema, { kind: "clear-completed" }>,
): StoredRecord[] {
  const targetQuery = schema.queries[action.target.query];

  if (!targetQuery) {
    throw new Error(
      `Action "${request.action}" references unknown query "${action.target.query}".`,
    );
  }

  return getActiveRecordsByEntity(storage, request.entity).filter((record) =>
    matchesQuery(record, targetQuery.expression),
  );
}

export function selectMissingJoinRecordValues(
  storage: DurableObjectStorage,
  request: ActionRequest,
  schema: AppSchema,
  action: Extract<EntityActionSchema, { kind: "create-missing-join-records" }>,
): RecordValues[] {
  const entity = schema.entities[request.entity];

  if (!entity) {
    throw new Error(`Missing entity "${request.entity}".`);
  }

  const leftQuery = schema.queries[action.join.left.query];
  const rightQuery = schema.queries[action.join.right.query];

  if (!leftQuery || !rightQuery) {
    throw new Error(`Action "${request.action}" references unknown join query.`);
  }

  const leftRecords = getActiveRecordsByEntity(storage, leftQuery.entity).filter((record) =>
    matchesQuery(record, leftQuery.expression),
  );
  const rightRecords = getActiveRecordsByEntity(storage, rightQuery.entity).filter((record) =>
    matchesQuery(record, rightQuery.expression),
  );
  const existingPairs = new Set(
    getActiveRecordsByEntity(storage, request.entity)
      .map((record) => joinPairKey(record, action))
      .filter((key): key is string => key !== undefined),
  );
  const values: RecordValues[] = [];

  for (const leftRecord of leftRecords) {
    for (const rightRecord of rightRecords) {
      const pairKey = createJoinPairKey(leftRecord.id, rightRecord.id);

      if (existingPairs.has(pairKey)) {
        continue;
      }

      existingPairs.add(pairKey);
      values.push(
        createJoinRecordValues(
          entity,
          action.join.left.field,
          action.join.right.field,
          leftRecord.id,
          rightRecord.id,
        ),
      );
    }
  }

  return values;
}

function joinPairKey(
  record: StoredRecord,
  action: Extract<EntityActionSchema, { kind: "create-missing-join-records" }>,
) {
  const leftValue = record.values[action.join.left.field];
  const rightValue = record.values[action.join.right.field];

  return typeof leftValue === "string" && typeof rightValue === "string"
    ? createJoinPairKey(leftValue, rightValue)
    : undefined;
}

function createJoinPairKey(leftRecordId: string, rightRecordId: string) {
  return `${leftRecordId}\u0000${rightRecordId}`;
}

function createJoinRecordValues(
  entity: EntitySchema,
  leftField: string,
  rightField: string,
  leftRecordId: string,
  rightRecordId: string,
): RecordValues {
  const values: RecordValues = {};

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    if (fieldName === leftField) {
      values[fieldName] = leftRecordId;
      continue;
    }

    if (fieldName === rightField) {
      values[fieldName] = rightRecordId;
      continue;
    }

    const defaultValue = fieldCreateDefaultValue(field);
    if (defaultValue !== undefined) {
      values[fieldName] = defaultValue;
    }
  }

  return values;
}

function selectSelectedJoinRecordValues(
  storage: DurableObjectStorage,
  request: ActionRequest,
  schema: AppSchema,
  action: Extract<EntityActionSchema, { kind: "create-selected-join-record" }>,
): RecordValues {
  const entity = schema.entities[request.entity];

  if (!entity) {
    throw new Error(`Missing entity "${request.entity}".`);
  }

  const relationship = getManyToManyActionRelationship(schema, request, action.relationship);
  const input = requireCreateSelectedJoinRecordInput(request);
  const fromRecord = requireActiveEndpointRecord(
    storage,
    request,
    relationship.from.entity,
    input.fromRecordId,
  );
  const toRecord = requireActiveEndpointRecord(
    storage,
    request,
    relationship.to.entity,
    input.toRecordId,
  );

  return createJoinRecordValues(
    entity,
    relationship.through.fromField,
    relationship.through.toField,
    fromRecord.id,
    toRecord.id,
  );
}

function selectSelectedJoinRecords(
  storage: DurableObjectStorage,
  request: ActionRequest,
  schema: AppSchema,
  action: Extract<EntityActionSchema, { kind: "remove-selected-join-records" }>,
): StoredRecord[] {
  const relationship = getManyToManyActionRelationship(schema, request, action.relationship);
  const input = requireRemoveSelectedJoinRecordsInput(request);
  const records: StoredRecord[] = [];

  for (const recordId of input.recordIds) {
    const record = getStoredRecord(storage, recordId);

    if (!record) {
      throw new BadRequestError(
        `Action "${request.action}" references unknown join record "${recordId}".`,
      );
    }

    if (record.entity !== relationship.through.entity) {
      throw new BadRequestError(
        `Action "${request.action}" join record "${recordId}" must belong to entity "${relationship.through.entity}".`,
      );
    }

    if (record.deletedAt) {
      throw new BadRequestError(
        `Action "${request.action}" cannot remove tombstoned join record "${recordId}".`,
      );
    }

    records.push(record);
  }

  return records;
}

function getManyToManyActionRelationship(
  schema: AppSchema,
  request: ActionRequest,
  relationshipName: string,
): ManyToManyRelationshipSchema {
  const relationship = schema.relationships?.[relationshipName];

  if (!relationship) {
    throw new Error(
      `Action "${request.action}" references unknown relationship "${relationshipName}".`,
    );
  }

  if (relationship.kind !== "manyToMany") {
    throw new Error(
      `Action "${request.action}" relationship "${relationshipName}" must be manyToMany.`,
    );
  }

  if (relationship.through.entity !== request.entity) {
    throw new Error(
      `Action "${request.action}" relationship "${relationshipName}" uses through entity "${relationship.through.entity}", not "${request.entity}".`,
    );
  }

  return relationship;
}

function requireCreateSelectedJoinRecordInput(
  request: ActionRequest,
): CreateSelectedJoinRecordActionInput {
  const input = request.input;

  if (
    !input ||
    !("fromRecordId" in input) ||
    !("toRecordId" in input) ||
    typeof input.fromRecordId !== "string" ||
    typeof input.toRecordId !== "string"
  ) {
    throw new BadRequestError(
      `Action "${request.action}" requires input with fromRecordId and toRecordId.`,
    );
  }

  return {
    fromRecordId: input.fromRecordId,
    toRecordId: input.toRecordId,
  };
}

function requireRemoveSelectedJoinRecordsInput(
  request: ActionRequest,
): RemoveSelectedJoinRecordsActionInput {
  const input = request.input;

  if (!input || !("recordIds" in input) || !Array.isArray(input.recordIds)) {
    throw new BadRequestError(`Action "${request.action}" requires input with recordIds.`);
  }

  return { recordIds: input.recordIds };
}

function requireActiveEndpointRecord(
  storage: DurableObjectStorage,
  request: ActionRequest,
  entityName: string,
  recordId: string,
): StoredRecord {
  const record = getStoredRecord(storage, recordId);

  if (!record) {
    throw new BadRequestError(
      `Action "${request.action}" references unknown ${entityName} record "${recordId}".`,
    );
  }

  if (record.entity !== entityName) {
    throw new BadRequestError(
      `Action "${request.action}" endpoint "${recordId}" must reference a ${entityName} record.`,
    );
  }

  if (record.deletedAt) {
    throw new BadRequestError(
      `Action "${request.action}" cannot reference tombstoned ${entityName} record "${recordId}".`,
    );
  }

  return record;
}

function executeActionEffect(
  storage: DurableObjectStorage,
  request: ActionRequest,
  records: StoredRecord[],
): WriteOutcome<ActionResponse> {
  return tombstoneRecordsForActionOutcome(
    storage,
    request.actionId,
    request.entity,
    request.action,
    records,
  );
}

function getEntityActionKindRuntimeModule<TAction extends EntityActionSchema>(
  action: TAction,
): EntityActionKindRuntimeModule<TAction> {
  const actionModule = entityActionKindRuntimeModules.find(
    (candidate) => candidate.kind === action.kind,
  );

  if (!actionModule) {
    throw new Error(`Unsupported action kind "${action.kind}".`);
  }

  return actionModule as EntityActionKindRuntimeModule<TAction>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import type {
  ActionRequest,
  ActionResponse,
  CreateMutation,
  RecordValues,
  StoredRecord,
} from "../shared/protocol.ts";
import { matchesQuery } from "../shared/query.ts";
import type {
  AfterCreateHookSchema,
  AppSchema,
  EntityActionSchema,
  EntitySchema,
  FieldSchema,
} from "../shared/schema.ts";
import {
  createRecordsForAction,
  type CreateMutationCausedRecordWriter,
  getActionResponseById,
  getActiveRecordsByEntity,
  tombstoneRecordsForAction,
} from "./storage.ts";

export function executeEntityAction(
  storage: DurableObjectStorage,
  request: ActionRequest,
  schema: AppSchema,
): ActionResponse {
  const replay = getActionResponseById(storage, request.actionId);
  if (replay) {
    return replay;
  }

  const action = schema.entities[request.entity]?.actions?.[request.action];

  if (action?.kind === "clear-completed") {
    const records = selectActionTargetRecords(storage, request, schema, action);

    return executeActionEffect(storage, request, records);
  }

  if (action?.kind === "create-missing-join-records") {
    const values = selectMissingJoinRecordValues(storage, request, schema, action);

    return createRecordsForAction(
      storage,
      request.actionId,
      request.entity,
      request.action,
      values,
    );
  }

  throw new Error(`Unsupported action "${request.action}".`);
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

  if (action?.kind !== "create-missing-join-records") {
    throw new Error(
      `Create hook "${mutation.entity}.${mutation.mutationId}" references unsupported action "${hook.entity}.${hook.action}".`,
    );
  }

  const request: ActionRequest = {
    actionId: mutation.mutationId,
    entity: hook.entity,
    action: hook.action,
  };
  const values = selectMissingJoinRecordValues(storage, request, schema, action);

  createRecords(hook.entity, values);
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
      values.push(createJoinRecordValues(entity, action, leftRecord.id, rightRecord.id));
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
  action: Extract<EntityActionSchema, { kind: "create-missing-join-records" }>,
  leftRecordId: string,
  rightRecordId: string,
): RecordValues {
  const values: RecordValues = {};

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    if (fieldName === action.join.left.field) {
      values[fieldName] = leftRecordId;
      continue;
    }

    if (fieldName === action.join.right.field) {
      values[fieldName] = rightRecordId;
      continue;
    }

    const defaultValue = fieldDefaultValue(field);
    if (defaultValue !== undefined) {
      values[fieldName] = defaultValue;
    }
  }

  return values;
}

function fieldDefaultValue(field: FieldSchema) {
  if (field.type === "boolean" || field.type === "enum" || field.type === "number") {
    return field.default;
  }

  return undefined;
}

function executeActionEffect(
  storage: DurableObjectStorage,
  request: ActionRequest,
  records: StoredRecord[],
): ActionResponse {
  return tombstoneRecordsForAction(
    storage,
    request.actionId,
    request.entity,
    request.action,
    records,
  );
}

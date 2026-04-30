import type { ActionRequest, ActionResponse, StoredRecord } from "../shared/protocol.ts";
import { matchesQuery } from "../shared/query.ts";
import type { AppSchema, EntityActionSchema } from "../shared/schema.ts";
import {
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
    const records = selectActionTargetRecords(storage, request, action);

    return executeActionEffect(storage, request, action, records);
  }

  throw new Error(`Unsupported action "${request.action}".`);
}

function selectActionTargetRecords(
  storage: DurableObjectStorage,
  request: ActionRequest,
  action: EntityActionSchema,
): StoredRecord[] {
  return getActiveRecordsByEntity(storage, request.entity).filter((record) =>
    matchesQuery(record, action.target.query),
  );
}

function executeActionEffect(
  storage: DurableObjectStorage,
  request: ActionRequest,
  action: EntityActionSchema,
  records: StoredRecord[],
): ActionResponse {
  if (action.kind !== "clear-completed") {
    throw new Error(`Unsupported action "${request.action}".`);
  }

  return tombstoneRecordsForAction(
    storage,
    request.actionId,
    request.entity,
    request.action,
    records,
  );
}

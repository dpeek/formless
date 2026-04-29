import type { ActionResponse, ActionRequest } from "../shared/protocol.ts";
import type { AppSchema } from "../shared/schema.ts";
import { getActiveRecordsByEntity, tombstoneRecordsForAction } from "./storage.ts";

export function executeEntityAction(
  storage: DurableObjectStorage,
  request: ActionRequest,
  schema: AppSchema,
): ActionResponse {
  const action = schema.entities[request.entity]?.actions?.[request.action];

  if (action?.kind === "clear-completed") {
    return clearCompletedTasks(storage, request);
  }

  throw new Error(`Unsupported action "${request.action}".`);
}

function clearCompletedTasks(
  storage: DurableObjectStorage,
  request: ActionRequest,
): ActionResponse {
  const recordsToTombstone = getActiveRecordsByEntity(storage, request.entity).filter((record) => {
    return record.values.done === true;
  });

  return tombstoneRecordsForAction(
    storage,
    request.actionId,
    request.entity,
    request.action,
    recordsToTombstone,
  );
}

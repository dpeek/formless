import type { SyncStatus } from "../../client/sync-status.ts";
import type {
  GeneratedOperationCallerInput,
  GeneratedOperationControlBinding,
  GeneratedOperationController,
  GeneratedOperationExecutionResult,
  TransitionStateOperationConfig,
} from "../../client/views.ts";
import { executeGeneratedOperationControl } from "./operation-control-runtime.ts";

export async function executeTransitionStateOperation({
  binding,
  controller,
  operation,
  recordId,
  setStatus,
  source,
}: {
  binding: GeneratedOperationControlBinding;
  controller: GeneratedOperationController;
  operation: TransitionStateOperationConfig;
  recordId: string;
  setStatus?: (status: SyncStatus) => void;
  source: GeneratedOperationCallerInput["source"];
}): Promise<GeneratedOperationExecutionResult> {
  return executeGeneratedOperationControl({
    binding,
    callerInput: {
      bindingId: binding.id,
      recordId,
      source,
    },
    controller,
    feedback: {
      committedMessage: `${operation.label} synced.`,
      progressMessage: `${operation.label}...`,
      replayedMessage: `${operation.label} synced.`,
    },
    setStatus,
  });
}

import { useMemo, useState } from "react";
import type { FormlessUiOperationPresentationIntent } from "@dpeek/formless-astryx/contract";
import { useRecord } from "../../client/store.ts";
import type { EntityOperationPresentationConfig } from "../../client/operation-presentation-model.ts";
import {
  projectRecordDeleteOperationControlBinding,
  type GeneratedOperationControlBinding,
  type GeneratedOperationController,
  type GeneratedOperationExecutionResult,
} from "../../client/views.ts";
import type { SyncStatus } from "../../client/sync-status.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { FieldSchema } from "@dpeek/formless-schema";
import {
  executeGeneratedOperationControl,
  handleGeneratedOperationFormlessUiIntent,
  useGeneratedOperationController,
  useGeneratedOperationControllerVersion,
} from "./operation-control-runtime.ts";
import { projectGeneratedOperationFormlessUiControl } from "./formless-ui-operation-projection.ts";
import {
  LegacyGeneratedOperationButton,
  LegacyGeneratedOperationDestructiveConfirmation,
} from "./legacy-operation-controls.tsx";

export type RecordLabelFieldConfig = {
  fieldName: string;
  field: FieldSchema;
};

export function DeleteRecordButton({
  ariaLabel,
  buttonLabel = "Delete",
  className,
  deleteOperation,
  entityLabel,
  labelFields = [],
  onDeleted,
  recordId,
  size = "xs",
  triggerData,
}: {
  ariaLabel?: string;
  buttonLabel?: string;
  className?: string;
  deleteOperation: EntityOperationPresentationConfig;
  entityLabel: string;
  entityName: string;
  labelFields?: RecordLabelFieldConfig[];
  onDeleted?: () => void;
  recordId: string;
  size?: "xs" | "sq-xs";
  triggerData?: Record<string, string>;
}) {
  const record = useRecord(recordId);
  const [open, setOpen] = useState(false);
  const recordLabel = selectRecordLabel(record, labelFields, entityLabel, recordId);
  const binding = useMemo(
    () =>
      projectDeleteRecordButtonBinding({
        deleteOperation,
        entityLabel,
        recordId,
        recordLabel,
      }),
    [deleteOperation, entityLabel, recordId, recordLabel],
  );
  const bindings = useMemo(() => (binding === undefined ? [] : [binding]), [binding]);
  const controller = useGeneratedOperationController(bindings);
  useGeneratedOperationControllerVersion(controller);
  const state =
    binding === undefined ? undefined : controller.getStateByExecutionKey(binding.executionKey);

  async function onIntent(intent: FormlessUiOperationPresentationIntent) {
    if (binding === undefined) {
      return;
    }

    await handleGeneratedOperationFormlessUiIntent({
      binding,
      confirmationOpen: open,
      controller,
      intent,
      invoke: (invokeIntent) =>
        executeRecordDeleteOperation({
          binding,
          controller,
          recordId,
          recordLabel,
          source: invokeIntent.invocationSource,
        }),
      onConfirmationOpenChange: setOpen,
      onSuccess: () => onDeleted?.(),
    });
  }

  if (binding === undefined || state === undefined) {
    return null;
  }

  const control = projectGeneratedOperationFormlessUiControl({
    binding,
    confirmationOpen: open,
    presentation: {
      accessibilityLabel: ariaLabel ?? `Delete ${recordLabel}`,
      content:
        size === "sq-xs"
          ? { icon: "delete", kind: "iconOnly" }
          : { kind: "label", label: buttonLabel },
      density: "compact",
      pendingLabel: "Deleting...",
      prominence: "destructive",
    },
    state,
  });

  return (
    <>
      <span className={className} {...triggerData}>
        <LegacyGeneratedOperationButton button={control.trigger} onIntent={onIntent} />
      </span>
      {control.confirmation ? (
        <LegacyGeneratedOperationDestructiveConfirmation
          confirmation={control.confirmation}
          feedback={control.feedback}
          onIntent={onIntent}
          progress={control.progress}
        />
      ) : null}
    </>
  );
}

export function projectDeleteRecordButtonBinding({
  deleteOperation,
  entityLabel,
  recordId,
  recordLabel,
}: {
  deleteOperation: EntityOperationPresentationConfig;
  entityLabel: string;
  recordId: string;
  recordLabel: string;
}): GeneratedOperationControlBinding | undefined {
  return projectRecordDeleteOperationControlBinding({
    entityLabel,
    label: "Delete",
    operation: deleteOperation,
    recordLabel,
    options: {
      executionTargetKey: recordId,
    },
  });
}

export async function executeRecordDeleteOperation({
  binding,
  controller,
  recordId,
  recordLabel,
  setStatus,
  source = "confirmationDialog",
}: {
  binding: GeneratedOperationControlBinding;
  controller: GeneratedOperationController;
  recordId: string;
  recordLabel: string;
  setStatus?: (status: SyncStatus) => void;
  source?: "button" | "confirmationDialog";
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
      committedMessage: `Deleted ${recordLabel}.`,
      failedMessage: (result) =>
        result.type === "failed" ? result.displayError : "Delete failed.",
      progressMessage: `Deleting ${recordLabel}...`,
      replayedMessage: `Deleted ${recordLabel}.`,
    },
    setStatus,
  });
}

export function selectRecordLabel(
  record: StoredRecord | undefined,
  labelFields: RecordLabelFieldConfig[],
  entityLabel: string,
  recordId: string,
) {
  const preferredFields = ["label", "title", "name", "slug"];

  for (const fieldName of preferredFields) {
    const value = record?.values[fieldName];

    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  for (const field of labelFields) {
    const value = record?.values[field.fieldName];

    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  return `${entityLabel} ${record?.id ?? recordId}`;
}

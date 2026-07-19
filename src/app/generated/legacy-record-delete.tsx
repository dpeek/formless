import { useMemo, useState } from "react";
import type { FormlessUiOperationPresentationIntent } from "@dpeek/formless-astryx/contract";
import { useRecord } from "../../client/store.ts";
import type { EntityOperationPresentationConfig } from "../../client/operation-presentation-model.ts";
import {
  handleGeneratedOperationFormlessUiIntent,
  useGeneratedOperationController,
  useGeneratedOperationControllerVersion,
} from "./operation-control-runtime.ts";
import { projectGeneratedOperationFormlessUiControl } from "./formless-ui-operation-projection.ts";
import {
  executeRecordDeleteOperation,
  projectDeleteRecordButtonBinding,
  selectRecordLabel,
  type RecordLabelFieldConfig,
} from "./record-delete-runtime.ts";
import {
  LegacyGeneratedOperationButton,
  LegacyGeneratedOperationDestructiveConfirmation,
} from "./legacy-operation-controls.tsx";

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

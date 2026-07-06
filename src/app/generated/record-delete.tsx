import { useMemo, useState } from "react";
import { Button } from "@dpeek/formless-ui/button";
import {
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@dpeek/formless-ui/modal";
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
  useGeneratedOperationController,
  useGeneratedOperationControllerVersion,
} from "./operation-control-runtime.ts";

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
  const isDeleting = binding === undefined ? false : controller.isPending(binding.id);

  async function deleteRecord() {
    if (binding === undefined || isDeleting) {
      return;
    }

    const result = await executeRecordDeleteOperation({
      binding,
      controller,
      recordId,
      recordLabel,
    });

    if (result.type !== "failed") {
      setOpen(false);
      onDeleted?.();
    }
  }

  return (
    <>
      <Button
        aria-label={ariaLabel ?? `Delete ${recordLabel}`}
        className={className}
        isDisabled={isDeleting}
        onPress={() => setOpen(true)}
        size={size}
        type="button"
        intent="danger"
        {...triggerData}
      >
        {isDeleting ? "Deleting..." : buttonLabel}
      </Button>
      <ModalContent
        closeButton={false}
        isOpen={open}
        onOpenChange={(nextOpen) => {
          if (!isDeleting) {
            setOpen(nextOpen);
          }
        }}
        role="alertdialog"
      >
        <ModalHeader>
          <ModalTitle>{binding?.confirmation?.title ?? `Delete ${recordLabel}?`}</ModalTitle>
          <ModalDescription>
            {binding?.confirmation?.description ??
              "The record will be hidden from active views. Active references can block deletion."}
          </ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <ModalClose intent="outline">Cancel</ModalClose>
          <Button
            isDisabled={isDeleting}
            onPress={() => void deleteRecord()}
            type="button"
            intent="danger"
          >
            {isDeleting ? "Deleting..." : (binding?.confirmation?.actionLabel ?? "Delete")}
          </Button>
        </ModalFooter>
      </ModalContent>
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
}: {
  binding: GeneratedOperationControlBinding;
  controller: GeneratedOperationController;
  recordId: string;
  recordLabel: string;
  setStatus?: (status: SyncStatus) => void;
}): Promise<GeneratedOperationExecutionResult> {
  return executeGeneratedOperationControl({
    binding,
    callerInput: {
      bindingId: binding.id,
      recordId,
      source: "confirmationDialog",
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

import { useState } from "react";
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
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitDeleteMutation } from "../../client/sync.ts";
import type { StoredRecord } from "../../shared/protocol.ts";
import type { FieldSchema } from "../../shared/schema.ts";
import { useSchemaAppTarget } from "./schema-app-context.tsx";

export type RecordLabelFieldConfig = {
  fieldName: string;
  field: FieldSchema;
};

export function DeleteRecordButton({
  ariaLabel,
  buttonLabel = "Delete",
  className,
  entityLabel,
  entityName,
  labelFields = [],
  onDeleted,
  recordId,
  size = "xs",
  triggerData,
}: {
  ariaLabel?: string;
  buttonLabel?: string;
  className?: string;
  entityLabel: string;
  entityName: string;
  labelFields?: RecordLabelFieldConfig[];
  onDeleted?: () => void;
  recordId: string;
  size?: "xs" | "sq-xs";
  triggerData?: Record<string, string>;
}) {
  const appTarget = useSchemaAppTarget();
  const record = useRecord(recordId);
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const recordLabel = selectRecordLabel(record, labelFields, entityLabel, recordId);

  async function deleteRecord() {
    if (isDeleting) {
      return;
    }

    setIsDeleting(true);
    setSyncStatus({ state: "syncing", message: `Deleting ${recordLabel}...` });

    try {
      await submitDeleteMutation(appTarget, entityName, recordId);
      setOpen(false);
      onDeleted?.();
      setSyncStatus({ state: "idle", message: `Deleted ${recordLabel}.` });
    } catch (error) {
      setSyncStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Delete failed.",
      });
    } finally {
      setIsDeleting(false);
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
          <ModalTitle>Delete {recordLabel}?</ModalTitle>
          <ModalDescription>
            The record will be hidden from active views. Active references can block deletion.
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
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </>
  );
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

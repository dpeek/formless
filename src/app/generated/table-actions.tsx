import { useState } from "react";
import { Button, buttonStyles } from "@dpeek/formless-ui/button";
import {
  ModalBody,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@dpeek/formless-ui/modal";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@dpeek/formless-ui/menu";
import { useRecord, useRecordField } from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import type {
  EditRecordTableOperationControlConfig,
  EditViewConfig,
  OperationControlTableColumnConfig,
  TableOperationControlConfig,
} from "../../client/views.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import { RecordFieldEditor } from "./record-field-editor.tsx";
import { useSchemaAppTarget, useSchemaAppWriteOptions } from "./schema-app-context.tsx";
import { RecordTransitionOperationControls } from "./state-machine-ui.tsx";
import { selectRecordFieldsForActiveUnion } from "./union-presentation.ts";
import {
  orderingMoveAriaLabel,
  selectOrderingMoveMenuItems,
  submitOrderingPatch,
  type OrderingMoveDirection,
  type OrderingMoveMenuItem,
  type ResultOrderingContext,
} from "./ordering-ui.ts";

type ReferenceEditRecordTableOperationControlConfig = EditRecordTableOperationControlConfig & {
  target: Extract<EditRecordTableOperationControlConfig["target"], { kind: "reference" }>;
};

export function TableOperationControlsCell({
  column,
  orderingContext,
  sourceRecordId,
}: {
  column: OperationControlTableColumnConfig;
  orderingContext?: ResultOrderingContext;
  sourceRecordId: string;
}) {
  const appTarget = useSchemaAppTarget();
  const writeOptions = useSchemaAppWriteOptions();
  const [openBindingName, setOpenBindingName] = useState<string | null>(null);
  const [pendingOrderingDirection, setPendingOrderingDirection] =
    useState<OrderingMoveDirection | null>(null);
  const orderingItems = selectOrderingMoveMenuItems({
    includeOrdering: column.includeOrdering && column.ordering !== undefined,
    orderingContext,
    sourceRecordId,
  });

  if (column.controls.length === 0 && orderingItems.length === 0) {
    return null;
  }

  const openControl = column.controls.find(
    (control): control is EditRecordTableOperationControlConfig =>
      control.bindingName === openBindingName && control.type === "editRecord",
  );

  function openControlDialog(control: TableOperationControlConfig) {
    if (control.type === "editRecord" && !control.disabled) {
      setOpenBindingName(control.bindingName);
    }
  }

  async function invokeOrderingMove(item: OrderingMoveMenuItem) {
    if (item.disabled || item.plan.kind !== "patch" || !orderingContext) {
      return;
    }

    setPendingOrderingDirection(item.direction);
    setSyncStatus({ state: "syncing", message: `${item.label}...` });

    try {
      await submitOrderingPatch(appTarget, orderingContext, item.plan, writeOptions);
      setSyncStatus({ state: "idle", message: "Row moved and synced." });
    } catch (error) {
      setSyncStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Move failed.",
      });
    } finally {
      setPendingOrderingDirection(null);
    }
  }

  if (
    column.presentation === "button" &&
    column.controls.length === 1 &&
    orderingItems.length === 0
  ) {
    const control = column.controls[0];

    if (!control) {
      return null;
    }

    return (
      <>
        <TableOperationControlButton control={control} onOpen={() => openControlDialog(control)} />
        {openControl ? (
          <EditRecordTableOperationDialog
            control={openControl}
            onOpenChange={(open) => {
              if (!open) {
                setOpenBindingName(null);
              }
            }}
            open={true}
            sourceRecordId={sourceRecordId}
          />
        ) : null}
      </>
    );
  }

  const controlLabels = column.controls.map((control) => control.label).join("|");
  const disabledControlLabels = column.controls
    .filter((control) => control.disabled)
    .map(operationControlAriaLabel)
    .join("|");
  const dangerControlLabels = column.controls
    .filter((control) => control.variant === "destructive")
    .map((control) => control.label)
    .join("|");
  const orderingLabels = orderingItems.map(orderingMoveAriaLabel).join("|");

  return (
    <>
      <Menu>
        <MenuTrigger
          aria-label={column.headerLabel}
          className={buttonStyles({ intent: "outline", size: "sq-xs" })}
          data-formless-table-operation-labels={controlLabels || undefined}
          data-formless-table-danger-operation-labels={dangerControlLabels || undefined}
          data-formless-table-disabled-operation-labels={disabledControlLabels || undefined}
          data-formless-table-ordering-labels={orderingLabels || undefined}
          type="button"
        >
          <span aria-hidden="true">...</span>
        </MenuTrigger>
        <MenuContent
          popover={{ placement: column.align === "end" ? "bottom end" : "bottom start" }}
        >
          {column.controls.map((control) => (
            <MenuItem
              aria-label={operationControlAriaLabel(control)}
              isDisabled={control.disabled}
              intent={control.variant === "destructive" ? "danger" : undefined}
              key={control.bindingName}
              onAction={() => openControlDialog(control)}
            >
              <MenuLabel>{control.label}</MenuLabel>
            </MenuItem>
          ))}
          {column.controls.length > 0 && orderingItems.length > 0 ? <MenuSeparator /> : null}
          {orderingItems.map((item) => (
            <MenuItem
              aria-label={orderingMoveAriaLabel(item)}
              isDisabled={item.disabled || pendingOrderingDirection !== null}
              key={item.direction}
              onAction={() => {
                void invokeOrderingMove(item);
              }}
            >
              <MenuLabel>{item.label}</MenuLabel>
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
      {openControl ? (
        <EditRecordTableOperationDialog
          control={openControl}
          onOpenChange={(open) => {
            if (!open) {
              setOpenBindingName(null);
            }
          }}
          open={true}
          sourceRecordId={sourceRecordId}
        />
      ) : null}
    </>
  );
}

function TableOperationControlButton({
  control,
  onOpen,
}: {
  control: TableOperationControlConfig;
  onOpen: () => void;
}) {
  return (
    <Button
      aria-label={operationControlAriaLabel(control)}
      isDisabled={control.disabled}
      onPress={control.type === "editRecord" ? onOpen : undefined}
      size="xs"
      type="button"
      intent={control.variant === "destructive" ? "danger" : "outline"}
    >
      {control.label}
    </Button>
  );
}

function operationControlAriaLabel(control: TableOperationControlConfig) {
  if (control.disabled && control.disabledReason) {
    return `${control.label}: ${control.disabledReason}`;
  }

  return control.label;
}

function EditRecordTableOperationDialog({
  control,
  onOpenChange,
  open,
  sourceRecordId,
}: {
  control: EditRecordTableOperationControlConfig;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sourceRecordId: string;
}) {
  if (control.target.kind === "row") {
    return (
      <RecordEditDialog
        control={control}
        onOpenChange={onOpenChange}
        open={open}
        targetRecordId={sourceRecordId}
      />
    );
  }

  if (!isReferenceEditRecordControl(control)) {
    return null;
  }

  return (
    <ReferencedRecordEditOperationDialog
      control={control}
      onOpenChange={onOpenChange}
      open={open}
      sourceRecordId={sourceRecordId}
    />
  );
}

function ReferencedRecordEditOperationDialog({
  control,
  onOpenChange,
  open,
  sourceRecordId,
}: {
  control: ReferenceEditRecordTableOperationControlConfig;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sourceRecordId: string;
}) {
  const targetRecordId = useRecordField(sourceRecordId, control.target.fieldName);

  return (
    <RecordEditDialog
      control={control}
      onOpenChange={onOpenChange}
      open={open}
      targetRecordId={typeof targetRecordId === "string" ? targetRecordId : undefined}
    />
  );
}

function isReferenceEditRecordControl(
  control: EditRecordTableOperationControlConfig,
): control is ReferenceEditRecordTableOperationControlConfig {
  return control.target.kind === "reference";
}

function RecordEditDialog({
  control,
  onOpenChange,
  open,
  targetRecordId,
}: {
  control: EditRecordTableOperationControlConfig;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  targetRecordId: string | undefined;
}) {
  const targetRecord = useRecord(targetRecordId ?? "");

  return (
    <ModalContent isOpen={open} onOpenChange={onOpenChange} size="3xl">
      <ModalHeader>
        <ModalTitle>{control.label}</ModalTitle>
        <ModalDescription>{control.editView.entity.label}</ModalDescription>
      </ModalHeader>
      <ModalBody>
        {targetRecord && targetRecordId ? (
          <>
            <EditViewFields
              editView={control.editView}
              targetRecord={targetRecord}
              targetRecordId={targetRecordId}
            />
            {control.editView.transitionOperations.length > 0 ? (
              <div className="mt-3">
                <RecordTransitionOperationControls
                  operations={control.editView.transitionOperations}
                  entityName={control.editView.entityName}
                  recordId={targetRecordId}
                  values={targetRecord.values}
                />
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-slate-600">Record unavailable.</p>
        )}
        {!control.operation ? (
          <p className="text-sm text-slate-600">
            Editing is disabled for {control.editView.entity.label}.
          </p>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <ModalClose intent="outline" type="button">
          Done
        </ModalClose>
      </ModalFooter>
    </ModalContent>
  );
}

export function EditViewFields({
  editView,
  targetRecord,
  targetRecordId,
}: {
  editView: EditViewConfig;
  targetRecord: StoredRecord;
  targetRecordId: string;
}) {
  const fields = selectRecordFieldsForActiveUnion(editView.fields, editView.union, targetRecord);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {fields.map((fieldConfig) => (
        <div
          className={editFieldClass(fieldConfig)}
          key={recordFieldEditorKey(editView.entityName, targetRecordId, fieldConfig.fieldName)}
        >
          <RecordFieldEditor
            entityName={editView.entityName}
            fieldConfig={fieldConfig}
            recordId={targetRecordId}
            showLabel={true}
            updateOperation={editView.updateOperation}
          />
        </div>
      ))}
    </div>
  );
}

function editFieldClass(fieldConfig: EditViewConfig["fields"][number]) {
  if (fieldConfig.editor === "markdown" || fieldConfig.editor === "textarea") {
    return "md:col-span-2";
  }

  return "";
}

function recordFieldEditorKey(entityName: string, recordId: string, fieldName: string) {
  return `${entityName}:${recordId}:${fieldName}`;
}

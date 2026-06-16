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
  EditRecordTableActionConfig,
  EditViewConfig,
  InvokeActionTableColumnConfig,
  TableActionConfig,
} from "../../client/views.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import { RecordFieldEditor } from "./record-field-editor.tsx";
import { useSchemaAppTarget } from "./schema-app-context.tsx";
import { RecordTransitionActionControls } from "./state-machine-ui.tsx";
import { selectRecordFieldsForActiveUnion } from "./union-presentation.ts";
import {
  orderingMoveAriaLabel,
  selectOrderingMoveMenuItems,
  submitOrderingPatch,
  type OrderingMoveDirection,
  type OrderingMoveMenuItem,
  type ResultOrderingContext,
} from "./ordering-ui.ts";

type ReferenceEditRecordTableActionConfig = EditRecordTableActionConfig & {
  target: Extract<EditRecordTableActionConfig["target"], { kind: "reference" }>;
};

export function InvokeActionTableCell({
  column,
  orderingContext,
  sourceRecordId,
}: {
  column: InvokeActionTableColumnConfig;
  orderingContext?: ResultOrderingContext;
  sourceRecordId: string;
}) {
  const appTarget = useSchemaAppTarget();
  const [openActionName, setOpenActionName] = useState<string | null>(null);
  const [pendingOrderingDirection, setPendingOrderingDirection] =
    useState<OrderingMoveDirection | null>(null);
  const orderingItems = selectOrderingMoveMenuItems({
    includeOrdering: column.includeOrdering && column.ordering !== undefined,
    orderingContext,
    sourceRecordId,
  });

  if (column.actions.length === 0 && orderingItems.length === 0) {
    return null;
  }

  const openAction = column.actions.find(
    (action): action is EditRecordTableActionConfig =>
      action.actionName === openActionName && action.type === "editRecord",
  );

  function openActionDialog(action: TableActionConfig) {
    if (action.type === "editRecord" && !action.disabled) {
      setOpenActionName(action.actionName);
    }
  }

  async function invokeOrderingMove(item: OrderingMoveMenuItem) {
    if (item.disabled || item.plan.kind !== "patch" || !orderingContext) {
      return;
    }

    setPendingOrderingDirection(item.direction);
    setSyncStatus({ state: "syncing", message: `${item.label}...` });

    try {
      await submitOrderingPatch(appTarget, orderingContext, item.plan);
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
    column.actions.length === 1 &&
    orderingItems.length === 0
  ) {
    const action = column.actions[0];

    if (!action) {
      return null;
    }

    return (
      <>
        <TableActionButton action={action} onOpen={() => openActionDialog(action)} />
        {openAction ? (
          <EditRecordTableActionDialog
            action={openAction}
            onOpenChange={(open) => {
              if (!open) {
                setOpenActionName(null);
              }
            }}
            open={true}
            sourceRecordId={sourceRecordId}
          />
        ) : null}
      </>
    );
  }

  const actionLabels = column.actions.map((action) => action.label).join("|");
  const disabledActionLabels = column.actions
    .filter((action) => action.disabled)
    .map(actionAriaLabel)
    .join("|");
  const dangerActionLabels = column.actions
    .filter((action) => action.variant === "destructive")
    .map((action) => action.label)
    .join("|");
  const orderingLabels = orderingItems.map(orderingMoveAriaLabel).join("|");

  return (
    <>
      <Menu>
        <MenuTrigger
          aria-label={column.headerLabel}
          className={buttonStyles({ intent: "outline", size: "sq-xs" })}
          data-formless-table-action-labels={actionLabels || undefined}
          data-formless-table-danger-action-labels={dangerActionLabels || undefined}
          data-formless-table-disabled-action-labels={disabledActionLabels || undefined}
          data-formless-table-ordering-labels={orderingLabels || undefined}
          type="button"
        >
          <span aria-hidden="true">...</span>
        </MenuTrigger>
        <MenuContent
          popover={{ placement: column.align === "end" ? "bottom end" : "bottom start" }}
        >
          {column.actions.map((action) => (
            <MenuItem
              aria-label={actionAriaLabel(action)}
              isDisabled={action.disabled}
              intent={action.variant === "destructive" ? "danger" : undefined}
              key={action.actionName}
              onAction={() => openActionDialog(action)}
            >
              <MenuLabel>{action.label}</MenuLabel>
            </MenuItem>
          ))}
          {column.actions.length > 0 && orderingItems.length > 0 ? <MenuSeparator /> : null}
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
      {openAction ? (
        <EditRecordTableActionDialog
          action={openAction}
          onOpenChange={(open) => {
            if (!open) {
              setOpenActionName(null);
            }
          }}
          open={true}
          sourceRecordId={sourceRecordId}
        />
      ) : null}
    </>
  );
}

function TableActionButton({ action, onOpen }: { action: TableActionConfig; onOpen: () => void }) {
  return (
    <Button
      aria-label={actionAriaLabel(action)}
      isDisabled={action.disabled}
      onPress={action.type === "editRecord" ? onOpen : undefined}
      size="xs"
      type="button"
      intent={action.variant === "destructive" ? "danger" : "outline"}
    >
      {action.label}
    </Button>
  );
}

function actionAriaLabel(action: TableActionConfig) {
  if (action.disabled && action.disabledReason) {
    return `${action.label}: ${action.disabledReason}`;
  }

  return action.label;
}

function EditRecordTableActionDialog({
  action,
  onOpenChange,
  open,
  sourceRecordId,
}: {
  action: EditRecordTableActionConfig;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sourceRecordId: string;
}) {
  if (action.target.kind === "row") {
    return (
      <RecordEditDialog
        action={action}
        onOpenChange={onOpenChange}
        open={open}
        targetRecordId={sourceRecordId}
      />
    );
  }

  if (!isReferenceEditRecordAction(action)) {
    return null;
  }

  return (
    <ReferencedRecordEditActionDialog
      action={action}
      onOpenChange={onOpenChange}
      open={open}
      sourceRecordId={sourceRecordId}
    />
  );
}

function ReferencedRecordEditActionDialog({
  action,
  onOpenChange,
  open,
  sourceRecordId,
}: {
  action: ReferenceEditRecordTableActionConfig;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sourceRecordId: string;
}) {
  const targetRecordId = useRecordField(sourceRecordId, action.target.fieldName);

  return (
    <RecordEditDialog
      action={action}
      onOpenChange={onOpenChange}
      open={open}
      targetRecordId={typeof targetRecordId === "string" ? targetRecordId : undefined}
    />
  );
}

function isReferenceEditRecordAction(
  action: EditRecordTableActionConfig,
): action is ReferenceEditRecordTableActionConfig {
  return action.target.kind === "reference";
}

function RecordEditDialog({
  action,
  onOpenChange,
  open,
  targetRecordId,
}: {
  action: EditRecordTableActionConfig;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  targetRecordId: string | undefined;
}) {
  const targetRecord = useRecord(targetRecordId ?? "");

  return (
    <ModalContent isOpen={open} onOpenChange={onOpenChange} size="3xl">
      <ModalHeader>
        <ModalTitle>{action.label}</ModalTitle>
        <ModalDescription>{action.editView.entity.label}</ModalDescription>
      </ModalHeader>
      <ModalBody>
        {targetRecord && targetRecordId ? (
          <>
            <EditViewFields
              editView={action.editView}
              targetRecord={targetRecord}
              targetRecordId={targetRecordId}
            />
            {action.editView.transitionActions.length > 0 ? (
              <div className="mt-3">
                <RecordTransitionActionControls
                  actions={action.editView.transitionActions}
                  entityName={action.editView.entityName}
                  recordId={targetRecordId}
                  values={targetRecord.values}
                />
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-slate-600">Record unavailable.</p>
        )}
        {!action.editView.updateOperation ? (
          <p className="text-sm text-slate-600">
            Editing is disabled for {action.editView.entity.label}.
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

import { useState } from "react";
import { Button } from "@formless/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@formless/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@formless/ui/dropdown-menu";
import { useRecord, useRecordField } from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitPatchMutation } from "../../client/sync.ts";
import type {
  EditRecordTableActionConfig,
  EditViewConfig,
  InvokeActionTableColumnConfig,
  TableActionConfig,
} from "../../client/views.ts";
import type { OrderingMoveDirection } from "../../shared/table-ordering.ts";
import { RecordFieldEditor } from "./record-field-editor.tsx";
import { useSchemaKey } from "./schema-app-context.tsx";
import {
  orderingMoveAriaLabel,
  selectOrderingMoveMenuItems,
  type OrderingMoveMenuItem,
  type TableOrderingContext,
} from "./table-ordering-ui.ts";

type ReferenceEditRecordTableActionConfig = EditRecordTableActionConfig & {
  target: Extract<EditRecordTableActionConfig["target"], { kind: "reference" }>;
};

export function InvokeActionTableCell({
  column,
  orderingContext,
  sourceRecordId,
}: {
  column: InvokeActionTableColumnConfig;
  orderingContext?: TableOrderingContext;
  sourceRecordId: string;
}) {
  const schemaKey = useSchemaKey();
  const [openActionName, setOpenActionName] = useState<string | null>(null);
  const [pendingOrderingDirection, setPendingOrderingDirection] =
    useState<OrderingMoveDirection | null>(null);
  const orderingItems = selectOrderingMoveMenuItems(column, sourceRecordId, orderingContext);

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
      await submitPatchMutation(schemaKey, orderingContext.entityName, item.plan.recordId, {
        [orderingContext.ordering.fieldName]: item.plan.rank,
      });
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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button aria-label={column.headerLabel} size="icon-xs" type="button" variant="outline">
              <span aria-hidden="true">...</span>
            </Button>
          }
        />
        <DropdownMenuContent align={column.align === "end" ? "end" : "start"}>
          {column.actions.map((action) => (
            <DropdownMenuItem
              aria-label={actionAriaLabel(action)}
              disabled={action.disabled}
              key={action.actionName}
              onClick={() => openActionDialog(action)}
              variant={action.variant === "destructive" ? "destructive" : "default"}
            >
              {action.label}
            </DropdownMenuItem>
          ))}
          {column.actions.length > 0 && orderingItems.length > 0 ? <DropdownMenuSeparator /> : null}
          {orderingItems.map((item) => (
            <DropdownMenuItem
              aria-label={orderingMoveAriaLabel(item)}
              disabled={item.disabled || pendingOrderingDirection !== null}
              key={item.direction}
              onClick={() => {
                void invokeOrderingMove(item);
              }}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
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
      disabled={action.disabled}
      onClick={action.type === "editRecord" ? onOpen : undefined}
      size="xs"
      type="button"
      variant={action.variant === "destructive" ? "destructive" : "outline"}
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{action.label}</DialogTitle>
          <DialogDescription>{action.editView.entity.label}</DialogDescription>
        </DialogHeader>
        {targetRecord && targetRecordId ? (
          <EditViewFields editView={action.editView} targetRecordId={targetRecordId} />
        ) : (
          <p className="text-sm text-slate-600">Record unavailable.</p>
        )}
        {!action.editView.entity.mutations.patch.enabled ? (
          <p className="text-sm text-slate-600">
            Editing is disabled for {action.editView.entity.label}.
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditViewFields({
  editView,
  targetRecordId,
}: {
  editView: EditViewConfig;
  targetRecordId: string;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {editView.fields.map((fieldConfig) => (
        <div className={editFieldClass(fieldConfig)} key={fieldConfig.fieldName}>
          <RecordFieldEditor
            canPatch={editView.entity.mutations.patch.enabled}
            entityName={editView.entityName}
            fieldConfig={fieldConfig}
            recordId={targetRecordId}
            showLabel={true}
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

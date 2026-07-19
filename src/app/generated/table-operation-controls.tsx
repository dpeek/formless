import { useEffect, useMemo, useState } from "react";
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
import type {
  EditRecordTableOperationControlConfig,
  EditViewConfig,
  GeneratedOperationCallerInput,
  GeneratedOperationControlBinding,
  OperationControlTableColumnConfig,
  TableOperationControlConfig,
} from "../../client/views.ts";
import {
  projectOrderingMoveOperationControlBinding,
  projectTableOperationControlBinding,
} from "../../client/views.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import { RecordFieldEditor } from "./record-field-editor.tsx";
import { RecordTransitionOperationControls } from "./legacy-state-machine-ui.tsx";
import {
  initialGeneratedUpdateDraftSessionState,
  nextGeneratedUpdateDraftSessionState,
  selectGeneratedUpdateDraftSession,
  type GeneratedUpdateDraftFieldInput,
} from "./record-field-authoring.ts";
import {
  orderingMoveAriaLabel,
  selectOrderingMoveMenuItems,
  type OrderingMoveMenuItem,
  type ResultOrderingContext,
} from "./ordering-ui.ts";
import {
  executeGeneratedOperationControl,
  executeGeneratedOrderingMoveOperation,
  selectGeneratedOperationControlTriggerDecision,
  useGeneratedOperationController,
  useGeneratedOperationControllerVersion,
} from "./operation-control-runtime.ts";

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
  const [openBindingName, setOpenBindingName] = useState<string | null>(null);
  const [confirmingBindingId, setConfirmingBindingId] = useState<string | null>(null);
  const orderingItems = useMemo(
    () =>
      selectOrderingMoveMenuItems({
        includeOrdering: column.includeOrdering && column.ordering !== undefined,
        orderingContext,
        sourceRecordId,
      }),
    [column.includeOrdering, column.ordering, orderingContext, sourceRecordId],
  );
  const controlBindings = useMemo(
    () =>
      column.controls.map((control) => ({
        binding: projectTableOperationControlBinding(control, {
          executionTargetKey: sourceRecordId,
          idPrefix: `table:${sourceRecordId}`,
        }),
        control,
      })),
    [column.controls, sourceRecordId],
  );
  const orderingBindings = useMemo(
    () =>
      orderingItems.map((item) => ({
        binding:
          orderingContext === undefined
            ? undefined
            : projectOrderingMoveOperationControlBinding(
                {
                  direction: item.direction,
                  label: item.label,
                  ordering: orderingContext.ordering,
                  updateOperation: orderingContext.updateOperation,
                  disabledReason: item.disabledReason,
                },
                {
                  executionTargetKey: sourceRecordId,
                  idPrefix: `table-ordering:${sourceRecordId}`,
                },
              ),
        item,
      })),
    [orderingContext, orderingItems, sourceRecordId],
  );
  const bindings = useMemo(
    () =>
      [...controlBindings, ...orderingBindings]
        .map(({ binding }) => binding)
        .filter((binding): binding is GeneratedOperationControlBinding => binding !== undefined),
    [controlBindings, orderingBindings],
  );
  const controller = useGeneratedOperationController(bindings);
  useGeneratedOperationControllerVersion(controller);
  const anyOrderingPending = orderingBindings.some(
    ({ binding }) => binding !== undefined && controller.isPending(binding.id),
  );

  if (column.controls.length === 0 && orderingItems.length === 0) {
    return null;
  }

  const openControl = column.controls.find(
    (control): control is EditRecordTableOperationControlConfig =>
      control.bindingName === openBindingName && control.type === "editRecord",
  );
  const confirmingControlBinding = controlBindings.find(
    ({ binding }) => binding?.id === confirmingBindingId,
  );

  function openControlDialog(control: TableOperationControlConfig) {
    if (control.type === "editRecord" && !control.disabled) {
      setOpenBindingName(control.bindingName);
    }
  }

  async function executeTableControl(
    binding: GeneratedOperationControlBinding,
    source: GeneratedOperationCallerInput["source"],
  ) {
    return executeGeneratedOperationControl({
      binding,
      callerInput: {
        bindingId: binding.id,
        recordId: sourceRecordId,
        source,
      },
      controller,
    });
  }

  async function invokeTableControl(
    control: TableOperationControlConfig,
    binding: GeneratedOperationControlBinding | undefined,
    source: GeneratedOperationCallerInput["source"],
  ) {
    if (control.type === "editRecord") {
      openControlDialog(control);
      return;
    }

    const decision = selectGeneratedOperationControlTriggerDecision({
      binding,
      disabled: control.disabled,
      pending: binding === undefined ? false : controller.isPending(binding.id),
    });

    if (decision.type === "ignore" || binding === undefined) {
      return;
    }

    if (decision.type === "confirm") {
      setConfirmingBindingId(binding.id);
      return;
    }

    await executeTableControl(binding, source);
  }

  async function confirmTableControl(
    control: TableOperationControlConfig,
    binding: GeneratedOperationControlBinding,
  ) {
    if (control.disabled || controller.isPending(binding.id)) {
      return;
    }

    const result = await executeTableControl(binding, "confirmationDialog");

    if (result.type !== "failed") {
      setConfirmingBindingId(null);
    }
  }

  async function invokeOrderingMove(
    item: OrderingMoveMenuItem,
    binding: GeneratedOperationControlBinding | undefined,
  ) {
    if (item.disabled || item.plan.kind !== "patch" || !orderingContext) {
      return;
    }

    if (binding === undefined || anyOrderingPending) {
      return;
    }

    await executeGeneratedOrderingMoveOperation({
      binding,
      controller,
      failedMessage: "Move failed.",
      orderingContext,
      plan: item.plan,
      source: "menuItem",
      successMessage: "Row moved and synced.",
      syncingMessage: `${item.label}...`,
    });
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
        <TableOperationControlButton
          binding={controlBindings[0]?.binding}
          control={control}
          onRun={invokeTableControl}
          pending={
            controlBindings[0]?.binding === undefined
              ? false
              : controller.isPending(controlBindings[0].binding.id)
          }
        />
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
        {confirmingControlBinding ? (
          <TableOperationConfirmationDialog
            binding={confirmingControlBinding.binding}
            control={confirmingControlBinding.control}
            onConfirm={confirmTableControl}
            onOpenChange={(open) => {
              if (!open) {
                setConfirmingBindingId(null);
              }
            }}
            open={true}
            pending={
              confirmingControlBinding.binding === undefined
                ? false
                : controller.isPending(confirmingControlBinding.binding.id)
            }
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
          {controlBindings.map(({ binding, control }) => (
            <MenuItem
              aria-label={operationControlAriaLabel(control)}
              isDisabled={
                control.disabled || (binding !== undefined && controller.isPending(binding.id))
              }
              intent={control.variant === "destructive" ? "danger" : undefined}
              key={control.bindingName}
              onAction={() => {
                void invokeTableControl(control, binding, "menuItem");
              }}
            >
              <MenuLabel>
                {binding !== undefined && controller.isPending(binding.id)
                  ? `${control.label}...`
                  : control.label}
              </MenuLabel>
            </MenuItem>
          ))}
          {column.controls.length > 0 && orderingItems.length > 0 ? <MenuSeparator /> : null}
          {orderingBindings.map(({ binding, item }) => (
            <MenuItem
              aria-label={orderingMoveAriaLabel(item)}
              isDisabled={item.disabled || anyOrderingPending}
              key={item.direction}
              onAction={() => {
                void invokeOrderingMove(item, binding);
              }}
            >
              <MenuLabel>
                {binding !== undefined && controller.isPending(binding.id)
                  ? `${item.label}...`
                  : item.label}
              </MenuLabel>
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
      {confirmingControlBinding ? (
        <TableOperationConfirmationDialog
          binding={confirmingControlBinding.binding}
          control={confirmingControlBinding.control}
          onConfirm={confirmTableControl}
          onOpenChange={(open) => {
            if (!open) {
              setConfirmingBindingId(null);
            }
          }}
          open={true}
          pending={
            confirmingControlBinding.binding === undefined
              ? false
              : controller.isPending(confirmingControlBinding.binding.id)
          }
        />
      ) : null}
    </>
  );
}

function TableOperationControlButton({
  binding,
  control,
  onRun,
  pending,
}: {
  binding: GeneratedOperationControlBinding | undefined;
  control: TableOperationControlConfig;
  onRun: (
    control: TableOperationControlConfig,
    binding: GeneratedOperationControlBinding | undefined,
    source: GeneratedOperationCallerInput["source"],
  ) => Promise<void>;
  pending: boolean;
}) {
  return (
    <Button
      aria-label={operationControlAriaLabel(control)}
      isDisabled={control.disabled || pending}
      onPress={() => {
        void onRun(control, binding, "button");
      }}
      size="xs"
      type="button"
      intent={control.variant === "destructive" ? "danger" : "outline"}
    >
      {pending ? `${control.label}...` : control.label}
    </Button>
  );
}

function TableOperationConfirmationDialog({
  binding,
  control,
  onConfirm,
  onOpenChange,
  open,
  pending,
}: {
  binding: GeneratedOperationControlBinding | undefined;
  control: TableOperationControlConfig;
  onConfirm: (
    control: TableOperationControlConfig,
    binding: GeneratedOperationControlBinding,
  ) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
}) {
  if (binding?.confirmation === undefined) {
    return null;
  }

  return (
    <ModalContent
      closeButton={false}
      isOpen={open}
      onOpenChange={(nextOpen) => {
        if (!pending) {
          onOpenChange(nextOpen);
        }
      }}
      role="alertdialog"
    >
      <ModalHeader>
        <ModalTitle>{binding.confirmation.title}</ModalTitle>
        <ModalDescription>{binding.confirmation.description}</ModalDescription>
      </ModalHeader>
      <ModalFooter>
        <ModalClose intent="outline" isDisabled={pending} type="button">
          Cancel
        </ModalClose>
        <Button
          isDisabled={pending}
          onPress={() => void onConfirm(control, binding)}
          type="button"
          intent={binding.visualIntent === "destructive" ? "danger" : "primary"}
        >
          {pending ? `${binding.label}...` : binding.confirmation.actionLabel}
        </Button>
      </ModalFooter>
    </ModalContent>
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
              fieldOwnerId={`table-edit-control:${control.bindingName}:${targetRecordId}`}
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
  fieldOwnerId,
  targetRecord,
  targetRecordId,
}: {
  editView: EditViewConfig;
  fieldOwnerId: string;
  targetRecord: StoredRecord;
  targetRecordId: string;
}) {
  const [session, setSession] = useState(() =>
    initialGeneratedUpdateDraftSessionState({
      baselineValues: targetRecord.values,
      fields: editView.fields,
      union: editView.union,
    }),
  );

  useEffect(() => {
    setSession(
      initialGeneratedUpdateDraftSessionState({
        baselineValues: targetRecord.values,
        fields: editView.fields,
        union: editView.union,
      }),
    );
  }, [editView, targetRecord]);

  const sessionFacts = selectGeneratedUpdateDraftSession({
    fields: editView.fields,
    state: session,
    union: editView.union,
  });

  function updateSessionDraft(
    fieldName: string,
    draftInput: GeneratedUpdateDraftFieldInput | undefined,
  ) {
    setSession((current) =>
      nextGeneratedUpdateDraftSessionState({
        fieldName,
        fieldValue: draftInput,
        state: current,
      }),
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {sessionFacts.visibleFields.map((fieldConfig) => (
        <div
          className={editFieldClass(fieldConfig)}
          key={recordFieldEditorKey(editView.entityName, targetRecordId, fieldConfig.fieldName)}
        >
          <RecordFieldEditor
            draftInput={session.draft.values[fieldConfig.fieldName]}
            entityName={editView.entityName}
            fieldConfig={fieldConfig}
            fieldOwner={{ kind: "standalone", ownerId: fieldOwnerId }}
            onDraftInputChange={updateSessionDraft}
            recordId={targetRecordId}
            showLabel={true}
            updateDraftContext={{
              baselineValues: session.baselineValues,
              draft: session.draft,
              fields: editView.fields,
              union: editView.union,
            }}
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

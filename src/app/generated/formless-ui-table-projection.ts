import type {
  FormlessUiButtonContract,
  FormlessUiField,
  FormlessUiOperationControlContract,
  FormlessUiSemanticIconId,
  FormlessUiTableActionContract,
  FormlessUiTableActionGroupContract,
  FormlessUiTableCellContentContract,
  FormlessUiTableColumnContentRole,
  FormlessUiTableColumnContract,
  FormlessUiTableContract,
  FormlessUiTableDisplayValueContract,
  FormlessUiTableEditActionContract,
  FormlessUiTableFieldContentContract,
  FormlessUiTableInvokeActionContract,
  FormlessUiTableOperationActionContract,
  FormlessUiTableOrderingContract,
  FormlessUiTableRowContract,
  FormlessUiTableValueStatus,
} from "@dpeek/formless-presentation/contract";
import type { RecordReadinessWarning } from "../../client/readiness.ts";
import type { OrderingMoveMenuItem } from "./ordering-ui.ts";
import type {
  GeneratedTableColumnPresentation,
  GeneratedTableFooterCellPresentation,
  GeneratedTablePresentation,
} from "./table-presentation.ts";

export type GeneratedTableRowProjectionFacts = {
  accessibilityLabel?: string;
  contentsByColumnId: Readonly<
    Record<string, readonly FormlessUiTableCellContentContract[] | undefined>
  >;
  readinessWarnings?: readonly RecordReadinessWarning[];
};

export type GeneratedTableFooterValueProjection = {
  displayValue: string;
  status?: FormlessUiTableValueStatus;
  suffix?: string;
};

export type ProjectGeneratedTableFormlessUiContractOptions = {
  accessibilityLabel: string;
  density?: FormlessUiTableContract["density"];
  editingDisabledReason?: string;
  emptyStateDescription?: string;
  footerValuesByColumnId?: Readonly<
    Record<string, GeneratedTableFooterValueProjection | undefined>
  >;
  id: string;
  presentation: GeneratedTablePresentation;
  rowsByRecordId: Readonly<Record<string, GeneratedTableRowProjectionFacts | undefined>>;
};

export type GeneratedTablePlacedAction = {
  action: FormlessUiTableActionContract;
  placement: "primary" | "secondary";
};

export type ProjectGeneratedTableInvokeActionOptions = {
  actionId: string;
  disabled?: boolean;
  disabledReason?: string;
  icon?: FormlessUiSemanticIconId;
  invocationSource: "button" | "menuItem";
  label: string;
  operationName?: string;
  pending?: boolean;
  pendingLabel?: string;
  prominence?: FormlessUiButtonContract["prominence"];
  role: FormlessUiTableInvokeActionContract["role"];
  rowId: string;
  tableId: string;
};

export type ProjectGeneratedTableEditActionOptions = {
  actionGroup?: FormlessUiTableActionGroupContract;
  actionId: string;
  description?: string;
  dialogId: string;
  disabled?: boolean;
  disabledReason?: string;
  fields?: readonly FormlessUiField[];
  fieldErrors?: readonly string[];
  label: string;
  open: boolean;
  rowId: string;
  tableId: string;
  target:
    | {
        disabledReason?: string;
        editingEnabled: boolean;
        kind: "available";
      }
    | {
        kind: "unavailable";
        message: string;
      };
  targetKind: "reference" | "row";
  title: string;
};

export type ProjectGeneratedTableOrderingOptions = {
  accessibilityLabel: string;
  items: readonly OrderingMoveMenuItem[];
  pending: boolean;
  rowId: string;
  tableId: string;
};

export function projectGeneratedTableFormlessUiContract({
  accessibilityLabel,
  density = "compact",
  editingDisabledReason = "Editing is disabled.",
  emptyStateDescription,
  footerValuesByColumnId = {},
  id,
  presentation,
  rowsByRecordId,
}: ProjectGeneratedTableFormlessUiContractOptions): FormlessUiTableContract {
  const rows = presentation.rows.map((row): FormlessUiTableRowContract => {
    const facts = rowsByRecordId[row.recordId];
    const readinessWarnings = facts?.readinessWarnings ?? [];

    return {
      accessibilityLabel: facts?.accessibilityLabel ?? row.recordId,
      cells: row.cells.map((cell) => ({
        columnId: cell.columnId,
        contents: facts?.contentsByColumnId[cell.columnId] ?? [missingCellContent(cell.column)],
        id: cell.id,
        kind: "tableCell",
      })),
      id: row.id,
      kind: "tableRow",
      warnings:
        readinessWarnings.length === 0
          ? []
          : [
              {
                id: row.readinessWarning.id,
                items: readinessWarnings.map(({ code, message }) => ({ code, message })),
                kind: "tableWarning",
                title: "Readiness warnings",
              },
            ],
    };
  });

  return {
    accessibilityLabel,
    columns: presentation.columns.map(projectTableColumn),
    density,
    editing: presentation.editingDisabled
      ? { disabledReason: editingDisabledReason, enabled: false }
      : { enabled: true },
    ...(presentation.emptyState.visible
      ? {
          emptyState: {
            ...(emptyStateDescription === undefined ? {} : { description: emptyStateDescription }),
            id: `${id}:empty`,
            kind: "tableEmptyState" as const,
            title: presentation.emptyState.message,
          },
        }
      : {}),
    ...(presentation.footer === undefined
      ? {}
      : {
          footer: {
            accessibilityLabel: "Aggregate footer",
            cells: presentation.footer.cells.map((cell) =>
              projectFooterCell(cell, footerValuesByColumnId[cell.columnId]),
            ),
            id: `${id}:${presentation.footer.id}`,
            kind: "tableFooter" as const,
          },
        }),
    id,
    kind: "table",
    rows,
  };
}

export function projectGeneratedTableFieldContent(
  field: FormlessUiField,
  source: FormlessUiTableFieldContentContract["source"] = "record",
): FormlessUiTableFieldContentContract {
  return {
    field,
    kind: "field",
    source,
  };
}

export function projectGeneratedTableDisplayValue({
  accessibilityLabel,
  displayValue,
  status = { kind: "ready" },
  suffix,
  valueKind,
}: Omit<FormlessUiTableDisplayValueContract, "kind" | "status"> & {
  status?: FormlessUiTableValueStatus;
}): FormlessUiTableDisplayValueContract {
  return {
    accessibilityLabel,
    displayValue,
    kind: "displayValue",
    status,
    ...(suffix === undefined ? {} : { suffix }),
    valueKind,
  };
}

export function projectGeneratedTableActionGroup({
  actions,
  id,
  secondaryAccessibilityLabel,
}: {
  actions: readonly GeneratedTablePlacedAction[];
  id: string;
  secondaryAccessibilityLabel: string;
}): FormlessUiTableActionGroupContract {
  return {
    id,
    kind: "actionGroup",
    primary: actions.filter(({ placement }) => placement === "primary").map(({ action }) => action),
    secondary: actions
      .filter(({ placement }) => placement === "secondary")
      .map(({ action }) => action),
    secondaryAccessibilityLabel,
  };
}

export function projectGeneratedTableOperationAction(
  control: FormlessUiOperationControlContract,
  role: FormlessUiTableOperationActionContract["role"],
): FormlessUiTableOperationActionContract {
  return {
    control,
    kind: "operationAction",
    role,
  };
}

export function projectGeneratedTableInvokeAction({
  actionId,
  disabled = false,
  disabledReason,
  icon,
  invocationSource,
  label,
  operationName,
  pending = false,
  pendingLabel,
  prominence = "secondary",
  role,
  rowId,
  tableId,
}: ProjectGeneratedTableInvokeActionOptions): FormlessUiTableInvokeActionContract {
  return {
    intent: {
      actionId,
      invocationSource,
      ...(operationName === undefined ? {} : { operationName }),
      rowId,
      tableId,
      type: "tableActionInvoke",
    },
    kind: "invokeAction",
    role,
    trigger: tableActionButton({
      actionId,
      disabled: disabled || pending,
      disabledReason: pending ? (pendingLabel ?? "Action in progress") : disabledReason,
      icon,
      label,
      pending,
      pendingLabel,
      prominence,
    }),
  };
}

export function projectGeneratedTableEditAction({
  actionGroup,
  actionId,
  description,
  dialogId,
  disabled = false,
  disabledReason,
  fields = [],
  fieldErrors = [],
  label,
  open,
  rowId,
  tableId,
  target,
  targetKind,
  title,
}: ProjectGeneratedTableEditActionOptions): FormlessUiTableEditActionContract {
  const openIntent = {
    dialogId,
    open: true,
    rowId,
    tableId,
    type: "tableEditDialogOpenChange" as const,
  };

  return {
    dialog: {
      close: tableButton({
        accessibilityLabel: "Done",
        content: { kind: "label", label: "Done" },
        id: `${dialogId}:close`,
        prominence: "secondary",
      }),
      ...(description === undefined ? {} : { description }),
      id: dialogId,
      kind: "tableEditDialog",
      open,
      openChangeIntent: {
        ...openIntent,
        open: false,
      },
      target:
        target.kind === "unavailable"
          ? target
          : {
              ...(actionGroup === undefined ? {} : { actionGroup }),
              fieldSet: {
                disabled: !target.editingEnabled,
                ...(!target.editingEnabled && target.disabledReason !== undefined
                  ? { disabledReason: target.disabledReason }
                  : {}),
                errors: fieldErrors,
                fields: fields.map(projectGeneratedTableEditDialogField),
                id: `${dialogId}:fields`,
                kind: "fieldSet",
              },
              kind: "available",
            },
      targetKind,
      title,
    },
    kind: "editAction",
    openIntent,
    trigger: tableActionButton({
      actionId,
      disabled,
      disabledReason,
      icon: "edit",
      label,
      prominence: "secondary",
    }),
  };
}

function projectGeneratedTableEditDialogField(field: FormlessUiField): FormlessUiField {
  if (field.mode === "editor" && (field.surface === "create" || field.surface === "operation")) {
    return field;
  }

  return {
    ...field,
    labelVisibility: "visible",
    surface: "record",
  };
}

export function projectGeneratedTableOrdering({
  accessibilityLabel,
  items,
  pending,
  rowId,
  tableId,
}: ProjectGeneratedTableOrderingOptions): FormlessUiTableOrderingContract {
  return {
    accessibilityLabel,
    actions: items.map((item) => {
      const id = `${tableId}:${rowId}:order:${item.direction}`;
      const disabledReason = pending ? "Ordering in progress" : item.disabledReason;

      return {
        direction: item.direction,
        disabled: item.disabled || pending,
        ...(disabledReason === undefined ? {} : { disabledReason }),
        id,
        intent: {
          actionId: id,
          direction: item.direction,
          rowId,
          tableId,
          type: "tableReorder",
        },
        label: item.label,
        ...(pending ? { pending: { isPending: true, label: "Ordering in progress" } } : {}),
      };
    }),
    affordance: "reorder",
    kind: "ordering",
    pending,
  };
}

function projectTableColumn(
  column: GeneratedTableColumnPresentation,
): FormlessUiTableColumnContract {
  const columnConfig = column.type === "data" ? column.column : undefined;

  return {
    accessibilityLabel: column.header.accessibleLabel,
    alignment:
      column.type === "delete" || column.type === "transition"
        ? "end"
        : (columnConfig?.align ?? "start"),
    contentRole: tableColumnContentRole(column),
    id: column.id,
    isRowHeader: column.isRowHeader,
    kind: "tableColumn",
    label: column.header.label,
    labelVisibility: column.header.isVisuallyHidden ? "hidden" : "visible",
    width:
      column.type === "delete"
        ? "xs"
        : column.type === "transition"
          ? "md"
          : (columnConfig?.width ?? "auto"),
  };
}

function tableColumnContentRole(
  column: GeneratedTableColumnPresentation,
): FormlessUiTableColumnContentRole {
  if (column.type === "delete") {
    return "delete";
  }

  if (column.type === "transition") {
    return "actions";
  }

  if (column.column.type === "computed") {
    return "computed";
  }

  if (column.column.type === "operationControl") {
    return "actions";
  }

  if (column.column.type === "orderingHandle") {
    return "ordering";
  }

  if (
    column.column.type === "referenceField" ||
    (column.column.type === "field" && column.column.field.type === "reference")
  ) {
    return "reference";
  }

  return "field";
}

function missingCellContent(column: GeneratedTableColumnPresentation) {
  return {
    accessibilityLabel: `${column.header.accessibleLabel} unavailable`,
    kind: "unavailable" as const,
    message: "Cell unavailable.",
  };
}

function projectFooterCell(
  cell: GeneratedTableFooterCellPresentation,
  value: GeneratedTableFooterValueProjection | undefined,
) {
  if (cell.type === "empty") {
    return {
      columnId: cell.columnId,
      id: cell.id,
      kind: "emptyFooterCell" as const,
    };
  }

  const displayValue = value?.displayValue ?? "Unavailable";
  const status =
    value?.status ??
    (value === undefined
      ? { kind: "unavailable" as const, message: "Aggregate unavailable." }
      : { kind: "ready" as const });
  const suffix = value?.suffix ?? cell.slot.suffix;

  return {
    accessibilityLabel: `${cell.slot.label}: ${displayValue}`,
    columnId: cell.columnId,
    displayValue,
    id: cell.id,
    kind: "aggregateFooterCell" as const,
    status,
    ...(suffix === undefined ? {} : { suffix }),
  };
}

function tableActionButton({
  actionId,
  disabled,
  disabledReason,
  icon,
  label,
  pending = false,
  pendingLabel,
  prominence,
}: {
  actionId: string;
  disabled: boolean;
  disabledReason?: string;
  icon?: ProjectGeneratedTableInvokeActionOptions["icon"];
  label: string;
  pending?: boolean;
  pendingLabel?: string;
  prominence: FormlessUiButtonContract["prominence"];
}): FormlessUiButtonContract {
  return tableButton({
    accessibilityLabel:
      disabled && disabledReason !== undefined ? `${label}: ${disabledReason}` : label,
    content: icon === undefined ? { kind: "label", label } : { icon, kind: "iconAndLabel", label },
    ...(disabled ? { disabled: true } : {}),
    ...(disabledReason === undefined ? {} : { disabledReason }),
    id: actionId,
    ...(pending
      ? { pending: { isPending: true, ...(pendingLabel ? { label: pendingLabel } : {}) } }
      : {}),
    prominence,
  });
}

function tableButton(
  button: Pick<FormlessUiButtonContract, "accessibilityLabel" | "content" | "id" | "prominence"> &
    Partial<Pick<FormlessUiButtonContract, "disabled" | "disabledReason" | "pending">>,
): FormlessUiButtonContract {
  return {
    ...button,
    density: "compact",
    kind: "button",
    type: "button",
  };
}

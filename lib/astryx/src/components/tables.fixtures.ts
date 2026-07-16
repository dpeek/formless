import type { FieldSchema, StateMachineSchema } from "@dpeek/formless-schema";
import type {
  FormlessUiButtonContract,
  FormlessUiField,
  FormlessUiTableActionContract,
  FormlessUiTableActionGroupContract,
  FormlessUiTableColumnContract,
  FormlessUiTableContract,
  FormlessUiTableEditActionContract,
  FormlessUiTableOperationActionContract,
  FormlessUiTableOrderingContract,
  FormlessUiTableRowContract,
} from "../formless-ui-contract.ts";
import {
  displayField,
  enumControl,
  enumOptions,
  enumValuePresentation,
  recordDrafts,
  recordField,
  stateMachineFacts,
  stateMachineField,
  textControl,
} from "./fields/fixture-helpers.ts";
import { operationControlFixtures } from "./operation-controls.fixtures.ts";

export type FormlessUiTableFixtureId = "active" | "editing-disabled" | "empty";

export type FormlessUiTableFixture = {
  id: FormlessUiTableFixtureId;
  label: string;
  table: FormlessUiTableContract;
};

const titleSchema = {
  label: "Task",
  required: true,
  type: "text",
} satisfies Extract<FieldSchema, { type: "text" }>;

const titleControl = textControl(titleSchema);

const statusSchema = {
  default: "open",
  label: "Status",
  required: true,
  type: "enum",
  values: {
    done: { label: "Done", presentation: { color: "success" } },
    open: { label: "Open", presentation: { color: "warning" } },
  },
} as const satisfies Extract<FieldSchema, { type: "enum" }>;

const statusMachine = {
  field: "status",
  initial: "open",
  terminal: ["done"],
  transitions: {
    complete: { from: ["open"], label: "Complete", to: "done" },
  },
} satisfies StateMachineSchema;

const statusOperationNames = {
  complete: "tasks.complete",
};

const tableColumns = [
  {
    accessibilityLabel: "Ordering",
    alignment: "center",
    contentRole: "ordering",
    id: "order",
    isRowHeader: false,
    kind: "tableColumn",
    label: "Order",
    labelVisibility: "hidden",
    width: "xs",
  },
  {
    accessibilityLabel: "Task",
    alignment: "start",
    contentRole: "field",
    id: "title",
    isRowHeader: true,
    kind: "tableColumn",
    label: "Task",
    labelVisibility: "visible",
    width: "auto",
  },
  {
    accessibilityLabel: "Status",
    alignment: "start",
    contentRole: "field",
    id: "status",
    isRowHeader: false,
    kind: "tableColumn",
    label: "Status",
    labelVisibility: "visible",
    width: "sm",
  },
  {
    accessibilityLabel: "Owner",
    alignment: "start",
    contentRole: "reference",
    id: "owner",
    isRowHeader: false,
    kind: "tableColumn",
    label: "Owner",
    labelVisibility: "visible",
    width: "sm",
  },
  {
    accessibilityLabel: "Score",
    alignment: "end",
    contentRole: "computed",
    id: "score",
    isRowHeader: false,
    kind: "tableColumn",
    label: "Score",
    labelVisibility: "visible",
    width: "sm",
  },
  {
    accessibilityLabel: "Actions",
    alignment: "end",
    contentRole: "actions",
    id: "actions",
    isRowHeader: false,
    kind: "tableColumn",
    label: "Actions",
    labelVisibility: "hidden",
    width: "md",
  },
] satisfies readonly FormlessUiTableColumnContract[];

export function createFormlessUiTableFixtures(): FormlessUiTableFixture[] {
  return [
    {
      id: "active",
      label: "Active",
      table: activeTableFixture(),
    },
    {
      id: "empty",
      label: "Empty",
      table: emptyTableFixture(),
    },
    {
      id: "editing-disabled",
      label: "Read-only",
      table: editingDisabledTableFixture(),
    },
  ];
}

function activeTableFixture(): FormlessUiTableContract {
  const rows = [
    taskRow({
      canEdit: true,
      canOrder: true,
      canDelete: true,
      index: 0,
      owner: "Sam Rivera",
      rowCount: 3,
      rowId: "task-1",
      score: { kind: "ready", value: "18" },
      status: "open",
      title: "Prepare launch checklist",
      titleMode: "editable",
      warning: "Owner email is missing.",
    }),
    taskRow({
      canEdit: false,
      canOrder: true,
      canDelete: false,
      index: 1,
      owner: "Mina Patel",
      rowCount: 3,
      rowId: "task-2",
      score: { kind: "pending" },
      status: "open",
      title: "Review release copy",
      titleMode: "readOnly",
    }),
    taskRow({
      canEdit: true,
      canOrder: true,
      canDelete: false,
      index: 2,
      owner: "No owner",
      rowCount: 3,
      rowId: "task-3",
      score: { kind: "invalid" },
      status: "done",
      title: "Publish release notes",
      titleMode: "editable",
    }),
  ];

  return {
    accessibilityLabel: "Tasks",
    columns: tableColumns,
    density: "default",
    editing: { enabled: true },
    footer: taskFooter("18"),
    id: "tasks",
    kind: "table",
    rows,
  };
}

function emptyTableFixture(): FormlessUiTableContract {
  return {
    accessibilityLabel: "Empty tasks",
    columns: tableColumns,
    density: "default",
    editing: { enabled: true },
    emptyState: {
      description: "Adjust the current filters to see more tasks.",
      id: "tasks:empty",
      kind: "tableEmptyState",
      title: "No matching tasks",
    },
    id: "tasks",
    kind: "table",
    rows: [],
  };
}

function editingDisabledTableFixture(): FormlessUiTableContract {
  return {
    accessibilityLabel: "Read-only tasks",
    columns: tableColumns,
    density: "default",
    editing: {
      disabledReason: "Editing requires an owner session.",
      enabled: false,
    },
    footer: taskFooter("18"),
    id: "tasks",
    kind: "table",
    rows: [
      taskRow({
        canEdit: false,
        canOrder: false,
        canDelete: false,
        index: 0,
        owner: "Sam Rivera",
        rowCount: 1,
        rowId: "task-read-only",
        score: { kind: "ready", value: "18" },
        status: "done",
        title: "Prepare launch",
        titleMode: "readOnly",
      }),
    ],
  };
}

type TaskRowInput = {
  canDelete: boolean;
  canEdit: boolean;
  canOrder: boolean;
  index: number;
  owner: string;
  rowCount: number;
  rowId: string;
  score: { kind: "invalid" } | { kind: "pending" } | { kind: "ready"; value: string };
  status: "done" | "open";
  title: string;
  titleMode: "editable" | "readOnly";
  warning?: string;
};

function taskRow(input: TaskRowInput): FormlessUiTableRowContract {
  const title = taskTitleField(input);
  const status = taskStatusField(input);
  const actions = taskActions(input, title, status);

  return {
    accessibilityLabel: input.title,
    cells: [
      {
        columnId: "order",
        contents: input.canOrder
          ? [taskOrdering(input)]
          : [
              {
                accessibilityLabel: `Ordering unavailable for ${input.title}`,
                kind: "unavailable",
                message: "—",
              },
            ],
        id: `${input.rowId}:order`,
        kind: "tableCell",
      },
      {
        columnId: "title",
        contents: [{ field: title, kind: "field", source: "record" }],
        id: `${input.rowId}:title`,
        kind: "tableCell",
      },
      {
        columnId: "status",
        contents: [{ field: status, kind: "field", source: "record" }],
        id: `${input.rowId}:status`,
        kind: "tableCell",
      },
      {
        columnId: "owner",
        contents: [
          {
            accessibilityLabel: `Owner: ${input.owner}`,
            displayValue: input.owner,
            kind: "displayValue",
            status: { kind: "ready" },
            valueKind: "reference",
          },
        ],
        id: `${input.rowId}:owner`,
        kind: "tableCell",
      },
      {
        columnId: "score",
        contents: [taskScore(input)],
        id: `${input.rowId}:score`,
        kind: "tableCell",
      },
      {
        columnId: "actions",
        contents:
          actions.primary.length > 0 || actions.secondary.length > 0
            ? [actions]
            : [
                {
                  accessibilityLabel: `Actions unavailable for ${input.title}`,
                  kind: "unavailable",
                  message: "Editing is unavailable",
                },
              ],
        id: `${input.rowId}:actions`,
        kind: "tableCell",
      },
    ],
    id: input.rowId,
    kind: "tableRow",
    warnings: input.warning
      ? [
          {
            id: `${input.rowId}:readiness`,
            items: [{ code: "owner-email", message: input.warning }],
            kind: "tableWarning",
            title: "Readiness warnings",
          },
        ]
      : [],
  };
}

function taskTitleField(input: Pick<TaskRowInput, "rowId" | "title" | "titleMode">) {
  const common = {
    control: titleControl,
    editor: titleControl.editor,
    field: titleSchema,
    fieldName: "title",
    labelVisibility: "hidden" as const,
    occurrence: { ownerId: `table:${input.rowId}`, placementId: "title" },
    recordId: input.rowId,
    surface: "table-cell" as const,
  };

  return input.titleMode === "editable"
    ? recordField({
        ...common,
        commit: "field-commit",
        density: "compact",
        drafts: recordDrafts({ recordValue: input.title }),
        rendererKind: "text",
      })
    : displayField({
        ...common,
        density: "compact",
        formatting: { displayValue: input.title },
        value: input.title,
      });
}

function taskStatusField(input: Pick<TaskRowInput, "canEdit" | "rowId" | "status">) {
  const machine = stateMachineField({
    fieldName: "status",
    machine: statusMachine,
    machineName: "taskWorkflow",
  });

  return displayField({
    access: { kind: "stateMachine", writable: false },
    control: enumControl(statusSchema),
    density: "compact",
    editor: "enum",
    field: statusSchema,
    fieldName: "status",
    formatting: {
      displayValue: statusSchema.values[input.status].label,
      enumValuePresentation: enumValuePresentation(statusSchema, input.status),
    },
    labelVisibility: "hidden",
    options: { enumOptions: enumOptions(statusSchema) },
    occurrence: { ownerId: `table:${input.rowId}`, placementId: "status" },
    recordId: input.rowId,
    stateMachine: machine,
    stateMachineFacts: stateMachineFacts({
      currentValue: input.status,
      field: statusSchema,
      interaction: input.canEdit && input.status === "open" ? "transitions" : "display",
      operationNames: statusOperationNames,
      stateMachine: machine,
    }),
    surface: "table-cell",
    value: input.status,
  });
}

function taskScore(input: Pick<TaskRowInput, "score" | "title">) {
  if (input.score.kind === "pending") {
    return {
      accessibilityLabel: `${input.title} score`,
      displayValue: "—",
      kind: "displayValue",
      status: { kind: "pending", label: "Calculating score" },
      valueKind: "computed",
    } as const;
  }

  if (input.score.kind === "invalid") {
    return {
      accessibilityLabel: `${input.title} score`,
      displayValue: "—",
      kind: "displayValue",
      status: { kind: "invalid", message: "Score input is invalid." },
      valueKind: "computed",
    } as const;
  }

  return {
    accessibilityLabel: `${input.title} score: ${input.score.value} points`,
    displayValue: input.score.value,
    kind: "displayValue",
    status: { kind: "ready" },
    suffix: "points",
    valueKind: "computed",
  } as const;
}

function taskOrdering(input: TaskRowInput): FormlessUiTableOrderingContract {
  return {
    accessibilityLabel: `Reorder ${input.title}`,
    actions: (["top", "up", "down", "bottom"] as const).map((direction) => {
      const atStart = input.index === 0 && (direction === "top" || direction === "up");
      const atEnd =
        input.index === input.rowCount - 1 && (direction === "bottom" || direction === "down");
      const disabledReason = atStart ? "Already first" : atEnd ? "Already last" : undefined;
      const label =
        direction === "top"
          ? "Move to top"
          : direction === "up"
            ? "Move up"
            : direction === "down"
              ? "Move down"
              : "Move to bottom";
      const actionId = `${input.rowId}:${direction}`;

      return {
        direction,
        ...(disabledReason ? { disabled: true, disabledReason } : {}),
        id: actionId,
        intent: {
          actionId,
          direction,
          rowId: input.rowId,
          tableId: "tasks",
          type: "tableReorder",
        },
        label,
      };
    }),
    affordance: "reorder",
    kind: "ordering",
    pending: false,
  };
}

function taskActions(input: TaskRowInput, title: FormlessUiField, status: FormlessUiField) {
  const secondary: FormlessUiTableActionContract[] = [];

  if (input.canEdit) {
    secondary.push(editTaskAction(input, [title, status]));
  }

  if (input.canDelete) {
    secondary.push({
      control: operationControlFixtures.deleteTask.initial,
      kind: "operationAction",
      role: "delete",
    } satisfies FormlessUiTableOperationActionContract);
  }

  return {
    id: `${input.rowId}:actions`,
    kind: "actionGroup",
    primary: [],
    secondary,
    secondaryAccessibilityLabel: `More actions for ${input.title}`,
  } satisfies FormlessUiTableActionGroupContract;
}

function editTaskAction(
  input: Pick<TaskRowInput, "rowId" | "title">,
  fields: readonly FormlessUiField[],
): FormlessUiTableEditActionContract {
  const dialogId = `${input.rowId}:edit`;

  return {
    dialog: {
      close: tableButton({ id: `${dialogId}:close`, label: "Done" }),
      description: "Update the selected task.",
      id: dialogId,
      kind: "tableEditDialog",
      open: false,
      openChangeIntent: {
        dialogId,
        open: false,
        rowId: input.rowId,
        tableId: "tasks",
        type: "tableEditDialogOpenChange",
      },
      target: {
        fieldSet: {
          disabled: false,
          fields: fields.map(tableDialogField),
          id: `${dialogId}:fields`,
          kind: "fieldSet",
          label: "Task fields",
        },
        kind: "available",
      },
      targetKind: "row",
      title: `Edit ${input.title}`,
    },
    kind: "editAction",
    openIntent: {
      dialogId,
      open: true,
      rowId: input.rowId,
      tableId: "tasks",
      type: "tableEditDialogOpenChange",
    },
    trigger: tableButton({ id: `${dialogId}:open`, label: "Edit task" }),
  };
}

function tableDialogField(field: FormlessUiField): FormlessUiField {
  if (field.mode === "editor" && (field.surface === "create" || field.surface === "operation")) {
    return field;
  }

  return {
    ...field,
    labelVisibility: "visible",
    surface: "record",
  };
}

function tableButton({
  id,
  label,
  prominence = "secondary",
}: {
  id: string;
  label: string;
  prominence?: FormlessUiButtonContract["prominence"];
}): FormlessUiButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "compact",
    id,
    kind: "button",
    prominence,
    type: "button",
  };
}

function taskFooter(total: string): NonNullable<FormlessUiTableContract["footer"]> {
  return {
    accessibilityLabel: "Task aggregates",
    cells: tableColumns.map((column) =>
      column.id === "score"
        ? {
            accessibilityLabel: `Total available score: ${total} points`,
            columnId: column.id,
            displayValue: total,
            id: `tasks:footer:${column.id}`,
            kind: "aggregateFooterCell",
            status: { kind: "ready" },
            suffix: "points",
          }
        : {
            columnId: column.id,
            id: `tasks:footer:${column.id}`,
            kind: "emptyFooterCell",
          },
    ),
    id: "tasks:footer",
    kind: "tableFooter",
  };
}

import type { FieldSchema } from "@dpeek/formless-schema";
import type {
  FormlessUiField,
  FormlessUiOperationControlContract,
  FormlessUiRecordResultActionContract,
  FormlessUiRecordResultContract,
  FormlessUiRecordResultFieldContract,
} from "../formless-ui-contract.ts";
import {
  displayField,
  enumControl,
  enumOptions,
  fieldError,
  recordDrafts,
  recordField,
  textControl,
} from "./fields/fixture-helpers.ts";
import { fieldScenarioGroups } from "./fields/fixtures.ts";
import { operationControlFixtures } from "./operation-controls.fixtures.ts";

export type FormlessUiRecordResultFixtureId =
  | "editable"
  | "editing-disabled"
  | "empty"
  | "read-only"
  | "unavailable";

export type FormlessUiRecordResultFixture = {
  id: FormlessUiRecordResultFixtureId;
  label: string;
  recordResult: FormlessUiRecordResultContract;
};

const taskId = "task-1";
const resultId = "tasks:detail";

const titleSchema = {
  label: "Task",
  required: true,
  type: "text",
} satisfies Extract<FieldSchema, { type: "text" }>;

const titleControl = textControl(titleSchema);

const slugSchema = {
  label: "Slug",
  required: true,
  type: "text",
} satisfies Extract<FieldSchema, { type: "text" }>;

const kindSchema = {
  default: "article",
  label: "Kind",
  required: true,
  type: "enum",
  values: {
    article: { label: "Article" },
    link: { label: "Link" },
  },
} as const satisfies Extract<FieldSchema, { type: "enum" }>;

const summarySchema = {
  label: "Summary",
  required: false,
  type: "text",
} satisfies Extract<FieldSchema, { type: "text" }>;

const urlSchema = {
  label: "URL",
  required: true,
  type: "text",
} satisfies Extract<FieldSchema, { type: "text" }>;

const ownerEmailSchema = {
  label: "Owner email",
  required: true,
  type: "text",
} satisfies Extract<FieldSchema, { type: "text" }>;

export function createFormlessUiRecordResultFixtures(): FormlessUiRecordResultFixture[] {
  return [
    {
      id: "editable",
      label: "Editable",
      recordResult: editableRecordResultFixture(),
    },
    {
      id: "read-only",
      label: "Read-only",
      recordResult: readOnlyRecordResultFixture(),
    },
    {
      id: "editing-disabled",
      label: "Disabled",
      recordResult: editingDisabledRecordResultFixture(),
    },
    {
      id: "empty",
      label: "Empty",
      recordResult: stateRecordResultFixture("empty"),
    },
    {
      id: "unavailable",
      label: "Unavailable",
      recordResult: stateRecordResultFixture("unavailable"),
    },
  ];
}

export function recordResultUnionField(kind: "article" | "link") {
  return kind === "article" ? summaryField() : urlField();
}

export function completedTaskControl(): FormlessUiOperationControlContract {
  return {
    feedback: {
      detail: "Status changed from Open to Done.",
      id: "task-complete-committed",
      intent: "success",
      kind: "operationFeedbackEvent",
      status: "committed",
      title: "Task completed",
    },
    id: "task-complete",
    kind: "operationControl",
    status: {
      accessibilityLabel: "Task completed. Status changed from Open to Done.",
      detail: "Status changed from Open to Done.",
      id: "task-complete-status",
      intent: "success",
      kind: "compactStatus",
      label: "Task completed",
      status: "committed",
    },
    trigger: completeTaskTrigger(),
  };
}

export function taskStatusField(value: "done" | "open") {
  const group = fieldScenarioGroups.find((candidate) => candidate.kind === "state-machine-enum");
  const variant = group?.variants.find(
    ({ field }) =>
      field.surface === "record" &&
      field.stateMachineFacts?.currentValue === value &&
      field.stateMachineFacts.interaction.kind === "display",
  );

  if (!variant) {
    throw new Error(`Missing display-only ${value} state-machine record field scenario.`);
  }

  return withRecordIdentity(variant.field);
}

function editableRecordResultFixture(): FormlessUiRecordResultContract {
  const fields = [
    editableTitleField(),
    readOnlySlugField(),
    kindField("article"),
    recordResultUnionField("article"),
    invalidOwnerEmailField(),
    ...specializedRecordFields(),
    taskStatusField("open"),
  ];

  return readyRecordResult({
    accessibilityLabel: "Task record",
    actions: {
      id: `${resultId}:actions`,
      kind: "actionGroup",
      primary: [operationAction(initialCompleteTaskControl(), "transition")],
      secondary: [operationAction(operationControlFixtures.deleteTask.initial, "delete")],
      secondaryAccessibilityLabel: "More actions for Prepare launch checklist",
    },
    editing: { enabled: true },
    fields,
    selectedRecordLabel: "Prepare launch checklist",
    warnings: [
      {
        id: `${resultId}:${taskId}:readiness`,
        items: [{ code: "owner-email", message: "Owner email is missing." }],
        kind: "recordResultWarning",
        title: "Readiness warnings",
      },
    ],
  });
}

function readOnlyRecordResultFixture(): FormlessUiRecordResultContract {
  return readyRecordResult({
    accessibilityLabel: "Read-only task record",
    actions: emptyActions("read-only"),
    editing: { enabled: true },
    fields: [readOnlyTitleField(), readOnlySlugField(), taskStatusField("done")],
    selectedRecordLabel: "Prepare launch checklist",
    warnings: [],
  });
}

function editingDisabledRecordResultFixture(): FormlessUiRecordResultContract {
  return readyRecordResult({
    accessibilityLabel: "Owner-only task record",
    actions: emptyActions("editing-disabled"),
    editing: {
      disabledReason: "Editing requires an owner session.",
      enabled: false,
    },
    fields: [readOnlyTitleField(), readOnlySlugField(), taskStatusField("open")],
    selectedRecordLabel: "Prepare launch checklist",
    warnings: [],
  });
}

function stateRecordResultFixture(state: "empty" | "unavailable"): FormlessUiRecordResultContract {
  return {
    accessibilityLabel: state === "empty" ? "Empty task record" : "Unavailable task record",
    actions: emptyActions(state),
    availability:
      state === "empty"
        ? { state: "empty" }
        : { message: "Task record is unavailable.", state: "unavailable" },
    density: "default",
    editing: { enabled: true },
    ...(state === "empty"
      ? {
          emptyState: {
            description: "Change the current query to select a task.",
            id: `${resultId}:empty`,
            kind: "recordResultEmptyState" as const,
            title: "No task record found.",
          },
        }
      : {}),
    fields: [],
    id: `${resultId}:${state}`,
    kind: "recordResult",
    warnings: [],
  };
}

function readyRecordResult({
  accessibilityLabel,
  actions,
  editing,
  fields,
  selectedRecordLabel,
  warnings,
}: Pick<
  FormlessUiRecordResultContract,
  "accessibilityLabel" | "actions" | "editing" | "warnings"
> & {
  fields: readonly FormlessUiField[];
  selectedRecordLabel: string;
}): FormlessUiRecordResultContract {
  return {
    accessibilityLabel,
    actions,
    availability: { state: "ready" },
    density: "default",
    editing,
    fields: fields.map(recordResultField),
    id: resultId,
    kind: "recordResult",
    selectedRecord: {
      accessibilityLabel: selectedRecordLabel,
      id: taskId,
      kind: "recordResultRecord",
    },
    warnings,
  };
}

function editableTitleField() {
  return recordField({
    commit: "field-commit",
    control: titleControl,
    drafts: recordDrafts({ recordValue: "Prepare launch checklist" }),
    editor: titleControl.editor,
    field: titleSchema,
    fieldName: "title",
    labelVisibility: "visible",
    pending: { isPending: true, label: "Saving task" },
    recordId: taskId,
    rendererKind: "text",
  });
}

function readOnlyTitleField() {
  return displayField({
    control: titleControl,
    editor: titleControl.editor,
    field: titleSchema,
    fieldName: "title",
    formatting: { displayValue: "Prepare launch checklist" },
    labelVisibility: "visible",
    recordId: taskId,
    surface: "record",
    value: "Prepare launch checklist",
  });
}

function readOnlySlugField() {
  const control = textControl(slugSchema, { editor: "slug" });

  return displayField({
    control,
    editor: control.editor,
    field: slugSchema,
    fieldName: "slug",
    formatting: { displayValue: "prepare-launch-checklist" },
    labelVisibility: "visible",
    recordId: taskId,
    surface: "record",
    value: "prepare-launch-checklist",
  });
}

function kindField(kind: "article" | "link") {
  const control = enumControl(kindSchema);

  return recordField({
    commit: "field-commit",
    control,
    drafts: recordDrafts({ recordValue: kind }),
    editor: control.editor,
    field: kindSchema,
    fieldName: "kind",
    labelVisibility: "visible",
    options: { enumOptions: enumOptions(kindSchema) },
    recordId: taskId,
    rendererKind: "enum",
  });
}

function summaryField() {
  const control = textControl(summarySchema, { editor: "textarea" });

  return recordField({
    commit: "field-commit",
    control,
    drafts: recordDrafts({ recordValue: "Coordinate launch owners and final checks." }),
    editor: control.editor,
    field: summarySchema,
    fieldName: "summary",
    labelVisibility: "visible",
    recordId: taskId,
    rendererKind: "textarea",
    visibleWhen: { field: "kind", values: ["article"] },
  });
}

function urlField() {
  const control = textControl(urlSchema, { editor: "href" });

  return recordField({
    commit: "field-commit",
    control,
    drafts: recordDrafts({ recordValue: "https://example.com/releases/draft" }),
    editor: control.editor,
    field: urlSchema,
    fieldName: "url",
    labelVisibility: "visible",
    recordId: taskId,
    rendererKind: "text",
    visibleWhen: { field: "kind", values: ["link"] },
  });
}

function invalidOwnerEmailField() {
  const control = textControl(ownerEmailSchema);

  return recordField({
    commit: "field-commit",
    control,
    drafts: recordDrafts({ recordValue: "" }),
    editor: control.editor,
    errors: [fieldError("ownerEmail", "Owner email is required.")],
    field: ownerEmailSchema,
    fieldName: "ownerEmail",
    labelVisibility: "visible",
    recordId: taskId,
    rendererKind: "text",
  });
}

function specializedRecordFields(): FormlessUiField[] {
  return [
    scenarioRecordField("source-icon", "icon"),
    scenarioRecordField("media", "media"),
    scenarioRecordField("color", "color"),
    scenarioRecordField("number", "value-unit"),
    scenarioRecordField("date", "quiet-date"),
    scenarioRecordField("markdown", "markdown"),
    scenarioRecordField("enum", "enum-icon"),
  ];
}

function scenarioRecordField(
  kind: (typeof fieldScenarioGroups)[number]["kind"],
  rendererKind: "color" | "enum-icon" | "icon" | "markdown" | "media" | "quiet-date" | "value-unit",
) {
  const group = fieldScenarioGroups.find((candidate) => candidate.kind === kind);
  const variant = group?.variants.find(
    ({ field }) =>
      field.surface === "record" &&
      field.mode === "editor" &&
      "rendererKind" in field &&
      field.rendererKind === rendererKind,
  );

  if (!variant) {
    throw new Error(`Missing ${kind} ${rendererKind} record field scenario.`);
  }

  return withRecordIdentity(variant.field);
}

function withRecordIdentity(field: FormlessUiField): FormlessUiField {
  return {
    ...field,
    labelVisibility: "visible",
    recordId: taskId,
  };
}

function recordResultField(field: FormlessUiField): FormlessUiRecordResultFieldContract {
  return {
    field,
    id: `${resultId}:${taskId}:field:${field.fieldName}`,
    kind: "recordResultField",
  };
}

function initialCompleteTaskControl(): FormlessUiOperationControlContract {
  return {
    id: "task-complete",
    kind: "operationControl",
    status: {
      accessibilityLabel: "Complete task available. Status is Open.",
      detail: "Status is Open.",
      id: "task-complete-status",
      intent: "neutral",
      kind: "compactStatus",
      label: "Complete task available",
      status: "idle",
    },
    trigger: completeTaskTrigger(),
  };
}

function completeTaskTrigger(): FormlessUiOperationControlContract["trigger"] {
  return {
    accessibilityLabel: "Complete task",
    content: { icon: "confirm", kind: "iconAndLabel", label: "Complete" },
    density: "default",
    id: "task-complete-trigger",
    intent: {
      controlId: "task-complete",
      invocationSource: "button",
      type: "operationInvoke",
    },
    kind: "button",
    prominence: "primary",
    type: "button",
  };
}

function operationAction(
  control: FormlessUiOperationControlContract,
  role: FormlessUiRecordResultActionContract["role"],
): FormlessUiRecordResultActionContract {
  return { control, kind: "operationAction", role };
}

function emptyActions(id: string): FormlessUiRecordResultContract["actions"] {
  return {
    id: `${resultId}:${id}:actions`,
    kind: "actionGroup",
    primary: [],
    secondary: [],
    secondaryAccessibilityLabel: "More actions for task record",
  };
}

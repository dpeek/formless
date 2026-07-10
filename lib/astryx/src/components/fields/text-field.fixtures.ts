import {
  composeScenarioAxis,
  composeScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type { FieldScenarioGroup } from "../field-scenario-model.ts";
import {
  createField,
  displayField,
  draftInput,
  recordDrafts,
  recordField,
  textControl,
} from "./fixture-helpers.ts";

const taskField = {
  type: "text",
  required: true,
  label: "Task",
} as const;

const idField = {
  type: "text",
  required: true,
  label: "Record ID",
} as const;

const summaryField = {
  type: "text",
  required: false,
  label: "Summary",
  format: "longText",
} as const;

const briefField = {
  type: "text",
  required: false,
  label: "Brief",
  format: "markdown",
} as const;

const notesField = {
  type: "text",
  required: false,
  label: "Notes",
  format: "markdown",
} as const;

const textCreateBase = createField({
  fieldName: "title",
  field: taskField,
  editor: "text",
  control: textControl(taskField),
  draftInput: draftInput("Prepare launch checklist"),
  value: "Prepare launch checklist",
  recordId: "create-title",
});

const textRecordBase = recordField({
  fieldName: "title",
  field: taskField,
  editor: "text",
  control: textControl(taskField),
  commit: "field-commit",
  drafts: recordDrafts({ recordValue: "Review route changes" }),
  formatting: { displayValue: "Review route changes" },
  recordId: "record-title",
  rendererKind: "text",
});

const textDetailBase = displayField({
  fieldName: "id",
  field: idField,
  editor: "text",
  control: textControl(idField),
  access: { kind: "system", fieldRef: { kind: "system", name: "id" } },
  fieldRef: { kind: "system", name: "id" },
  formatting: { displayValue: "task-launch" },
  recordId: "system-id",
  value: "task-launch",
});

const longTextDetailBase = displayField({
  fieldName: "summary",
  field: summaryField,
  editor: "textarea",
  control: textControl(summaryField, { editor: "textarea", controlKind: "textarea" }),
  formatting: { displayValue: "Block placement review before publish." },
  recordId: "detail-summary",
  value: "Block placement review before publish.",
});

const markdownCreateBase = createField({
  fieldName: "brief",
  field: briefField,
  editor: "markdown",
  control: textControl(briefField, { editor: "markdown", controlKind: "markdown" }),
  draftInput: draftInput("## Launch scope\n\n- Confirm owner\n- Publish public page"),
  recordId: "create-brief",
  value: "## Launch scope\n\n- Confirm owner\n- Publish public page",
});

const markdownDetailBase = displayField({
  fieldName: "notes",
  field: notesField,
  editor: "markdown",
  control: textControl(notesField, { editor: "markdown", controlKind: "markdown" }),
  formatting: {
    displayValue:
      "### Publish note\n\nReview **routes** and [preview](https://example.com) before release.",
  },
  recordId: "detail-markdown",
  value: "### Publish note\n\nReview **routes** and [preview](https://example.com) before release.",
});

export const textScenarioGroups = [
  composeScenarioGroup({
    id: "text-create",
    kind: "text",
    surface: "create",
    base: textCreateBase,
    axes: [
      composeScenarioAxis("requiredness", "Requiredness", [scenarioOption("required", "Required")]),
    ],
  }),
  composeScenarioGroup({
    id: "text-record",
    kind: "text",
    surface: "record",
    base: textRecordBase,
    axes: [
      composeScenarioAxis("state", "State", [
        scenarioOption("default", "Default"),
        scenarioOption("pending", "Pending", {
          drafts: recordDrafts({ recordValue: "Publish homepage edits" }),
          formatting: { displayValue: "Publish homepage edits" },
          pending: { isPending: true, label: "Saving" },
          recordId: "pending-title",
        }),
      ]),
    ],
  }),
  composeScenarioGroup({
    id: "text-detail",
    kind: "text",
    surface: "detail",
    base: textDetailBase,
    axes: [composeScenarioAxis("state", "State", [scenarioOption("system", "System")])],
  }),
  composeScenarioGroup({
    id: "long-text-detail",
    kind: "long-text",
    surface: "detail",
    base: longTextDetailBase,
    axes: [composeScenarioAxis("mode", "Mode", [scenarioOption("default", "Default")])],
  }),
  composeScenarioGroup({
    id: "markdown-create",
    kind: "markdown",
    surface: "create",
    base: markdownCreateBase,
    axes: [composeScenarioAxis("mode", "Mode", [scenarioOption("default", "Default")])],
  }),
  composeScenarioGroup({
    id: "markdown-detail",
    kind: "markdown",
    surface: "detail",
    base: markdownDetailBase,
    axes: [composeScenarioAxis("mode", "Mode", [scenarioOption("default", "Default")])],
  }),
] satisfies readonly FieldScenarioGroup[];

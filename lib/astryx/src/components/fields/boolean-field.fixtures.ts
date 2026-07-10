import {
  composeScenarioAxis,
  composeScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type { FieldScenarioGroup } from "../field-scenario-model.ts";
import {
  booleanControl,
  draftInput,
  operationField,
  recordDrafts,
  recordField,
} from "./fixture-helpers.ts";

const completedField = {
  type: "boolean",
  required: false,
  label: "Completed",
  default: false,
} as const;

const subscribeField = {
  type: "boolean",
  required: false,
  label: "Subscribe",
  default: true,
} as const;

const booleanRecordBase = recordField({
  fieldName: "completed",
  field: completedField,
  editor: "boolean",
  control: booleanControl(completedField),
  commit: "immediate",
  drafts: recordDrafts({ recordValue: false }),
  formatting: { displayValue: "No" },
  recordId: "record-completed",
  rendererKind: "checkbox",
});

const booleanOperationBase = operationField({
  fieldName: "subscribe",
  field: subscribeField,
  editor: "boolean",
  control: booleanControl(subscribeField),
  draftInput: draftInput(true),
  value: true,
  recordId: "operation-subscribe",
});

export const booleanScenarioGroups = [
  composeScenarioGroup({
    id: "boolean-record",
    kind: "boolean",
    surface: "record",
    base: booleanRecordBase,
    axes: [
      composeScenarioAxis("presentation", "Presentation", [
        scenarioOption("default", "Default Checkbox"),
        scenarioOption("completion", "Completion", {
          presentation: { mode: "completion" },
          rendererKind: "completion-checkbox",
        }),
      ]),
    ],
    finalizeField: ({ field, optionIds }) => ({
      ...field,
      recordId: `record-completed-${optionIds.join("-")}`,
    }),
  }),
  composeScenarioGroup({
    id: "boolean-operation",
    kind: "boolean",
    surface: "operation",
    base: booleanOperationBase,
    axes: [composeScenarioAxis("mode", "Mode", [scenarioOption("subscribe", "Subscribe")])],
  }),
] satisfies readonly FieldScenarioGroup[];

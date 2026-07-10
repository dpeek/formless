import {
  composeScenarioAxis,
  composeScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type { FieldScenarioGroup } from "../field-scenario-model.ts";
import { fieldError, numberControl, recordDrafts, recordField } from "./fixture-helpers.ts";

const estimateField = {
  type: "number",
  required: false,
  label: "Estimate",
  min: 0,
  integer: false,
} as const;

const unitField = {
  type: "enum",
  required: true,
  label: "Unit",
  values: {
    h: { label: "h" },
    d: { label: "d" },
  },
  default: "h",
} as const;

const numberRecordBase = recordField({
  fieldName: "estimateHours",
  field: estimateField,
  editor: "number",
  control: numberControl(estimateField),
  commit: "field-commit",
  drafts: recordDrafts({ recordValue: 6 }),
  formatting: { displayValue: "6" },
  recordId: "record-estimate",
  rendererKind: "number",
});

export const numberScenarioGroups = [
  composeScenarioGroup({
    id: "number-record",
    kind: "number",
    surface: "record",
    base: numberRecordBase,
    axes: [
      composeScenarioAxis("state", "State", [
        scenarioOption("plain", "Plain"),
        scenarioOption("invalid-draft", "Invalid Draft", {
          drafts: recordDrafts({
            draft: "6..",
            draftInput: { kind: "input", value: "6.." },
            recordValue: 6,
          }),
          errors: [fieldError("estimateHours", "Enter a number.")],
          recordId: "record-estimate-invalid",
        }),
        scenarioOption("value-unit", "Value Unit", {
          drafts: recordDrafts({
            draft: "6",
            draftInput: { kind: "value", value: 6 },
            recordValue: 6,
            unitDraft: "h",
            unitDraftInput: { kind: "input", value: "h" },
            unitRecordValue: "h",
          }),
          recordId: "record-estimate-value-unit",
          rendererKind: "value-unit",
          valueUnit: { unitFieldName: "estimateUnit", unitField },
        }),
      ]),
    ],
  }),
] satisfies readonly FieldScenarioGroup[];

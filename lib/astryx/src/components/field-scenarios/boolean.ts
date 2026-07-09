import {
  composeScenarioAxis,
  composeScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type { FieldScenarioGroup } from "../field-scenario-model.ts";
import type { AstryxFieldData } from "../../field-contract.ts";

const booleanRecordBase = {
  id: "record-completed",
  name: "completed",
  label: "Completed",
  surface: "record",
  density: "balanced",
  accessMode: "editable",
  kind: "boolean",
  mode: "editor",
  draftValue: false,
  committedValue: false,
  committedDisplayValue: "No",
  commitPolicy: "immediate",
} satisfies AstryxFieldData;

const booleanPublicActionBase = {
  id: "public-action-subscribe",
  name: "subscribe",
  label: "Subscribe",
  surface: "public-action",
  density: "balanced",
  accessMode: "editable",
  kind: "boolean",
  mode: "editor",
  draftValue: true,
  committedDisplayValue: "",
  commitPolicy: "submit",
} satisfies AstryxFieldData;

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
          presentation: { boolean: { mode: "completion" } },
        }),
      ]),
    ],
    finalizeField: ({ field, optionIds }) => ({
      ...field,
      id: `record-completed-${optionIds.join("-")}`,
    }),
  }),
  composeScenarioGroup({
    id: "boolean-public-action",
    kind: "boolean",
    surface: "public-action",
    base: booleanPublicActionBase,
    axes: [
      composeScenarioAxis("mode", "Mode", [
        scenarioOption("subscribe", "Subscribe"),
      ]),
    ],
  }),
] satisfies readonly FieldScenarioGroup[];

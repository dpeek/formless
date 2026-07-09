import {
  composeScenarioAxis,
  composeScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type { FieldScenarioGroup } from "../field-scenario-model.ts";
import type { AstryxFieldData } from "../../field-contract.ts";

const numberRecordBase = {
  id: "record-estimate",
  name: "estimateHours",
  label: "Estimate",
  surface: "record",
  density: "balanced",
  accessMode: "editable",
  kind: "number",
  mode: "editor",
  draftValue: 6,
  committedValue: 6,
  committedDisplayValue: "6",
  commitPolicy: "field",
  presentation: { placeholder: "Hours" },
} satisfies AstryxFieldData;

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
          id: "record-estimate-invalid",
          draftValue: "6..",
          errors: [{ id: "estimate-invalid", message: "Enter a number." }],
          presentation: undefined,
        }),
      ]),
    ],
  }),
] satisfies readonly FieldScenarioGroup[];

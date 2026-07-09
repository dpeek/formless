import {
  composeScenarioAxis,
  composeScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type {
  FieldScenarioComposeContext,
  FieldScenarioGroup,
} from "../field-scenario-model.ts";
import type { AstryxFieldData } from "../../field-contract.ts";
import { displayOption, statusOptions } from "./fixtures.ts";

const enumRecordBase = {
  id: "record-status",
  name: "status",
  label: "Status",
  isRequired: true,
  surface: "record",
  density: "balanced",
  accessMode: "editable",
  kind: "enum",
  mode: "editor",
  draftValue: "waiting",
  committedValue: "waiting",
  committedDisplayValue: "Waiting",
  commitPolicy: "immediate",
  options: statusOptions,
} satisfies AstryxFieldData;

const enumTableCellBase = {
  id: "cell-status",
  name: "status",
  label: "Status",
  surface: "table-cell",
  density: "compact",
  accessMode: "editable",
  kind: "enum",
  mode: "editor",
  draftValue: "waiting",
  committedValue: "waiting",
  committedDisplayValue: "Waiting",
  commitPolicy: "immediate",
  options: statusOptions,
} satisfies AstryxFieldData;

export const enumScenarioGroups = [
  composeScenarioGroup({
    id: "enum-record",
    kind: "enum",
    surface: "record",
    base: enumRecordBase,
    axes: [
      composeScenarioAxis("requiredness", "Required", [
        scenarioOption("required", "Required", { isRequired: true }),
        scenarioOption("optional", "Optional", { isRequired: false }),
      ]),
      composeScenarioAxis("value", "Value", [
        scenarioOption("filled", "Filled", {
          draftValue: "waiting",
          committedValue: "waiting",
          committedDisplayValue: "Waiting",
        }),
        scenarioOption("empty", "Empty", {
          draftValue: "",
          committedValue: "",
          committedDisplayValue: "",
        }),
      ]),
      composeScenarioAxis("presentation", "Presentation", [
        scenarioOption("default", "Default"),
        scenarioOption("icon-only-trigger", "Icon Trigger", {
          draftValue: "open",
          committedValue: "open",
          committedDisplayValue: "Open",
          presentation: { enum: { mode: "iconOnly", trigger: "icon", list: "both" } },
        }),
        scenarioOption("trigger-both", "Trigger Both", {
          draftValue: "blocked",
          committedValue: "blocked",
          committedDisplayValue: "Blocked",
          presentation: { enum: { trigger: "both", list: "both" } },
        }),
        scenarioOption("list-label", "List Label", {
          draftValue: "waiting",
          committedValue: "waiting",
          committedDisplayValue: "Waiting",
          presentation: { enum: { trigger: "both", list: "label" } },
        }),
        scenarioOption("invalid-stored-value", "Invalid Value", {
          draftValue: "paused",
          committedValue: "paused",
          committedDisplayValue: "paused",
        }),
      ]),
    ],
    include: enumRecordCombinationIsValid,
    finalizeField: finalizeEnumRecordField,
  }),
  composeScenarioGroup({
    id: "enum-table-cell",
    kind: "enum",
    surface: "table-cell",
    base: enumTableCellBase,
    axes: [
      composeScenarioAxis("mode", "Mode", [
        scenarioOption("default", "Default"),
      ]),
    ],
  }),
] satisfies readonly FieldScenarioGroup[];

function enumRecordCombinationIsValid({ facets }: FieldScenarioComposeContext) {
  if (facets.presentation === "default") {
    return true;
  }

  return facets.requiredness === "required" && facets.value === "filled";
}

function finalizeEnumRecordField({
  facets,
  field,
  optionIds,
}: FieldScenarioComposeContext): AstryxFieldData {
  if (field.mode !== "editor") {
    return field;
  }

  const draftValue = String(field.draftValue ?? "");

  return {
    ...field,
    id: `record-status-${optionIds.join("-")}`,
    committedValue: draftValue,
    committedDisplayValue: displayOption(statusOptions, draftValue),
    errors:
      facets.requiredness === "required" && facets.value === "empty"
        ? [{ id: "status-required", message: "Choose a status." }]
        : undefined,
  };
}

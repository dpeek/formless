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

const dueDate = "2026-07-08";

const dateRecordBase = {
  id: "record-date",
  name: "dueDate",
  label: "Due",
  isRequired: false,
  surface: "record",
  density: "balanced",
  accessMode: "editable",
  kind: "date",
  mode: "editor",
  draftValue: dueDate,
  committedValue: dueDate,
  committedDisplayValue: "Jul 8",
  commitPolicy: "field",
} satisfies AstryxFieldData;

const dateTableCellBase = {
  id: "cell-due",
  name: "dueDate",
  label: "Due",
  surface: "table-cell",
  density: "compact",
  accessMode: "read-only",
  kind: "date",
  mode: "display",
  value: dueDate,
  displayValue: "Jul 8",
} satisfies AstryxFieldData;

const dateDetailBase = {
  id: "system-updated",
  name: "updatedAt",
  label: "Updated",
  surface: "detail",
  density: "compact",
  accessMode: "system",
  kind: "date",
  mode: "display",
  value: "2026-07-06T09:30:00.000Z",
  displayValue: "Jul 6, 2026 9:30 AM",
} satisfies AstryxFieldData;

export const dateScenarioGroups = [
  composeScenarioGroup({
    id: "date-record",
    kind: "date",
    surface: "record",
    base: dateRecordBase,
    axes: [
      composeScenarioAxis("requiredness", "Required", [
        scenarioOption("optional", "Optional", { isRequired: false }),
        scenarioOption("required", "Required", { isRequired: true }),
      ]),
      composeScenarioAxis("value", "Value", [
        scenarioOption("filled", "Filled", {
          draftValue: dueDate,
          committedValue: dueDate,
          committedDisplayValue: "Jul 8",
        }),
        scenarioOption("empty", "Empty", {
          draftValue: "",
          committedValue: null,
          committedDisplayValue: "",
        }),
      ]),
      composeScenarioAxis("presentation", "Presentation", [
        scenarioOption("default", "Default"),
        scenarioOption("value-or-interaction", "Value Or Interaction", {
          presentation: { date: { visibility: "valueOrInteraction" } },
        }),
      ]),
    ],
    include: dateRecordCombinationIsValid,
    finalizeField: finalizeDateRecordField,
  }),
  composeScenarioGroup({
    id: "date-table-cell",
    kind: "date",
    surface: "table-cell",
    base: dateTableCellBase,
    axes: [
      composeScenarioAxis("state", "State", [
        scenarioOption("readonly", "Read Only"),
      ]),
    ],
  }),
  composeScenarioGroup({
    id: "date-detail",
    kind: "date",
    surface: "detail",
    base: dateDetailBase,
    axes: [
      composeScenarioAxis("state", "State", [
        scenarioOption("system", "System"),
      ]),
    ],
  }),
] satisfies readonly FieldScenarioGroup[];

function dateRecordCombinationIsValid({ facets }: FieldScenarioComposeContext) {
  if (facets.presentation === "value-or-interaction") {
    return facets.requiredness === "optional" && facets.value === "empty";
  }

  return true;
}

function finalizeDateRecordField({
  facets,
  field,
  optionIds,
}: FieldScenarioComposeContext): AstryxFieldData {
  if (field.mode !== "editor") {
    return field;
  }

  return {
    ...field,
    id: `record-date-${optionIds.join("-")}`,
    errors:
      facets.requiredness === "required" && facets.value === "empty"
        ? [{ id: "due-required", message: "Choose a due date." }]
        : undefined,
  };
}

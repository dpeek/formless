import {
  composeScenarioAxis,
  composeScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type { FieldScenarioComposeContext, FieldScenarioGroup } from "../field-scenario-model.ts";
import {
  dateControl,
  displayField,
  fieldError,
  recordDrafts,
  recordField,
} from "./fixture-helpers.ts";
import type { FormlessUiField } from "../../formless-ui-contract.ts";

const dueDate = "2026-07-08";

const dueDateField = {
  type: "date",
  required: false,
  label: "Due",
} as const;

const updatedAtField = {
  type: "date",
  required: false,
  label: "Updated",
} as const;

const dateRecordBase = recordField({
  fieldName: "dueDate",
  field: dueDateField,
  editor: "date",
  control: dateControl(dueDateField),
  commit: "field-commit",
  drafts: recordDrafts({ recordValue: dueDate }),
  formatting: { displayValue: "Jul 8" },
  recordId: "record-date",
  rendererKind: "date",
});

const dateTableCellBase = displayField({
  fieldName: "dueDate",
  field: dueDateField,
  editor: "date",
  control: dateControl(dueDateField),
  access: { kind: "readOnly", writable: false },
  formatting: { displayValue: "Jul 8" },
  recordId: "cell-due",
  surface: "table-cell",
  value: dueDate,
});

const dateDetailBase = displayField({
  fieldName: "updatedAt",
  field: updatedAtField,
  editor: "date",
  control: dateControl(updatedAtField),
  access: { kind: "system", fieldRef: { kind: "system", name: "updatedAt" } },
  fieldRef: { kind: "system", name: "updatedAt" },
  formatting: { displayValue: "Jul 6, 2026 9:30 AM" },
  recordId: "system-updated",
  surface: "detail",
  value: "2026-07-06T09:30:00.000Z",
});

export const dateScenarioGroups = [
  composeScenarioGroup({
    id: "date-record",
    kind: "date",
    surface: "record",
    base: dateRecordBase,
    axes: [
      composeScenarioAxis("requiredness", "Required", [
        scenarioOption("optional", "Optional"),
        scenarioOption("required", "Required", requiredDate),
      ]),
      composeScenarioAxis("value", "Value", [
        scenarioOption("filled", "Filled", withDateValue(dueDate, "Jul 8")),
        scenarioOption("empty", "Empty", withDateValue("", "")),
      ]),
      composeScenarioAxis("presentation", "Presentation", [
        scenarioOption("default", "Default"),
        scenarioOption("value-or-interaction", "Value Or Interaction", {
          presentation: { visibility: "valueOrInteraction" },
          rendererKind: "quiet-date",
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
    axes: [composeScenarioAxis("state", "State", [scenarioOption("readonly", "Read Only")])],
  }),
  composeScenarioGroup({
    id: "date-detail",
    kind: "date",
    surface: "detail",
    base: dateDetailBase,
    axes: [composeScenarioAxis("state", "State", [scenarioOption("system", "System")])],
  }),
] satisfies readonly FieldScenarioGroup[];

function dateRecordCombinationIsValid({ facets }: FieldScenarioComposeContext) {
  if (facets.presentation === "value-or-interaction") {
    return facets.requiredness === "optional" && facets.value === "empty";
  }

  return true;
}

function finalizeDateRecordField({ facets, field, optionIds }: FieldScenarioComposeContext) {
  if (field.mode !== "editor") {
    return field;
  }

  return {
    ...field,
    recordId: `record-date-${optionIds.join("-")}`,
    errors:
      facets.requiredness === "required" && facets.value === "empty"
        ? [fieldError("dueDate", "Choose a due date.")]
        : undefined,
  };
}

function requiredDate(field: FormlessUiField): FormlessUiField {
  const requiredField = { ...dueDateField, required: true };

  if (field.mode !== "editor" || field.surface === "create" || field.surface === "operation") {
    return field;
  }

  return {
    ...field,
    control: dateControl(requiredField),
    field: requiredField,
    required: true,
  };
}

function withDateValue(value: string, displayValue: string) {
  return (field: FormlessUiField): FormlessUiField => {
    if (field.mode !== "editor" || field.surface === "create" || field.surface === "operation") {
      return field;
    }

    return {
      ...field,
      drafts: recordDrafts({
        draft: value,
        draftInput: { kind: "input", value },
        recordValue: value,
      }),
      formatting: { ...field.formatting, displayValue },
    };
  };
}

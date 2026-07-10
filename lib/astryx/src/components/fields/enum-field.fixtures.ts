import {
  composeScenarioAxis,
  composeScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type { FieldScenarioComposeContext, FieldScenarioGroup } from "../field-scenario-model.ts";
import {
  enumControl,
  enumOptions,
  enumValuePresentation,
  fieldError,
  recordDrafts,
  recordField,
} from "./fixture-helpers.ts";
import type { FormlessUiField } from "../../formless-ui-contract.ts";

const priorityMarkerIconSource = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M12 4.75v14.5" />',
  '<path d="m6.75 10 5.25-5.25L17.25 10" />',
  "</svg>",
].join("");

const closeIconSource = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="m6.75 6.75 10.5 10.5" />',
  '<path d="m17.25 6.75-10.5 10.5" />',
  "</svg>",
].join("");

const statusField = {
  type: "enum",
  required: true,
  label: "Status",
  values: {
    open: {
      label: "Open",
      presentation: { icon: "priority-marker", color: "#2563eb" },
    },
    waiting: { label: "Waiting", presentation: { color: "#d97706" } },
    blocked: { label: "Blocked", presentation: { icon: "close", color: "danger" } },
    done: { label: "Done", presentation: { color: "success" } },
  },
  default: "open",
} as const;

const statusOptions = enumOptions(statusField, {
  blocked: { iconSource: closeIconSource },
  open: { iconSource: priorityMarkerIconSource },
});

const enumRecordBase = recordField({
  fieldName: "status",
  field: statusField,
  editor: "enum",
  control: enumControl(statusField),
  commit: "immediate",
  drafts: recordDrafts({ recordValue: "waiting" }),
  formatting: {
    displayValue: "Waiting",
    enumValuePresentation: enumValuePresentation(statusField, "waiting"),
  },
  options: { enumOptions: statusOptions },
  recordId: "record-status",
  rendererKind: "enum",
});

const enumTableCellBase = recordField({
  fieldName: "status",
  field: statusField,
  editor: "enum",
  control: enumControl(statusField),
  commit: "immediate",
  density: "compact",
  drafts: recordDrafts({ recordValue: "waiting" }),
  formatting: {
    displayValue: "Waiting",
    enumValuePresentation: enumValuePresentation(statusField, "waiting"),
  },
  options: { enumOptions: statusOptions },
  recordId: "cell-status",
  rendererKind: "enum",
  surface: "table-cell",
});

export const enumScenarioGroups = [
  composeScenarioGroup({
    id: "enum-record",
    kind: "enum",
    surface: "record",
    base: enumRecordBase,
    axes: [
      composeScenarioAxis("requiredness", "Required", [
        scenarioOption("required", "Required"),
        scenarioOption("optional", "Optional", withEnumRequired(false)),
      ]),
      composeScenarioAxis("value", "Value", [
        scenarioOption("filled", "Filled", withEnumValue("waiting")),
        scenarioOption("empty", "Empty", withEnumValue("")),
      ]),
      composeScenarioAxis("presentation", "Presentation", [
        scenarioOption("default", "Default"),
        scenarioOption("icon-only-trigger", "Icon Trigger", {
          ...withEnumValuePatch("open"),
          presentation: { mode: "iconOnly", trigger: "icon", list: "both" },
          rendererKind: "enum-icon",
        }),
        scenarioOption("trigger-both", "Trigger Both", {
          ...withEnumValuePatch("blocked"),
          presentation: { trigger: "both", list: "both" },
          rendererKind: "enum-icon",
        }),
        scenarioOption("list-label", "List Label", {
          ...withEnumValuePatch("waiting"),
          presentation: { trigger: "both", list: "label" },
        }),
        scenarioOption("invalid-stored-value", "Invalid Value", {
          ...withEnumValuePatch("paused"),
          options: { enumOptions: statusOptions, unknownEnumValue: "paused" },
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
    axes: [composeScenarioAxis("mode", "Mode", [scenarioOption("default", "Default")])],
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
}: FieldScenarioComposeContext): FormlessUiField {
  if (field.mode !== "editor" || field.surface === "create" || field.surface === "operation") {
    return field;
  }

  const draftValue = "drafts" in field ? field.drafts.draft : "";

  return {
    ...field,
    formatting: {
      ...field.formatting,
      displayValue: displayOption(draftValue),
      enumValuePresentation:
        draftValue === "" ? undefined : enumValuePresentation(statusField, draftValue),
    },
    recordId: `record-status-${optionIds.join("-")}`,
    errors:
      facets.requiredness === "required" && facets.value === "empty"
        ? [fieldError("status", "Choose a status.")]
        : undefined,
  };
}

function withEnumRequired(required: boolean) {
  return (field: FormlessUiField): FormlessUiField => {
    const nextField = { ...statusField, required };

    if (field.control.kind !== "enum") {
      return field;
    }

    return {
      ...field,
      control: enumControl(nextField),
      field: nextField,
      required,
    };
  };
}

function withEnumValue(value: string) {
  return (_field: FormlessUiField): FormlessUiField => ({
    ..._field,
    ...withEnumValuePatch(value),
  });
}

function withEnumValuePatch(value: string) {
  return {
    drafts: recordDrafts({
      draft: value,
      draftInput: { kind: "input" as const, value },
      recordValue: value,
    }),
    formatting: {
      displayValue: displayOption(value),
      enumValuePresentation: value === "" ? undefined : enumValuePresentation(statusField, value),
    },
  };
}

function displayOption(value: string) {
  const values: Record<string, { label: string }> = statusField.values;

  return values[value]?.label ?? value;
}

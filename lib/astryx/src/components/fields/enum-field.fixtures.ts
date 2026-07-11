import {
  composeScenarioAxis,
  projectScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type { FieldScenarioGroup, FieldScenarioProjectionContext } from "../field-scenario-model.ts";
import {
  enumControl,
  enumOptions,
  enumValuePresentation,
  fieldError,
  recordDrafts,
  recordField,
} from "./fixture-helpers.ts";
import type {
  FormlessUiField,
  FormlessUiFieldSurface,
  FormlessUiRecordFieldRendererKind,
} from "../../formless-ui-contract.ts";

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

const enumAxes = [
  composeScenarioAxis("surface", "Surface", [
    scenarioOption("record", "Record"),
    scenarioOption("table-cell", "Table Cell"),
  ]),
  composeScenarioAxis("requiredness", "Required", [
    scenarioOption("required", "Required"),
    scenarioOption("optional", "Optional"),
  ]),
  composeScenarioAxis("value", "Value", [
    scenarioOption("filled", "Known"),
    scenarioOption("empty", "Empty"),
    scenarioOption("unknown", "Unknown"),
  ]),
  composeScenarioAxis("presentation", "Presentation", [
    scenarioOption("default", "Default"),
    scenarioOption("icon-only-trigger", "Icon Trigger"),
    scenarioOption("trigger-both", "Trigger Both"),
    scenarioOption("list-label", "List Label"),
  ]),
];

export const enumScenarioGroups = [
  projectScenarioGroup({
    id: "enum",
    kind: "enum",
    axes: enumAxes,
    include: enumCombinationIsValid,
    projectField: projectEnumField,
  }),
] satisfies readonly FieldScenarioGroup[];

function enumCombinationIsValid({ facets }: FieldScenarioProjectionContext) {
  if (facets.value === "unknown") {
    return facets.requiredness === "required" && facets.presentation === "default";
  }

  if (facets.presentation === "default") {
    return true;
  }

  return facets.requiredness === "required" && facets.value === "filled";
}

function projectEnumField({
  facets,
  optionIds,
}: FieldScenarioProjectionContext): FormlessUiField {
  const surface = enumSurface(facets.surface);
  const value = enumValue(facets.value);
  const required = facets.requiredness !== "optional";
  const field = { ...statusField, required };
  const presentation = enumPresentation(facets.presentation);

  return recordField({
    fieldName: "status",
    field,
    editor: "enum",
    control: enumControl(field),
    commit: "immediate",
    density: surface === "table-cell" ? "compact" : "default",
    drafts: recordDrafts({
      draft: value,
      draftInput: { kind: "input", value },
      recordValue: value,
    }),
    errors: required && value === "" ? [fieldError("status", "Choose a status.")] : undefined,
    formatting: {
      displayValue: displayOption(value),
      enumValuePresentation: value === "" ? undefined : enumValuePresentation(statusField, value),
    },
    options: {
      enumOptions: statusOptions,
      unknownEnumValue: value === "paused" ? "paused" : undefined,
    },
    presentation,
    recordId: `${surface}-status-${optionIds.join("-")}`,
    rendererKind: enumRendererKind(facets.presentation),
    surface,
  });
}

function enumSurface(
  surface: string | undefined,
): Extract<FormlessUiFieldSurface, "record" | "table-cell"> {
  return surface === "table-cell" ? "table-cell" : "record";
}

function enumValue(value: string | undefined) {
  if (value === "empty") {
    return "";
  }

  if (value === "unknown") {
    return "paused";
  }

  return "open";
}

function enumRendererKind(
  presentation: string | undefined,
): FormlessUiRecordFieldRendererKind {
  return presentation === "icon-only-trigger" || presentation === "trigger-both"
    ? "enum-icon"
    : "enum";
}

function enumPresentation(presentation: string | undefined): FormlessUiField["presentation"] {
  if (presentation === "icon-only-trigger") {
    return { mode: "iconOnly", trigger: "icon", list: "both" };
  }

  if (presentation === "trigger-both") {
    return { trigger: "both", list: "both" };
  }

  if (presentation === "list-label") {
    return { trigger: "both", list: "label" };
  }

  return undefined;
}

function displayOption(value: string) {
  const values: Record<string, { label: string }> = statusField.values;

  return values[value]?.label ?? value;
}

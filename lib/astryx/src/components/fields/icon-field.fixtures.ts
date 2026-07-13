import {
  composeScenarioAxis,
  projectScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type {
  FieldScenarioGroup,
  FieldScenarioProjectionContext,
} from "../field-scenario-model.ts";
import type {
  FormlessUiFieldSurface,
  FormlessUiIconPickerFacts,
} from "../../formless-ui-contract.ts";
import { listIconCatalogEntries } from "../../../../../src/shared/icon-catalog.ts";
import {
  createField,
  displayField,
  draftInput,
  recordDrafts,
  recordField,
  textControl,
} from "./fixture-helpers.ts";

const pageIconSource = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">',
  '<path d="M4.75 19.25h14.5" />',
  '<path d="M6.75 19.25V5.75a1 1 0 0 1 1-1h8.5a1 1 0 0 1 1 1v13.5" />',
  "</svg>",
].join("");
const customIconSource = [
  '<svg viewBox="0 0 24 24" fill="currentColor">',
  '<path d="M12 3 21 12 12 21 3 12Z" />',
  "</svg>",
].join("");

const pageIconField = {
  type: "text",
  required: true,
  label: "Page Icon",
  format: "icon",
} as const;
const optionalPageIconField = { ...pageIconField, required: false } as const;
const iconOptions = [
  { id: "page", label: "Page", group: "Content", source: pageIconSource },
  ...listIconCatalogEntries()
    .slice(0, 19)
    .map((entry) => ({
      group: entry.group,
      id: entry.key,
      label: entry.label,
      source: entry.source,
    })),
];

const requirednessAxis = composeScenarioAxis("requiredness", "Requiredness", [
  scenarioOption("required", "Required"),
  scenarioOption("optional", "Optional"),
]);
const valueAxis = composeScenarioAxis("value", "Value", [
  scenarioOption("catalog", "Catalog Source"),
  scenarioOption("custom", "Custom Source"),
  scenarioOption("unset", "Unset"),
]);
const modeAxis = composeScenarioAxis("mode", "Mode", [
  scenarioOption("editor", "Editor"),
  scenarioOption("display", "Display"),
]);
export const iconScenarioGroups = [
  projectScenarioGroup({
    id: "source-icon-create",
    kind: "source-icon",
    axes: [requirednessAxis, valueAxis],
    projectField: projectCreateIconField,
  }),
  existingIconGroup("record"),
  existingIconGroup("table-cell"),
  existingIconGroup("detail"),
] satisfies readonly FieldScenarioGroup[];

function existingIconGroup(
  surface: Extract<FormlessUiFieldSurface, "detail" | "record" | "table-cell">,
) {
  return projectScenarioGroup({
    id: `source-icon-${surface}`,
    kind: "source-icon",
    axes: [modeAxis, requirednessAxis, valueAxis],
    projectField: (context) => projectExistingIconField(surface, context),
  });
}

function projectCreateIconField({ facets }: FieldScenarioProjectionContext) {
  const required = facets.requiredness === "required";
  const field = required ? pageIconField : optionalPageIconField;
  const value = iconValue(facets.value);

  return createField({
    fieldName: "pageIcon",
    field,
    editor: "icon",
    control: textControl(field, { editor: "icon", controlKind: "icon" }),
    draftInput: draftInput(value),
    icon: iconPickerFacts(value),
    labelVisibility: "visible",
    options: { iconOptions },
    recordId: `source-icon-create-${facets.requiredness}-${facets.value}`,
    value,
  });
}

function projectExistingIconField(
  surface: Extract<FormlessUiFieldSurface, "detail" | "record" | "table-cell">,
  { facets }: FieldScenarioProjectionContext,
) {
  const required = facets.requiredness === "required";
  const field = required ? pageIconField : optionalPageIconField;
  const value = iconValue(facets.value);
  const common = {
    fieldName: "pageIcon",
    field,
    editor: "icon" as const,
    control: textControl(field, { editor: "icon", controlKind: "icon" }),
    labelVisibility: surface === "detail" ? ("visible" as const) : ("hidden" as const),
    options: { iconOptions },
    recordId: `source-icon-${surface}-${facets.mode}-${facets.requiredness}-${facets.value}`,
    surface,
  };

  return facets.mode === "display"
    ? displayField({
        ...common,
        density: surface === "table-cell" ? "compact" : "default",
        formatting: { displayValue: value ? "Page icon" : "" },
        value: value || undefined,
      })
    : recordField({
        ...common,
        commit: "field-commit",
        density: surface === "table-cell" ? "compact" : "default",
        drafts: recordDrafts({ recordValue: value || undefined }),
        formatting: { displayValue: value ? "Page icon" : "" },
        icon: iconPickerFacts(value),
        rendererKind: "icon",
      });
}

function iconValue(value: string | undefined) {
  return value === "catalog" ? pageIconSource : value === "custom" ? customIconSource : "";
}

function iconPickerFacts(
  value: string,
): FormlessUiIconPickerFacts {
  const dialogDraft = value;
  const option = iconOptions.find((candidate) => candidate.source === dialogDraft);

  return {
    canCancel: false,
    canSave: false,
    dialogDraft,
    dialogOpen: false,
    emptyValue: dialogDraft.trim() === "",
    previewSource: dialogDraft,
    selection:
      dialogDraft.trim() === ""
        ? { kind: "empty" }
        : option
          ? { kind: "option", optionId: option.id, source: dialogDraft }
          : { kind: "customSource", source: dialogDraft },
    valueMode: "svgSource",
  };
}

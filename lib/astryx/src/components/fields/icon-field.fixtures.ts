import {
  composeScenarioAxis,
  composeScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type { FieldScenarioGroup } from "../field-scenario-model.ts";
import { displayField, textControl } from "./fixture-helpers.ts";

const publishedPageIconSource = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M4.75 19.25h14.5" />',
  '<path d="M6.75 19.25V5.75a1 1 0 0 1 1-1h8.5a1 1 0 0 1 1 1v13.5" />',
  '<path d="M9.25 8.75h5.5" />',
  '<path d="M9.25 12h5.5" />',
  '<path d="M9.25 15.25h2.5" />',
  "</svg>",
].join("");

const pageIconField = {
  type: "text",
  required: false,
  label: "Page Icon",
  format: "icon",
} as const;

const sourceIconDetailBase = displayField({
  fieldName: "pageIcon",
  field: pageIconField,
  editor: "icon",
  control: textControl(pageIconField, { editor: "icon", controlKind: "icon" }),
  formatting: { displayValue: "Published page" },
  recordId: "detail-page-icon",
  value: publishedPageIconSource,
});

export const iconScenarioGroups = [
  composeScenarioGroup({
    id: "source-icon-detail",
    kind: "source-icon",
    surface: "detail",
    base: sourceIconDetailBase,
    axes: [
      composeScenarioAxis("state", "State", [
        scenarioOption("source", "Source"),
        scenarioOption("empty", "Empty", {
          fieldName: "emptyIcon",
          formatting: { displayValue: "Empty source" },
          label: "Empty Icon",
          recordId: "detail-empty-icon",
          value: "",
        }),
      ]),
    ],
  }),
] satisfies readonly FieldScenarioGroup[];

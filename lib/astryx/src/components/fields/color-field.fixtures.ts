import {
  composeScenarioAxis,
  composeScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type { FieldScenarioGroup } from "../field-scenario-model.ts";
import { displayField, recordDrafts, recordField, textControl } from "./fixture-helpers.ts";

const accentField = {
  type: "text",
  required: false,
  label: "Accent",
  format: "color",
} as const;

const colorRecordBase = recordField({
  fieldName: "accent",
  field: accentField,
  editor: "color",
  control: textControl(accentField, { editor: "color", controlKind: "color" }),
  commit: "field-commit",
  drafts: recordDrafts({ recordValue: "#2563eb" }),
  formatting: { displayValue: "#2563eb" },
  recordId: "record-accent",
  rendererKind: "color",
});

const colorTableCellBase = recordField({
  fieldName: "accent",
  field: accentField,
  editor: "color",
  control: textControl(accentField, { editor: "color", controlKind: "color" }),
  commit: "immediate",
  density: "compact",
  drafts: recordDrafts({ recordValue: "#38bdf8" }),
  formatting: { displayValue: "#38bdf8" },
  recordId: "cell-accent",
  rendererKind: "color",
  surface: "table-cell",
});

const colorDetailBase = displayField({
  fieldName: "accent",
  field: accentField,
  editor: "color",
  control: textControl(accentField, { editor: "color", controlKind: "color" }),
  access: { kind: "readOnly", writable: false },
  formatting: { displayValue: "#2563eb" },
  recordId: "detail-color",
  surface: "detail",
  value: "#2563eb",
});

export const colorScenarioGroups = [
  composeScenarioGroup({
    id: "color-record",
    kind: "color",
    surface: "record",
    base: colorRecordBase,
    axes: [composeScenarioAxis("mode", "Mode", [scenarioOption("hex", "Hex")])],
  }),
  composeScenarioGroup({
    id: "color-table-cell",
    kind: "color",
    surface: "table-cell",
    base: colorTableCellBase,
    axes: [composeScenarioAxis("mode", "Mode", [scenarioOption("compact", "Compact")])],
  }),
  composeScenarioGroup({
    id: "color-detail",
    kind: "color",
    surface: "detail",
    base: colorDetailBase,
    axes: [
      composeScenarioAxis("mode", "Mode", [
        scenarioOption("hex", "Hex"),
        scenarioOption("token", "Token", {
          fieldName: "themeAccent",
          formatting: { displayValue: "var(--site-accent)" },
          label: "Theme Accent",
          recordId: "detail-color-token",
          value: "var(--site-accent)",
        }),
      ]),
    ],
  }),
] satisfies readonly FieldScenarioGroup[];

import {
  composeScenarioAxis,
  composeScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type { FieldScenarioGroup } from "../field-scenario-model.ts";
import type { AstryxFieldData } from "../../field-contract.ts";

const colorRecordBase = {
  id: "record-accent",
  name: "accent",
  label: "Accent",
  labelTooltip: "Stored values use opaque hex colors.",
  surface: "record",
  density: "balanced",
  accessMode: "editable",
  kind: "color",
  mode: "editor",
  draftValue: "#2563eb",
  committedValue: "#2563eb",
  committedDisplayValue: "#2563eb",
  commitPolicy: "field",
} satisfies AstryxFieldData;

const colorTableCellBase = {
  id: "cell-accent",
  name: "accent",
  label: "Accent",
  surface: "table-cell",
  density: "compact",
  accessMode: "editable",
  kind: "color",
  mode: "editor",
  draftValue: "#38bdf8",
  committedValue: "#38bdf8",
  committedDisplayValue: "#38bdf8",
  commitPolicy: "immediate",
} satisfies AstryxFieldData;

const colorDetailBase = {
  id: "detail-color",
  name: "accent",
  label: "Accent",
  surface: "detail",
  density: "balanced",
  accessMode: "read-only",
  kind: "color",
  mode: "display",
  value: "#2563eb",
  displayValue: "#2563eb",
} satisfies AstryxFieldData;

export const colorScenarioGroups = [
  composeScenarioGroup({
    id: "color-record",
    kind: "color",
    surface: "record",
    base: colorRecordBase,
    axes: [
      composeScenarioAxis("mode", "Mode", [
        scenarioOption("hex", "Hex"),
      ]),
    ],
  }),
  composeScenarioGroup({
    id: "color-table-cell",
    kind: "color",
    surface: "table-cell",
    base: colorTableCellBase,
    axes: [
      composeScenarioAxis("mode", "Mode", [
        scenarioOption("compact", "Compact"),
      ]),
    ],
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
          id: "detail-color-token",
          name: "themeAccent",
          label: "Theme Accent",
          density: "compact",
          value: "var(--site-accent)",
          displayValue: "var(--site-accent)",
        }),
      ]),
    ],
  }),
] satisfies readonly FieldScenarioGroup[];

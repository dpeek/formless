import {
  composeScenarioAxis,
  composeScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type { FieldScenarioGroup } from "../field-scenario-model.ts";
import type { AstryxFieldData } from "../../field-contract.ts";

const textCreateBase = {
  id: "create-title",
  name: "title",
  label: "Task",
  isRequired: true,
  surface: "create",
  density: "balanced",
  accessMode: "editable",
  kind: "text",
  mode: "editor",
  draftValue: "Prepare launch checklist",
  committedDisplayValue: "",
  commitPolicy: "submit",
  presentation: { placeholder: "Task name" },
} satisfies AstryxFieldData;

const textRecordBase = {
  id: "record-title",
  name: "title",
  label: "Task",
  isRequired: true,
  surface: "record",
  density: "balanced",
  accessMode: "editable",
  kind: "text",
  mode: "editor",
  draftValue: "Review route changes",
  committedValue: "Review route changes",
  committedDisplayValue: "Review route changes",
  commitPolicy: "field",
} satisfies AstryxFieldData;

const textDetailBase = {
  id: "system-id",
  name: "id",
  label: "Record ID",
  surface: "detail",
  density: "compact",
  accessMode: "system",
  kind: "text",
  mode: "display",
  value: "task-launch",
  displayValue: "task-launch",
} satisfies AstryxFieldData;

const longTextDetailBase = {
  id: "detail-summary",
  name: "summary",
  label: "Summary",
  surface: "detail",
  density: "comfortable",
  accessMode: "read-only",
  kind: "long-text",
  mode: "display",
  value: "Block placement review before publish.",
  displayValue: "Block placement review before publish.",
  presentation: { maxLines: 3 },
} satisfies AstryxFieldData;

const markdownCreateBase = {
  id: "create-brief",
  name: "brief",
  label: "Brief",
  surface: "create",
  density: "balanced",
  accessMode: "editable",
  kind: "markdown",
  mode: "editor",
  draftValue: "## Launch scope\n\n- Confirm owner\n- Publish public page",
  committedDisplayValue: "",
  commitPolicy: "submit",
  presentation: { placeholder: "Write markdown" },
} satisfies AstryxFieldData;

const markdownDetailBase = {
  id: "detail-markdown",
  name: "notes",
  label: "Notes",
  surface: "detail",
  density: "comfortable",
  accessMode: "read-only",
  kind: "markdown",
  mode: "display",
  value:
    "### Publish note\n\nReview **routes** and [preview](https://example.com) before release.",
  displayValue:
    "### Publish note\n\nReview **routes** and [preview](https://example.com) before release.",
} satisfies AstryxFieldData;

export const textScenarioGroups = [
  composeScenarioGroup({
    id: "text-create",
    kind: "text",
    surface: "create",
    base: textCreateBase,
    axes: [
      composeScenarioAxis("requiredness", "Requiredness", [
        scenarioOption("required", "Required"),
      ]),
    ],
  }),
  composeScenarioGroup({
    id: "text-record",
    kind: "text",
    surface: "record",
    base: textRecordBase,
    axes: [
      composeScenarioAxis("state", "State", [
        scenarioOption("default", "Default"),
        scenarioOption("pending", "Pending", {
          id: "pending-title",
          draftValue: "Publish homepage edits",
          committedValue: "Publish homepage edits",
          committedDisplayValue: "Publish homepage edits",
          pending: { isPending: true, label: "Saving" },
        }),
      ]),
    ],
  }),
  composeScenarioGroup({
    id: "text-detail",
    kind: "text",
    surface: "detail",
    base: textDetailBase,
    axes: [
      composeScenarioAxis("state", "State", [
        scenarioOption("system", "System"),
      ]),
    ],
  }),
  composeScenarioGroup({
    id: "long-text-detail",
    kind: "long-text",
    surface: "detail",
    base: longTextDetailBase,
    axes: [
      composeScenarioAxis("mode", "Mode", [
        scenarioOption("default", "Default"),
      ]),
    ],
  }),
  composeScenarioGroup({
    id: "markdown-create",
    kind: "markdown",
    surface: "create",
    base: markdownCreateBase,
    axes: [
      composeScenarioAxis("mode", "Mode", [
        scenarioOption("default", "Default"),
      ]),
    ],
  }),
  composeScenarioGroup({
    id: "markdown-detail",
    kind: "markdown",
    surface: "detail",
    base: markdownDetailBase,
    axes: [
      composeScenarioAxis("mode", "Mode", [
        scenarioOption("default", "Default"),
      ]),
    ],
  }),
] satisfies readonly FieldScenarioGroup[];

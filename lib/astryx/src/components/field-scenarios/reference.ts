import {
  composeScenarioAxis,
  composeScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type { FieldScenarioGroup } from "../field-scenario-model.ts";
import type { AstryxFieldData } from "../../field-contract.ts";
import { ownerOptions } from "./fixtures.ts";

const referenceCreateBase = {
  id: "create-owner",
  name: "ownerId",
  label: "Owner",
  isRequired: true,
  surface: "create",
  density: "balanced",
  accessMode: "editable",
  kind: "reference",
  mode: "editor",
  draftValue: "principal-dana",
  committedDisplayValue: "",
  commitPolicy: "submit",
  options: ownerOptions,
} satisfies AstryxFieldData;

const referenceRecordBase = {
  id: "readonly-owner",
  name: "ownerId",
  label: "Owner",
  surface: "record",
  density: "balanced",
  accessMode: "read-only",
  kind: "reference",
  mode: "display",
  value: "principal-dana",
  displayValue: "Dana Peek",
  options: ownerOptions,
} satisfies AstryxFieldData;

export const referenceScenarioGroups = [
  composeScenarioGroup({
    id: "reference-create",
    kind: "reference",
    surface: "create",
    base: referenceCreateBase,
    axes: [
      composeScenarioAxis("requiredness", "Requiredness", [
        scenarioOption("required-selected", "Required Selected"),
      ]),
    ],
  }),
  composeScenarioGroup({
    id: "reference-record",
    kind: "reference",
    surface: "record",
    base: referenceRecordBase,
    axes: [
      composeScenarioAxis("state", "State", [
        scenarioOption("valid", "Valid", {
          id: "readonly-owner-valid",
          value: "principal-dana",
          displayValue: "Dana Peek",
        }),
        scenarioOption("missing-reference", "Missing Reference", {
          id: "readonly-owner-missing",
          value: "principal-missing",
          displayValue: "principal-missing",
        }),
        scenarioOption("optional-empty", "Optional Empty", {
          id: "readonly-owner-empty",
          value: null,
          displayValue: "",
        }),
      ]),
    ],
  }),
] satisfies readonly FieldScenarioGroup[];

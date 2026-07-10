import {
  composeScenarioAxis,
  composeScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type { FieldScenarioGroup } from "../field-scenario-model.ts";
import {
  createField,
  displayField,
  draftInput,
  referenceControl,
  referenceOptions,
} from "./fixture-helpers.ts";

const ownerOptions = [
  { id: "principal-dana", label: "Dana Peek" },
  { id: "principal-jordan", label: "Jordan Lee" },
  {
    id: "principal-missing",
    label: "principal-missing",
    missing: true,
  },
] as const;

const ownerField = {
  type: "reference",
  required: true,
  label: "Owner",
  to: "principal",
} as const;

const optionalOwnerField = {
  ...ownerField,
  required: false,
} as const;

const referenceCreateBase = createField({
  fieldName: "ownerId",
  field: ownerField,
  editor: "reference",
  control: referenceControl(ownerField),
  draftInput: draftInput("principal-dana"),
  options: { referenceOptions: referenceOptions(ownerOptions) },
  recordId: "create-owner",
  value: "principal-dana",
});

const referenceRecordBase = displayField({
  fieldName: "ownerId",
  field: ownerField,
  editor: "reference",
  control: referenceControl(ownerField),
  access: { kind: "readOnly", writable: false },
  formatting: { displayValue: "Dana Peek" },
  options: { referenceOptions: referenceOptions(ownerOptions) },
  recordId: "readonly-owner",
  surface: "record",
  value: "principal-dana",
});

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
          formatting: { displayValue: "Dana Peek" },
          options: { referenceOptions: referenceOptions(ownerOptions) },
          recordId: "readonly-owner-valid",
          value: "principal-dana",
        }),
        scenarioOption("missing-reference", "Missing Reference", {
          formatting: { displayValue: "principal-missing" },
          options: {
            missingReferenceValue: "principal-missing",
            referenceOptions: referenceOptions(ownerOptions),
          },
          recordId: "readonly-owner-missing",
          value: "principal-missing",
        }),
        scenarioOption("optional-empty", "Optional Empty", {
          control: referenceControl(optionalOwnerField),
          field: optionalOwnerField,
          formatting: { displayValue: "" },
          recordId: "readonly-owner-empty",
          required: false,
          value: undefined,
        }),
      ]),
    ],
  }),
] satisfies readonly FieldScenarioGroup[];

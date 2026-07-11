import {
  composeScenarioAxis,
  composeScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type {
  FieldScenarioComposeContext,
  FieldScenarioFieldModifier,
  FieldScenarioGroup,
} from "../field-scenario-model.ts";
import type { FieldSchema, StateMachineSchema } from "@dpeek/formless-schema";
import type { FormlessUiField } from "../../formless-ui-contract.ts";
import {
  displayField,
  enumControl,
  enumOptions,
  enumValuePresentation,
  stateMachineFacts,
  stateMachineField,
} from "./fixture-helpers.ts";

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

const confirmIconSource = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="m5 12 5 5L20 7" />',
  "</svg>",
].join("");

const stateStatusField = {
  type: "enum",
  required: true,
  label: "Status",
  values: {
    open: {
      label: "Open",
      presentation: { color: "blue", icon: "priority-marker" },
    },
    waiting: { label: "Waiting", presentation: { color: "orange" } },
    blocked: { label: "Blocked", presentation: { color: "red", icon: "close" } },
    done: { label: "Done", presentation: { color: "green", icon: "confirm" } },
  },
  default: "open",
} as const;

const stateStatusOptions = enumOptions(stateStatusField, {
  blocked: { iconSource: closeIconSource },
  done: { iconSource: confirmIconSource },
  open: { iconSource: priorityMarkerIconSource },
});

const taskWorkflowMachine = {
  field: "status",
  initial: "open",
  terminal: ["done"],
  transitions: {
    complete: { label: "Complete", from: ["open", "waiting", "blocked"], to: "done" },
    sendWaiting: { label: "Send to waiting", from: ["open", "blocked"], to: "waiting" },
    reopen: {
      label: "Reopen",
      from: ["waiting", "blocked"],
      to: "open",
    },
    block: { label: "Block", from: ["open", "waiting"], to: "blocked" },
  },
} satisfies StateMachineSchema;

const operationNames = {
  block: "tasks.block",
  complete: "tasks.complete",
  reopen: "tasks.reopen",
  sendWaiting: "tasks.sendToWaiting",
};

const stateMachineRecordBase = stateMachineDisplayField({
  recordId: "state-status-record",
  surface: "record",
  value: "open",
});

const stateMachineTableCellBase = stateMachineDisplayField({
  recordId: "state-status-cell",
  surface: "table-cell",
  value: "open",
});

const stateMachineDetailBase = stateMachineDisplayField({
  recordId: "state-status-detail",
  surface: "detail",
  value: "open",
});

export const stateMachineScenarioGroups = [
  composeScenarioGroup({
    id: "state-machine-record",
    kind: "state-machine-enum",
    surface: "record",
    base: stateMachineRecordBase,
    axes: [
      composeScenarioAxis("value", "Value", [
        scenarioOption("open", "Known", withStateValue("open")),
        scenarioOption("unknown", "Unknown", withStateValue("paused")),
      ]),
    ],
    finalizeField: finalizeRecordStateMachineField,
  }),
  composeScenarioGroup({
    id: "state-machine-table-cell",
    kind: "state-machine-enum",
    surface: "table-cell",
    base: stateMachineTableCellBase,
    axes: [
      composeScenarioAxis("value", "Value", [
        scenarioOption("open", "Known", withStateValue("open")),
        scenarioOption("unknown", "Unknown", withStateValue("paused")),
      ]),
    ],
    finalizeField: finalizeTableCellStateMachineField,
  }),
  composeScenarioGroup({
    id: "state-machine-detail",
    kind: "state-machine-enum",
    surface: "detail",
    base: stateMachineDetailBase,
    axes: [
      composeScenarioAxis("value", "Value", [
        scenarioOption("open", "Known", withStateValue("open")),
        scenarioOption("unknown", "Unknown", withStateValue("paused")),
      ]),
    ],
    finalizeField: finalizeDetailStateMachineField,
  }),
] satisfies readonly FieldScenarioGroup[];

function finalizeRecordStateMachineField({ field, optionIds }: FieldScenarioComposeContext) {
  return {
    ...field,
    recordId: `state-status-record-${optionIds.join("-")}`,
  };
}

function finalizeTableCellStateMachineField({ field, optionIds }: FieldScenarioComposeContext) {
  return {
    ...field,
    recordId: `state-status-cell-${optionIds.join("-")}`,
  };
}

function finalizeDetailStateMachineField({ field, optionIds }: FieldScenarioComposeContext) {
  return {
    ...field,
    recordId: `state-status-detail-${optionIds.join("-")}`,
  };
}

function withStateValue(value: string): FieldScenarioFieldModifier {
  return (field) => applyStateMachineFacts(field, { value });
}

function stateMachineDisplayField(input: {
  recordId: string;
  surface: "detail" | "record" | "table-cell";
  value: string;
}) {
  const stateMachine = stateMachineField({
    fieldName: "status",
    machineName: "taskWorkflow",
    machine: taskWorkflowMachine,
  });

  return displayField({
    fieldName: "status",
    field: stateStatusField,
    editor: "enum",
    control: enumControl(stateStatusField),
    access: { kind: "stateMachine", writable: false },
    formatting: {
      displayValue: displayOption(stateStatusField, input.value),
      enumValuePresentation: stateValuePresentation(stateStatusField, input.value),
    },
    options: { enumOptions: stateStatusOptions },
    recordId: input.recordId,
    stateMachine,
    stateMachineFacts: stateMachineFacts({
      currentValue: input.value,
      field: stateStatusField,
      operationNames,
      stateMachine,
    }),
    surface: input.surface,
    value: input.value,
  });
}

function applyStateMachineFacts(
  field: FormlessUiField,
  input: {
    field?: Extract<FieldSchema, { type: "enum" }>;
    machine?: StateMachineSchema;
    value?: unknown;
  },
): FormlessUiField {
  if (field.mode !== "display") {
    return field;
  }

  const enumField = input.field ?? (field.field.type === "enum" ? field.field : stateStatusField);
  const machine =
    input.machine ?? field.stateMachineFacts?.stateMachine.machine ?? taskWorkflowMachine;
  const value =
    typeof input.value === "string"
      ? input.value
      : typeof field.stateMachineFacts?.currentValue === "string"
        ? field.stateMachineFacts.currentValue
        : "";
  const stateMachine = stateMachineField({
    fieldName: "status",
    machineName: "taskWorkflow",
    machine,
  });

  const hasKnownValue = Object.hasOwn(enumField.values, value);

  return {
    ...field,
    control: enumControl(enumField),
    field: enumField,
    formatting: {
      ...field.formatting,
      displayValue: displayOption(enumField, value),
      enumValuePresentation: stateValuePresentation(enumField, value),
    },
    options: {
      enumOptions: enumOptions(enumField, {
        blocked: { iconSource: closeIconSource },
        done: { iconSource: confirmIconSource },
        open: { iconSource: priorityMarkerIconSource },
      }),
      unknownEnumValue: !hasKnownValue && value !== "" ? value : undefined,
    },
    stateMachine,
    stateMachineFacts: stateMachineFacts({
      currentValue: value,
      field: enumField,
      operationNames,
      stateMachine,
    }),
    value,
  };
}

function displayOption(field: Extract<FieldSchema, { type: "enum" }>, value: string) {
  return field.values[value]?.label ?? value;
}

function stateValuePresentation(
  field: Extract<FieldSchema, { type: "enum" }>,
  value: string,
) {
  const iconSource =
    value === "open"
      ? priorityMarkerIconSource
      : value === "blocked"
        ? closeIconSource
        : value === "done"
          ? confirmIconSource
          : undefined;

  return enumValuePresentation(field, value, iconSource);
}

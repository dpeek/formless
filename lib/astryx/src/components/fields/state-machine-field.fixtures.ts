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
import type { FormlessUiField, FormlessUiStateMachineFacts } from "../../formless-ui-contract.ts";
import {
  displayField,
  enumControl,
  enumOptions,
  enumValuePresentation,
  fieldError,
  stateMachineFacts,
  stateMachineField,
} from "./fixture-helpers.ts";

const stateStatusField = {
  type: "enum",
  required: true,
  label: "Status",
  values: {
    open: { label: "Open", presentation: { color: "#2563eb" } },
    waiting: { label: "Waiting", presentation: { color: "#d97706" } },
    blocked: { label: "Blocked", presentation: { color: "danger" } },
    done: { label: "Done", presentation: { color: "success" } },
  },
  default: "open",
} as const;

const longStateStatusField = {
  ...stateStatusField,
  values: {
    ...stateStatusField.values,
    waiting: {
      label: "Waiting on final launch readiness review",
      presentation: { color: "#d97706" },
    },
  },
} as const;

const taskWorkflowMachine = {
  field: "status",
  initial: "open",
  terminal: ["done"],
  transitions: {
    complete: { label: "Complete", from: ["open", "waiting", "blocked"], to: "done" },
    sendWaiting: { label: "Send to waiting", from: ["open", "blocked"], to: "waiting" },
    reopen: {
      label: "Reopen",
      from: ["waiting", "blocked", "done"],
      to: "open",
      allowTerminalRecovery: true,
    },
    block: { label: "Block", from: ["open", "waiting"], to: "blocked" },
  },
} satisfies StateMachineSchema;

const oneTransitionMachine = {
  ...taskWorkflowMachine,
  transitions: {
    complete: taskWorkflowMachine.transitions.complete,
  },
} satisfies StateMachineSchema;

const noTransitionMachine = {
  ...taskWorkflowMachine,
  transitions: {},
} satisfies StateMachineSchema;

const longLabelMachine = {
  ...taskWorkflowMachine,
  transitions: {
    ...taskWorkflowMachine.transitions,
    complete: {
      ...taskWorkflowMachine.transitions.complete,
      label: "Complete after final launch readiness review",
    },
    sendWaiting: {
      ...taskWorkflowMachine.transitions.sendWaiting,
      label: "Send back to waiting for external dependency review",
    },
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
  value: "waiting",
});

const stateMachineTableCellBase = stateMachineDisplayField({
  recordId: "state-status-cell",
  surface: "table-cell",
  value: "open",
});

const recordStateMachineCombinations = new Set([
  "many-transitions|open|idle",
  "many-transitions|waiting|idle",
  "many-transitions|blocked|idle",
  "many-transitions|done|idle",
  "many-transitions|unknown|idle",
  "no-transitions|waiting|idle",
  "one-transition|open|idle",
  "long-labels|waiting|idle",
  "terminal|done|idle",
  "many-transitions|waiting|field-pending",
  "many-transitions|waiting|transition-pending",
  "many-transitions|waiting|disabled-transition",
  "many-transitions|blocked|transition-error",
]);

const tableCellStateMachineCombinations = new Set(["open|idle", "blocked|transition-error"]);

export const stateMachineScenarioGroups = [
  composeScenarioGroup({
    id: "state-machine-record",
    kind: "state-machine-enum",
    surface: "record",
    base: stateMachineRecordBase,
    axes: [
      composeScenarioAxis("machine", "Machine", [
        scenarioOption("many-transitions", "Many Transitions"),
        scenarioOption("no-transitions", "No Transitions", withMachine(noTransitionMachine)),
        scenarioOption("one-transition", "One Transition", withMachine(oneTransitionMachine)),
        scenarioOption(
          "long-labels",
          "Long Labels",
          withMachine(longLabelMachine, longStateStatusField),
        ),
        scenarioOption("terminal", "Terminal", withMachine(taskWorkflowMachine)),
      ]),
      composeScenarioAxis("value", "Value", [
        scenarioOption("open", "Open", withStateValue("open")),
        scenarioOption("waiting", "Waiting", withStateValue("waiting")),
        scenarioOption("blocked", "Blocked", withStateValue("blocked")),
        scenarioOption("done", "Done", withStateValue("done")),
        scenarioOption("unknown", "Unknown", withStateValue("paused")),
      ]),
      composeScenarioAxis("runtime", "Runtime", [
        scenarioOption("idle", "Idle"),
        scenarioOption("field-pending", "Field Pending", {
          pending: { isPending: true, label: "Completing task" },
        }),
        scenarioOption(
          "transition-pending",
          "Transition Pending",
          withTransitionPatch("complete", { pending: { isPending: true, label: "Running" } }),
        ),
        scenarioOption(
          "disabled-transition",
          "Disabled Transition",
          withTransitionPatch("complete", {
            availability: {
              valid: false,
              disabledReason: "Complete is unavailable until required fields are filled.",
            },
          }),
        ),
        scenarioOption("transition-error", "Transition Error", {
          errors: [fieldError("status", "Transition rejected by workflow.")],
        }),
      ]),
    ],
    include: ({ facets }) =>
      recordStateMachineCombinations.has(`${facets.machine}|${facets.value}|${facets.runtime}`),
    finalizeField: finalizeRecordStateMachineField,
  }),
  composeScenarioGroup({
    id: "state-machine-table-cell",
    kind: "state-machine-enum",
    surface: "table-cell",
    base: stateMachineTableCellBase,
    axes: [
      composeScenarioAxis("value", "Value", [
        scenarioOption("open", "Open", withStateValue("open")),
        scenarioOption("blocked", "Blocked", withStateValue("blocked")),
      ]),
      composeScenarioAxis("runtime", "Runtime", [
        scenarioOption("idle", "Idle"),
        scenarioOption("transition-error", "Transition Error", {
          errors: [fieldError("status", "Transition rejected by workflow.")],
        }),
      ]),
    ],
    include: ({ facets }) =>
      tableCellStateMachineCombinations.has(`${facets.value}|${facets.runtime}`),
    finalizeField: ({ field, optionIds }) => ({
      ...field,
      recordId: `state-status-cell-${optionIds.join("-")}`,
    }),
  }),
] satisfies readonly FieldScenarioGroup[];

function finalizeRecordStateMachineField({ field, optionIds }: FieldScenarioComposeContext) {
  return {
    ...field,
    recordId: `state-status-record-${optionIds.join("-")}`,
  };
}

function withMachine(
  machine: StateMachineSchema,
  field: Extract<FieldSchema, { type: "enum" }> = stateStatusField,
): FieldScenarioFieldModifier {
  return (currentField) =>
    applyStateMachineFacts(currentField, {
      field,
      machine,
      value: currentField.stateMachineFacts?.currentValue,
    });
}

function withStateValue(value: string): FieldScenarioFieldModifier {
  return (field) => applyStateMachineFacts(field, { value });
}

function withTransitionPatch(
  transitionName: string,
  patch: Partial<NonNullable<FormlessUiStateMachineFacts["transitions"]>[number]>,
): FieldScenarioFieldModifier {
  return (field) => {
    const facts = field.stateMachineFacts;

    if (facts === undefined) {
      return field;
    }

    return {
      ...field,
      stateMachineFacts: {
        ...facts,
        transitions: facts.transitions?.map((transition) =>
          transition.transitionName === transitionName ? { ...transition, ...patch } : transition,
        ),
      },
    };
  };
}

function stateMachineDisplayField(input: {
  recordId: string;
  surface: "record" | "table-cell";
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
      enumValuePresentation: enumValuePresentation(stateStatusField, input.value),
    },
    options: { enumOptions: enumOptions(stateStatusField) },
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
      enumValuePresentation: enumValuePresentation(enumField, value),
    },
    options: {
      enumOptions: enumOptions(enumField),
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

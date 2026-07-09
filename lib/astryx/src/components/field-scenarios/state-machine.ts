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
import type {
  AstryxFieldData,
  AstryxFieldOption,
  AstryxFieldTransitionOperation,
} from "../../field-contract.ts";
import { displayOption, stateStatusOptions, stateTransitions } from "./fixtures.ts";

const stateFacts = [
  { id: "owned-status", kind: "owned", label: "status", value: "task workflow" },
  {
    id: "hidden-completed-at",
    kind: "hidden",
    label: "completedAt",
    value: "set by Complete",
  },
  {
    id: "derived-can-transition",
    kind: "derived",
    label: "can transition",
    value: "true",
  },
] satisfies NonNullable<NonNullable<AstryxFieldData["stateMachine"]>["facts"]>;

const stateMachineRecordBase = {
  id: "state-status-record",
  name: "status",
  label: "Status",
  surface: "record",
  density: "balanced",
  accessMode: "state-machine",
  kind: "enum",
  mode: "display",
  value: "waiting",
  displayValue: "Waiting",
  options: stateStatusOptions,
  stateMachine: {
    transitions: stateTransitions,
    facts: stateFacts,
  },
} satisfies AstryxFieldData;

const stateMachineTableCellBase = {
  id: "state-status-cell",
  name: "status",
  label: "Status",
  surface: "table-cell",
  density: "compact",
  accessMode: "state-machine",
  kind: "enum",
  mode: "display",
  value: "open",
  displayValue: "Open",
  options: stateStatusOptions,
  stateMachine: { transitions: stateTransitions },
} satisfies AstryxFieldData;

const longStateOptions = stateStatusOptions.map((option) =>
  option.value === "waiting"
    ? { ...option, label: "Waiting on final launch readiness review" }
    : option,
) satisfies readonly AstryxFieldOption[];

const longTransitions = stateTransitions.map((transition) =>
  transition.id === "complete"
    ? {
        ...transition,
        label: "Complete after final launch readiness review",
      }
    : transition.id === "send-waiting"
      ? {
          ...transition,
          label: "Send back to waiting for external dependency review",
        }
      : transition,
) satisfies readonly AstryxFieldTransitionOperation[];

const hiddenCurrentTransitions = [
  ...stateTransitions,
  {
    id: "keep-waiting",
    label: "Keep waiting",
    operationKey: "tasks.keepWaiting",
    targetValue: "waiting",
    isHidden: true,
  },
] satisfies readonly AstryxFieldTransitionOperation[];

const terminalTransitions = stateTransitions.map((transition) => ({
  ...transition,
  isHidden: true,
  targetValue: "done",
})) satisfies readonly AstryxFieldTransitionOperation[];

const recordStateMachineCombinations = new Set([
  "many-transitions|open|idle",
  "many-transitions|waiting|idle",
  "many-transitions|blocked|idle",
  "many-transitions|done|idle",
  "many-transitions|unknown|idle",
  "no-transitions|waiting|idle",
  "one-transition|open|idle",
  "long-labels|waiting|idle",
  "hidden-current|waiting|idle",
  "terminal|done|idle",
  "many-transitions|waiting|field-pending",
  "many-transitions|waiting|transition-pending",
  "many-transitions|waiting|disabled-transition",
  "many-transitions|blocked|transition-error",
]);

const tableCellStateMachineCombinations = new Set([
  "open|idle",
  "blocked|transition-error",
]);

export const stateMachineScenarioGroups = [
  composeScenarioGroup({
    id: "state-machine-record",
    kind: "state-machine-enum",
    surface: "record",
    base: stateMachineRecordBase,
    axes: [
      composeScenarioAxis("machine", "Machine", [
        scenarioOption("many-transitions", "Many Transitions", withTransitions(stateTransitions)),
        scenarioOption("no-transitions", "No Transitions", withTransitions([])),
        scenarioOption("one-transition", "One Transition", withTransitions([stateTransitions[0]])),
        scenarioOption("long-labels", "Long Labels", [
          { options: longStateOptions },
          withTransitions(longTransitions),
        ]),
        scenarioOption("hidden-current", "Hidden Current", withTransitions(hiddenCurrentTransitions)),
        scenarioOption("terminal", "Terminal", withTransitions(terminalTransitions)),
      ]),
      composeScenarioAxis("value", "Value", [
        scenarioOption("open", "Open", withStateValue("open")),
        scenarioOption("waiting", "Waiting", withStateValue("waiting")),
        scenarioOption("blocked", "Blocked", withStateValue("blocked")),
        scenarioOption("done", "Done", withStateValue("done")),
        scenarioOption("unknown", "Unknown", withStateValue("paused", "paused")),
      ]),
      composeScenarioAxis("runtime", "Runtime", [
        scenarioOption("idle", "Idle"),
        scenarioOption("field-pending", "Field Pending", {
          pending: { isPending: true, label: "Completing task" },
        }),
        scenarioOption("transition-pending", "Transition Pending", withTransition("complete", {
          pending: { isPending: true, label: "Running" },
        })),
        scenarioOption("disabled-transition", "Disabled Transition", withTransition("complete", {
          isDisabled: true,
          disabledReason: "Complete is unavailable until required fields are filled.",
        })),
        scenarioOption("transition-error", "Transition Error", {
          errors: [{ id: "transition-rejected", message: "Transition rejected by workflow." }],
        }),
      ]),
    ],
    include: ({ facets }) =>
      recordStateMachineCombinations.has(
        `${facets.machine}|${facets.value}|${facets.runtime}`,
      ),
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
          errors: [{ id: "transition-rejected", message: "Transition rejected by workflow." }],
        }),
      ]),
    ],
    include: ({ facets }) =>
      tableCellStateMachineCombinations.has(`${facets.value}|${facets.runtime}`),
    finalizeField: ({ field, optionIds }) => ({
      ...field,
      id: `state-status-cell-${optionIds.join("-")}`,
    }),
  }),
] satisfies readonly FieldScenarioGroup[];

function finalizeRecordStateMachineField({
  field,
  optionIds,
}: FieldScenarioComposeContext): AstryxFieldData {
  return {
    ...field,
    id: `state-status-record-${optionIds.join("-")}`,
  };
}

function withTransitions(
  transitions: readonly AstryxFieldTransitionOperation[],
): FieldScenarioFieldModifier {
  return (field) => ({
    ...field,
    stateMachine: {
      ...field.stateMachine,
      transitions,
    },
  });
}

function withTransition(
  transitionId: string,
  patch: Partial<AstryxFieldTransitionOperation>,
): FieldScenarioFieldModifier {
  return (field) => ({
    ...field,
    stateMachine: {
      ...field.stateMachine,
      transitions: (field.stateMachine?.transitions ?? []).map((transition) =>
        transition.id === transitionId ? { ...transition, ...patch } : transition,
      ),
    },
  });
}

function withStateValue(value: string, stateLabel?: string): FieldScenarioFieldModifier {
  return (field) => {
    if (field.mode !== "display") {
      return field;
    }

    return {
      ...field,
      value,
      displayValue: displayOption(field.options ?? [], value),
      stateMachine: {
        ...field.stateMachine,
        stateLabel,
      },
    };
  };
}

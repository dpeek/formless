import {
  type EntityActionSchema,
  type EntitySchema,
  type FieldSchema,
  type StateMachineSchema,
  type StateMachineTransitionSchema,
} from "@dpeek/formless-schema";
import type { FieldValue } from "../shared/protocol.ts";
import {
  selectAvailableEntityOperations,
  type EntityOperationPresentationConfig,
} from "./operation-presentation-model.ts";

export type StateMachineFieldConfig = {
  fieldName: string;
  machineName: string;
  machine: StateMachineSchema;
  initialState: string;
  terminalStates: string[];
};

export type TransitionStateActionConfig = {
  operationName: string;
  operation: EntityOperationPresentationConfig;
  label: string;
  action: Extract<EntityActionSchema, { kind: "transition-state" }>;
  machineName: string;
  machine: StateMachineSchema;
  transitionName: string;
  transition: StateMachineTransitionSchema;
  fieldName: string;
  field: Extract<FieldSchema, { type: "enum" }>;
};

export type TransitionStateActionAvailability = {
  valid: boolean;
  disabledReason?: string;
};

export function selectStateMachineField(
  entity: EntitySchema,
  fieldName: string,
): StateMachineFieldConfig | undefined {
  for (const [machineName, machine] of Object.entries(entity.stateMachines ?? {})) {
    if (machine.field !== fieldName) {
      continue;
    }

    return {
      fieldName,
      machineName,
      machine,
      initialState: machine.initial,
      terminalStates: machine.terminal ?? [],
    };
  }

  return undefined;
}

export function selectTransitionStateActions(
  entityName: string,
  entity: EntitySchema,
): TransitionStateActionConfig[] {
  return selectAvailableEntityOperations(entityName, entity, "record").flatMap((operation) => {
    if (
      operation.operation.kind !== "command" ||
      operation.operation.effect?.type !== "runActionKind" ||
      operation.operation.effect.kind !== "transition-state" ||
      operation.operation.effect.action === undefined
    ) {
      return [];
    }

    const actionName = operation.operation.effect.action;
    const action = entity.actions?.[actionName];

    if (action?.kind !== "transition-state") {
      return [];
    }

    const machine = entity.stateMachines?.[action.machine];
    const transition = machine?.transitions[action.transition];
    const field = machine === undefined ? undefined : entity.fields[machine.field];

    if (!machine || !transition || field?.type !== "enum") {
      return [];
    }

    return [
      {
        operationName: operation.operationName,
        operation,
        label: action.label,
        action,
        machineName: action.machine,
        machine,
        transitionName: action.transition,
        transition,
        fieldName: machine.field,
        field,
      },
    ];
  });
}

export function selectTransitionStateActionAvailability({
  action,
  currentValue,
  field,
}: {
  action: TransitionStateActionConfig;
  currentValue: FieldValue | undefined;
  field: Extract<FieldSchema, { type: "enum" }>;
}): TransitionStateActionAvailability {
  if (typeof currentValue !== "string" || currentValue.trim() === "") {
    return {
      valid: false,
      disabledReason: `Requires ${transitionSourceStateLabels(action, field).join(", ")}.`,
    };
  }

  if (field.values[currentValue] === undefined) {
    return {
      valid: false,
      disabledReason: `Current state "${currentValue}" is not declared.`,
    };
  }

  if (!action.transition.from.includes(currentValue)) {
    return {
      valid: false,
      disabledReason: `Requires ${transitionSourceStateLabels(action, field).join(", ")}.`,
    };
  }

  return { valid: true };
}

export function stateMachineStateIsTerminal(
  stateMachine: StateMachineFieldConfig,
  value: FieldValue | undefined,
) {
  return typeof value === "string" && stateMachine.terminalStates.includes(value);
}

function transitionSourceStateLabels(
  action: TransitionStateActionConfig,
  field: Extract<FieldSchema, { type: "enum" }>,
) {
  return action.transition.from.map((state) => field.values[state]?.label ?? state);
}

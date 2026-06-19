import type {
  EntitySchema,
  FieldSchema,
  RunActionKindEntityOperationEffectSchema,
  StateMachineSchema,
  StateMachineTransitionSchema,
} from "@dpeek/formless-schema";
import type { FieldValue } from "@dpeek/formless-storage";
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

export type TransitionStateOperationConfig = {
  operationName: string;
  operation: EntityOperationPresentationConfig;
  label: string;
  machineName: string;
  machine: StateMachineSchema;
  transitionName: string;
  transition: StateMachineTransitionSchema;
  fieldName: string;
  field: Extract<FieldSchema, { type: "enum" }>;
};

export type TransitionStateOperationAvailability = {
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

export function selectTransitionStateOperations(
  entityName: string,
  entity: EntitySchema,
): TransitionStateOperationConfig[] {
  return selectAvailableEntityOperations(entityName, entity, "record").flatMap((operation) => {
    if (
      operation.operation.kind !== "command" ||
      operation.operation.effect?.type !== "runActionKind" ||
      operation.operation.effect.kind !== "transition-state"
    ) {
      return [];
    }

    const transitionTarget = selectTransitionOperationTarget(entity, operation.operation.effect);

    if (transitionTarget === undefined) {
      return [];
    }

    const machine = entity.stateMachines?.[transitionTarget.machineName];
    const transition = machine?.transitions[transitionTarget.transitionName];
    const field = machine === undefined ? undefined : entity.fields[machine.field];

    if (!machine || !transition || field?.type !== "enum") {
      return [];
    }

    return [
      {
        operationName: operation.operationName,
        operation,
        label: operation.label,
        machineName: transitionTarget.machineName,
        machine,
        transitionName: transitionTarget.transitionName,
        transition,
        fieldName: machine.field,
        field,
      },
    ];
  });
}

export function selectTransitionStateOperationAvailability({
  operation,
  currentValue,
  field,
}: {
  operation: TransitionStateOperationConfig;
  currentValue: FieldValue | undefined;
  field: Extract<FieldSchema, { type: "enum" }>;
}): TransitionStateOperationAvailability {
  if (typeof currentValue !== "string" || currentValue.trim() === "") {
    return {
      valid: false,
      disabledReason: `Requires ${transitionSourceStateLabels(operation, field).join(", ")}.`,
    };
  }

  if (field.values[currentValue] === undefined) {
    return {
      valid: false,
      disabledReason: `Current state "${currentValue}" is not declared.`,
    };
  }

  if (!operation.transition.from.includes(currentValue)) {
    return {
      valid: false,
      disabledReason: `Requires ${transitionSourceStateLabels(operation, field).join(", ")}.`,
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
  operation: TransitionStateOperationConfig,
  field: Extract<FieldSchema, { type: "enum" }>,
) {
  return operation.transition.from.map((state) => field.values[state]?.label ?? state);
}

function selectTransitionOperationTarget(
  entity: EntitySchema,
  effect: RunActionKindEntityOperationEffectSchema,
): { machineName: string; transitionName: string } | undefined {
  if (effect.action === undefined) {
    return undefined;
  }

  const action = entity.actions?.[effect.action];

  if (action?.kind !== "transition-state") {
    return undefined;
  }

  return {
    machineName: action.machine,
    transitionName: action.transition,
  };
}

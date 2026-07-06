import { useMemo } from "react";
import { Badge, type BadgeProps } from "@dpeek/formless-ui/badge";
import { Button } from "@dpeek/formless-ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@dpeek/formless-ui/menu";
import {
  selectTransitionStateOperationAvailability,
  stateMachineStateIsTerminal,
  type TransitionStateOperationAvailability,
} from "../../client/state-machine-model.ts";
import type { SyncStatus } from "../../client/sync-status.ts";
import type {
  StateMachineFieldConfig,
  TransitionStateOperationConfig,
} from "../../client/views.ts";
import {
  projectStateTransitionOperationControlBinding,
  type GeneratedOperationCallerInput,
  type GeneratedOperationControlBinding,
  type GeneratedOperationController,
  type GeneratedOperationExecutionResult,
} from "../../client/views.ts";
import type { FieldValue, RecordValues } from "@dpeek/formless-storage";
import { enumValuePresentation, GeneratedFieldPresentationIcon } from "./field-presentation.tsx";
import {
  executeGeneratedOperationControl,
  useGeneratedOperationController,
  useGeneratedOperationControllerVersion,
} from "./operation-control-runtime.ts";
import type { FieldSchema } from "@dpeek/formless-schema";

type ProjectedTransitionOperationControl = {
  availability: TransitionStateOperationAvailability;
  binding: GeneratedOperationControlBinding;
  operation: TransitionStateOperationConfig;
};

export function StateMachineStateBadge({
  field,
  label,
  stateMachine,
  value,
}: {
  field: Extract<FieldSchema, { type: "enum" }>;
  label: string;
  stateMachine: StateMachineFieldConfig;
  value: FieldValue | undefined;
}) {
  const stateValue = typeof value === "string" ? value : "";
  const option = field.values[stateValue];
  const presentation = enumValuePresentation({ option, value: stateValue });
  const stateLabel = stateValue === "" ? "Unset" : presentation.label;
  const terminal = stateMachineStateIsTerminal(stateMachine, value);

  return (
    <Badge
      aria-label={`${label}: ${stateLabel}${terminal ? " terminal" : ""}`}
      className={terminal ? "[--badge-border:var(--color-slate-400)] border-dashed" : undefined}
      data-formless-state-machine={stateMachine.machineName}
      data-formless-state-machine-field={stateMachine.fieldName}
      data-formless-state-terminal={terminal ? "true" : "false"}
      data-formless-state-value={stateValue}
      intent={badgeIntentForPresentation(presentation.color.intent)}
      isCircle={false}
    >
      {presentation.icon ? (
        <GeneratedFieldPresentationIcon className="size-3" icon={presentation.icon} />
      ) : null}
      <span>{stateLabel}</span>
    </Badge>
  );
}

export function RecordStateTransitionMenu({
  className,
  field,
  label,
  operations,
  recordId,
  stateMachine,
  values,
}: {
  className?: string;
  entityName: string;
  field: Extract<FieldSchema, { type: "enum" }>;
  label: string;
  operations: TransitionStateOperationConfig[];
  recordId: string;
  stateMachine: StateMachineFieldConfig;
  values: RecordValues | undefined;
}) {
  const currentValue = values?.[stateMachine.fieldName];
  const stateValue = typeof currentValue === "string" ? currentValue : "";
  const option = field.values[stateValue];
  const presentation = enumValuePresentation({ option, value: stateValue });
  const stateLabel = stateValue === "" ? "Unset" : presentation.label;
  const terminal = stateMachineStateIsTerminal(stateMachine, currentValue);
  const projectedOperations = useMemo(
    () =>
      operations.map((operation): ProjectedTransitionOperationControl => {
        const availability = selectTransitionStateOperationAvailability({
          operation,
          currentValue,
          field,
        });

        return {
          availability,
          binding: projectStateTransitionOperationControlBinding({
            operation,
            availability,
            options: {
              executionTargetKey: recordId,
            },
          }),
          operation,
        };
      }),
    [currentValue, field, operations, recordId],
  );
  const bindings = useMemo(
    () => projectedOperations.map((operation) => operation.binding),
    [projectedOperations],
  );
  const controller = useGeneratedOperationController(bindings);
  useGeneratedOperationControllerVersion(controller);
  const availableOperations = projectedOperations.filter(
    (operation) => operation.availability.valid,
  );
  const hasPendingOperation = bindings.some((binding) => controller.isPending(binding.id));
  const operationLabels = availableOperations.map(({ operation }) => operation.label).join("|");
  const operationNames = availableOperations
    .map(({ operation }) => operation.operationName)
    .join("|");
  const targetStates = availableOperations
    .map(({ operation }) => operation.transition.to)
    .join("|");

  async function runOperation(projected: ProjectedTransitionOperationControl) {
    if (hasPendingOperation) {
      return;
    }

    await executeTransitionStateOperation({
      binding: projected.binding,
      controller,
      operation: projected.operation,
      recordId,
      source: "menuItem",
    });
  }

  const stateBadge = (
    <Badge
      className={terminal ? "[--badge-border:var(--color-slate-400)] border-dashed" : undefined}
      data-formless-state-machine={stateMachine.machineName}
      data-formless-state-machine-field={stateMachine.fieldName}
      data-formless-state-terminal={terminal ? "true" : "false"}
      data-formless-state-value={stateValue}
      intent={badgeIntentForPresentation(presentation.color.intent)}
      isCircle={false}
    >
      {presentation.icon ? (
        <GeneratedFieldPresentationIcon className="size-3" icon={presentation.icon} />
      ) : null}
      <span>{stateLabel}</span>
    </Badge>
  );

  if (availableOperations.length === 0) {
    return (
      <span
        aria-label={`${label}: ${stateLabel}. No transitions available.`}
        className={`inline-flex ${className ?? ""}`}
        data-formless-state-transition-menu={recordId}
        data-formless-state-transition-operation-labels=""
        data-formless-state-transition-operations=""
        data-formless-state-transition-target-states=""
      >
        {stateBadge}
      </span>
    );
  }

  return (
    <Menu>
      <MenuTrigger
        aria-label={`${label}: ${stateLabel}. Change state.`}
        className={`group inline-flex min-h-6 items-center ${className ?? ""}`}
        data-formless-state-transition-menu={recordId}
        data-formless-state-transition-operation-labels={operationLabels}
        data-formless-state-transition-operations={operationNames}
        data-formless-state-transition-target-states={targetStates}
        type="button"
      >
        {stateBadge}
      </MenuTrigger>
      <MenuContent popover={{ placement: "bottom start" }}>
        {availableOperations.map((projected) => {
          const { binding, operation } = projected;
          const pending = controller.isPending(binding.id);

          return (
            <MenuItem
              aria-label={pending ? `${operation.label}...` : operation.label}
              data-formless-state-transition-operation={operation.operationName}
              data-formless-state-transition-machine={operation.machineName}
              data-formless-state-transition-state-valid="true"
              data-formless-state-transition-target-state={operation.transition.to}
              isDisabled={hasPendingOperation}
              key={operation.operationName}
              onAction={() => {
                void runOperation(projected);
              }}
            >
              <MenuLabel>{pending ? `${operation.label}...` : operation.label}</MenuLabel>
            </MenuItem>
          );
        })}
      </MenuContent>
    </Menu>
  );
}

export function RecordTransitionOperationControls({
  operations,
  className,
  recordId,
  values,
}: {
  operations: TransitionStateOperationConfig[];
  className?: string;
  entityName: string;
  recordId: string;
  values: RecordValues | undefined;
}) {
  const projectedOperations = useMemo(
    () =>
      operations.map((operation): ProjectedTransitionOperationControl => {
        const field = operation.machine.field;
        const currentValue = values?.[field];
        const availability = selectTransitionStateOperationAvailability({
          operation,
          currentValue,
          field: operation.field,
        });

        return {
          availability,
          binding: projectStateTransitionOperationControlBinding({
            operation,
            availability,
            options: {
              executionTargetKey: recordId,
            },
          }),
          operation,
        };
      }),
    [operations, recordId, values],
  );
  const bindings = useMemo(
    () => projectedOperations.map((operation) => operation.binding),
    [projectedOperations],
  );
  const controller = useGeneratedOperationController(bindings);
  useGeneratedOperationControllerVersion(controller);
  const hasPendingOperation = bindings.some((binding) => controller.isPending(binding.id));

  if (operations.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="Lifecycle transitions"
      className={`flex flex-wrap items-center gap-1.5 ${className ?? ""}`}
      data-formless-transition-controls={recordId}
    >
      {projectedOperations.map(({ availability, binding, operation }) => {
        const pending = controller.isPending(binding.id);
        const disabled = hasPendingOperation || binding.availability.state === "disabled";
        const label = pending ? `${operation.label}...` : operation.label;

        return (
          <Button
            aria-label={
              availability.valid
                ? operation.label
                : `${operation.label}: ${availability.disabledReason ?? "Unavailable"}`
            }
            data-formless-transition-operation={operation.operationName}
            data-formless-transition-disabled-reason={availability.disabledReason}
            data-formless-transition-machine={operation.machineName}
            data-formless-transition-state-valid={availability.valid ? "true" : "false"}
            data-formless-transition-target-state={operation.transition.to}
            isDisabled={disabled}
            key={operation.operationName}
            onPress={() => {
              if (availability.valid) {
                void executeTransitionStateOperation({
                  binding,
                  controller,
                  operation,
                  recordId,
                  source: "button",
                });
              }
            }}
            size="xs"
            type="button"
            intent="outline"
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}

export async function executeTransitionStateOperation({
  binding,
  controller,
  operation,
  recordId,
  setStatus,
  source,
}: {
  binding: GeneratedOperationControlBinding;
  controller: GeneratedOperationController;
  operation: TransitionStateOperationConfig;
  recordId: string;
  setStatus?: (status: SyncStatus) => void;
  source: GeneratedOperationCallerInput["source"];
}): Promise<GeneratedOperationExecutionResult> {
  return executeGeneratedOperationControl({
    binding,
    callerInput: {
      bindingId: binding.id,
      recordId,
      source,
    },
    controller,
    feedback: {
      committedMessage: `${operation.label} synced.`,
      progressMessage: `${operation.label}...`,
      replayedMessage: `${operation.label} synced.`,
    },
    setStatus,
  });
}

function badgeIntentForPresentation(
  intent: ReturnType<typeof enumValuePresentation>["color"]["intent"],
): BadgeProps["intent"] {
  if (intent === "success" || intent === "warning" || intent === "danger") {
    return intent;
  }

  return "outline";
}

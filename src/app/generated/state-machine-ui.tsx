import { useState } from "react";
import { Badge, type BadgeProps } from "@dpeek/formless-ui/badge";
import { Button } from "@dpeek/formless-ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@dpeek/formless-ui/menu";
import {
  selectTransitionStateOperationAvailability,
  stateMachineStateIsTerminal,
} from "../../client/state-machine-model.ts";
import type { ClientAppTarget } from "../../client/app-target.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitOperation, type BrowserWriteOptions } from "../../client/sync.ts";
import type {
  StateMachineFieldConfig,
  TransitionStateOperationConfig,
} from "../../client/views.ts";
import type { FieldValue, RecordValues } from "@dpeek/formless-storage";
import { enumValuePresentation, GeneratedFieldPresentationIcon } from "./field-presentation.tsx";
import { useSchemaAppTarget, useSchemaAppWriteOptions } from "./schema-app-context.tsx";
import type { FieldSchema } from "@dpeek/formless-schema";

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
  entityName,
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
  const appTarget = useSchemaAppTarget();
  const writeOptions = useSchemaAppWriteOptions();
  const [pendingOperationName, setPendingOperationName] = useState<string | null>(null);
  const currentValue = values?.[stateMachine.fieldName];
  const stateValue = typeof currentValue === "string" ? currentValue : "";
  const option = field.values[stateValue];
  const presentation = enumValuePresentation({ option, value: stateValue });
  const stateLabel = stateValue === "" ? "Unset" : presentation.label;
  const terminal = stateMachineStateIsTerminal(stateMachine, currentValue);
  const availableOperations = operations.filter(
    (operation) =>
      selectTransitionStateOperationAvailability({
        operation,
        currentValue,
        field,
      }).valid,
  );
  const operationLabels = availableOperations.map((operation) => operation.label).join("|");
  const operationNames = availableOperations.map((operation) => operation.operationName).join("|");
  const targetStates = availableOperations.map((operation) => operation.transition.to).join("|");

  async function runOperation(operation: TransitionStateOperationConfig) {
    if (pendingOperationName !== null) {
      return;
    }

    setPendingOperationName(operation.operationName);
    setSyncStatus({ state: "syncing", message: `${operation.label}...` });

    try {
      await submitTransitionStateOperation(
        appTarget,
        entityName,
        operation.operationName,
        recordId,
        undefined,
        writeOptions,
      );
      setSyncStatus({ state: "idle", message: `${operation.label} synced.` });
    } catch (error) {
      setSyncStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Transition failed.",
      });
    } finally {
      setPendingOperationName(null);
    }
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
        {availableOperations.map((operation) => {
          const pending = pendingOperationName === operation.operationName;

          return (
            <MenuItem
              aria-label={pending ? `${operation.label}...` : operation.label}
              data-formless-state-transition-operation={operation.operationName}
              data-formless-state-transition-machine={operation.machineName}
              data-formless-state-transition-state-valid="true"
              data-formless-state-transition-target-state={operation.transition.to}
              isDisabled={pendingOperationName !== null}
              key={operation.operationName}
              onAction={() => {
                void runOperation(operation);
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
  entityName,
  recordId,
  values,
}: {
  operations: TransitionStateOperationConfig[];
  className?: string;
  entityName: string;
  recordId: string;
  values: RecordValues | undefined;
}) {
  const appTarget = useSchemaAppTarget();
  const writeOptions = useSchemaAppWriteOptions();
  const [pendingOperationName, setPendingOperationName] = useState<string | null>(null);

  if (operations.length === 0) {
    return null;
  }

  async function runOperation(operation: TransitionStateOperationConfig) {
    if (pendingOperationName !== null) {
      return;
    }

    setPendingOperationName(operation.operationName);
    setSyncStatus({ state: "syncing", message: `${operation.label}...` });

    try {
      await submitTransitionStateOperation(
        appTarget,
        entityName,
        operation.operationName,
        recordId,
        undefined,
        writeOptions,
      );
      setSyncStatus({ state: "idle", message: `${operation.label} synced.` });
    } catch (error) {
      setSyncStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Transition failed.",
      });
    } finally {
      setPendingOperationName(null);
    }
  }

  return (
    <div
      aria-label="Lifecycle transitions"
      className={`flex flex-wrap items-center gap-1.5 ${className ?? ""}`}
      data-formless-transition-controls={recordId}
    >
      {operations.map((operation) => {
        const field = operation.machine.field;
        const currentValue = values?.[field];
        const availability = selectTransitionStateOperationAvailability({
          operation,
          currentValue,
          field: operation.field,
        });
        const pending = pendingOperationName === operation.operationName;
        const disabled = pendingOperationName !== null || !availability.valid;
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
                void runOperation(operation);
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

export async function submitTransitionStateOperation(
  target: ClientAppTarget,
  entityName: string,
  operationName: string,
  recordId: string,
  fetcher: typeof fetch = fetch,
  options: BrowserWriteOptions = {},
) {
  return submitOperation(target, entityName, operationName, { recordId }, fetcher, options);
}

function badgeIntentForPresentation(
  intent: ReturnType<typeof enumValuePresentation>["color"]["intent"],
): BadgeProps["intent"] {
  if (intent === "success" || intent === "warning" || intent === "danger") {
    return intent;
  }

  return "outline";
}

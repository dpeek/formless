import { useState } from "react";
import { Badge, type BadgeProps } from "@dpeek/formless-ui/badge";
import { Button } from "@dpeek/formless-ui/button";
import {
  selectTransitionStateActionAvailability,
  stateMachineStateIsTerminal,
} from "../../client/state-machine-model.ts";
import type { ClientAppTarget } from "../../client/app-target.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitOperation } from "../../client/sync.ts";
import type { StateMachineFieldConfig, TransitionStateActionConfig } from "../../client/views.ts";
import type { FieldValue, RecordValues } from "../../shared/protocol.ts";
import { enumValuePresentation, GeneratedFieldPresentationIcon } from "./field-presentation.tsx";
import { useSchemaAppTarget } from "./schema-app-context.tsx";
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

export function RecordTransitionActionControls({
  actions,
  className,
  entityName,
  recordId,
  values,
}: {
  actions: TransitionStateActionConfig[];
  className?: string;
  entityName: string;
  recordId: string;
  values: RecordValues | undefined;
}) {
  const appTarget = useSchemaAppTarget();
  const [pendingActionName, setPendingActionName] = useState<string | null>(null);

  if (actions.length === 0) {
    return null;
  }

  async function runAction(action: TransitionStateActionConfig) {
    if (pendingActionName !== null) {
      return;
    }

    setPendingActionName(action.operationName);
    setSyncStatus({ state: "syncing", message: `${action.label}...` });

    try {
      await submitTransitionStateAction(appTarget, entityName, action.operationName, recordId);
      setSyncStatus({ state: "idle", message: `${action.label} synced.` });
    } catch (error) {
      setSyncStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Transition failed.",
      });
    } finally {
      setPendingActionName(null);
    }
  }

  return (
    <div
      aria-label="Lifecycle transitions"
      className={`flex flex-wrap items-center gap-1.5 ${className ?? ""}`}
      data-formless-transition-controls={recordId}
    >
      {actions.map((action) => {
        const field = action.machine.field;
        const currentValue = values?.[field];
        const availability = selectTransitionStateActionAvailability({
          action,
          currentValue,
          field: action.field,
        });
        const pending = pendingActionName === action.operationName;
        const disabled = pendingActionName !== null || !availability.valid;
        const label = pending ? `${action.label}...` : action.label;

        return (
          <Button
            aria-label={
              availability.valid
                ? action.label
                : `${action.label}: ${availability.disabledReason ?? "Unavailable"}`
            }
            data-formless-transition-action={action.operationName}
            data-formless-transition-disabled-reason={availability.disabledReason}
            data-formless-transition-machine={action.machineName}
            data-formless-transition-state-valid={availability.valid ? "true" : "false"}
            data-formless-transition-target-state={action.transition.to}
            isDisabled={disabled}
            key={action.operationName}
            onPress={() => {
              if (availability.valid) {
                void runAction(action);
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

export async function submitTransitionStateAction(
  target: ClientAppTarget,
  entityName: string,
  operationName: string,
  recordId: string,
  fetcher: typeof fetch = fetch,
) {
  return submitOperation(target, entityName, operationName, { recordId }, fetcher);
}

function badgeIntentForPresentation(
  intent: ReturnType<typeof enumValuePresentation>["color"]["intent"],
): BadgeProps["intent"] {
  if (intent === "success" || intent === "warning" || intent === "danger") {
    return intent;
  }

  return "outline";
}

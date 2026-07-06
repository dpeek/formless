import { useMemo, useState } from "react";
import { Badge } from "@dpeek/formless-ui/badge";
import { Button } from "@dpeek/formless-ui/button";
import { useEntityRecordCountMatchingQuery } from "../../client/store.ts";
import {
  projectCollectionOperationControlBindings,
  type CommandOperationTargetCountConfig,
  type GeneratedOperationControlBinding,
  type GeneratedOperationController,
  type GeneratedOperationExecutionResult,
  type HomeOperationConfig,
} from "../../client/views.ts";
import type { SyncStatus } from "../../client/sync-status.ts";
import { createDefaultsAreResolved, type QueryEvaluationContext } from "@dpeek/formless-schema";
import { GeneratedCreateDialog } from "./create.tsx";
import {
  executeGeneratedOperationControl,
  useGeneratedOperationController,
  useGeneratedOperationControllerVersion,
} from "./operation-control-runtime.ts";

type CommandHomeOperationConfig = Extract<HomeOperationConfig, { type: "command" }>;
type CreateHomeOperationConfig = Extract<HomeOperationConfig, { type: "create" }>;

export function HomeOperationRow({
  ariaLabel,
  operations,
  queryContext,
}: {
  ariaLabel: string;
  operations: HomeOperationConfig[];
  queryContext: QueryEvaluationContext;
}) {
  const [createDialogOperation, setCreateDialogOperation] =
    useState<CreateHomeOperationConfig | null>(null);
  const bindings = useMemo(
    () => projectCollectionOperationControlBindings(operations),
    [operations],
  );
  const bindingsByCanonicalKey = useMemo(
    () => new Map(bindings.map((binding) => [binding.canonicalOperationKey, binding])),
    [bindings],
  );
  const controller = useGeneratedOperationController(bindings);
  useGeneratedOperationControllerVersion(controller);
  const commandPending = bindings.some(
    (binding) => binding.kind === "command" && controller.isPending(binding.id),
  );

  async function runCommandOperation(operation: CommandHomeOperationConfig) {
    const binding = bindingsByCanonicalKey.get(operation.operation.canonicalKey);

    if (binding === undefined || commandPending) {
      return;
    }

    await executeHomeCommandOperation({
      binding,
      controller,
      operation,
    });
  }

  return (
    <section aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {operations.map((operation) => {
        if (operation.type === "create") {
          const canOpen =
            operation.enabled && createDefaultsAreResolved(operation.defaults, queryContext);

          return (
            <Button
              isDisabled={!canOpen}
              key={`${operation.type}:${operation.entityName}`}
              onPress={() => {
                if (canOpen) {
                  setCreateDialogOperation(operation);
                }
              }}
              type="button"
            >
              {operation.enabled ? operation.label : "Create disabled"}
            </Button>
          );
        }

        const binding = bindingsByCanonicalKey.get(operation.operation.canonicalKey);

        return (
          <HomeCommandOperationButton
            binding={binding}
            disabled={commandPending}
            key={`${operation.type}:${operation.operationName}`}
            onRun={runCommandOperation}
            operation={operation}
            pending={binding === undefined ? false : controller.isPending(binding.id)}
            queryContext={queryContext}
          />
        );
      })}
      {createDialogOperation ? (
        <GeneratedCreateDialog
          operation={createDialogOperation}
          onOpenChange={(open) => {
            if (!open) {
              setCreateDialogOperation(null);
            }
          }}
          open={true}
          queryContext={queryContext}
        />
      ) : null}
    </section>
  );
}

function HomeCommandOperationButton({
  binding,
  disabled,
  onRun,
  operation,
  pending,
  queryContext,
}: {
  binding?: GeneratedOperationControlBinding;
  disabled: boolean;
  onRun: (operation: CommandHomeOperationConfig) => Promise<void>;
  operation: CommandHomeOperationConfig;
  pending: boolean;
  queryContext: QueryEvaluationContext;
}) {
  const controlDisabled = disabled || binding?.availability.state === "disabled";

  if (!operation.ui.targetCount) {
    return (
      <Button
        isDisabled={controlDisabled}
        onPress={() => void onRun(operation)}
        type="button"
        intent="outline"
      >
        {pending ? `${operation.label}...` : operation.label}
      </Button>
    );
  }

  return (
    <CountedHomeCommandOperationButton
      disabled={controlDisabled}
      onRun={onRun}
      operation={operation}
      pending={pending}
      queryContext={queryContext}
      targetCount={operation.ui.targetCount}
    />
  );
}

function CountedHomeCommandOperationButton({
  disabled,
  onRun,
  operation,
  pending,
  queryContext,
  targetCount,
}: {
  disabled: boolean;
  onRun: (operation: CommandHomeOperationConfig) => Promise<void>;
  operation: CommandHomeOperationConfig;
  pending: boolean;
  queryContext: QueryEvaluationContext;
  targetCount: CommandOperationTargetCountConfig;
}) {
  const count = useEntityRecordCountMatchingQuery(
    operation.entityName,
    targetCount.query,
    queryContext,
  );

  return (
    <Button
      isDisabled={disabled}
      onPress={() => void onRun(operation)}
      type="button"
      intent="outline"
    >
      <span>{pending ? `${operation.label}...` : operation.label}</span>
      <Badge aria-label={targetCount.ariaLabel} className="ml-2 h-4 px-1.5" intent="outline">
        {count}
      </Badge>
    </Button>
  );
}

export async function executeHomeCommandOperation({
  binding,
  controller,
  operation,
  setStatus,
}: {
  binding: GeneratedOperationControlBinding;
  controller: GeneratedOperationController;
  operation: CommandHomeOperationConfig;
  setStatus?: (status: SyncStatus) => void;
}): Promise<GeneratedOperationExecutionResult> {
  return executeGeneratedOperationControl({
    binding,
    callerInput: {
      bindingId: binding.id,
      source: "button",
    },
    controller,
    feedback: {
      committedMessage: (result) => homeCommandOperationCommittedMessage(operation, result),
      replayedMessage: binding.feedback?.replayLabel ?? `${operation.label} replayed.`,
    },
    setStatus,
  });
}

export function homeCommandOperationCommittedMessage(
  operation: CommandHomeOperationConfig,
  result: GeneratedOperationExecutionResult,
): string {
  const affectedCount = result.type === "failed" ? 0 : (result.affectedCount ?? 0);

  return operation.ui.showAffectedCountOnSuccess
    ? `${operation.label} synced. ${affectedCount} affected.`
    : `${operation.label} synced.`;
}

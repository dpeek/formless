import { useState } from "react";
import { Badge } from "@dpeek/formless-ui/badge";
import { Button } from "@dpeek/formless-ui/button";
import { useEntityRecordCountMatchingQuery } from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitOperation } from "../../client/sync.ts";
import type { CommandOperationTargetCountConfig } from "../../client/views.ts";
import type { HomeOperationConfig } from "../../client/views.ts";
import { createDefaultsAreResolved, type QueryEvaluationContext } from "@dpeek/formless-schema";
import { GeneratedCreateDialog } from "./create.tsx";
import { useSchemaAppTarget, useSchemaAppWriteOptions } from "./schema-app-context.tsx";

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
  const appTarget = useSchemaAppTarget();
  const writeOptions = useSchemaAppWriteOptions();
  const [pendingOperationName, setPendingOperationName] = useState<string | null>(null);
  const [createDialogAction, setCreateDialogAction] = useState<CreateHomeOperationConfig | null>(
    null,
  );

  async function runCommandOperation(operation: CommandHomeOperationConfig) {
    if (pendingOperationName) {
      return;
    }

    setPendingOperationName(operation.operationName);
    setSyncStatus({ state: "syncing", message: `${operation.label}...` });

    try {
      const response = await submitOperation(
        appTarget,
        operation.entityName,
        operation.operationName,
        {},
        undefined,
        writeOptions,
      );
      const affected = "changes" in response.output ? response.output.changes.length : 0;
      const message = operation.ui.showAffectedCountOnSuccess
        ? `${operation.label} synced. ${affected} affected.`
        : `${operation.label} synced.`;

      setSyncStatus({ state: "idle", message });
    } catch (error) {
      setSyncStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Operation failed.",
      });
    } finally {
      setPendingOperationName(null);
    }
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
                  setCreateDialogAction(operation);
                }
              }}
              type="button"
            >
              {operation.enabled ? operation.label : "Create disabled"}
            </Button>
          );
        }

        return (
          <HomeCommandOperationButton
            disabled={pendingOperationName !== null}
            key={`${operation.type}:${operation.operationName}`}
            onRun={runCommandOperation}
            operation={operation}
            pending={pendingOperationName === operation.operationName}
            queryContext={queryContext}
          />
        );
      })}
      {createDialogAction ? (
        <GeneratedCreateDialog
          action={createDialogAction}
          onOpenChange={(open) => {
            if (!open) {
              setCreateDialogAction(null);
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
  disabled,
  onRun,
  operation,
  pending,
  queryContext,
}: {
  disabled: boolean;
  onRun: (operation: CommandHomeOperationConfig) => Promise<void>;
  operation: CommandHomeOperationConfig;
  pending: boolean;
  queryContext: QueryEvaluationContext;
}) {
  if (!operation.ui.targetCount) {
    return (
      <Button
        isDisabled={disabled}
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
      disabled={disabled}
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

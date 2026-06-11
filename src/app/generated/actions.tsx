import { useState } from "react";
import { Badge } from "@dpeek/formless-ui/badge";
import { Button } from "@dpeek/formless-ui/button";
import { useEntityRecordCountMatchingQuery } from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitOperation } from "../../client/sync.ts";
import type { EntityActionTargetCountConfig } from "../../client/action-ui.ts";
import type { HomeOperationConfig } from "../../client/views.ts";
import { createDefaultsAreResolved, type QueryEvaluationContext } from "@dpeek/formless-schema";
import { GeneratedCreateDialog } from "./create.tsx";
import { useSchemaAppTarget } from "./schema-app-context.tsx";

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
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [createDialogAction, setCreateDialogAction] = useState<CreateHomeOperationConfig | null>(
    null,
  );

  async function runAction(action: CommandHomeOperationConfig) {
    if (pendingAction) {
      return;
    }

    setPendingAction(action.operationName);
    setSyncStatus({ state: "syncing", message: `${action.label}...` });

    try {
      const response = await submitOperation(appTarget, action.entityName, action.operationName);
      const affected = "changes" in response.output ? response.output.changes.length : 0;
      const message = action.ui.showAffectedCountOnSuccess
        ? `${action.label} synced. ${affected} affected.`
        : `${action.label} synced.`;

      setSyncStatus({ state: "idle", message });
    } catch (error) {
      setSyncStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Action failed.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {operations.map((action) => {
        if (action.type === "create") {
          const canOpen =
            action.enabled && createDefaultsAreResolved(action.defaults, queryContext);

          return (
            <Button
              isDisabled={!canOpen}
              key={`${action.type}:${action.entityName}`}
              onPress={() => {
                if (canOpen) {
                  setCreateDialogAction(action);
                }
              }}
              type="button"
            >
              {action.enabled ? action.label : "Create disabled"}
            </Button>
          );
        }

        return (
          <HomeEntityActionButton
            action={action}
            disabled={pendingAction !== null}
            key={`${action.type}:${action.operationName}`}
            onRun={runAction}
            pending={pendingAction === action.operationName}
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

function HomeEntityActionButton({
  action,
  disabled,
  onRun,
  pending,
  queryContext,
}: {
  action: CommandHomeOperationConfig;
  disabled: boolean;
  onRun: (action: CommandHomeOperationConfig) => Promise<void>;
  pending: boolean;
  queryContext: QueryEvaluationContext;
}) {
  if (!action.ui.targetCount) {
    return (
      <Button
        isDisabled={disabled}
        onPress={() => void onRun(action)}
        type="button"
        intent="outline"
      >
        {pending ? `${action.label}...` : action.label}
      </Button>
    );
  }

  return (
    <CountedHomeEntityActionButton
      action={action}
      disabled={disabled}
      onRun={onRun}
      pending={pending}
      queryContext={queryContext}
      targetCount={action.ui.targetCount}
    />
  );
}

function CountedHomeEntityActionButton({
  action,
  disabled,
  onRun,
  pending,
  queryContext,
  targetCount,
}: {
  action: CommandHomeOperationConfig;
  disabled: boolean;
  onRun: (action: CommandHomeOperationConfig) => Promise<void>;
  pending: boolean;
  queryContext: QueryEvaluationContext;
  targetCount: EntityActionTargetCountConfig;
}) {
  const count = useEntityRecordCountMatchingQuery(
    action.entityName,
    targetCount.query,
    queryContext,
  );

  return (
    <Button isDisabled={disabled} onPress={() => void onRun(action)} type="button" intent="outline">
      <span>{pending ? `${action.label}...` : action.label}</span>
      <Badge aria-label={targetCount.ariaLabel} className="ml-2 h-4 px-1.5" intent="outline">
        {count}
      </Badge>
    </Button>
  );
}

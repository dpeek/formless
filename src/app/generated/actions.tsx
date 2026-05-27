import { useState } from "react";
import { Badge } from "@dpeek/formless-ui/badge";
import { Button } from "@dpeek/formless-ui/button";
import { useEntityRecordCountMatchingQuery } from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitAction } from "../../client/sync.ts";
import type { EntityActionTargetCountConfig } from "../../client/action-ui.ts";
import type { HomeActionConfig } from "../../client/views.ts";
import type { QueryEvaluationContext } from "../../shared/query.ts";
import { createDefaultsAreResolved } from "../../shared/create-defaults.ts";
import { GeneratedCreateDialog } from "./create.tsx";
import { useSchemaAppTarget } from "./schema-app-context.tsx";

type EntityHomeActionConfig = Extract<HomeActionConfig, { type: "entity-action" }>;
type CreateHomeActionConfig = Extract<HomeActionConfig, { type: "create" }>;

export function HomeActionRow({
  actions,
  ariaLabel,
  queryContext,
}: {
  actions: HomeActionConfig[];
  ariaLabel: string;
  queryContext: QueryEvaluationContext;
}) {
  const appTarget = useSchemaAppTarget();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [createDialogAction, setCreateDialogAction] = useState<CreateHomeActionConfig | null>(null);

  async function runAction(action: Extract<HomeActionConfig, { type: "entity-action" }>) {
    if (pendingAction) {
      return;
    }

    setPendingAction(action.actionName);
    setSyncStatus({ state: "syncing", message: `${action.label}...` });

    try {
      const response = await submitAction(appTarget, action.entityName, action.actionName);
      const affected = response.changes.length;
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
      {actions.map((action) => {
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
            key={`${action.type}:${action.actionName}`}
            onRun={runAction}
            pending={pendingAction === action.actionName}
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
  action: EntityHomeActionConfig;
  disabled: boolean;
  onRun: (action: EntityHomeActionConfig) => Promise<void>;
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
  action: EntityHomeActionConfig;
  disabled: boolean;
  onRun: (action: EntityHomeActionConfig) => Promise<void>;
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

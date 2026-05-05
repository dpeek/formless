import { useState } from "react";
import { Badge } from "@formless/ui/badge";
import { Button } from "@formless/ui/button";
import { useEntityRecordCountMatchingQuery } from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitAction } from "../../client/sync.ts";
import type { HomeActionConfig } from "../../client/views.ts";
import type { QueryEvaluationContext, QueryExpression } from "../../shared/query.ts";
import {
  createDefaultsAreResolved,
  GeneratedCreateDialog,
  type CreateHomeActionConfig,
} from "./create.tsx";
import { useSchemaKey } from "./schema-app-context.tsx";

type EntityHomeActionConfig = Extract<HomeActionConfig, { type: "entity-action" }>;
type CountedEntityHomeActionConfig = EntityHomeActionConfig & {
  targetQuery: QueryExpression;
};

export function HomeActionRow({
  actions,
  ariaLabel,
  queryContext,
}: {
  actions: HomeActionConfig[];
  ariaLabel: string;
  queryContext: QueryEvaluationContext;
}) {
  const schemaKey = useSchemaKey();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [createDialogAction, setCreateDialogAction] = useState<CreateHomeActionConfig | null>(null);

  async function runAction(action: Extract<HomeActionConfig, { type: "entity-action" }>) {
    if (pendingAction) {
      return;
    }

    setPendingAction(action.actionName);
    setSyncStatus({ state: "syncing", message: `${action.label}...` });

    try {
      const response = await submitAction(schemaKey, action.entityName, action.actionName);
      const affected = response.changes.length;
      const message =
        action.count?.type === "count"
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
          const canOpen = action.enabled && createDefaultsAreResolved(action, queryContext);

          return (
            <Button
              disabled={!canOpen}
              key={`${action.type}:${action.entityName}`}
              onClick={() => {
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
  if (action.count?.type !== "count" || !hasTargetQuery(action)) {
    return (
      <Button
        disabled={disabled}
        onClick={() => void onRun(action)}
        type="button"
        variant="outline"
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
    />
  );
}

function CountedHomeEntityActionButton({
  action,
  disabled,
  onRun,
  pending,
  queryContext,
}: {
  action: CountedEntityHomeActionConfig;
  disabled: boolean;
  onRun: (action: EntityHomeActionConfig) => Promise<void>;
  pending: boolean;
  queryContext: QueryEvaluationContext;
}) {
  const count = useEntityRecordCountMatchingQuery(
    action.entityName,
    action.targetQuery,
    queryContext,
  );

  return (
    <Button disabled={disabled} onClick={() => void onRun(action)} type="button" variant="outline">
      <span>{pending ? `${action.label}...` : action.label}</span>
      {action.count?.type === "count" ? (
        <Badge
          aria-label={`${action.label} target count`}
          className="ml-2 h-4 px-1.5"
          variant="outline"
        >
          {count}
        </Badge>
      ) : null}
    </Button>
  );
}

function hasTargetQuery(action: EntityHomeActionConfig): action is CountedEntityHomeActionConfig {
  return action.targetQuery !== undefined;
}

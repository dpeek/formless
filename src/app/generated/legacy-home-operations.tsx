import { useMemo } from "react";
import type { FormlessUiOperationPresentationIntent } from "@dpeek/formless-astryx/contract";
import { useEntityRecordCountMatchingQuery } from "../../client/store.ts";
import {
  projectCollectionOperationControlBindings,
  type CommandOperationTargetCountConfig,
  type GeneratedOperationControlBinding,
  type GeneratedOperationController,
  type HomeOperationConfig,
} from "../../client/views.ts";
import type { QueryEvaluationContext } from "@dpeek/formless-schema";
import { GeneratedCreateSurface } from "./legacy-generated-create.tsx";
import {
  handleGeneratedOperationFormlessUiIntent,
  useGeneratedOperationController,
  useGeneratedOperationControllerVersion,
} from "./operation-control-runtime.ts";
import { projectGeneratedOperationFormlessUiControl } from "./formless-ui-operation-projection.ts";
import { LegacyGeneratedOperationButton } from "./legacy-operation-controls.tsx";
import { executeHomeCommandOperation } from "./home-operation-runtime.ts";

type CommandHomeOperationConfig = Extract<HomeOperationConfig, { type: "command" }>;
export function HomeOperationRow({
  ariaLabel,
  operations,
  queryContext,
}: {
  ariaLabel: string;
  operations: HomeOperationConfig[];
  queryContext: QueryEvaluationContext;
}) {
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

  return (
    <section aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {operations.map((operation) => {
        if (operation.type === "create") {
          return (
            <GeneratedCreateSurface
              key={`${operation.type}:${operation.entityName}`}
              operation={operation}
              queryContext={queryContext}
              surfaceId={`home-operation:${operation.operation.canonicalKey}`}
              trigger={{
                content: {
                  kind: "label",
                  label: operation.enabled ? operation.label : "Create disabled",
                },
                density: "default",
                prominence: "primary",
              }}
            />
          );
        }

        const binding = bindingsByCanonicalKey.get(operation.operation.canonicalKey);

        return (
          <HomeCommandOperationButton
            binding={binding}
            commandPending={commandPending}
            controller={controller}
            key={`${operation.type}:${operation.operationName}`}
            operation={operation}
            queryContext={queryContext}
          />
        );
      })}
    </section>
  );
}

function HomeCommandOperationButton({
  binding,
  commandPending,
  controller,
  operation,
  queryContext,
}: {
  binding?: GeneratedOperationControlBinding;
  commandPending: boolean;
  controller: GeneratedOperationController;
  operation: CommandHomeOperationConfig;
  queryContext: QueryEvaluationContext;
}) {
  if (binding === undefined) {
    return null;
  }

  if (!operation.ui.targetCount) {
    return (
      <HomeCommandOperationControl
        binding={binding}
        commandPending={commandPending}
        controller={controller}
        operation={operation}
      />
    );
  }

  return (
    <CountedHomeCommandOperationButton
      binding={binding}
      commandPending={commandPending}
      controller={controller}
      operation={operation}
      queryContext={queryContext}
      targetCount={operation.ui.targetCount}
    />
  );
}

function CountedHomeCommandOperationButton({
  binding,
  commandPending,
  controller,
  operation,
  queryContext,
  targetCount,
}: {
  binding: GeneratedOperationControlBinding;
  commandPending: boolean;
  controller: GeneratedOperationController;
  operation: CommandHomeOperationConfig;
  queryContext: QueryEvaluationContext;
  targetCount: CommandOperationTargetCountConfig;
}) {
  const count = useEntityRecordCountMatchingQuery(
    operation.entityName,
    targetCount.query,
    queryContext,
  );

  return (
    <HomeCommandOperationControl
      binding={binding}
      commandPending={commandPending}
      controller={controller}
      operation={operation}
      targetCount={{
        accessibilityLabel: targetCount.ariaLabel,
        count,
      }}
    />
  );
}

function HomeCommandOperationControl({
  binding,
  commandPending,
  controller,
  operation,
  targetCount,
}: {
  binding: GeneratedOperationControlBinding;
  commandPending: boolean;
  controller: GeneratedOperationController;
  operation: CommandHomeOperationConfig;
  targetCount?: { accessibilityLabel: string; count: number };
}) {
  const state = controller.getStateByExecutionKey(binding.executionKey);
  const control = projectGeneratedOperationFormlessUiControl({
    binding,
    presentation: {
      accessibilityLabel: operation.label,
      content: { kind: "label", label: operation.label },
      density: "default",
      ...(commandPending && state.status !== "pending"
        ? { disabledReason: "Another command is running." }
        : {}),
      pendingLabel: `${operation.label}...`,
      prominence: "secondary",
    },
    state,
    ...(targetCount === undefined ? {} : { targetCount }),
  });

  async function onIntent(intent: FormlessUiOperationPresentationIntent) {
    await handleGeneratedOperationFormlessUiIntent({
      binding,
      controller,
      intent,
      invoke: (invokeIntent) =>
        executeHomeCommandOperation({
          binding,
          controller,
          operation,
          source: invokeIntent.invocationSource,
        }),
    });
  }

  return <LegacyGeneratedOperationButton button={control.trigger} onIntent={onIntent} />;
}

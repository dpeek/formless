import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Section } from "@astryxdesign/core/Section";
import { Selector, type SelectorOptionData } from "@astryxdesign/core/Selector";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { memo, type ReactNode } from "react";
import type {
  FormlessUiCreateIntent,
  FormlessUiFieldIntent,
  FormlessUiListIntent,
  FormlessUiListOperationActionContract,
  FormlessUiOperationPresentationIntent,
  FormlessUiRecordResultIntent,
  FormlessUiContextResultReference,
  FormlessUiMainResultReference,
  FormlessUiTableOperationActionContract,
  FormlessUiTableIntent,
  FormlessUiWorkspaceCollectionActionContract,
  FormlessUiWorkspaceCollectionActionGroupContract,
  FormlessUiWorkspaceCollectionContract,
  FormlessUiWorkspaceCollectionShellContract,
  FormlessUiWorkspaceContextContract,
  FormlessUiWorkspaceContextOptionContract,
  FormlessUiWorkspaceIntentHandler,
  FormlessUiWorkspaceIntentScope,
  FormlessUiWorkspaceQueryContract,
  FormlessUiWorkspaceQueryNavigationContract,
  FormlessUiWorkspaceResultContract,
  FormlessUiWorkspaceSummaryContract,
} from "../formless-ui-contract.ts";
import { formlessUiContractReferenceKey } from "../formless-ui-contract-host.ts";
import {
  useFormlessUiResult,
  useFormlessUiWorkspaceIntentHandler,
} from "../formless-ui-contract-host-react.tsx";
import { AstryxCreateSurfaceRenderer } from "./formless-ui-create-renderer.tsx";
import { AstryxListRenderer } from "./formless-ui-list-renderer.tsx";
import { AstryxRecordResultRenderer } from "./formless-ui-record-result-renderer.tsx";
import { AstryxTableRenderer } from "./formless-ui-table-renderer.tsx";
import {
  AstryxSubscribedTreeResultRenderer,
  AstryxTreeResultRenderer,
  dispatchAstryxWorkspaceTreeIntent,
} from "./formless-ui-tree-renderer.tsx";
import {
  AstryxOperationButton,
  AstryxOperationButtonWithProgress,
  AstryxOperationCompactStatus,
  AstryxOperationDestructiveConfirmation,
  AstryxOperationFeedback,
} from "./operation-controls.tsx";

export function AstryxWorkspaceCollectionRenderer({
  collection,
  onIntent,
  scope,
}: {
  collection: FormlessUiWorkspaceCollectionContract;
  onIntent: FormlessUiWorkspaceIntentHandler;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  const presentation = collection.presentation;

  return (
    <AstryxWorkspaceCollectionFrame
      collection={collection}
      contextResult={
        presentation.contextDetail ? (
          <AstryxWorkspaceRecordResult
            contextId={
              presentation.kind === "listDetail"
                ? presentation.selector.id
                : presentation.context?.id
            }
            onIntent={onIntent}
            recordResult={presentation.contextDetail}
            scope={scope}
          />
        ) : undefined
      }
      mainResult={
        <AstryxWorkspaceResult onIntent={onIntent} result={presentation.result} scope={scope} />
      }
      onIntent={onIntent}
      scope={scope}
    />
  );
}

export function AstryxSubscribedWorkspaceCollectionRenderer({
  collection,
  scope,
}: {
  collection: FormlessUiWorkspaceCollectionShellContract;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  const onIntent = useFormlessUiWorkspaceIntentHandler();
  const presentation = collection.presentation;

  return (
    <AstryxWorkspaceCollectionFrame
      collection={collection}
      contextResult={
        presentation.contextDetail ? (
          <AstryxSubscribedWorkspaceContextResult
            contextId={
              presentation.kind === "listDetail"
                ? presentation.selector.id
                : presentation.context?.id
            }
            reference={presentation.contextDetail}
            scope={scope}
          />
        ) : undefined
      }
      mainResult={
        <AstryxSubscribedWorkspaceMainResult reference={presentation.result} scope={scope} />
      }
      onIntent={onIntent}
      scope={scope}
    />
  );
}

function AstryxWorkspaceCollectionFrame({
  collection,
  contextResult,
  mainResult,
  onIntent,
  scope,
}: {
  collection: FormlessUiWorkspaceCollectionContract | FormlessUiWorkspaceCollectionShellContract;
  contextResult?: ReactNode;
  mainResult: ReactNode;
  onIntent: FormlessUiWorkspaceIntentHandler;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  if (collection.availability.state === "empty") {
    return (
      <EmptyState
        data-formless-astryx-workspace-empty-state={collection.availability.emptyState.id}
        description={collection.availability.emptyState.description}
        headingLevel={3}
        title={collection.availability.emptyState.title}
      />
    );
  }

  if (collection.availability.state === "unavailable") {
    return (
      <Banner
        container="card"
        data-formless-astryx-workspace-unavailable={collection.id}
        status="warning"
        title={collection.availability.message}
      />
    );
  }

  const presentation = collection.presentation;

  return (
    <VStack
      as="section"
      aria-label={collection.accessibilityLabel}
      data-formless-astryx-workspace-collection={collection.id}
      gap={6}
      width="100%"
    >
      {presentation.kind === "listDetail" ? (
        <Grid
          aria-label={presentation.accessibilityLabel}
          columns={{ max: 2, minWidth: 280 }}
          gap={6}
          role="group"
          width="100%"
        >
          <AstryxWorkspaceListDetailSelector
            context={presentation.selector}
            onIntent={onIntent}
            scope={scope}
          />
          <VStack gap={6} width="100%">
            {contextResult}
            <AstryxWorkspaceQueryNavigation
              navigation={presentation.queryNavigation}
              onIntent={onIntent}
            />
            <AstryxWorkspaceSummaries summaries={presentation.summaries} />
            {mainResult}
            <AstryxWorkspaceCollectionActions
              actions={presentation.actions}
              onIntent={onIntent}
              scope={scope}
            />
          </VStack>
        </Grid>
      ) : (
        <>
          {presentation.context ? (
            <AstryxWorkspaceOrdinaryContext
              context={presentation.context}
              detail={contextResult}
              onIntent={onIntent}
              scope={scope}
            />
          ) : null}
          <AstryxWorkspaceQueryNavigation
            navigation={presentation.queryNavigation}
            onIntent={onIntent}
          />
          <AstryxWorkspaceSummaries summaries={presentation.summaries} />
          {mainResult}
          <AstryxWorkspaceCollectionActions
            actions={presentation.actions}
            onIntent={onIntent}
            scope={scope}
          />
        </>
      )}
    </VStack>
  );
}

function AstryxWorkspaceQueryNavigation({
  navigation,
  onIntent,
}: {
  navigation?: FormlessUiWorkspaceQueryNavigationContract;
  onIntent: FormlessUiWorkspaceIntentHandler;
}) {
  if (!navigation) {
    return null;
  }

  const selectedId = navigation.items.find((item) => item.selected)?.id ?? "";

  return (
    <TabList
      aria-label={navigation.accessibilityLabel}
      hasDivider
      onChange={(itemId) => {
        const item = navigation.items.find((candidate) => candidate.id === itemId);
        if (item) {
          void dispatchAstryxWorkspaceQuerySelection(onIntent, item);
        }
      }}
      value={selectedId}
    >
      {navigation.items.map((item) => (
        <Tab
          aria-disabled={!item.availability.available || undefined}
          endContent={
            item.countText === undefined ? undefined : (
              <Badge aria-label={`${item.label} count`} label={item.countText} variant="neutral" />
            )
          }
          key={item.id}
          label={item.label}
          value={item.id}
        />
      ))}
    </TabList>
  );
}

function AstryxWorkspaceOrdinaryContext({
  context,
  detail,
  onIntent,
  scope,
}: {
  context: FormlessUiWorkspaceContextContract;
  detail?: ReactNode;
  onIntent: FormlessUiWorkspaceIntentHandler;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  if (context.presentation === "externalNavigation") {
    return detail ?? null;
  }

  return (
    <Section padding={3} variant="muted" width="100%">
      <VStack gap={3} width="100%">
        {context.presentation === "localTabs" ? (
          <HStack align="center" gap={3} justify="between" width="100%" wrap="wrap">
            <AstryxWorkspaceContextTabs context={context} onIntent={onIntent} />
            <AstryxWorkspaceContextCreate context={context} onIntent={onIntent} scope={scope} />
          </HStack>
        ) : null}
        <AstryxWorkspaceContextAvailability context={context} />
        {detail}
      </VStack>
    </Section>
  );
}

function AstryxWorkspaceContextTabs({
  context,
  onIntent,
}: {
  context: FormlessUiWorkspaceContextContract;
  onIntent: FormlessUiWorkspaceIntentHandler;
}) {
  return (
    <TabList
      aria-label={context.accessibilityLabel}
      onChange={(optionId) => {
        const option = context.options.find((candidate) => candidate.id === optionId);
        if (option) {
          void dispatchAstryxWorkspaceContextSelection(onIntent, option);
        }
      }}
      size="sm"
      value={context.selectedOptionId ?? ""}
    >
      {context.options.map((option) => (
        <Tab
          aria-disabled={!option.availability.available || undefined}
          endContent={
            option.countText === undefined ? undefined : (
              <Badge
                aria-label={`${option.label} count`}
                label={option.countText}
                variant="neutral"
              />
            )
          }
          key={option.id}
          label={option.label}
          value={option.id}
        />
      ))}
    </TabList>
  );
}

function AstryxWorkspaceListDetailSelector({
  context,
  onIntent,
  scope,
}: {
  context: FormlessUiWorkspaceContextContract;
  onIntent: FormlessUiWorkspaceIntentHandler;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  const options = context.options.map(astryxWorkspaceContextSelectorOption);

  return (
    <Card padding={4} width="100%">
      <VStack gap={3} width="100%">
        <HStack align="center" gap={2} justify="between" width="100%" wrap="wrap">
          <Heading level={3}>{context.label}</Heading>
          <AstryxWorkspaceContextCreate context={context} onIntent={onIntent} scope={scope} />
        </HStack>
        <AstryxWorkspaceContextAvailability context={context} />
        {context.availability.state === "ready" ? (
          <Selector
            isLabelHidden
            label={context.accessibilityLabel}
            onChange={(optionId) => {
              const option = context.options.find((candidate) => candidate.id === optionId);
              if (option) {
                void dispatchAstryxWorkspaceContextSelection(onIntent, option);
              }
            }}
            options={options}
            renderOption={(option) => {
              const contextOption = context.options.find(
                (candidate) => candidate.id === option.value,
              );

              return (
                <HStack align="center" gap={2} justify="between" width="100%">
                  <Text type="label">{option.label}</Text>
                  {contextOption?.countText === undefined ? null : (
                    <Badge
                      aria-label={`${contextOption.label} count`}
                      label={contextOption.countText}
                      variant="neutral"
                    />
                  )}
                </HStack>
              );
            }}
            size="sm"
            value={context.selectedOptionId}
            width="100%"
          />
        ) : null}
      </VStack>
    </Card>
  );
}

function AstryxWorkspaceContextAvailability({
  context,
}: {
  context: FormlessUiWorkspaceContextContract;
}) {
  if (context.availability.state === "ready") {
    return null;
  }

  return context.availability.state === "empty" ? (
    <EmptyState
      data-formless-astryx-workspace-context-empty={context.availability.emptyState.id}
      description={context.availability.emptyState.description}
      headingLevel={3}
      isCompact
      title={context.availability.emptyState.title}
    />
  ) : (
    <Banner container="card" status="warning" title={context.availability.message} />
  );
}

function AstryxWorkspaceContextCreate({
  context,
  onIntent,
  scope,
}: {
  context: FormlessUiWorkspaceContextContract;
  onIntent: FormlessUiWorkspaceIntentHandler;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  const action = context.createAction;
  if (!action) {
    return null;
  }

  return (
    <AstryxCreateSurfaceRenderer
      onFieldIntent={(fieldId, intent) =>
        dispatchAstryxWorkspaceFieldIntent(onIntent, scope, fieldId, intent, {
          contextId: context.id,
          surfaceId: action.surface.id,
        })
      }
      onIntent={(intent) =>
        dispatchAstryxWorkspaceCreateIntent(onIntent, scope, action.surface.id, intent, context.id)
      }
      surface={action.surface}
    />
  );
}

function AstryxWorkspaceSummaries({
  summaries,
}: {
  summaries: readonly FormlessUiWorkspaceSummaryContract[];
}) {
  const availableSummaries = summaries.filter((summary) => summary.availability.available);
  if (availableSummaries.length === 0) {
    return null;
  }

  return (
    <Grid aria-label="Collection summary" columns={{ max: 4, minWidth: 128 }} gap={3}>
      {availableSummaries.map((summary) => (
        <Card aria-label={`${summary.label} summary`} key={summary.id} padding={3} variant="muted">
          <VStack gap={1}>
            <Text color="secondary" display="block" type="supporting" weight="medium">
              {summary.label}
            </Text>
            <HStack align="end" gap={1}>
              <Text display="block" type="body" weight="semibold">
                {summary.displayValue}
              </Text>
              {summary.suffix ? (
                <Text color="secondary" display="block" type="supporting">
                  {summary.suffix}
                </Text>
              ) : null}
            </HStack>
          </VStack>
        </Card>
      ))}
    </Grid>
  );
}

function AstryxWorkspaceCollectionActions({
  actions,
  onIntent,
  scope,
}: {
  actions: FormlessUiWorkspaceCollectionActionGroupContract;
  onIntent: FormlessUiWorkspaceIntentHandler;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  const orderedActions = [...actions.primary, ...actions.secondary];
  if (orderedActions.length === 0) {
    return null;
  }

  return (
    <HStack aria-label={actions.secondaryAccessibilityLabel} gap={2} role="group" wrap="wrap">
      {orderedActions.map((action) => (
        <AstryxWorkspaceCollectionAction
          action={action}
          key={workspaceCollectionActionId(action)}
          onIntent={onIntent}
          scope={scope}
        />
      ))}
    </HStack>
  );
}

function AstryxWorkspaceCollectionAction({
  action,
  onIntent,
  scope,
}: {
  action: FormlessUiWorkspaceCollectionActionContract;
  onIntent: FormlessUiWorkspaceIntentHandler;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  if (action.kind === "createAction") {
    return (
      <AstryxCreateSurfaceRenderer
        onFieldIntent={(fieldId, intent) =>
          dispatchAstryxWorkspaceFieldIntent(onIntent, scope, fieldId, intent, {
            surfaceId: action.surface.id,
          })
        }
        onIntent={(intent) =>
          dispatchAstryxWorkspaceCreateIntent(onIntent, scope, action.surface.id, intent)
        }
        surface={action.surface}
      />
    );
  }

  const dispatch = (intent: FormlessUiOperationPresentationIntent) =>
    dispatchAstryxWorkspaceOperationIntent(onIntent, scope, action.control.id, intent);

  return (
    <VStack gap={2}>
      {action.control.progress ? (
        <AstryxOperationButtonWithProgress
          button={action.control.trigger}
          onIntent={dispatch}
          progress={action.control.progress}
        />
      ) : (
        <AstryxOperationButton button={action.control.trigger} onIntent={dispatch} />
      )}
      {action.control.confirmation ? (
        <AstryxOperationDestructiveConfirmation
          confirmation={action.control.confirmation}
          onIntent={dispatch}
        />
      ) : null}
      {action.control.status.status === "idle" ? null : (
        <AstryxOperationCompactStatus status={action.control.status} />
      )}
      <AstryxOperationFeedback feedback={action.control.feedback} />
    </VStack>
  );
}

const AstryxSubscribedWorkspaceMainResult = memo(function AstryxSubscribedWorkspaceMainResult({
  reference,
  scope,
}: {
  reference: FormlessUiMainResultReference;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  if (reference.kind === "treeResultReference") {
    return <AstryxSubscribedTreeResultRenderer reference={reference} scope={scope} />;
  }

  return <AstryxSubscribedWorkspaceNonTreeMainResult reference={reference} scope={scope} />;
}, subscribedMainResultPropsEqual);

function AstryxSubscribedWorkspaceNonTreeMainResult({
  reference,
  scope,
}: {
  reference: Exclude<FormlessUiMainResultReference, { kind: "treeResultReference" }>;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  const onIntent = useFormlessUiWorkspaceIntentHandler();
  const result = useFormlessUiResult(reference);

  return result ? (
    <AstryxWorkspaceResult onIntent={onIntent} result={result} scope={scope} />
  ) : null;
}

const AstryxSubscribedWorkspaceContextResult = memo(
  function AstryxSubscribedWorkspaceContextResult({
    contextId,
    reference,
    scope,
  }: {
    contextId?: string;
    reference: FormlessUiContextResultReference;
    scope: FormlessUiWorkspaceIntentScope;
  }) {
    const onIntent = useFormlessUiWorkspaceIntentHandler();
    const result = useFormlessUiResult(reference);

    return result ? (
      <AstryxWorkspaceRecordResult
        contextId={contextId}
        onIntent={onIntent}
        recordResult={result}
        scope={scope}
      />
    ) : null;
  },
  subscribedContextResultPropsEqual,
);

function subscribedMainResultPropsEqual(
  previous: {
    reference: FormlessUiMainResultReference;
    scope: FormlessUiWorkspaceIntentScope;
  },
  next: {
    reference: FormlessUiMainResultReference;
    scope: FormlessUiWorkspaceIntentScope;
  },
) {
  return (
    formlessUiContractReferenceKey(previous.reference) ===
      formlessUiContractReferenceKey(next.reference) &&
    workspaceScopesEqual(previous.scope, next.scope)
  );
}

function subscribedContextResultPropsEqual(
  previous: {
    contextId?: string;
    reference: FormlessUiContextResultReference;
    scope: FormlessUiWorkspaceIntentScope;
  },
  next: {
    contextId?: string;
    reference: FormlessUiContextResultReference;
    scope: FormlessUiWorkspaceIntentScope;
  },
) {
  return (
    previous.contextId === next.contextId &&
    formlessUiContractReferenceKey(previous.reference) ===
      formlessUiContractReferenceKey(next.reference) &&
    workspaceScopesEqual(previous.scope, next.scope)
  );
}

function workspaceScopesEqual(
  previous: FormlessUiWorkspaceIntentScope,
  next: FormlessUiWorkspaceIntentScope,
) {
  return (
    previous.collectionId === next.collectionId &&
    previous.screenId === next.screenId &&
    previous.sectionId === next.sectionId
  );
}

function AstryxWorkspaceResult({
  onIntent,
  result,
  scope,
}: {
  onIntent: FormlessUiWorkspaceIntentHandler;
  result: FormlessUiWorkspaceResultContract;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  if (result.kind === "list") {
    return (
      <AstryxListRenderer
        list={result}
        onFieldIntent={(itemId, field, intent) =>
          dispatchAstryxWorkspaceFieldIntent(onIntent, scope, field.fieldId, intent, {
            recordId: field.recordId ?? itemId,
            resultId: result.id,
          })
        }
        onListIntent={(intent) =>
          dispatchAstryxWorkspaceListIntent(onIntent, scope, result.id, intent)
        }
        onOperationIntent={(action, intent) =>
          dispatchAstryxWorkspaceOperationIntent(onIntent, scope, action.control.id, intent, {
            recordId: workspaceListActionRecordId(result, action),
            resultId: result.id,
          })
        }
      />
    );
  }

  if (result.kind === "table") {
    return (
      <AstryxTableRenderer
        onFieldIntent={(contextId, fieldId, recordId, intent) =>
          dispatchAstryxWorkspaceFieldIntent(onIntent, scope, fieldId, intent, {
            contextId,
            ...(recordId === undefined ? {} : { recordId }),
            resultId: result.id,
          })
        }
        onOperationIntent={(action, intent) =>
          dispatchAstryxWorkspaceOperationIntent(onIntent, scope, action.control.id, intent, {
            recordId: workspaceTableActionRecordId(result, action),
            resultId: result.id,
          })
        }
        onTableIntent={(intent) =>
          dispatchAstryxWorkspaceTableIntent(onIntent, scope, result.id, intent)
        }
        table={result}
      />
    );
  }

  if (result.kind === "recordResult") {
    return <AstryxWorkspaceRecordResult onIntent={onIntent} recordResult={result} scope={scope} />;
  }

  return (
    <AstryxTreeResultRenderer
      onIntent={(intent) => dispatchAstryxWorkspaceTreeIntent(onIntent, scope, result.id, intent)}
      tree={result}
    />
  );
}

function AstryxWorkspaceRecordResult({
  contextId,
  onIntent,
  recordResult,
  scope,
}: {
  contextId?: string;
  onIntent: FormlessUiWorkspaceIntentHandler;
  recordResult: Extract<FormlessUiWorkspaceResultContract, { kind: "recordResult" }>;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  return (
    <AstryxRecordResultRenderer
      onIntent={(intent) =>
        dispatchAstryxWorkspaceRecordResultIntent(
          onIntent,
          scope,
          recordResult.id,
          intent,
          contextId,
        )
      }
      recordResult={recordResult}
    />
  );
}

export function dispatchAstryxWorkspaceQuerySelection(
  handler: FormlessUiWorkspaceIntentHandler,
  item: FormlessUiWorkspaceQueryContract,
) {
  return item.availability.available ? handler(item.selectionIntent) : undefined;
}

export function dispatchAstryxWorkspaceContextSelection(
  handler: FormlessUiWorkspaceIntentHandler,
  option: FormlessUiWorkspaceContextOptionContract,
) {
  return option.availability.available ? handler(option.selectionIntent) : undefined;
}

export function dispatchAstryxWorkspaceCreateIntent(
  handler: FormlessUiWorkspaceIntentHandler,
  scope: FormlessUiWorkspaceIntentScope,
  surfaceId: string,
  intent: FormlessUiCreateIntent,
  contextId?: string,
) {
  return handler({
    ...scope,
    ...(contextId === undefined ? {} : { contextId }),
    intent,
    surfaceId,
    type: "workspaceCreate",
  });
}

export function dispatchAstryxWorkspaceFieldIntent(
  handler: FormlessUiWorkspaceIntentHandler,
  scope: FormlessUiWorkspaceIntentScope,
  fieldId: string,
  intent: FormlessUiFieldIntent,
  identities: {
    contextId?: string;
    recordId?: string;
    resultId?: string;
    surfaceId?: string;
  } = {},
) {
  return handler({
    ...scope,
    ...identities,
    fieldId,
    intent,
    type: "workspaceField",
  });
}

export function dispatchAstryxWorkspaceOperationIntent(
  handler: FormlessUiWorkspaceIntentHandler,
  scope: FormlessUiWorkspaceIntentScope,
  controlId: string,
  intent: FormlessUiOperationPresentationIntent,
  identities: { contextId?: string; recordId?: string; resultId?: string } = {},
) {
  return handler({
    ...scope,
    ...identities,
    controlId,
    intent,
    type: "workspaceOperation",
  });
}

export function dispatchAstryxWorkspaceListIntent(
  handler: FormlessUiWorkspaceIntentHandler,
  scope: FormlessUiWorkspaceIntentScope,
  resultId: string,
  intent: FormlessUiListIntent,
) {
  return handler({ ...scope, intent, resultId, type: "workspaceList" });
}

export function dispatchAstryxWorkspaceTableIntent(
  handler: FormlessUiWorkspaceIntentHandler,
  scope: FormlessUiWorkspaceIntentScope,
  resultId: string,
  intent: FormlessUiTableIntent,
) {
  return handler({ ...scope, intent, resultId, type: "workspaceTable" });
}

export function dispatchAstryxWorkspaceRecordResultIntent(
  handler: FormlessUiWorkspaceIntentHandler,
  scope: FormlessUiWorkspaceIntentScope,
  resultId: string,
  intent: FormlessUiRecordResultIntent,
  contextId?: string,
) {
  return handler({
    ...scope,
    ...(contextId === undefined ? {} : { contextId }),
    intent,
    resultId,
    type: "workspaceRecordResult",
  });
}

function astryxWorkspaceContextSelectorOption(
  option: FormlessUiWorkspaceContextOptionContract,
): SelectorOptionData {
  return {
    disabled: !option.availability.available,
    label: option.label,
    value: option.id,
  };
}

function workspaceCollectionActionId(action: FormlessUiWorkspaceCollectionActionContract) {
  return action.kind === "createAction" ? action.surface.id : action.control.id;
}

function workspaceListActionRecordId(
  list: Extract<FormlessUiWorkspaceResultContract, { kind: "list" }>,
  action: FormlessUiListOperationActionContract,
) {
  return list.items.find((item) =>
    [...item.actions.primary, ...item.actions.secondary].includes(action),
  )?.id;
}

function workspaceTableActionRecordId(
  table: Extract<FormlessUiWorkspaceResultContract, { kind: "table" }>,
  action: FormlessUiTableOperationActionContract,
) {
  return table.rows.find((row) =>
    row.cells.some((cell) =>
      cell.contents.some(
        (content) =>
          content.kind === "actionGroup" &&
          [...content.primary, ...content.secondary].includes(action),
      ),
    ),
  )?.id;
}

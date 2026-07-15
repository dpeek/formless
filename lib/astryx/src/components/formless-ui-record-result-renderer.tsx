import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { VStack } from "@astryxdesign/core/VStack";
import type { DropdownMenuOption } from "@astryxdesign/core/DropdownMenu";
import type {
  FormlessUiFieldIntent,
  FormlessUiOperationPresentationIntent,
  FormlessUiRecordResultActionContract,
  FormlessUiRecordResultContract,
  FormlessUiRecordResultFieldContract,
  FormlessUiRecordResultIntentHandler,
} from "../formless-ui-contract.ts";
import { FormlessUiFieldRenderer } from "./fields/renderer.tsx";
import {
  AstryxOperationButton,
  AstryxOperationButtonWithProgress,
  AstryxOperationCompactStatus,
  AstryxOperationDestructiveConfirmation,
  AstryxOperationFeedback,
  operationIcon,
} from "./operation-controls.tsx";

export function AstryxRecordResultRenderer({
  onIntent,
  recordResult,
}: {
  onIntent: FormlessUiRecordResultIntentHandler;
  recordResult: FormlessUiRecordResultContract;
}) {
  const spacing = astryxRecordResultSpacing(recordResult.density);

  return (
    <VStack
      as="section"
      aria-label={recordResult.accessibilityLabel}
      data-formless-record-result={recordResult.id}
      data-formless-record-result-density={recordResult.density}
      gap={spacing.gap}
      width="100%"
    >
      {recordResult.editing.enabled ? null : (
        <Banner container="card" status="info" title={recordResult.editing.disabledReason} />
      )}
      <AstryxRecordResultContent
        onIntent={onIntent}
        recordResult={recordResult}
        spacing={spacing}
      />
    </VStack>
  );
}

function AstryxRecordResultContent({
  onIntent,
  recordResult,
  spacing,
}: {
  onIntent: FormlessUiRecordResultIntentHandler;
  recordResult: FormlessUiRecordResultContract;
  spacing: ReturnType<typeof astryxRecordResultSpacing>;
}) {
  if (recordResult.availability.state === "empty") {
    return recordResult.emptyState ? (
      <>
        <EmptyState
          actions={
            recordResult.emptyState.action ? (
              <AstryxRecordResultActionButton
                action={recordResult.emptyState.action}
                onIntent={onIntent}
                recordId={recordResult.selectedRecord?.id}
                recordResult={recordResult}
              />
            ) : undefined
          }
          description={recordResult.emptyState.description}
          isCompact={recordResult.density === "compact"}
          title={recordResult.emptyState.title}
        />
        {recordResult.emptyState.action ? (
          <AstryxRecordResultActionEffects
            action={recordResult.emptyState.action}
            onIntent={onIntent}
            recordId={recordResult.selectedRecord?.id}
            recordResult={recordResult}
          />
        ) : null}
      </>
    ) : null;
  }

  if (recordResult.availability.state === "unavailable") {
    return (
      <EmptyState
        isCompact={recordResult.density === "compact"}
        title={recordResult.availability.message}
      />
    );
  }

  const selectedRecord = recordResult.selectedRecord;

  if (!selectedRecord) {
    return (
      <EmptyState
        isCompact={recordResult.density === "compact"}
        title={recordResult.accessibilityLabel}
      />
    );
  }

  return (
    <Card padding={spacing.padding} width="100%">
      <VStack
        as="article"
        aria-label={selectedRecord.accessibilityLabel}
        gap={spacing.gap}
        width="100%"
      >
        <VStack gap={spacing.fieldGap} width="100%">
          {recordResult.fields.map((field) => (
            <FormlessUiFieldRenderer
              field={field.field}
              key={field.id}
              onIntent={(intent) =>
                dispatchAstryxRecordResultFieldIntent(
                  onIntent,
                  recordResult,
                  selectedRecord.id,
                  field,
                  intent,
                )
              }
            />
          ))}
        </VStack>
        <AstryxRecordResultActionGroup
          onIntent={onIntent}
          recordId={selectedRecord.id}
          recordResult={recordResult}
        />
        {recordResult.warnings.map((warning) => {
          const description = warning.items.map((item) => item.message).join(" ");

          return (
            <Banner
              container="card"
              description={description || undefined}
              key={warning.id}
              status="warning"
              title={warning.title}
            />
          );
        })}
      </VStack>
    </Card>
  );
}

function AstryxRecordResultActionGroup({
  onIntent,
  recordId,
  recordResult,
}: {
  onIntent: FormlessUiRecordResultIntentHandler;
  recordId: string;
  recordResult: FormlessUiRecordResultContract;
}) {
  const actions = [...recordResult.actions.primary, ...recordResult.actions.secondary];
  const secondaryItems = astryxRecordResultSecondaryItems(recordResult, recordId, onIntent);

  if (actions.length === 0) {
    return null;
  }

  return (
    <>
      <HStack align="center" gap={1} justify="end" width="100%" wrap="wrap">
        {recordResult.actions.primary.map((action) => (
          <AstryxRecordResultActionButton
            action={action}
            key={action.control.id}
            onIntent={onIntent}
            recordId={recordId}
            recordResult={recordResult}
          />
        ))}
        {secondaryItems.length > 0 ? (
          <MoreMenu
            items={secondaryItems}
            label={recordResult.actions.secondaryAccessibilityLabel}
            size={recordResult.density === "compact" ? "sm" : "md"}
            variant="ghost"
          />
        ) : null}
      </HStack>
      {actions.map((action) => (
        <AstryxRecordResultActionEffects
          action={action}
          key={`${action.control.id}:effects`}
          onIntent={onIntent}
          recordId={recordId}
          recordResult={recordResult}
        />
      ))}
    </>
  );
}

function AstryxRecordResultActionButton({
  action,
  onIntent,
  recordId,
  recordResult,
}: {
  action: FormlessUiRecordResultActionContract;
  onIntent: FormlessUiRecordResultIntentHandler;
  recordId: string | undefined;
  recordResult: FormlessUiRecordResultContract;
}) {
  const handleIntent = (intent: FormlessUiOperationPresentationIntent) =>
    recordId
      ? dispatchAstryxRecordResultOperationIntent(onIntent, recordResult, recordId, action, intent)
      : undefined;

  return action.control.progress ? (
    <AstryxOperationButtonWithProgress
      button={action.control.trigger}
      onIntent={handleIntent}
      progress={action.control.progress}
    />
  ) : (
    <AstryxOperationButton button={action.control.trigger} onIntent={handleIntent} />
  );
}

function AstryxRecordResultActionEffects({
  action,
  onIntent,
  recordId,
  recordResult,
}: {
  action: FormlessUiRecordResultActionContract;
  onIntent: FormlessUiRecordResultIntentHandler;
  recordId: string | undefined;
  recordResult: FormlessUiRecordResultContract;
}) {
  const handleIntent = (intent: FormlessUiOperationPresentationIntent) =>
    recordId
      ? dispatchAstryxRecordResultOperationIntent(onIntent, recordResult, recordId, action, intent)
      : undefined;

  return (
    <>
      {action.control.confirmation ? (
        <AstryxOperationDestructiveConfirmation
          confirmation={action.control.confirmation}
          onIntent={handleIntent}
        />
      ) : null}
      {action.control.status.status === "idle" ? null : (
        <AstryxOperationCompactStatus status={action.control.status} />
      )}
      <AstryxOperationFeedback feedback={action.control.feedback} />
    </>
  );
}

export function astryxRecordResultSpacing(density: FormlessUiRecordResultContract["density"]) {
  return density === "compact"
    ? ({ fieldGap: 2, gap: 2, padding: 3 } as const)
    : ({ fieldGap: 4, gap: 4, padding: 4 } as const);
}

export function astryxRecordResultSecondaryItems(
  recordResult: FormlessUiRecordResultContract,
  recordId: string,
  onIntent: FormlessUiRecordResultIntentHandler,
): DropdownMenuOption[] {
  return recordResult.actions.secondary.map((action) => {
    const trigger = action.control.trigger;

    return {
      icon: trigger.content.kind === "label" ? undefined : operationIcon(trigger.content.icon),
      isDisabled: astryxRecordResultActionDisabled(action),
      label: astryxRecordResultActionLabel(action),
      onClick: () => {
        if (astryxRecordResultActionDisabled(action)) {
          return;
        }

        void dispatchAstryxRecordResultOperationIntent(
          onIntent,
          recordResult,
          recordId,
          action,
          trigger.intent,
        );
      },
    };
  });
}

export function dispatchAstryxRecordResultFieldIntent(
  handler: FormlessUiRecordResultIntentHandler,
  recordResult: FormlessUiRecordResultContract,
  recordId: string,
  field: FormlessUiRecordResultFieldContract,
  intent: FormlessUiFieldIntent,
) {
  return handler({
    fieldId: field.id,
    intent,
    recordId,
    resultId: recordResult.id,
    type: "recordResultFieldIntent",
  });
}

export function dispatchAstryxRecordResultOperationIntent(
  handler: FormlessUiRecordResultIntentHandler,
  recordResult: FormlessUiRecordResultContract,
  recordId: string,
  action: FormlessUiRecordResultActionContract,
  intent: FormlessUiOperationPresentationIntent,
) {
  return handler({
    controlId: action.control.id,
    intent,
    recordId,
    resultId: recordResult.id,
    type: "recordResultOperationIntent",
  });
}

function astryxRecordResultActionLabel(action: FormlessUiRecordResultActionContract) {
  const trigger = action.control.trigger;
  const label =
    trigger.pending?.label ??
    (trigger.content.kind === "iconOnly" ? trigger.accessibilityLabel : trigger.content.label);

  return trigger.disabledReason && trigger.disabledReason !== label
    ? `${label} — ${trigger.disabledReason}`
    : label;
}

function astryxRecordResultActionDisabled(action: FormlessUiRecordResultActionContract) {
  return Boolean(action.control.trigger.disabled || action.control.trigger.pending?.isPending);
}

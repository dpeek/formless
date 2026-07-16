import { Button, type ButtonVariant } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { HStack } from "@astryxdesign/core/HStack";
import { Section } from "@astryxdesign/core/Section";
import { Heading } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { memo, type ReactNode, useMemo } from "react";
import type {
  FormlessUiActionTriggerContract,
  FormlessUiWorkspaceContract,
  FormlessUiWorkspaceExternalActionContract,
  FormlessUiWorkspaceIntentHandler,
  FormlessUiWorkspaceManifestContract,
  FormlessUiWorkspaceManifestReference,
  FormlessUiWorkspaceIntentScope,
  FormlessUiWorkspaceSectionContract,
  FormlessUiWorkspaceSectionShellContract,
  FormlessUiWorkspaceSectionShellReference,
} from "../formless-ui-contract.ts";
import {
  useFormlessUiWorkspaceIntentHandler,
  useFormlessUiWorkspaceManifest,
  useFormlessUiWorkspaceSectionShell,
} from "../formless-ui-contract-host-react.tsx";
import { operationIcon } from "./operation-controls.tsx";
import {
  AstryxSubscribedWorkspaceCollectionRenderer,
  AstryxWorkspaceCollectionRenderer,
} from "./formless-ui-workspace-collection-renderer.tsx";

export function AstryxWorkspaceScreenRenderer({
  onIntent,
  workspace,
}: {
  onIntent: FormlessUiWorkspaceIntentHandler;
  workspace: FormlessUiWorkspaceContract;
}) {
  if (workspace.sections.length === 0) {
    return null;
  }

  return (
    <AstryxWorkspaceFrame workspace={workspace}>
      {workspace.sections.map((section) => (
        <AstryxWorkspaceSection
          key={section.id}
          onIntent={onIntent}
          screenId={workspace.id}
          section={section}
        />
      ))}
    </AstryxWorkspaceFrame>
  );
}

export const AstryxSubscribedWorkspaceScreenRenderer = memo(
  function AstryxSubscribedWorkspaceScreenRenderer({
    reference,
  }: {
    reference: FormlessUiWorkspaceManifestReference;
  }) {
    const workspace = useFormlessUiWorkspaceManifest(reference);

    if (!workspace || workspace.sections.length === 0) {
      return null;
    }

    return (
      <AstryxWorkspaceFrame workspace={workspace}>
        {workspace.sections.map((sectionReference) => (
          <AstryxSubscribedWorkspaceSection
            key={`${sectionReference.workspaceId}:${sectionReference.sectionId}`}
            reference={sectionReference}
          />
        ))}
      </AstryxWorkspaceFrame>
    );
  },
  (previous, next) => previous.reference.workspaceId === next.reference.workspaceId,
);

function AstryxWorkspaceFrame({
  children,
  workspace,
}: {
  children: ReactNode;
  workspace: FormlessUiWorkspaceContract | FormlessUiWorkspaceManifestContract;
}) {
  return (
    <VStack
      aria-label={workspace.accessibilityLabel}
      data-formless-astryx-workspace={workspace.id}
      gap={workspace.sections.length === 1 ? 4 : 8}
      role="region"
      width="100%"
    >
      {children}
    </VStack>
  );
}

function AstryxWorkspaceSection({
  onIntent,
  screenId,
  section,
}: {
  onIntent: FormlessUiWorkspaceIntentHandler;
  screenId: string;
  section: FormlessUiWorkspaceSectionContract;
}) {
  const scope = {
    collectionId: section.collection.id,
    screenId,
    sectionId: section.id,
  };

  return (
    <AstryxWorkspaceSectionFrame onIntent={onIntent} scope={scope} section={section}>
      <AstryxWorkspaceCollectionRenderer
        collection={section.collection}
        onIntent={onIntent}
        scope={scope}
      />
    </AstryxWorkspaceSectionFrame>
  );
}

const AstryxSubscribedWorkspaceSection = memo(
  function AstryxSubscribedWorkspaceSection({
    reference,
  }: {
    reference: FormlessUiWorkspaceSectionShellReference;
  }) {
    const onIntent = useFormlessUiWorkspaceIntentHandler();
    const section = useFormlessUiWorkspaceSectionShell(reference);
    const scope = useMemo(
      () =>
        section
          ? {
              collectionId: section.collection.id,
              screenId: reference.workspaceId,
              sectionId: reference.sectionId,
            }
          : undefined,
      [reference.sectionId, reference.workspaceId, section?.collection.id],
    );

    if (!section || !scope) {
      return null;
    }

    return (
      <AstryxWorkspaceSectionFrame onIntent={onIntent} scope={scope} section={section}>
        <AstryxSubscribedWorkspaceCollectionRenderer
          collection={section.collection}
          scope={scope}
        />
      </AstryxWorkspaceSectionFrame>
    );
  },
  (previous, next) =>
    previous.reference.workspaceId === next.reference.workspaceId &&
    previous.reference.sectionId === next.reference.sectionId,
);

function AstryxWorkspaceSectionFrame({
  children,
  onIntent,
  scope,
  section,
}: {
  children: ReactNode;
  onIntent: FormlessUiWorkspaceIntentHandler;
  scope: FormlessUiWorkspaceIntentScope;
  section: FormlessUiWorkspaceSectionContract | FormlessUiWorkspaceSectionShellContract;
}) {
  const renderHeader = section.headingVisibility === "visible" || section.actions.length > 0;

  return (
    <Section
      aria-label={section.accessibilityLabel}
      data-formless-astryx-workspace-section={section.id}
      padding={0}
      role="region"
      variant="transparent"
      width="100%"
    >
      <VStack gap={renderHeader ? 4 : 0} width="100%">
        {renderHeader ? (
          <HStack align="center" gap={3} justify="between" width="100%" wrap="wrap">
            {section.headingVisibility === "visible" ? (
              <Heading level={2}>{section.label}</Heading>
            ) : (
              <span aria-hidden="true" />
            )}
            {section.actions.length > 0 ? (
              <HStack gap={2} wrap="wrap">
                {section.actions.map((externalAction) => (
                  <AstryxWorkspaceExternalAction
                    externalAction={externalAction}
                    key={externalAction.id}
                    onIntent={onIntent}
                    scope={scope}
                  />
                ))}
              </HStack>
            ) : null}
          </HStack>
        ) : null}
        {children}
      </VStack>
    </Section>
  );
}

function AstryxWorkspaceExternalAction({
  externalAction,
  onIntent,
  scope,
}: {
  externalAction: FormlessUiWorkspaceExternalActionContract;
  onIntent: FormlessUiWorkspaceIntentHandler;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  const action = externalAction.action;
  const isPending = Boolean(action.pending?.isPending);
  const isDisabled = Boolean(action.disabled || isPending);

  return (
    <VStack gap={1}>
      <Button
        aria-pressed={action.selected || undefined}
        data-formless-astryx-workspace-external-action={externalAction.id}
        icon={action.icon ? operationIcon(action.icon) : undefined}
        isDisabled={isDisabled}
        isLoading={isPending}
        label={action.accessibilityLabel ?? action.label}
        onClick={() => {
          if (!isDisabled) {
            void dispatchAstryxWorkspaceExternalAction(onIntent, scope, externalAction);
          }
        }}
        size="sm"
        tooltip={action.disabledReason}
        variant={astryxWorkspaceActionVariant(action)}
      >
        {action.label}
      </Button>
      {action.errors?.length ? (
        <Banner container="card" status="error" title={action.errors.join(" ")} />
      ) : null}
    </VStack>
  );
}

export function dispatchAstryxWorkspaceExternalAction(
  handler: FormlessUiWorkspaceIntentHandler,
  scope: FormlessUiWorkspaceIntentScope,
  externalAction: FormlessUiWorkspaceExternalActionContract,
) {
  return handler({
    ...scope,
    actionId: externalAction.id,
    controlId: externalAction.action.id,
    intent: externalAction.action.invoke,
    type: "workspaceExternalAction",
  });
}

function astryxWorkspaceActionVariant(action: FormlessUiActionTriggerContract): ButtonVariant {
  switch (action.intent) {
    case "danger":
      return "destructive";
    case "primary":
    case "success":
      return "primary";
    case "neutral":
    case "warning":
    case undefined:
      return "secondary";
  }
}

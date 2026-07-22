import * as stylex from "@stylexjs/stylex";
import { Banner, type BannerStatus } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { FieldStatus } from "@astryxdesign/core/FieldStatus";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Section } from "@astryxdesign/core/Section";
import { Selector } from "@astryxdesign/core/Selector";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { memo, type FormEvent, type ReactNode } from "react";
import type {
  ButtonContract,
  CreateFieldContract,
  FieldIntent,
  ManagementFeedbackContract,
  ManagementInstallDialogContract,
  ManagementIntentHandler,
  ManagementManifestContract,
  ManagementManifestReference,
  ManagementReadyContract,
  ManagementWorkspaceOperationContract,
  OperationPresentationIntent,
  WorkspaceContract,
  WorkspaceIntentHandler,
} from "@dpeek/formless-presentation/contract";
import {
  useManagementInstallDialog,
  useManagementIntentHandler,
  useManagementManifest,
} from "@dpeek/formless-presentation/host/react";
import { fieldChromeProps } from "./fields/field-chrome.tsx";
import { FieldRenderer } from "./fields/field-renderer.tsx";
import {
  AstryxOperationButton,
  AstryxOperationButtonWithProgress,
  AstryxOperationFeedback,
  operationButtonVariant,
  operationIcon,
} from "./operation-renderer.tsx";
import {
  AstryxSubscribedWorkspaceScreenRenderer,
  AstryxWorkspaceScreenRenderer,
} from "./workspace-screen-renderer.tsx";

export function AstryxManagementRenderer({
  dialog,
  manifest,
  onIntent,
  onWorkspaceIntent,
  workspaces = [],
}: {
  dialog?: ManagementInstallDialogContract | undefined;
  manifest: ManagementManifestContract;
  onIntent: ManagementIntentHandler;
  onWorkspaceIntent: WorkspaceIntentHandler;
  workspaces?: readonly WorkspaceContract[] | undefined;
}) {
  if (manifest.state !== "ready") {
    return <AstryxManagementFrame manifest={manifest} onIntent={onIntent} />;
  }

  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));

  return (
    <AstryxManagementFrame
      dialog={
        dialog ? <AstryxManagementInstallDialog dialog={dialog} onIntent={onIntent} /> : undefined
      }
      manifest={manifest}
      onIntent={onIntent}
      workspaces={manifest.workspaces.flatMap(({ reference, role }) => {
        const workspace = workspaceById.get(reference.workspaceId);
        return workspace
          ? [
              <AstryxManagementWorkspace key={role} role={role}>
                <AstryxWorkspaceScreenRenderer onIntent={onWorkspaceIntent} workspace={workspace} />
              </AstryxManagementWorkspace>,
            ]
          : [];
      })}
    />
  );
}

export const AstryxSubscribedManagementRenderer = memo(
  function AstryxSubscribedManagementRenderer({
    managementReference,
  }: {
    managementReference: ManagementManifestReference;
  }) {
    const manifest = useManagementManifest(managementReference);
    const onIntent = useManagementIntentHandler();

    if (!manifest) {
      return null;
    }

    if (manifest.state !== "ready") {
      return <AstryxManagementFrame manifest={manifest} onIntent={onIntent} />;
    }

    return (
      <AstryxManagementFrame
        dialog={<AstryxSubscribedManagementInstallDialog reference={manifest.installDialog} />}
        manifest={manifest}
        onIntent={onIntent}
        workspaces={manifest.workspaces.map(({ reference, role }) => (
          <AstryxManagementWorkspace key={role} role={role}>
            <AstryxSubscribedWorkspaceScreenRenderer reference={reference} />
          </AstryxManagementWorkspace>
        ))}
      />
    );
  },
  (previous, next) =>
    previous.managementReference.managementId === next.managementReference.managementId,
);

function AstryxManagementFrame({
  dialog,
  manifest,
  onIntent,
  workspaces,
}: {
  dialog?: ReactNode;
  manifest: ManagementManifestContract;
  onIntent: ManagementIntentHandler;
  workspaces?: ReactNode;
}) {
  const headingId = `${manifest.id}:heading`;

  return (
    <Section
      aria-labelledby={headingId}
      data-formless-astryx-management={manifest.id}
      data-formless-astryx-management-state={manifest.state}
      padding={0}
      variant="transparent"
      width="100%"
    >
      <VStack gap={6} width="100%">
        <Heading id={headingId} level={1}>
          {manifest.title}
        </Heading>
        {manifest.state === "loading" ? (
          <EmptyState
            description={manifest.message}
            headingLevel={2}
            icon={<Spinner aria-label={manifest.message} size="md" />}
            isCompact
            title="Loading instance settings"
          />
        ) : null}
        {manifest.state === "failed" ? (
          <AstryxManagementFeedback feedback={manifest.feedback} />
        ) : null}
        {manifest.state === "ready" ? (
          <>
            <AstryxManagementWorkspaceControls manifest={manifest} onIntent={onIntent} />
            <VStack gap={8} width="100%">
              {workspaces}
            </VStack>
            {dialog}
          </>
        ) : null}
      </VStack>
    </Section>
  );
}

function AstryxManagementWorkspace({
  children,
  role,
}: {
  children: ReactNode;
  role: "apps" | "routes";
}) {
  return (
    <Section
      aria-label={role === "apps" ? "Apps" : "Routes"}
      data-formless-astryx-management-workspace={role}
      padding={0}
      variant="transparent"
      width="100%"
    >
      {children}
    </Section>
  );
}

function AstryxManagementWorkspaceControls({
  manifest,
  onIntent,
}: {
  manifest: ManagementReadyContract;
  onIntent: ManagementIntentHandler;
}) {
  const operation = manifest.workspaceOperation;

  if (!operation && !manifest.workspaceFeedback) {
    return null;
  }

  return (
    <Card
      aria-label="Workspace Push"
      data-formless-astryx-management-workspace-operation={operation?.id}
      padding={4}
      role="region"
      width="100%"
    >
      <VStack gap={4} width="100%">
        <HStack align="center" gap={3} justify="between" width="100%" wrap="wrap">
          <Heading level={2}>Workspace Push</Heading>
          {operation ? (
            <AstryxManagementOperationButton
              manifest={manifest}
              onIntent={onIntent}
              operation={operation}
            />
          ) : null}
        </HStack>
        {manifest.workspaceFeedback ? (
          <AstryxManagementFeedback feedback={manifest.workspaceFeedback} />
        ) : null}
        {operation?.control.feedback ? (
          <AstryxOperationFeedback feedback={operation.control.feedback} />
        ) : null}
        {operation?.authorizationPrompt ? (
          <AstryxManagementAuthorizationPrompt onIntent={onIntent} operation={operation} />
        ) : null}
      </VStack>
    </Card>
  );
}

function AstryxManagementOperationButton({
  manifest,
  onIntent,
  operation,
}: {
  manifest: ManagementReadyContract;
  onIntent: ManagementIntentHandler;
  operation: ManagementWorkspaceOperationContract;
}) {
  const handleIntent = (intent: OperationPresentationIntent) =>
    dispatchAstryxManagementWorkspaceOperationIntent(onIntent, manifest, operation, intent);

  return operation.control.progress ? (
    <AstryxOperationButtonWithProgress
      button={operation.control.trigger}
      onIntent={handleIntent}
      progress={operation.control.progress}
    />
  ) : (
    <AstryxOperationButton button={operation.control.trigger} onIntent={handleIntent} />
  );
}

function AstryxManagementAuthorizationPrompt({
  onIntent,
  operation,
}: {
  onIntent: ManagementIntentHandler;
  operation: ManagementWorkspaceOperationContract;
}) {
  const prompt = operation.authorizationPrompt;

  if (!prompt) {
    return null;
  }

  return (
    <Card
      aria-label={prompt.title}
      data-formless-astryx-management-authorization={prompt.id}
      padding={3}
      variant="muted"
      width="100%"
    >
      <HStack align="center" gap={3} justify="between" width="100%" wrap="wrap">
        <VStack gap={0.5}>
          <Text display="block" type="label" weight="medium">
            {prompt.title}
          </Text>
          {prompt.detail ? (
            <Text color="secondary" display="block" type="supporting">
              {prompt.detail}
            </Text>
          ) : null}
        </VStack>
        <AstryxManagementButton button={prompt.action} onPress={() => onIntent(prompt.intent)} />
      </HStack>
    </Card>
  );
}

const AstryxSubscribedManagementInstallDialog = memo(
  function AstryxSubscribedManagementInstallDialog({
    reference,
  }: {
    reference: ManagementReadyContract["installDialog"];
  }) {
    const dialog = useManagementInstallDialog(reference);
    const onIntent = useManagementIntentHandler();

    return dialog ? <AstryxManagementInstallDialog dialog={dialog} onIntent={onIntent} /> : null;
  },
  (previous, next) =>
    previous.reference.managementId === next.reference.managementId &&
    previous.reference.dialogId === next.reference.dialogId,
);

export function AstryxManagementInstallDialog({
  dialog,
  onIntent,
}: {
  dialog: ManagementInstallDialogContract;
  onIntent: ManagementIntentHandler;
}) {
  const emitOpenChange = (open: boolean) => void onIntent({ ...dialog.closeIntent, open });

  return (
    <Dialog
      aria-label={dialog.title}
      isOpen={dialog.open}
      onOpenChange={emitOpenChange}
      purpose="form"
      width={560}
    >
      <AstryxManagementInstallDialogContent dialog={dialog} onIntent={onIntent} />
    </Dialog>
  );
}

export function AstryxManagementInstallDialogContent({
  dialog,
  onIntent,
}: {
  dialog: ManagementInstallDialogContract;
  onIntent: ManagementIntentHandler;
}) {
  const selectedOption = dialog.packageOptions.find(
    (option) => option.id === dialog.selectedPackageOptionId,
  );

  return (
    <form
      data-formless-astryx-management-install-dialog={dialog.id}
      id={`${dialog.id}:form`}
      noValidate
      onSubmit={(event) => submitAstryxManagementInstall(event, dialog, onIntent)}
    >
      <Layout
        height="auto"
        header={
          <DialogHeader
            onOpenChange={(open) => void onIntent({ ...dialog.closeIntent, open })}
            subtitle={dialog.description}
            title={dialog.title}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4} width="100%">
              <AstryxManagementPackageSelector dialog={dialog} onIntent={onIntent} />
              {selectedOption ? (
                <Text color="secondary" display="block" type="supporting">
                  {selectedOption.description}
                </Text>
              ) : null}
              <fieldset
                aria-label="Install details"
                disabled={dialog.pending?.isPending}
                {...stylex.props(styles.fieldSet)}
              >
                <FormLayout direction="vertical">
                  {[dialog.fields.label, dialog.fields.installId].map((field) => (
                    <FieldRenderer
                      field={field}
                      key={field.fieldId}
                      onIntent={(intent) =>
                        dispatchAstryxManagementInstallFieldIntent(onIntent, dialog, field, intent)
                      }
                    />
                  ))}
                </FormLayout>
              </fieldset>
              {dialog.errors.length > 0 ? (
                <VStack aria-live="assertive" gap={1} role="alert">
                  {dialog.errors.map((error) => (
                    <FieldStatus key={error} message={error} type="error" variant="detached" />
                  ))}
                </VStack>
              ) : null}
              {dialog.feedback ? <AstryxManagementFeedback feedback={dialog.feedback} /> : null}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} justify="end" width="100%" wrap="wrap">
              <AstryxManagementButton
                button={dialog.cancel}
                onPress={() => onIntent(dialog.closeIntent)}
              />
              <AstryxManagementButton button={dialog.submit} form={`${dialog.id}:form`} />
            </HStack>
          </LayoutFooter>
        }
      />
    </form>
  );
}

function AstryxManagementPackageSelector({
  dialog,
  onIntent,
}: {
  dialog: ManagementInstallDialogContract;
  onIntent: ManagementIntentHandler;
}) {
  const field = dialog.fields.package;
  const chrome = fieldChromeProps(field);
  const isPending = Boolean(dialog.pending?.isPending);

  return (
    <Selector
      {...chrome}
      data-formless-astryx-management-package-field={field.fieldId}
      disabledMessage={isPending ? dialog.pending?.label : chrome.description}
      isDisabled={isPending || chrome.isDisabled}
      onChange={(optionId) => {
        const option = dialog.packageOptions.find((candidate) => candidate.id === optionId);
        if (option) {
          void onIntent(option.selectionIntent);
        }
      }}
      options={dialog.packageOptions.map((option) => ({
        label: option.label,
        value: option.id,
      }))}
      size={field.density === "compact" ? "sm" : "md"}
      value={dialog.selectedPackageOptionId}
    />
  );
}

function AstryxManagementFeedback({ feedback }: { feedback: ManagementFeedbackContract }) {
  return (
    <Banner
      container="card"
      data-formless-astryx-management-feedback={feedback.id}
      description={feedback.detail}
      status={astryxManagementFeedbackStatus(feedback.intent)}
      title={feedback.title}
    />
  );
}

function AstryxManagementButton({
  button,
  form,
  onPress,
}: {
  button: ButtonContract;
  form?: string;
  onPress?: (() => Promise<void> | void) | undefined;
}) {
  const isLoading = Boolean(button.pending?.isPending);
  const content = button.content;
  const isIconOnly = content.kind === "iconOnly";
  const icon = content.kind === "label" ? undefined : operationIcon(content.icon);

  return (
    <Button
      data-formless-astryx-management-control={button.id}
      form={form}
      icon={icon}
      isDisabled={Boolean(button.disabled || isLoading)}
      isIconOnly={isIconOnly}
      isLoading={isLoading}
      label={button.accessibilityLabel}
      onClick={onPress ? () => void onPress() : undefined}
      size={button.density === "compact" ? "sm" : "md"}
      tooltip={button.disabledReason}
      type={button.type}
      variant={operationButtonVariant(button.prominence)}
    >
      {content.kind === "iconOnly" ? undefined : content.label}
    </Button>
  );
}

export function dispatchAstryxManagementInstallFieldIntent(
  onIntent: ManagementIntentHandler,
  dialog: ManagementInstallDialogContract,
  field: CreateFieldContract,
  intent: FieldIntent,
) {
  return onIntent({
    dialogId: dialog.id,
    fieldId: field.fieldId,
    intent,
    managementId: dialog.managementId,
    type: "managementInstallField",
  });
}

export function dispatchAstryxManagementWorkspaceOperationIntent(
  onIntent: ManagementIntentHandler,
  manifest: ManagementReadyContract,
  operation: ManagementWorkspaceOperationContract,
  intent: OperationPresentationIntent,
) {
  return onIntent({
    controlId: operation.control.id,
    intent,
    managementId: manifest.id,
    operationId: operation.id,
    type: "managementWorkspaceOperation",
  });
}

function submitAstryxManagementInstall(
  event: FormEvent<HTMLFormElement>,
  dialog: ManagementInstallDialogContract,
  onIntent: ManagementIntentHandler,
) {
  event.preventDefault();
  void onIntent(dialog.submitIntent);
}

function astryxManagementFeedbackStatus(
  intent: ManagementFeedbackContract["intent"],
): BannerStatus {
  switch (intent) {
    case "danger":
      return "error";
    case "warning":
      return "warning";
    case "success":
      return "success";
    case "info":
    case "neutral":
      return "info";
  }
}

const styles = stylex.create({
  fieldSet: {
    borderWidth: 0,
    margin: 0,
    minWidth: 0,
    padding: 0,
  },
});

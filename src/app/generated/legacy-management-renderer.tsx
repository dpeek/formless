import { Button } from "@dpeek/formless-ui/button";
import { Fieldset, fieldErrorStyles } from "@dpeek/formless-ui/field";
import { AddIcon, LoadingIcon } from "@dpeek/formless-ui/icons";
import {
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@dpeek/formless-ui/modal";
import { memo, type ReactNode } from "react";
import type {
  FormlessUiButtonContent,
  FormlessUiButtonContract,
  FormlessUiCreateField,
  FormlessUiFieldIntent,
  FormlessUiManagementFeedbackContract,
  FormlessUiManagementInstallDialogContract,
  FormlessUiManagementIntentHandler,
  FormlessUiManagementManifestContract,
  FormlessUiManagementManifestReference,
  FormlessUiManagementReadyContract,
  FormlessUiManagementWorkspaceOperationContract,
  FormlessUiOperationPresentationIntent,
  FormlessUiWorkspaceContract,
  FormlessUiWorkspaceIntentHandler,
} from "@dpeek/formless-astryx/contract";
import {
  useFormlessUiManagementInstallDialog,
  useFormlessUiManagementIntentHandler,
  useFormlessUiManagementManifest,
} from "@dpeek/formless-astryx/contract-host/react";
import { GeneratedCreateFieldControl } from "./create-field-control.tsx";
import {
  LegacyGeneratedOperationButton,
  LegacyGeneratedOperationCompactStatus,
  LegacyGeneratedOperationFeedback,
  LegacyGeneratedOperationProgress,
} from "./legacy-operation-controls.tsx";
import {
  LegacySubscribedWorkspaceScreenRenderer,
  LegacyWorkspaceScreenRenderer,
} from "./legacy-workspace-screen-renderer.tsx";

export function LegacyManagementRenderer({
  dialog,
  manifest,
  onIntent,
  onWorkspaceIntent,
  workspaces = [],
}: {
  dialog?: FormlessUiManagementInstallDialogContract | undefined;
  manifest: FormlessUiManagementManifestContract;
  onIntent: FormlessUiManagementIntentHandler;
  onWorkspaceIntent: FormlessUiWorkspaceIntentHandler;
  workspaces?: readonly FormlessUiWorkspaceContract[] | undefined;
}) {
  if (manifest.state !== "ready") {
    return <LegacyManagementFrame manifest={manifest} onIntent={onIntent} />;
  }

  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));

  return (
    <LegacyManagementFrame
      dialog={
        dialog ? <LegacyManagementInstallDialog dialog={dialog} onIntent={onIntent} /> : undefined
      }
      manifest={manifest}
      onIntent={onIntent}
      workspaces={manifest.workspaces.flatMap(({ reference, role }) => {
        const workspace = workspaceById.get(reference.workspaceId);
        return workspace
          ? [
              <LegacyManagementWorkspace key={role} role={role}>
                <LegacyWorkspaceScreenRenderer onIntent={onWorkspaceIntent} workspace={workspace} />
              </LegacyManagementWorkspace>,
            ]
          : [];
      })}
    />
  );
}

export const LegacySubscribedManagementRenderer = memo(
  function LegacySubscribedManagementRenderer({
    managementReference,
  }: {
    managementReference: FormlessUiManagementManifestReference;
  }) {
    const manifest = useFormlessUiManagementManifest(managementReference);
    const onIntent = useFormlessUiManagementIntentHandler();

    if (!manifest) {
      return null;
    }

    if (manifest.state !== "ready") {
      return <LegacyManagementFrame manifest={manifest} onIntent={onIntent} />;
    }

    return (
      <LegacyManagementFrame
        dialog={<LegacySubscribedManagementInstallDialog reference={manifest.installDialog} />}
        manifest={manifest}
        onIntent={onIntent}
        workspaces={manifest.workspaces.map(({ reference, role }) => (
          <LegacyManagementWorkspace key={role} role={role}>
            <LegacySubscribedWorkspaceScreenRenderer reference={reference} />
          </LegacyManagementWorkspace>
        ))}
      />
    );
  },
  (previous, next) =>
    previous.managementReference.managementId === next.managementReference.managementId,
);

function LegacyManagementFrame({
  dialog,
  manifest,
  onIntent,
  workspaces,
}: {
  dialog?: ReactNode;
  manifest: FormlessUiManagementManifestContract;
  onIntent: FormlessUiManagementIntentHandler;
  workspaces?: ReactNode;
}) {
  const headingId = `${manifest.id}:heading`;

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6"
      data-formless-management={manifest.id}
      data-formless-management-state={manifest.state}
    >
      <header>
        <h1 className="text-2xl font-semibold" id={headingId}>
          {manifest.title}
        </h1>
      </header>
      {manifest.state === "loading" ? (
        <p aria-live="polite" className="text-sm text-muted-fg">
          {manifest.message}
        </p>
      ) : null}
      {manifest.state === "failed" ? (
        <LegacyManagementFeedback feedback={manifest.feedback} />
      ) : null}
      {manifest.state === "ready" ? (
        <>
          <LegacyManagementWorkspaceControls manifest={manifest} onIntent={onIntent} />
          <div className="space-y-8">{workspaces}</div>
          {dialog}
        </>
      ) : null}
    </section>
  );
}

function LegacyManagementWorkspace({
  children,
  role,
}: {
  children: ReactNode;
  role: "apps" | "routes";
}) {
  return (
    <section
      aria-label={role === "apps" ? "Apps" : "Routes"}
      className="space-y-3"
      data-formless-management-workspace={role}
    >
      {children}
    </section>
  );
}

function LegacyManagementWorkspaceControls({
  manifest,
  onIntent,
}: {
  manifest: FormlessUiManagementReadyContract;
  onIntent: FormlessUiManagementIntentHandler;
}) {
  const operation = manifest.workspaceOperation;

  if (!operation && !manifest.workspaceFeedback) {
    return null;
  }

  return (
    <section
      aria-label="Workspace Push"
      className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-2"
      data-formless-management-workspace-operation={operation?.id}
    >
      <div className="min-w-0 space-y-2">
        {manifest.workspaceFeedback ? (
          <LegacyManagementFeedback feedback={manifest.workspaceFeedback} />
        ) : null}
        {operation && operation.control.status.status !== "idle" ? (
          <LegacyGeneratedOperationCompactStatus status={operation.control.status} />
        ) : null}
        {operation?.control.feedback ? (
          <LegacyGeneratedOperationFeedback feedback={operation.control.feedback} />
        ) : null}
        {operation?.control.progress ? (
          <LegacyGeneratedOperationProgress progress={operation.control.progress} />
        ) : null}
      </div>
      {operation ? (
        <div className="flex flex-wrap items-center gap-2">
          <LegacyGeneratedOperationButton
            button={operation.control.trigger}
            onIntent={(intent) =>
              dispatchLegacyManagementWorkspaceOperationIntent(
                onIntent,
                manifest,
                operation,
                intent,
              )
            }
          />
          {operation.authorizationPrompt ? (
            <div
              aria-label={operation.authorizationPrompt.title}
              className="flex flex-wrap items-center gap-2"
              data-formless-management-authorization={operation.authorizationPrompt.id}
            >
              <span className="text-xs text-muted-fg">
                {operation.authorizationPrompt.title}
                {operation.authorizationPrompt.detail
                  ? ` · ${operation.authorizationPrompt.detail}`
                  : ""}
              </span>
              <LegacyManagementButton
                button={operation.authorizationPrompt.action}
                onPress={() => void onIntent(operation.authorizationPrompt!.intent)}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const LegacySubscribedManagementInstallDialog = memo(
  function LegacySubscribedManagementInstallDialog({
    reference,
  }: {
    reference: FormlessUiManagementReadyContract["installDialog"];
  }) {
    const dialog = useFormlessUiManagementInstallDialog(reference);
    const onIntent = useFormlessUiManagementIntentHandler();

    return dialog ? <LegacyManagementInstallDialog dialog={dialog} onIntent={onIntent} /> : null;
  },
  (previous, next) =>
    previous.reference.managementId === next.reference.managementId &&
    previous.reference.dialogId === next.reference.dialogId,
);

export function LegacyManagementInstallDialog({
  dialog,
  onIntent,
}: {
  dialog: FormlessUiManagementInstallDialogContract;
  onIntent: FormlessUiManagementIntentHandler;
}) {
  if (!dialog.open) {
    return null;
  }

  return (
    <ModalContent
      isOpen={dialog.open}
      onOpenChange={(open) => void onIntent({ ...dialog.closeIntent, open })}
      size="lg"
    >
      <LegacyManagementInstallDialogContent dialog={dialog} onIntent={onIntent} />
    </ModalContent>
  );
}

export function LegacyManagementInstallDialogContent({
  dialog,
  onIntent,
}: {
  dialog: FormlessUiManagementInstallDialogContract;
  onIntent: FormlessUiManagementIntentHandler;
}) {
  const selectedOption = dialog.packageOptions.find(
    (option) => option.id === dialog.selectedPackageOptionId,
  );
  const fieldPanelId = `${dialog.id}:fields`;

  return (
    <form
      className="contents"
      data-formless-management-install-dialog={dialog.id}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void onIntent(dialog.submitIntent);
      }}
    >
      <ModalHeader>
        <ModalTitle>{dialog.title}</ModalTitle>
        <ModalDescription>{dialog.description}</ModalDescription>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-5">
          <div
            aria-label={dialog.fields.package.label}
            className="grid grid-cols-2 gap-1 rounded-md border border-border bg-muted p-1 sm:grid-cols-4"
            role="tablist"
          >
            {dialog.packageOptions.map((option) => (
              <button
                aria-controls={fieldPanelId}
                aria-label={option.label}
                aria-selected={option.selected}
                className={legacyManagementPackageOptionClass(option.selected)}
                disabled={dialog.pending?.isPending}
                key={option.id}
                onClick={() => void onIntent(option.selectionIntent)}
                role="tab"
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="space-y-4" id={fieldPanelId} role="tabpanel">
            {selectedOption ? (
              <header className="space-y-1">
                <h2 className="text-sm font-semibold">{selectedOption.label}</h2>
                <p className="text-xs text-muted-fg">{selectedOption.description}</p>
              </header>
            ) : null}
            <Fieldset className="space-y-4" disabled={dialog.pending?.isPending}>
              {[dialog.fields.label, dialog.fields.installId].map((field) => (
                <GeneratedCreateFieldControl
                  field={field}
                  key={field.fieldId}
                  onIntent={(intent) =>
                    dispatchLegacyManagementInstallFieldIntent(onIntent, dialog, field, intent)
                  }
                />
              ))}
            </Fieldset>
            {dialog.errors.length > 0 ? (
              <ul className="space-y-1" role="alert">
                {dialog.errors.map((error) => (
                  <li className={fieldErrorStyles()} data-slot="field-error" key={error}>
                    {error}
                  </li>
                ))}
              </ul>
            ) : null}
            {dialog.feedback ? <LegacyManagementFeedback feedback={dialog.feedback} /> : null}
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <LegacyManagementButton
          button={dialog.cancel}
          onPress={() => void onIntent(dialog.closeIntent)}
        />
        <LegacyManagementButton button={dialog.submit} />
      </ModalFooter>
    </form>
  );
}

function LegacyManagementFeedback({
  feedback,
}: {
  feedback: FormlessUiManagementFeedbackContract;
}) {
  return (
    <div
      className={`rounded border px-2.5 py-2 text-xs ${legacyManagementFeedbackClass(feedback.intent)}`}
      data-formless-management-feedback={feedback.id}
      role={feedback.intent === "danger" ? "alert" : "status"}
    >
      <p className="font-medium">{feedback.title}</p>
      {feedback.detail ? <p>{feedback.detail}</p> : null}
    </div>
  );
}

function LegacyManagementButton({
  button,
  onPress,
}: {
  button: FormlessUiButtonContract;
  onPress?: (() => Promise<void> | void) | undefined;
}) {
  return (
    <span title={button.disabledReason}>
      <Button
        aria-label={button.accessibilityLabel}
        data-formless-management-control={button.id}
        intent={legacyManagementButtonIntent(button)}
        isDisabled={button.disabled}
        onPress={onPress}
        size={button.density === "compact" ? "sm" : undefined}
        type={button.type}
      >
        <LegacyManagementButtonContent button={button} />
      </Button>
    </span>
  );
}

function LegacyManagementButtonContent({ button }: { button: FormlessUiButtonContract }) {
  if (button.pending?.isPending) {
    return (
      <>
        <LoadingIcon aria-hidden="true" className="animate-spin" />
        {button.content.kind === "iconOnly" ? null : button.pending.label}
      </>
    );
  }

  return <LegacyManagementContent content={button.content} />;
}

function LegacyManagementContent({ content }: { content: FormlessUiButtonContent }) {
  if (content.kind === "label") {
    return content.label;
  }

  return (
    <>
      {content.icon === "add" ? <AddIcon aria-hidden="true" /> : null}
      {content.kind === "iconAndLabel" ? content.label : null}
    </>
  );
}

export function dispatchLegacyManagementInstallFieldIntent(
  onIntent: FormlessUiManagementIntentHandler,
  dialog: FormlessUiManagementInstallDialogContract,
  field: FormlessUiCreateField,
  intent: FormlessUiFieldIntent,
) {
  return onIntent({
    dialogId: dialog.id,
    fieldId: field.fieldId,
    intent,
    managementId: dialog.managementId,
    type: "managementInstallField",
  });
}

export function dispatchLegacyManagementWorkspaceOperationIntent(
  onIntent: FormlessUiManagementIntentHandler,
  manifest: FormlessUiManagementReadyContract,
  operation: FormlessUiManagementWorkspaceOperationContract,
  intent: FormlessUiOperationPresentationIntent,
) {
  return onIntent({
    controlId: operation.control.id,
    intent,
    managementId: manifest.id,
    operationId: operation.id,
    type: "managementWorkspaceOperation",
  });
}

function legacyManagementButtonIntent(button: FormlessUiButtonContract) {
  return button.prominence === "primary"
    ? "primary"
    : button.prominence === "secondary"
      ? "outline"
      : "plain";
}

function legacyManagementFeedbackClass(intent: FormlessUiManagementFeedbackContract["intent"]) {
  switch (intent) {
    case "danger":
      return "border-red-300 bg-red-50 text-red-700";
    case "info":
    case "warning":
      return "border-amber-300 bg-amber-50 text-amber-800";
    case "success":
      return "border-emerald-300 bg-emerald-50 text-emerald-800";
    case "neutral":
      return "border-border bg-muted text-muted-fg";
  }
}

function legacyManagementPackageOptionClass(selected: boolean) {
  const base =
    "min-h-8 rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  return selected
    ? `${base} bg-overlay text-fg shadow-xs`
    : `${base} text-muted-fg hover:bg-overlay/70 hover:text-fg`;
}

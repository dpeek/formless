import { Badge } from "@dpeek/formless-ui/badge";
import { Button } from "@dpeek/formless-ui/button";
import {
  AddIcon,
  CalendarIcon,
  CloseIcon,
  ConfirmIcon,
  CopyIcon,
  DisclosureDownIcon,
  DisclosureIcon,
  DragHandleIcon,
  LoadingIcon,
  MenuIcon,
  NextIcon,
  PreviousIcon,
  PublishIcon,
  RemoveIcon,
  SelectDownIcon,
  SelectIcon,
  SortIcon,
  TreeDisclosureIcon,
} from "@dpeek/formless-ui/icons";
import {
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@dpeek/formless-ui/modal";
import { cn } from "@dpeek/formless-ui/primitive";
import type {
  FormlessUiButtonContent,
  FormlessUiCompactStatusContract,
  FormlessUiCompactStatusIntent,
  FormlessUiOperationButtonContract,
  FormlessUiOperationDestructiveConfirmationContract,
  FormlessUiOperationFeedbackEventContract,
  FormlessUiOperationPresentationIntentHandler,
  FormlessUiOperationProgressContract,
  FormlessUiOperationProgressStepStatus,
  FormlessUiSemanticIconId,
} from "@dpeek/formless-astryx/contract";

export function LegacyGeneratedOperationButton({
  button,
  onIntent,
}: {
  button: FormlessUiOperationButtonContract;
  onIntent: FormlessUiOperationPresentationIntentHandler;
}) {
  return (
    <span title={button.disabledReason}>
      <Button
        aria-label={button.accessibilityLabel}
        data-formless-generated-operation-control={button.id}
        intent={legacyOperationButtonIntent(button)}
        isDisabled={button.disabled}
        onPress={() => void onIntent(button.intent)}
        size={legacyOperationButtonSize(button)}
        type={button.type}
      >
        {button.countBadge ? (
          <span>
            <LegacyGeneratedOperationButtonContent button={button} />
          </span>
        ) : (
          <LegacyGeneratedOperationButtonContent button={button} />
        )}
        {button.countBadge ? (
          <Badge
            aria-label={button.countBadge.accessibilityLabel}
            className="ml-2 h-4 px-1.5"
            intent="outline"
          >
            {button.countBadge.count}
          </Badge>
        ) : null}
      </Button>
    </span>
  );
}

export function LegacyGeneratedOperationDestructiveConfirmation({
  confirmation,
  feedback,
  onIntent,
  progress,
}: {
  confirmation: FormlessUiOperationDestructiveConfirmationContract;
  feedback?: FormlessUiOperationFeedbackEventContract;
  onIntent: FormlessUiOperationPresentationIntentHandler;
  progress?: FormlessUiOperationProgressContract;
}) {
  return (
    <ModalContent
      closeButton={false}
      isOpen={confirmation.open}
      onOpenChange={(open) => {
        if (!open) {
          void onIntent(confirmation.closeIntent);
        }
      }}
      role="alertdialog"
    >
      <ModalHeader>
        <ModalTitle>{confirmation.title}</ModalTitle>
        <ModalDescription>{confirmation.description}</ModalDescription>
      </ModalHeader>
      {feedback || progress ? (
        <ModalBody className="space-y-3">
          {feedback ? <LegacyGeneratedOperationFeedback feedback={feedback} /> : null}
          {progress ? <LegacyGeneratedOperationProgress progress={progress} /> : null}
        </ModalBody>
      ) : null}
      <ModalFooter>
        <LegacyGeneratedOperationButton button={confirmation.cancel} onIntent={onIntent} />
        <LegacyGeneratedOperationButton button={confirmation.action} onIntent={onIntent} />
      </ModalFooter>
    </ModalContent>
  );
}

export function LegacyGeneratedOperationCompactStatus({
  className,
  status,
}: {
  className?: string;
  status: FormlessUiCompactStatusContract;
}) {
  return (
    <div
      aria-label={status.accessibilityLabel}
      className={cn(legacyCompactStatusClassName(status.intent), className)}
      data-formless-generated-operation-status={status.status}
      role={status.status === "failed" ? "alert" : "status"}
    >
      <LegacyGeneratedOperationStatusMarker status={status} />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{status.label}</span>
        <span className="block line-clamp-2 text-xs text-muted-fg">{status.detail}</span>
      </span>
    </div>
  );
}

export function LegacyGeneratedOperationProgress({
  className,
  progress,
}: {
  className?: string;
  progress: FormlessUiOperationProgressContract;
}) {
  if (progress.steps.length === 0) {
    return null;
  }

  return (
    <ol
      aria-label={progress.title}
      className={cn("grid gap-2 text-xs", className)}
      data-formless-generated-operation-progress-steps="true"
    >
      {progress.steps.map((step) => (
        <li
          className="grid gap-1 rounded border border-border px-3 py-2"
          data-formless-generated-operation-progress-step={step.id}
          data-formless-generated-operation-progress-step-status={step.status}
          key={step.id}
        >
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="min-w-0 truncate font-medium text-fg">{step.label}</span>
            <span className="shrink-0 text-muted-fg">
              {legacyOperationProgressStepStatusLabel(step.status)}
            </span>
          </div>
          {step.detail ? <p className="min-w-0 break-words text-muted-fg">{step.detail}</p> : null}
        </li>
      ))}
    </ol>
  );
}

export function LegacyGeneratedOperationFeedback({
  feedback,
}: {
  feedback: FormlessUiOperationFeedbackEventContract;
}) {
  return (
    <div
      className={cn("rounded border px-2.5 py-2 text-xs", legacyFeedbackClassName(feedback.intent))}
      data-formless-generated-operation-feedback={feedback.status}
      role={feedback.status === "failed" ? "alert" : "status"}
    >
      <p className="font-medium">{feedback.title}</p>
      {feedback.detail ? <p>{feedback.detail}</p> : null}
    </div>
  );
}

function LegacyGeneratedOperationButtonContent({
  button,
}: {
  button: FormlessUiOperationButtonContract;
}) {
  if (button.pending?.isPending) {
    return (
      <>
        <LoadingIcon aria-hidden="true" className="animate-spin" data-slot="loader" />
        {button.content.kind === "iconOnly" ? null : button.pending.label}
      </>
    );
  }

  return <LegacyGeneratedOperationContent content={button.content} />;
}

function LegacyGeneratedOperationContent({ content }: { content: FormlessUiButtonContent }) {
  if (content.kind === "label") {
    return content.label;
  }

  return (
    <>
      <LegacyGeneratedOperationIcon icon={content.icon} />
      {content.kind === "iconAndLabel" ? content.label : null}
    </>
  );
}

function LegacyGeneratedOperationIcon({ icon }: { icon: FormlessUiSemanticIconId }) {
  const Icon = legacyOperationIcon(icon);
  return Icon ? <Icon aria-hidden="true" /> : null;
}

function legacyOperationIcon(icon: FormlessUiSemanticIconId) {
  switch (icon) {
    case "add":
      return AddIcon;
    case "calendar":
      return CalendarIcon;
    case "close":
      return CloseIcon;
    case "confirm":
      return ConfirmIcon;
    case "copy":
      return CopyIcon;
    case "delete":
    case "remove":
      return RemoveIcon;
    case "disclosure":
      return DisclosureIcon;
    case "disclosureDown":
      return DisclosureDownIcon;
    case "dragHandle":
      return DragHandleIcon;
    case "loading":
    case "sync":
      return LoadingIcon;
    case "menu":
      return MenuIcon;
    case "next":
      return NextIcon;
    case "previous":
      return PreviousIcon;
    case "publish":
    case "upload":
      return PublishIcon;
    case "select":
      return SelectIcon;
    case "selectDown":
      return SelectDownIcon;
    case "sort":
      return SortIcon;
    case "treeDisclosure":
      return TreeDisclosureIcon;
    case "archive":
    case "edit":
    case "indeterminate":
      return undefined;
  }
}

function LegacyGeneratedOperationStatusMarker({
  status,
}: {
  status: FormlessUiCompactStatusContract;
}) {
  if (status.pending?.isPending) {
    return (
      <LoadingIcon
        aria-hidden="true"
        className="mt-0.5 size-3.5 shrink-0 animate-spin text-amber-600"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn("mt-1 size-2 shrink-0 rounded-full", legacyStatusDotClassName(status.intent))}
    />
  );
}

function legacyOperationButtonIntent(button: FormlessUiOperationButtonContract) {
  switch (button.prominence) {
    case "destructive":
      return "danger";
    case "primary":
      return "primary";
    case "quiet":
      return "plain";
    case "secondary":
      return "outline";
  }
}

function legacyOperationButtonSize(button: FormlessUiOperationButtonContract) {
  if (button.density !== "compact") {
    return undefined;
  }

  return button.content.kind === "iconOnly" ? "sq-xs" : "xs";
}

function legacyCompactStatusClassName(intent: FormlessUiCompactStatusIntent): string {
  const base = "flex min-w-0 max-w-full items-start gap-2 rounded border px-2.5 py-1.5 text-xs";

  switch (intent) {
    case "danger":
      return `${base} border-red-300 bg-red-50 text-red-700`;
    case "info":
    case "warning":
      return `${base} border-amber-300 bg-amber-50 text-amber-800`;
    case "success":
      return `${base} border-emerald-300 bg-emerald-50 text-emerald-800`;
    case "neutral":
      return `${base} border-border text-muted-fg`;
  }
}

function legacyStatusDotClassName(intent: FormlessUiCompactStatusIntent): string {
  switch (intent) {
    case "danger":
      return "bg-red-500";
    case "info":
    case "warning":
      return "bg-amber-500";
    case "success":
      return "bg-emerald-500";
    case "neutral":
      return "bg-slate-400";
  }
}

function legacyFeedbackClassName(intent: FormlessUiCompactStatusIntent): string {
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

function legacyOperationProgressStepStatusLabel(
  status: FormlessUiOperationProgressStepStatus,
): string {
  return status.replace(/^\w/, (match) => match.toUpperCase());
}

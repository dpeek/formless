import type {
  FormlessUiButtonContent,
  FormlessUiCompactStatusContract,
  FormlessUiCompactStatusIntent,
  FormlessUiOperationButtonContract,
  FormlessUiOperationControlContract,
  FormlessUiOperationExecutionStatus,
  FormlessUiOperationFeedbackEventContract,
  FormlessUiOperationProgressContract,
  FormlessUiOperationProgressStepContract,
} from "@dpeek/formless-presentation/contract";
import type {
  GeneratedOperationControlBinding,
  GeneratedOperationExecutionState,
  GeneratedOperationProgressStep,
} from "../../client/views.ts";

type ProjectedFeedbackStatus = Exclude<FormlessUiOperationExecutionStatus, "idle">;

export type GeneratedFormlessUiOperationButtonPresentation = {
  accessibilityLabel: string;
  content: FormlessUiButtonContent;
  density: FormlessUiOperationButtonContract["density"];
  disabledReason?: string;
  pendingLabel?: string;
  prominence: FormlessUiOperationButtonContract["prominence"];
};

export type GeneratedFormlessUiOperationTargetCount = {
  accessibilityLabel: string;
  count: number;
};

export type GeneratedFormlessUiOperationStatusPresentation = {
  id: string;
  label: string;
  progressLabel?: string;
};

export type GeneratedFormlessUiOperationFeedbackCopy = Partial<
  Record<
    ProjectedFeedbackStatus,
    {
      detail?: string;
      title: string;
    }
  >
>;

export type ProjectGeneratedOperationFormlessUiControlOptions = {
  binding: GeneratedOperationControlBinding;
  confirmationOpen?: boolean;
  feedbackCopy?: GeneratedFormlessUiOperationFeedbackCopy;
  presentation: GeneratedFormlessUiOperationButtonPresentation;
  state: GeneratedOperationExecutionState;
  targetCount?: GeneratedFormlessUiOperationTargetCount;
};

export function projectGeneratedOperationFormlessUiControl({
  binding,
  confirmationOpen = false,
  feedbackCopy,
  presentation,
  state,
  targetCount,
}: ProjectGeneratedOperationFormlessUiControlOptions): FormlessUiOperationControlContract {
  const pending = state.status === "pending";
  const disabledReason =
    binding.availability.state === "disabled"
      ? binding.availability.reason
      : (presentation.disabledReason ??
        (pending ? (presentation.pendingLabel ?? `${binding.label} is running.`) : undefined));
  const progress = projectGeneratedOperationFormlessUiProgress(state);
  const status = projectGeneratedOperationFormlessUiCompactStatus(binding, state);
  const feedback = projectGeneratedOperationFormlessUiFeedback(binding, state, {
    copy: feedbackCopy,
    progress,
  });
  const triggerIntent =
    binding.confirmation === undefined
      ? {
          controlId: binding.id,
          invocationSource: "button" as const,
          type: "operationInvoke" as const,
        }
      : {
          controlId: binding.id,
          open: true,
          type: "operationConfirmationOpenChange" as const,
        };
  const trigger: FormlessUiOperationButtonContract = {
    accessibilityLabel: presentation.accessibilityLabel,
    content: presentation.content,
    density: presentation.density,
    disabled: disabledReason !== undefined,
    ...(disabledReason === undefined ? {} : { disabledReason }),
    id: binding.id,
    intent: triggerIntent,
    kind: "button",
    pending: pending
      ? { isPending: true, label: presentation.pendingLabel ?? `${binding.label} is running.` }
      : undefined,
    prominence: presentation.prominence,
    type: "button",
    ...(targetCount === undefined
      ? {}
      : {
          countBadge: {
            accessibilityLabel: targetCount.accessibilityLabel,
            count: targetCount.count,
            id: `${binding.id}:count`,
            kind: "countBadge" as const,
          },
        }),
  };

  return {
    ...(binding.confirmation === undefined
      ? {}
      : {
          confirmation: {
            action: operationConfirmationButton({
              binding,
              content: { kind: "label", label: binding.confirmation.actionLabel },
              disabledReason,
              intent: {
                controlId: binding.id,
                invocationSource: "confirmationDialog",
                type: "operationInvoke",
              },
              label: binding.confirmation.actionLabel,
              pending,
              prominence: "destructive",
            }),
            cancel: operationConfirmationButton({
              binding,
              content: { kind: "label", label: "Cancel" },
              disabledReason: undefined,
              intent: {
                controlId: binding.id,
                open: false,
                type: "operationConfirmationOpenChange",
              },
              label: "Cancel",
              pending: false,
              prominence: "secondary",
            }),
            closeIntent: {
              controlId: binding.id,
              open: false,
              type: "operationConfirmationOpenChange",
            },
            description: binding.confirmation.description,
            id: `${binding.id}:confirmation`,
            kind: "destructiveConfirmation" as const,
            open: confirmationOpen,
            title: binding.confirmation.title,
          },
        }),
    ...(feedback === undefined ? {} : { feedback }),
    id: binding.id,
    kind: "operationControl",
    ...(progress === undefined ? {} : { progress }),
    status,
    trigger,
  };
}

export function projectGeneratedOperationFormlessUiCompactStatus(
  binding: GeneratedOperationControlBinding,
  state: GeneratedOperationExecutionState,
): FormlessUiCompactStatusContract {
  const status = projectGeneratedOperationStateFormlessUiCompactStatus(
    {
      id: binding.id,
      label: binding.label,
      ...(binding.feedback?.progressLabel === undefined
        ? {}
        : { progressLabel: binding.feedback.progressLabel }),
    },
    state,
  );
  const affectedDetail =
    state.result?.type === "committed"
      ? affectedCountDetail(binding, state.result.affectedCount)
      : undefined;
  const displayMessage =
    state.result?.type === "committed" ? state.result.displayMessage : undefined;

  return affectedDetail === undefined || displayMessage !== undefined
    ? status
    : {
        ...status,
        accessibilityLabel: `${status.label}: ${affectedDetail}`,
        detail: affectedDetail,
      };
}

export function projectGeneratedOperationStateFormlessUiCompactStatus(
  presentation: GeneratedFormlessUiOperationStatusPresentation,
  state: GeneratedOperationExecutionState,
): FormlessUiCompactStatusContract {
  const text = generatedOperationCompactStatusText(presentation.label, state);

  return {
    accessibilityLabel: `${text.label}: ${text.detail}`,
    detail: text.detail,
    id: `${presentation.id}:status`,
    intent: generatedOperationStatusIntent(state.status),
    kind: "compactStatus",
    label: text.label,
    pending:
      state.status === "pending"
        ? {
            isPending: true,
            label: presentation.progressLabel ?? `${presentation.label} is running.`,
          }
        : undefined,
    status: state.status,
  };
}

export function projectGeneratedOperationFormlessUiProgress(
  state: GeneratedOperationExecutionState,
): FormlessUiOperationProgressContract | undefined {
  if (state.progress === undefined) {
    return undefined;
  }

  return projectGeneratedOperationProgressFormlessUiContract({
    id: `operation-progress:${opaqueExecutionIdentity(state.executionKey)}`,
    progress: state.progress,
  });
}

export function projectGeneratedOperationProgressFormlessUiContract({
  id,
  progress,
}: {
  id: string;
  progress: NonNullable<GeneratedOperationExecutionState["progress"]>;
}): FormlessUiOperationProgressContract {
  return {
    ...(progress.detail === undefined ? {} : { detail: progress.detail }),
    id,
    kind: "operationProgress",
    steps: progress.steps.map(projectGeneratedOperationProgressStep),
    title: progress.title,
    updatedAt: progress.updatedAt,
  };
}

export function projectGeneratedOperationFormlessUiFeedback(
  binding: GeneratedOperationControlBinding,
  state: GeneratedOperationExecutionState,
  options: {
    copy?: GeneratedFormlessUiOperationFeedbackCopy;
    progress?: FormlessUiOperationProgressContract;
  } = {},
): FormlessUiOperationFeedbackEventContract | undefined {
  if (state.status === "idle") {
    return undefined;
  }

  const progress = options.progress ?? projectGeneratedOperationFormlessUiProgress(state);
  const activeProgressStep = selectActiveGeneratedOperationProgressStep(state);
  const copy = options.copy?.[state.status] ?? generatedOperationFeedbackCopy(binding, state);
  const timestamp =
    state.status === "pending"
      ? (state.startedAt ?? 0)
      : (state.completedAt ?? state.startedAt ?? 0);

  return {
    ...(activeProgressStep === undefined
      ? {}
      : {
          activeProgress: {
            ...(activeProgressStep.detail === undefined
              ? {}
              : { detail: activeProgressStep.detail }),
            label: activeProgressStep.label,
            stepId: activeProgressStep.id,
          },
        }),
    ...(copy.detail === undefined ? {} : { detail: copy.detail }),
    id: `operation-feedback:${opaqueExecutionIdentity(state.executionKey)}:${state.status}:${timestamp}`,
    intent: generatedOperationStatusIntent(state.status),
    kind: "operationFeedbackEvent",
    ...(progress === undefined ? {} : { progress }),
    status: state.status,
    title: copy.title,
  };
}

function operationConfirmationButton({
  binding,
  content,
  disabledReason,
  intent,
  label,
  pending,
  prominence,
}: {
  binding: GeneratedOperationControlBinding;
  content: FormlessUiButtonContent;
  disabledReason: string | undefined;
  intent: FormlessUiOperationButtonContract["intent"];
  label: string;
  pending: boolean;
  prominence: FormlessUiOperationButtonContract["prominence"];
}): FormlessUiOperationButtonContract {
  return {
    accessibilityLabel: label,
    content,
    density: "default",
    disabled: disabledReason !== undefined,
    ...(disabledReason === undefined ? {} : { disabledReason }),
    id: `${binding.id}:${prominence === "destructive" ? "confirm" : "cancel"}`,
    intent,
    kind: "button",
    pending: pending ? { isPending: true, label: `${binding.label} is running.` } : undefined,
    prominence,
    type: "button",
  };
}

function generatedOperationCompactStatusText(
  operationLabel: string,
  state: GeneratedOperationExecutionState,
): { detail: string; label: string } {
  if (state.status === "pending") {
    const progressStep = selectActiveGeneratedOperationProgressStep(state);

    return {
      label: state.progress?.title ?? `${operationLabel} running`,
      detail: progressStep?.label ?? state.progress?.detail ?? "Pending",
    };
  }

  if (state.result?.type === "failed") {
    return {
      label: `${operationLabel} failed`,
      detail: state.result.displayError,
    };
  }

  if (state.result?.type === "replayed") {
    return {
      label: `${operationLabel} replayed`,
      detail: state.result.displayMessage ?? "No changes applied.",
    };
  }

  if (state.result?.type === "committed") {
    return {
      label: `${operationLabel} synced`,
      detail: state.result.displayMessage ?? "Committed.",
    };
  }

  return {
    label: operationLabel,
    detail: "Ready",
  };
}

function generatedOperationFeedbackCopy(
  binding: GeneratedOperationControlBinding,
  state: Exclude<GeneratedOperationExecutionState, { status: "idle" }>,
): { detail?: string; title: string } {
  if (state.status === "pending") {
    return {
      ...(state.progress?.detail === undefined ? {} : { detail: state.progress.detail }),
      title:
        recordDeleteFeedbackTitle(binding, "pending") ??
        binding.feedback?.progressLabel ??
        `${binding.label}...`,
    };
  }

  if (state.result?.type === "failed") {
    return {
      detail: state.result.displayError,
      title: binding.feedback?.failureLabel ?? `${binding.label} failed.`,
    };
  }

  if (state.result?.type === "replayed") {
    return {
      title:
        state.result.displayMessage ??
        recordDeleteFeedbackTitle(binding, "replayed") ??
        binding.feedback?.replayLabel ??
        binding.feedback?.successLabel ??
        `${binding.label} replayed.`,
    };
  }

  return {
    ...(affectedCountDetail(binding, state.result?.affectedCount) === undefined
      ? {}
      : { detail: affectedCountDetail(binding, state.result?.affectedCount) }),
    title:
      state.result?.displayMessage ??
      recordDeleteFeedbackTitle(binding, "committed") ??
      binding.feedback?.successLabel ??
      `${binding.label} synced.`,
  };
}

function recordDeleteFeedbackTitle(
  binding: GeneratedOperationControlBinding,
  status: "committed" | "pending" | "replayed",
): string | undefined {
  if (binding.input.kind !== "recordDelete" || binding.input.recordLabel === undefined) {
    return undefined;
  }

  return status === "pending"
    ? `Deleting ${binding.input.recordLabel}...`
    : `Deleted ${binding.input.recordLabel}.`;
}

function affectedCountDetail(
  binding: GeneratedOperationControlBinding,
  affectedCount: number | undefined,
): string | undefined {
  return binding.input.kind === "collectionCommand" && binding.input.ui.showAffectedCountOnSuccess
    ? `${affectedCount ?? 0} affected.`
    : undefined;
}

function selectActiveGeneratedOperationProgressStep(
  state: GeneratedOperationExecutionState,
): GeneratedOperationProgressStep | undefined {
  const steps = state.progress?.steps;

  if (steps === undefined) {
    return undefined;
  }

  return (
    steps.find((step) => step.status === "running") ??
    steps.find((step) => step.status === "failed") ??
    steps.find((step) => step.status === "pending") ??
    steps.find((step) => step.status === "skipped") ??
    steps[steps.length - 1]
  );
}

function projectGeneratedOperationProgressStep(
  step: GeneratedOperationProgressStep,
): FormlessUiOperationProgressStepContract {
  return {
    ...(step.detail === undefined ? {} : { detail: step.detail }),
    id: step.id,
    label: step.label,
    status: step.status,
  };
}

function generatedOperationStatusIntent(
  status: FormlessUiOperationExecutionStatus,
): FormlessUiCompactStatusIntent {
  switch (status) {
    case "committed":
      return "success";
    case "failed":
      return "danger";
    case "pending":
      return "info";
    case "idle":
    case "replayed":
      return "neutral";
  }
}

function opaqueExecutionIdentity(executionKey: string): string {
  let hash = 2166136261;

  for (let index = 0; index < executionKey.length; index += 1) {
    hash ^= executionKey.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

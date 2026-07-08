import type { HTMLAttributes } from "react";
import { LoadingIcon } from "@dpeek/formless-ui/icons";
import { cn } from "@dpeek/formless-ui/primitive";
import type {
  GeneratedOperationExecutionState,
  GeneratedOperationProgress,
  GeneratedOperationProgressStep,
} from "../../client/views.ts";

export type GeneratedOperationDisplayTextFormatter = (value: string) => string;

export type GeneratedOperationCompactStatusProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  displayText?: GeneratedOperationDisplayTextFormatter;
  operationLabel: string;
  state: GeneratedOperationExecutionState;
};

export function GeneratedOperationCompactStatus({
  className,
  displayText = identityDisplayText,
  operationLabel,
  state,
  ...props
}: GeneratedOperationCompactStatusProps) {
  const text = compactGeneratedOperationStatusText(operationLabel, state);

  return (
    <div
      {...props}
      className={cn(generatedOperationCompactStatusClassName(state), className)}
      data-formless-generated-operation-status={state.status}
      role={state.status === "failed" ? "alert" : "status"}
    >
      <GeneratedOperationCompactStatusMarker state={state} />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{displayText(text.title)}</span>
        <span className="block line-clamp-2 text-xs text-muted-fg">{displayText(text.detail)}</span>
      </span>
    </div>
  );
}

export function GeneratedOperationProgressSteps({
  className,
  displayText = identityDisplayText,
  progress,
}: {
  className?: string;
  displayText?: GeneratedOperationDisplayTextFormatter;
  progress: GeneratedOperationProgress;
}) {
  if (progress.steps.length === 0) {
    return null;
  }

  return (
    <ol
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
            <span className="min-w-0 truncate font-medium text-fg">{displayText(step.label)}</span>
            <span className="shrink-0 text-muted-fg">
              {generatedOperationProgressStepStatusLabel(step.status)}
            </span>
          </div>
          {step.detail ? (
            <p className="min-w-0 break-words text-muted-fg">{displayText(step.detail)}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function selectActiveGeneratedOperationProgressStep(
  progress: GeneratedOperationProgress,
): GeneratedOperationProgressStep | undefined {
  return (
    progress.steps.find((step) => step.status === "running") ??
    progress.steps.find((step) => step.status === "failed") ??
    progress.steps.find((step) => step.status === "pending") ??
    progress.steps.find((step) => step.status === "skipped") ??
    progress.steps[progress.steps.length - 1]
  );
}

export function compactGeneratedOperationStatusText(
  operationLabel: string,
  state: GeneratedOperationExecutionState,
): { detail: string; title: string } {
  if (state.status === "pending") {
    const progressStep = state.progress
      ? selectActiveGeneratedOperationProgressStep(state.progress)
      : undefined;

    return {
      title: state.progress?.title ?? `${operationLabel} running`,
      detail: progressStep?.label ?? state.progress?.detail ?? "Pending",
    };
  }

  if (state.result?.type === "failed") {
    return {
      title: `${operationLabel} failed`,
      detail: state.result.displayError,
    };
  }

  if (state.result?.type === "replayed") {
    return {
      title: `${operationLabel} replayed`,
      detail: state.result.displayMessage ?? "No changes applied.",
    };
  }

  if (state.result?.type === "committed") {
    return {
      title: `${operationLabel} synced`,
      detail: state.result.displayMessage ?? "Committed.",
    };
  }

  return {
    title: operationLabel,
    detail: "Ready",
  };
}

function GeneratedOperationCompactStatusMarker({
  state,
}: {
  state: GeneratedOperationExecutionState;
}) {
  if (state.status === "pending") {
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
      className={cn(
        "mt-1 size-2 shrink-0 rounded-full",
        generatedOperationStatusDotClassName(state),
      )}
    />
  );
}

function generatedOperationCompactStatusClassName(state: GeneratedOperationExecutionState): string {
  const base = "flex min-w-0 max-w-full items-start gap-2 rounded border px-2.5 py-1.5 text-xs";

  switch (state.status) {
    case "failed":
      return `${base} border-red-300 bg-red-50 text-red-700`;
    case "pending":
      return `${base} border-amber-300 bg-amber-50 text-amber-800`;
    case "committed":
      return `${base} border-emerald-300 bg-emerald-50 text-emerald-800`;
    case "replayed":
      return `${base} border-border bg-muted text-muted-fg`;
    case "idle":
      return `${base} border-border text-muted-fg`;
  }
}

function generatedOperationStatusDotClassName(state: GeneratedOperationExecutionState): string {
  switch (state.status) {
    case "failed":
      return "bg-red-500";
    case "committed":
      return "bg-emerald-500";
    case "pending":
      return "bg-amber-500";
    case "replayed":
    case "idle":
      return "bg-slate-400";
  }
}

function generatedOperationProgressStepStatusLabel(
  status: GeneratedOperationProgressStep["status"],
): string {
  return status.replace(/^\w/, (match) => match.toUpperCase());
}

function identityDisplayText(value: string): string {
  return value;
}

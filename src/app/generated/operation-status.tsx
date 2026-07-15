import type { HTMLAttributes } from "react";
import type {
  GeneratedOperationExecutionState,
  GeneratedOperationProgress,
} from "../../client/views.ts";
import {
  projectGeneratedOperationProgressFormlessUiContract,
  projectGeneratedOperationStateFormlessUiCompactStatus,
} from "./formless-ui-operation-projection.ts";
import {
  LegacyGeneratedOperationCompactStatus,
  LegacyGeneratedOperationProgress,
} from "./legacy-operation-controls.tsx";

export type GeneratedOperationDisplayTextFormatter = (value: string) => string;

export type GeneratedOperationCompactStatusProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  controlId: string;
  displayText?: GeneratedOperationDisplayTextFormatter;
  operationLabel: string;
  state: GeneratedOperationExecutionState;
};

export function GeneratedOperationCompactStatus({
  className,
  controlId,
  displayText = identityDisplayText,
  operationLabel,
  state,
  ...props
}: GeneratedOperationCompactStatusProps) {
  const status = projectGeneratedOperationStateFormlessUiCompactStatus(
    { id: controlId, label: operationLabel },
    state,
  );
  const displayStatus = {
    ...status,
    accessibilityLabel: displayText(status.accessibilityLabel),
    detail: displayText(status.detail),
    label: displayText(status.label),
    ...(status.pending === undefined
      ? {}
      : { pending: { ...status.pending, label: displayText(status.pending.label ?? "") } }),
  };

  return (
    <div {...props}>
      <LegacyGeneratedOperationCompactStatus className={className} status={displayStatus} />
    </div>
  );
}

export function GeneratedOperationProgressSteps({
  className,
  controlId,
  displayText = identityDisplayText,
  progress,
}: {
  className?: string;
  controlId: string;
  displayText?: GeneratedOperationDisplayTextFormatter;
  progress: GeneratedOperationProgress;
}) {
  const projectedProgress = projectGeneratedOperationProgressFormlessUiContract({
    id: `${controlId}:progress`,
    progress,
  });
  const displayProgress = {
    ...projectedProgress,
    ...(projectedProgress.detail === undefined
      ? {}
      : { detail: displayText(projectedProgress.detail) }),
    steps: projectedProgress.steps.map((step) => ({
      ...step,
      ...(step.detail === undefined ? {} : { detail: displayText(step.detail) }),
      label: displayText(step.label),
    })),
    title: displayText(projectedProgress.title),
  };

  return <LegacyGeneratedOperationProgress className={className} progress={displayProgress} />;
}

function identityDisplayText(value: string): string {
  return value;
}

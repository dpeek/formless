import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  GeneratedOperationExecutionState,
  GeneratedOperationProgress,
} from "../../client/views.ts";
import {
  GeneratedOperationCompactStatus,
  GeneratedOperationProgressSteps,
  compactGeneratedOperationStatusText,
  selectActiveGeneratedOperationProgressStep,
} from "./operation-status.tsx";

describe("generated operation status", () => {
  it("uses the active progress step for compact pending feedback", () => {
    const progress = generatedProgress();
    const state: GeneratedOperationExecutionState = {
      executionKey: "workspace:push",
      progress,
      startedAt: 1,
      status: "pending",
    };

    expect(selectActiveGeneratedOperationProgressStep(progress)?.id).toBe("provider");
    expect(compactGeneratedOperationStatusText("Push", state)).toEqual({
      title: "Pushing workspace",
      detail: "Provider reconciliation",
    });

    const html = renderToStaticMarkup(
      <GeneratedOperationCompactStatus operationLabel="Push" state={state} />,
    );

    expect(html).toContain('data-formless-generated-operation-status="pending"');
    expect(html).toContain("Pushing workspace");
    expect(html).toContain("Provider reconciliation");
    expect(html).toContain("animate-spin");
  });

  it("renders richer step output from the same generic progress state", () => {
    const html = renderToStaticMarkup(
      <GeneratedOperationProgressSteps progress={generatedProgress()} />,
    );

    expect(html).toContain('data-formless-generated-operation-progress-steps="true"');
    expect(html).toContain('data-formless-generated-operation-progress-step="provider"');
    expect(html).toContain('data-formless-generated-operation-progress-step-status="running"');
    expect(html).toContain("Provider reconciliation");
    expect(html).toContain("Updating provider state");
  });
});

function generatedProgress(): GeneratedOperationProgress {
  return {
    detail: "Workspace push is running.",
    steps: [
      { id: "sync", label: "Plan workspace source", status: "succeeded" },
      {
        detail: "Updating provider state",
        id: "provider",
        label: "Provider reconciliation",
        status: "running",
      },
      { id: "plan", label: "Health check", status: "pending" },
    ],
    title: "Pushing workspace",
    updatedAt: 1,
  };
}

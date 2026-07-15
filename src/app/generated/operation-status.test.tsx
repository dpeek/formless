import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  GeneratedOperationExecutionState,
  GeneratedOperationProgress,
} from "../../client/views.ts";
import {
  GeneratedOperationCompactStatus,
  GeneratedOperationProgressSteps,
} from "./operation-status.tsx";
import {
  projectGeneratedOperationProgressFormlessUiContract,
  projectGeneratedOperationStateFormlessUiCompactStatus,
} from "./formless-ui-operation-projection.ts";

describe("generated operation status", () => {
  it("uses the active progress step for compact pending feedback", () => {
    const progress = generatedProgress();
    const state: GeneratedOperationExecutionState = {
      executionKey: "workspace:push",
      progress,
      startedAt: 1,
      status: "pending",
    };

    expect(
      projectGeneratedOperationStateFormlessUiCompactStatus(
        { id: "workspace-push", label: "Push" },
        state,
      ),
    ).toMatchObject({
      label: "Pushing workspace",
      detail: "Provider reconciliation",
    });

    const html = renderToStaticMarkup(
      <GeneratedOperationCompactStatus
        controlId="workspace-push"
        operationLabel="Push"
        state={state}
      />,
    );

    expect(html).toContain("Pushing workspace");
    expect(html).toContain("Provider reconciliation");
  });

  it("renders richer step output from the same generic progress state", () => {
    const html = renderToStaticMarkup(
      <GeneratedOperationProgressSteps controlId="workspace-push" progress={generatedProgress()} />,
    );

    expect(html).toContain("Provider reconciliation");
    expect(html).toContain("Updating provider state");
    expect(
      projectGeneratedOperationProgressFormlessUiContract({
        id: "workspace-push:progress",
        progress: generatedProgress(),
      }).steps,
    ).toEqual([
      { id: "sync", label: "Plan workspace source", status: "succeeded" },
      {
        detail: "Updating provider state",
        id: "provider",
        label: "Provider reconciliation",
        status: "running",
      },
      { id: "plan", label: "Health check", status: "pending" },
    ]);
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

import {
  fetchWorkspaceGatewayOperation,
  startWorkspaceGatewayOperation,
  WorkspaceGatewayApiError,
  type WorkspaceGatewayConfig,
  type WorkspaceGatewayOperation,
  type WorkspaceGatewayOperationKind,
  type WorkspaceGatewayOperationStep,
  type WorkspaceGatewayResponse,
  type WorkspaceGatewayStartInput,
} from "@dpeek/formless-gateway/client";
import type {
  GeneratedOperationProgress,
  GeneratedOperationProgressStep,
} from "./operation-control-model.ts";
import type {
  GeneratedOperationRuntimeAdapter,
  GeneratedOperationRuntimeAdapterRequest,
  GeneratedOperationRuntimeAdapterResponse,
} from "./operation-control-controller.ts";

const DEFAULT_WORKSPACE_GATEWAY_POLL_INTERVAL_MS = 1_500;

export type WorkspaceGatewayGeneratedOperationRuntimeAdapterOptions = {
  config?: WorkspaceGatewayConfig;
  csrfToken?: string;
  fetcher?: typeof fetch;
  pollIntervalMs?: number;
  signal?: AbortSignal;
  wait?: (milliseconds: number) => Promise<void>;
};

export function createWorkspaceGatewayGeneratedOperationRuntimeAdapter(
  options: WorkspaceGatewayGeneratedOperationRuntimeAdapterOptions = {},
): GeneratedOperationRuntimeAdapter {
  return (request) => executeWorkspaceGatewayGeneratedOperation(request, options);
}

export async function executeWorkspaceGatewayGeneratedOperation(
  request: GeneratedOperationRuntimeAdapterRequest,
  options: WorkspaceGatewayGeneratedOperationRuntimeAdapterOptions = {},
): Promise<GeneratedOperationRuntimeAdapterResponse> {
  const input = workspaceGatewayStartInputFromGeneratedOperation(request);

  if (input === undefined) {
    return failedWorkspaceGatewayRuntimeAdapterResponse("Workspace operation is unavailable.");
  }

  try {
    const response = await startWorkspaceGatewayOperation(input, {
      config: options.config,
      csrfToken: options.csrfToken,
      fetcher: options.fetcher,
      signal: options.signal,
    });

    if (response === undefined) {
      return failedWorkspaceGatewayRuntimeAdapterResponse("Workspace gateway is unavailable.");
    }

    return await pollWorkspaceGatewayGeneratedOperation(response, request, options);
  } catch (error) {
    return failedWorkspaceGatewayRuntimeAdapterResponse(workspaceGatewayAdapterErrorMessage(error));
  }
}

export function workspaceGatewayStartInputFromGeneratedOperation(
  request: GeneratedOperationRuntimeAdapterRequest,
): WorkspaceGatewayStartInput | undefined {
  const adapter = request.binding.input;

  if (adapter.kind !== "workspace") {
    return undefined;
  }

  const operationKind = workspaceGatewayOperationKind(adapter.operationKind);

  if (operationKind === undefined) {
    return undefined;
  }

  const input: Record<string, unknown> = { kind: operationKind };

  if (isRecord(request.input)) {
    for (const field of adapter.inputFields) {
      if (Object.hasOwn(request.input, field)) {
        input[field] = request.input[field];
      }
    }
  }

  return input as WorkspaceGatewayStartInput;
}

export function workspaceGatewayOperationGeneratedRuntimeAdapterResponse(
  operation: WorkspaceGatewayOperation,
): GeneratedOperationRuntimeAdapterResponse {
  const progress = workspaceGatewayOperationGeneratedProgress(operation);

  if (operation.status === "failed") {
    return {
      status: "failed",
      displayError: workspaceGatewayOperationFailureMessage(operation),
      progress,
    };
  }

  if (operation.status !== "succeeded") {
    return {
      status: "failed",
      displayError: "Workspace gateway operation is still running.",
      progress,
    };
  }

  return {
    status: workspaceGatewayOperationReplayed(operation) ? "replayed" : "committed",
    displayMessage: workspaceGatewayOperationDisplayMessage(operation),
    output: {
      operationId: operation.id,
      operationKind: operation.operation,
      status: operation.status,
    },
    progress,
  };
}

export function workspaceGatewayOperationGeneratedProgress(
  operation: WorkspaceGatewayOperation,
): GeneratedOperationProgress {
  const steps = workspaceGatewayOperationGeneratedProgressSteps(operation);
  const activeDetail = steps.find((step) => step.status === "running")?.detail;
  const failedDetail = steps.find((step) => step.status === "failed")?.detail;
  const pendingDetail = steps.find((step) => step.status === "pending")?.detail;
  const detail = activeDetail ?? failedDetail ?? pendingDetail;

  return {
    title: operation.summary.title,
    ...(detail === undefined ? {} : { detail }),
    updatedAt: workspaceGatewayOperationUpdatedAt(operation),
    steps,
  };
}

export function workspaceGatewayOperationGeneratedProgressSteps(
  operation: WorkspaceGatewayOperation,
): readonly GeneratedOperationProgressStep[] {
  const steps = operation.steps ?? operation.result?.steps ?? [];

  if (steps.length > 0) {
    return steps.map(workspaceGatewayOperationGeneratedProgressStep);
  }

  const failureMessage =
    operation.status === "failed" ? workspaceGatewayOperationFailureMessage(operation) : undefined;

  return [
    {
      id: operation.operation,
      label: operation.summary.title,
      ...(failureMessage === undefined ? {} : { detail: failureMessage }),
      status: workspaceGatewayStatusToGeneratedStepStatus(operation.status),
    },
  ];
}

async function pollWorkspaceGatewayGeneratedOperation(
  response: WorkspaceGatewayResponse,
  request: GeneratedOperationRuntimeAdapterRequest,
  options: WorkspaceGatewayGeneratedOperationRuntimeAdapterOptions,
): Promise<GeneratedOperationRuntimeAdapterResponse> {
  let operation = response.operation;

  request.reportProgress(workspaceGatewayOperationGeneratedProgress(operation));

  while (workspaceGatewayOperationPending(operation)) {
    await waitForWorkspaceGatewayPoll(options);

    const next = await fetchWorkspaceGatewayOperation(
      { operationId: operation.id, operationKind: operation.operation },
      {
        config: options.config,
        fetcher: options.fetcher,
        signal: options.signal,
      },
    );

    if (next === undefined) {
      return {
        status: "failed",
        displayError: "Workspace gateway operation is unavailable.",
        progress: workspaceGatewayOperationGeneratedProgress(operation),
      };
    }

    operation = next.operation;
    request.reportProgress(workspaceGatewayOperationGeneratedProgress(operation));
  }

  return workspaceGatewayOperationGeneratedRuntimeAdapterResponse(operation);
}

function workspaceGatewayOperationGeneratedProgressStep(
  step: WorkspaceGatewayOperationStep,
): GeneratedOperationProgressStep {
  return {
    id: step.id,
    label: step.label,
    ...(step.detail === undefined && step.error === undefined
      ? {}
      : { detail: step.detail ?? step.error }),
    status: step.status,
  };
}

function workspaceGatewayOperationKind(
  value: string | undefined,
): WorkspaceGatewayOperationKind | undefined {
  switch (value) {
    case "check":
    case "credentialSetup":
    case "pull":
    case "push":
    case "save":
    case "status":
      return value;
    default:
      return undefined;
  }
}

function workspaceGatewayOperationPending(operation: WorkspaceGatewayOperation): boolean {
  return operation.status === "queued" || operation.status === "running";
}

function workspaceGatewayStatusToGeneratedStepStatus(
  status: WorkspaceGatewayOperation["status"],
): GeneratedOperationProgressStep["status"] {
  switch (status) {
    case "failed":
      return "failed";
    case "queued":
      return "pending";
    case "running":
      return "running";
    case "succeeded":
      return "succeeded";
  }
}

function workspaceGatewayOperationFailureMessage(operation: WorkspaceGatewayOperation): string {
  const failedStep = (operation.steps ?? operation.result?.steps ?? []).find(
    (step) => step.status === "failed",
  );

  return (
    operation.errors.at(-1)?.message ??
    failedStep?.error ??
    failedStep?.detail ??
    operation.summary.title ??
    "Workspace gateway operation failed."
  );
}

function workspaceGatewayOperationDisplayMessage(operation: WorkspaceGatewayOperation): string {
  if (workspaceGatewayOperationReplayed(operation)) {
    return "Workspace source push already applied.";
  }

  return punctuate(operation.summary.title);
}

function workspaceGatewayOperationReplayed(operation: WorkspaceGatewayOperation): boolean {
  return (
    operation.operation === "push" &&
    operation.summary.fields.noop === true &&
    operation.summary.fields.runtimeRebuild === undefined
  );
}

function workspaceGatewayOperationUpdatedAt(operation: WorkspaceGatewayOperation): number {
  const timestamp = Date.parse(operation.updatedAt);

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function punctuate(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function workspaceGatewayAdapterErrorMessage(error: unknown): string {
  if (error instanceof WorkspaceGatewayApiError) {
    return error.message;
  }

  return "Workspace gateway operation failed.";
}

function failedWorkspaceGatewayRuntimeAdapterResponse(
  displayError: string,
): GeneratedOperationRuntimeAdapterResponse {
  return {
    status: "failed",
    displayError,
  };
}

async function waitForWorkspaceGatewayPoll(
  options: WorkspaceGatewayGeneratedOperationRuntimeAdapterOptions,
): Promise<void> {
  if (options.wait !== undefined) {
    await options.wait(options.pollIntervalMs ?? DEFAULT_WORKSPACE_GATEWAY_POLL_INTERVAL_MS);
    return;
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, options.pollIntervalMs ?? DEFAULT_WORKSPACE_GATEWAY_POLL_INTERVAL_MS);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

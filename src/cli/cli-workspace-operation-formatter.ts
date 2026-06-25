import type {
  WorkspaceOperationDisplayObject,
  WorkspaceOperationDisplayValue,
  WorkspaceOperationState,
} from "@dpeek/formless-workspace";

const CLI_WORKSPACE_OPERATION_NOOP_OUTPUT = "Everything up to date.";

export function formatCliWorkspaceOperationOutput(state: WorkspaceOperationState): string {
  return isNoopCliWorkspaceOperation(state)
    ? CLI_WORKSPACE_OPERATION_NOOP_OUTPUT
    : formatCliWorkspaceOperationResult(state);
}

function formatCliWorkspaceOperationResult(state: WorkspaceOperationState): string {
  return [
    `Workspace operation: ${formatWorkspaceOperationLabel(state.operation)} (${state.status}).`,
    "Workspace source: layout-only manifest, storage snapshots, media payloads.",
    `Summary: ${state.summary.title}.`,
    ...formatCliDisplayFields(state.summary.fields),
    ...(state.result?.details === undefined
      ? []
      : ["Details:", ...formatCliDisplayFields(state.result.details)]),
    ...(state.result?.deployment === undefined
      ? []
      : ["Deployment execution summary:", ...formatCliDisplayFields(state.result.deployment)]),
  ].join("\n");
}

function isNoopCliWorkspaceOperation(state: WorkspaceOperationState): boolean {
  return (
    state.status === "succeeded" &&
    (state.operation === "pull" || state.operation === "push") &&
    state.summary.fields.noop === true &&
    state.summary.fields.runtimeRebuild === undefined
  );
}

function formatWorkspaceOperationLabel(operation: WorkspaceOperationState["operation"]): string {
  switch (operation) {
    case "credentialSetup":
      return "credential setup";
    case "deploymentRefresh":
      return "deployment refresh";
    default:
      return operation;
  }
}

function formatCliDisplayFields(fields: WorkspaceOperationDisplayObject): string[] {
  return Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}: ${formatCliDisplayValue(value)}.`);
}

function formatCliDisplayValue(value: WorkspaceOperationDisplayValue): string {
  if (value === null) {
    return "none";
  }

  if (Array.isArray(value)) {
    return value.length === 0
      ? "none"
      : value.map((entry) => formatCliDisplayValue(entry)).join(", ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

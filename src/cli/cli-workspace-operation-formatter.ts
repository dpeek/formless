import type { WorkspaceOperationState } from "@dpeek/formless-workspace";

import {
  formatCliDisplayFields,
  formatCliOutputLines,
  formatCliWorkspaceOperationLabel,
} from "./cli-formatter-helpers.ts";

const CLI_WORKSPACE_OPERATION_NOOP_OUTPUT = "Everything up to date.";

export function formatCliWorkspaceOperationOutput(state: WorkspaceOperationState): string {
  return isNoopCliWorkspaceOperation(state)
    ? CLI_WORKSPACE_OPERATION_NOOP_OUTPUT
    : formatCliWorkspaceOperationResult(state);
}

function formatCliWorkspaceOperationResult(state: WorkspaceOperationState): string {
  return formatCliOutputLines([
    `Workspace operation: ${formatCliWorkspaceOperationLabel(state.operation)} (${state.status}).`,
    "Workspace source: layout-only manifest, storage snapshots, media payloads.",
    `Summary: ${state.summary.title}.`,
    ...formatCliDisplayFields(state.summary.fields),
    ...(state.result?.details === undefined
      ? []
      : ["Details:", ...formatCliDisplayFields(state.result.details)]),
    ...(state.result?.deployment === undefined
      ? []
      : ["Deployment execution summary:", ...formatCliDisplayFields(state.result.deployment)]),
  ]);
}

function isNoopCliWorkspaceOperation(state: WorkspaceOperationState): boolean {
  return (
    state.status === "succeeded" &&
    (state.operation === "pull" || state.operation === "push") &&
    state.summary.fields.noop === true &&
    state.summary.fields.runtimeRebuild === undefined
  );
}

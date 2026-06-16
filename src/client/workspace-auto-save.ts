import {
  enqueueWorkspaceGatewayAutoSave,
  fetchWorkspaceGatewayAutoSaveStatus,
  workspaceGatewayBrowserConfig,
  type WorkspaceGatewayAutoSaveEnqueueInput,
  type WorkspaceGatewayConfig,
} from "@dpeek/formless-gateway/client";

export type LocalWorkspaceAutoSaveClient = {
  enqueue: (input: WorkspaceGatewayAutoSaveEnqueueInput) => Promise<unknown>;
};

export type LocalWorkspaceAutoSaveOptions = {
  autoSave?: false | LocalWorkspaceAutoSaveClient;
};

export type LocalWorkspaceAutoSaveWriteSource = WorkspaceGatewayAutoSaveEnqueueInput["source"];

export async function enqueueLocalWorkspaceAutoSave(
  input: WorkspaceGatewayAutoSaveEnqueueInput,
  options: LocalWorkspaceAutoSaveOptions = {},
): Promise<void> {
  if (options.autoSave === false) {
    return;
  }

  try {
    if (options.autoSave) {
      await options.autoSave.enqueue(input);
      return;
    }

    const config = workspaceGatewayBrowserConfig();

    if (!config) {
      return;
    }

    await enqueueWithGatewayClient(input, config);
  } catch {
    // Committed browser writes must not fail because local auto-save is unavailable.
  }
}

async function enqueueWithGatewayClient(
  input: WorkspaceGatewayAutoSaveEnqueueInput,
  config: WorkspaceGatewayConfig,
): Promise<void> {
  const status = await fetchWorkspaceGatewayAutoSaveStatus({ config });
  await enqueueWorkspaceGatewayAutoSave(input, {
    config,
    csrfToken: status?.csrfToken,
  });
}

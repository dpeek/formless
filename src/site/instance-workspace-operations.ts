import path from "node:path";

import {
  WORKSPACE_OPERATION_CAPABILITIES,
  assertWorkspaceOperationExecutionAllowed,
  assertWorkspaceOperationExecutionRequirements,
  workspaceOperationInputDisplay,
  type RunnableWorkspaceOperationInput,
  type StatusWorkspaceOperationInput,
  type WorkspaceOperationActor,
  type WorkspaceOperationDisplayObject,
  type WorkspaceOperationRequiredCapability,
  type WorkspaceOperationResult,
  type WorkspaceOperationState,
  type WorkspaceOperationStep,
} from "@dpeek/formless-workspace";
import {
  createWorkspaceOperationState,
  updateWorkspaceOperationState,
} from "@dpeek/formless-workspace/node";

import {
  checkLocalFormlessWorkspace,
  getFormlessInstanceWorkspaceStatus,
  initLocalFormlessWorkspaceOnboarding,
  pullFormlessInstanceWorkspace,
  pushFormlessInstanceWorkspace,
  refreshFormlessInstanceDeploymentObservation,
  resolveFormlessInstanceWorkspaceRoot,
  saveLocalFormlessWorkspace,
  type CheckLocalFormlessWorkspaceResult,
  type DeployLocalFormlessWorkspaceDependencies,
  type FormlessInstanceWorkspaceSyncPlan,
  type FormlessInstanceWorkspaceStatusResult,
  type InitFormlessInstanceWorkspaceResult,
  type PullFormlessInstanceWorkspaceResult,
  type PushFormlessInstanceWorkspaceDependencies,
  type PushFormlessInstanceWorkspaceResult,
  type RefreshFormlessInstanceDeploymentObservationResult,
  type SaveLocalFormlessWorkspaceResult,
} from "./instance-workspace.ts";
import type { RestorePortableArchiveResult } from "./archive-workflows.ts";
import { workspaceRuntimeExtensionKeys } from "../shared/workspace-runtime-extensions.ts";

export type RunFormlessWorkspaceOperationDependencies = Pick<
  DeployLocalFormlessWorkspaceDependencies,
  "cwd" | "fetch" | "now"
> &
  Partial<Omit<DeployLocalFormlessWorkspaceDependencies, "cwd" | "fetch" | "now">> & {
    createOperationId?: () => string;
  };

export async function runFormlessWorkspaceOperation(
  input: RunnableWorkspaceOperationInput,
  dependencies: RunFormlessWorkspaceOperationDependencies,
  options: {
    actor?: WorkspaceOperationActor;
    capabilities?: readonly WorkspaceOperationRequiredCapability[];
  } = {},
): Promise<WorkspaceOperationState> {
  const actor = options.actor ?? "system";

  assertWorkspaceOperationExecutionRequirements(input);
  assertWorkspaceOperationExecutionAllowed({
    actor,
    capabilities: options.capabilities ?? WORKSPACE_OPERATION_CAPABILITIES,
    kind: input.kind,
  });

  const workspaceRoot = await resolveWorkspaceOperationRoot(input, dependencies);
  let state = await createWorkspaceOperationState({
    actor,
    id: dependencies.createOperationId?.(),
    input: workspaceOperationInputDisplay(input),
    now: dependencies.now,
    operation: input.kind,
    workspaceRoot,
  });

  state = await updateWorkspaceOperationState(state.id, {
    logs: [{ at: dependencies.now(), level: "info", message: `${input.kind} started.` }],
    status: "running",
    workspaceRoot,
  });

  try {
    const result = await runWorkspaceOperationBody(input, dependencies);

    return updateWorkspaceOperationState(state.id, {
      logs: [{ at: dependencies.now(), level: "info", message: `${input.kind} completed.` }],
      result,
      ...(result.steps === undefined ? {} : { steps: result.steps }),
      status: "succeeded",
      summary: result.summary,
      workspaceRoot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failureSteps = failureWorkspaceOperationSteps(input, error);

    return updateWorkspaceOperationState(state.id, {
      errors: [{ message }],
      logs: [{ at: dependencies.now(), level: "error", message }],
      status: "failed",
      ...(failureSteps === undefined ? {} : { steps: failureSteps }),
      summary: {
        fields: failureWorkspaceOperationSummaryFields(message, error),
        title: "Operation failed",
      },
      workspaceRoot,
    });
  }
}

async function runWorkspaceOperationBody(
  input: RunnableWorkspaceOperationInput,
  dependencies: RunFormlessWorkspaceOperationDependencies,
): Promise<WorkspaceOperationResult> {
  switch (input.kind) {
    case "init":
      return summarizeInitResult(
        await initLocalFormlessWorkspaceOnboarding(
          {
            name: input.name,
            workspacePath: input.workspacePath ?? undefined,
          },
          dependencies,
        ),
      );
    case "status":
      return summarizeStatusResult(await readWorkspaceStatus(input, dependencies));
    case "save":
      return summarizeSaveResult(
        await saveLocalFormlessWorkspace(
          {
            check: input.check,
            source: input.source,
            workspacePath: input.workspacePath ?? undefined,
          },
          dependencies,
        ),
      );
    case "check":
      return summarizeCheckResult(
        await checkLocalFormlessWorkspace(
          {
            targetAlias: input.targetAlias,
            workspacePath: input.workspacePath ?? undefined,
          },
          dependencies,
        ),
      );
    case "pull":
      return summarizePullResult(
        await pullFormlessInstanceWorkspace(
          {
            dryRun: input.dryRun,
            targetAlias: input.targetAlias,
            workspacePath: input.workspacePath ?? undefined,
          },
          dependencies,
        ),
      );
    case "deploymentRefresh":
      return summarizeDeploymentRefreshResult(
        await refreshFormlessInstanceDeploymentObservation(
          {
            targetAlias: input.targetAlias,
            workspacePath: input.workspacePath ?? undefined,
          },
          dependencies,
        ),
      );
    case "push":
      return summarizePushResult(
        await pushFormlessInstanceWorkspace(
          {
            apply: !input.dryRun,
            force: input.force,
            targetAlias: input.targetAlias,
            workspacePath: input.workspacePath ?? undefined,
          },
          requirePushWorkspaceOperationDependencies(dependencies),
        ),
      );
  }
}

function requirePushWorkspaceOperationDependencies(
  dependencies: RunFormlessWorkspaceOperationDependencies,
): PushFormlessInstanceWorkspaceDependencies {
  const {
    accountDiscovery,
    deploymentAdapter,
    healthCheck,
    localSecretEnv,
    packageRoot,
    packageVersion,
    randomToken,
    setupCapability,
  } = dependencies;
  const missing: string[] = [];

  if (accountDiscovery === undefined) missing.push("accountDiscovery");
  if (deploymentAdapter === undefined) missing.push("deploymentAdapter");
  if (healthCheck === undefined) missing.push("healthCheck");
  if (localSecretEnv === undefined) missing.push("localSecretEnv");
  if (packageRoot === undefined) missing.push("packageRoot");
  if (packageVersion === undefined) missing.push("packageVersion");
  if (randomToken === undefined) missing.push("randomToken");
  if (setupCapability === undefined) missing.push("setupCapability");

  if (missing.length > 0) {
    throw new Error(`Workspace push requires operation dependencies: ${missing.join(", ")}.`);
  }

  if (
    accountDiscovery === undefined ||
    deploymentAdapter === undefined ||
    healthCheck === undefined ||
    localSecretEnv === undefined ||
    packageRoot === undefined ||
    packageVersion === undefined ||
    randomToken === undefined ||
    setupCapability === undefined
  ) {
    throw new Error("Workspace push dependencies are incomplete.");
  }

  return {
    accountDiscovery,
    cwd: dependencies.cwd,
    deploymentAdapter,
    ...(dependencies.env === undefined ? {} : { env: dependencies.env }),
    fetch: dependencies.fetch,
    healthCheck,
    localSecretEnv,
    now: dependencies.now,
    packageRoot,
    packageVersion,
    randomToken,
    setupCapability,
  };
}

async function readWorkspaceStatus(
  input: StatusWorkspaceOperationInput,
  dependencies: RunFormlessWorkspaceOperationDependencies,
): Promise<FormlessInstanceWorkspaceStatusResult | { initialized: false }> {
  try {
    return await getFormlessInstanceWorkspaceStatus(
      {
        includeDeploymentStatus: input.includeDeploymentStatus,
        targetAlias: input.targetAlias,
        workspacePath: input.workspacePath ?? undefined,
      },
      dependencies,
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { initialized: false };
    }

    throw error;
  }
}

async function resolveWorkspaceOperationRoot(
  input: RunnableWorkspaceOperationInput,
  dependencies: Pick<RunFormlessWorkspaceOperationDependencies, "cwd">,
): Promise<string> {
  if (input.kind === "init") {
    return path.resolve(dependencies.cwd, input.workspacePath ?? ".");
  }

  if (input.kind === "status") {
    try {
      return await resolveFormlessInstanceWorkspaceRoot({
        cwd: dependencies.cwd,
        workspacePath: input.workspacePath,
      });
    } catch (error) {
      if (input.workspacePath !== undefined && input.workspacePath !== null) {
        return path.resolve(dependencies.cwd, input.workspacePath);
      }

      if (error instanceof Error && error.message.includes("Could not find formless.json")) {
        return path.resolve(dependencies.cwd);
      }

      throw error;
    }
  }

  return resolveFormlessInstanceWorkspaceRoot({
    cwd: dependencies.cwd,
    workspacePath: input.workspacePath,
  });
}

function summarizeInitResult(
  result: InitFormlessInstanceWorkspaceResult,
): WorkspaceOperationResult {
  return {
    details: {
      state: {
        apps: `${result.manifest.state.root}/apps`,
        instance: `${result.manifest.state.root}/instance.json`,
        media: result.manifest.media.root,
      },
      manifest: "formless.json",
    },
    summary: {
      fields: {
        initialized: true,
        workspace: result.manifest.name,
      },
      title: "Workspace initialized",
    },
  };
}

function summarizeStatusResult(
  result: FormlessInstanceWorkspaceStatusResult | { initialized: false },
): WorkspaceOperationResult {
  if ("initialized" in result) {
    return {
      summary: {
        fields: { initialized: false },
        title: "Workspace not initialized",
      },
    };
  }

  const runtimeExtensions = workspaceRuntimeExtensionKeys(result.manifest);

  return {
    details: {
      runtimeExtensions,
      selectedTarget: result.selectedTarget?.alias ?? null,
      targetUrl: result.selectedTarget?.url ?? null,
    },
    summary: {
      fields: {
        automationToken: result.secretState,
        initialized: true,
        remoteStatus: result.remoteStatus ? "available" : "skipped",
      },
      title: "Workspace status",
    },
  };
}

function summarizeSaveResult(result: SaveLocalFormlessWorkspaceResult): WorkspaceOperationResult {
  return {
    details: {
      appState: result.appState.map((state) => ({
        installId: state.installId,
        mediaCount: state.mediaCount,
        recordCount: state.recordCount,
      })),
      source: result.source,
    },
    summary: {
      fields: {
        appCount: result.instanceState.appCount,
        mediaCount: result.instanceState.mediaCount,
        mode: result.mode,
        recordCount: result.instanceState.recordCount,
      },
      title: result.mode === "check" ? "Workspace source current" : "Workspace saved",
    },
  };
}

function summarizeCheckResult(result: CheckLocalFormlessWorkspaceResult): WorkspaceOperationResult {
  if (result.mode === "local") {
    return {
      details: {
        target: null,
      },
      summary: {
        fields: {
          initialized: true,
          mode: "local",
          remoteSync: "skipped",
        },
        title: "Workspace check",
      },
    };
  }

  return {
    details: {
      deploymentStatus: result.remote.deploymentStatus ?? null,
      syncPlan: summarizeSyncPlan(result.remote.syncPlan),
      target: result.remote.selectedTarget.alias,
    },
    summary: {
      fields: {
        deployment:
          result.remote.deploymentStatus === undefined
            ? "unavailable"
            : result.remote.deploymentStatus.state,
        mode: "remote",
        sync: result.remote.syncPlan.status,
      },
      title: "Workspace check",
    },
  };
}

function summarizePullResult(
  result: PullFormlessInstanceWorkspaceResult,
): WorkspaceOperationResult {
  const pulledAppState = result.appState;
  const details: WorkspaceOperationDisplayObject = {
    appState: pulledAppState.map((state) => state.installId),
    domainCount: result.domains.length,
    syncPlan: summarizeSyncPlan(result.syncPlan),
    target: result.selectedTarget.alias,
  };

  if (result.mode === "dry-run") {
    details.changedStatePaths = result.replacement.changedStatePaths;
    details.prunedStatePaths = result.replacement.prunedStatePaths;
  }

  return {
    details,
    summary: {
      fields: {
        appCount: pulledAppState.length,
        mediaCount: pulledAppState.reduce((count, state) => count + state.mediaCount, 0),
        mode: result.mode,
        noop: result.noop,
        recordCount: pulledAppState.reduce((count, state) => count + state.recordCount, 0),
      },
      title: "Workspace pulled",
    },
  };
}

function summarizePushResult(
  result: PushFormlessInstanceWorkspaceResult,
): WorkspaceOperationResult {
  const details: WorkspaceOperationDisplayObject = {
    applyRestore: result.applyResult ? summarizeRestore(result.applyResult) : null,
    dryRunRestore: result.dryRun ? summarizeRestore(result.dryRun) : null,
    syncPlan: summarizeSyncPlan(result.syncPlan),
    target: result.selectedTarget.alias,
  };
  const fields: WorkspaceOperationDisplayObject = {
    applyRestoreOk: result.applyResult?.remote.ok ?? null,
    dryRunRestoreOk: result.dryRun?.remote.ok ?? null,
    mode: result.mode,
    noop: result.noop,
    sourceApps: result.source.appCount,
    sourceMedia: result.source.mediaCount,
    sourceRecords: result.source.recordCount,
    sync: result.syncPlan.status,
  };

  if (result.runtimeRebuild !== undefined) {
    details.runtimeRebuild = result.runtimeRebuild;
    fields.runtimeRebuild = result.runtimeRebuild.status;
  }

  return {
    details,
    summary: {
      fields,
      title: result.mode === "apply" ? "Workspace push applied" : "Workspace push planned",
    },
  };
}

function summarizeDeploymentRefreshResult(
  result: RefreshFormlessInstanceDeploymentObservationResult,
): WorkspaceOperationResult {
  return {
    deployment: {
      observation: {
        desiredState: result.observation.desiredState,
        observedAt: result.observation.observedAt,
        ...(result.observation.observedError === undefined
          ? {}
          : { observedError: result.observation.observedError }),
        observedStatus: result.observation.observedStatus,
        observedSummary: result.observation.observedSummary,
        resourceCount: result.observation.resourceCount,
        resourcesByKind: result.observation.resourcesByKind,
        runnerId: result.observation.runnerId,
        targetId: result.observation.targetId,
      },
      status: result.deploymentStatus,
      targetAlias: result.selectedTarget.alias,
    },
    summary: {
      fields: {
        desiredStateVersion: result.observation.desiredState.versionId,
        observedStatus: result.observation.observedStatus,
        status: result.deploymentStatus.state,
        target: result.selectedTarget.alias,
      },
      title: "Deployment observation refreshed",
    },
    steps: deploymentRefreshOperationSteps(result),
  };
}

type DeploymentOperationStepId =
  | "account-selection"
  | "credentials"
  | "desired-state-plan"
  | "health-check"
  | "observation-refresh"
  | "owner-setup"
  | "provider-reconciliation"
  | "workspace-push-writeback";

type DeploymentOperationStepInput = Omit<WorkspaceOperationStep, "id" | "label">;

const deploymentOperationStepLabels = {
  "account-selection": "Account selection",
  credentials: "Credentials",
  "desired-state-plan": "Desired-state plan",
  "health-check": "Health check",
  "observation-refresh": "Observation refresh",
  "owner-setup": "Owner setup",
  "provider-reconciliation": "Provider reconciliation",
  "workspace-push-writeback": "Workspace push/writeback",
} satisfies Record<DeploymentOperationStepId, string>;

const deploymentOperationStepOrder = [
  "credentials",
  "account-selection",
  "desired-state-plan",
  "provider-reconciliation",
  "health-check",
  "owner-setup",
  "workspace-push-writeback",
  "observation-refresh",
] satisfies DeploymentOperationStepId[];

function deploymentRefreshOperationSteps(
  result: RefreshFormlessInstanceDeploymentObservationResult,
): WorkspaceOperationStep[] {
  return deploymentOperationSteps({
    "account-selection": {
      detail: "Account selection is not required for observation refresh.",
      status: "skipped",
    },
    credentials: {
      detail: "Credentials were resolved from local workspace state.",
      status: "succeeded",
    },
    "desired-state-plan": {
      fields: {
        desiredStateVersion: result.observation.desiredState.versionId,
        target: result.selectedTarget.alias,
      },
      status: "succeeded",
    },
    "health-check": {
      detail: "Health check is not required for observation refresh.",
      status: "skipped",
    },
    "observation-refresh": {
      fields: {
        observedAt: result.observation.observedAt,
        observedStatus: result.observation.observedStatus,
        status: result.deploymentStatus.state,
      },
      status: "succeeded",
    },
    "owner-setup": {
      detail: "Owner setup is not required for observation refresh.",
      status: "skipped",
    },
    "provider-reconciliation": {
      detail: "Provider reconciliation is not required for observation refresh.",
      status: "skipped",
    },
    "workspace-push-writeback": {
      detail: "Workspace push/writeback is not required for observation refresh.",
      status: "skipped",
    },
  });
}

function failureWorkspaceOperationSteps(
  input: RunnableWorkspaceOperationInput,
  error: unknown,
): WorkspaceOperationStep[] | undefined {
  void input;
  void error;

  return undefined;
}

function failureWorkspaceOperationSummaryFields(
  message: string,
  error: unknown,
): WorkspaceOperationDisplayObject {
  void error;

  return { error: message };
}

function deploymentOperationSteps(
  steps: Record<DeploymentOperationStepId, DeploymentOperationStepInput>,
): WorkspaceOperationStep[] {
  return deploymentOperationStepOrder.map((id) => ({
    id,
    label: deploymentOperationStepLabels[id],
    ...steps[id],
  }));
}

function summarizeRestore(result: RestorePortableArchiveResult): WorkspaceOperationDisplayObject {
  const summary = result.remote.report?.summary ?? result.remote.plan?.summary;

  return {
    createdInstalls: summary?.createdInstalls ?? [],
    errorCount: result.remote.errors?.length ?? 0,
    ok: result.remote.ok,
    replacedInstalls: summary?.replacedInstalls ?? [],
  };
}

function summarizeSyncPlan(
  plan: FormlessInstanceWorkspaceSyncPlan,
): WorkspaceOperationDisplayObject {
  return {
    changedAreas: plan.changedAreas,
    changedControlPlaneRecordCount: plan.changedControlPlaneRecords.length,
    changedDomainCount: plan.changedDomainCount,
    changedMediaCount: plan.changedMedia.length,
    changedRecordCount: plan.changedRecords.length,
    changedStatePathCount: plan.changedStatePaths.length,
    extraInstallCount: plan.extraInstalls.length,
    missingInstallCount: plan.missingInstalls.length,
    source: plan.source.label,
    sourceAppCount: plan.source.appCount,
    sourceControlPlaneRecordCount: plan.source.controlPlaneRecordCount,
    sourceDomainCount: plan.source.domainCount,
    sourceFingerprint: plan.source.fingerprint,
    sourceMediaCount: plan.source.mediaCount,
    sourceRecordCount: plan.source.recordCount,
    status: plan.status,
    target: plan.target.label,
    targetAppCount: plan.target.appCount,
    targetControlPlaneRecordCount: plan.target.controlPlaneRecordCount,
    targetDomainCount: plan.target.domainCount,
    targetFingerprint: plan.target.fingerprint,
    targetMediaCount: plan.target.mediaCount,
    targetRecordCount: plan.target.recordCount,
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

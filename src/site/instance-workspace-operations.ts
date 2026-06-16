import path from "node:path";

import {
  WORKSPACE_OPERATION_CAPABILITIES,
  assertWorkspaceOperationExecutionAllowed,
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
  deployLocalFormlessWorkspace,
  DeployLocalFormlessWorkspaceStepError,
  getFormlessInstanceWorkspaceStatus,
  initLocalFormlessWorkspaceOnboarding,
  planDeployLocalFormlessWorkspace,
  pullFormlessInstanceWorkspace,
  pushFormlessInstanceWorkspace,
  refreshFormlessInstanceDeploymentObservation,
  resolveFormlessInstanceWorkspaceRoot,
  saveLocalFormlessWorkspace,
  type CheckLocalFormlessWorkspaceResult,
  type DeployLocalFormlessWorkspaceDependencies,
  type DeployFormlessInstanceWorkspaceResult,
  type FormlessInstanceWorkspaceDriftSummary,
  type FormlessInstanceWorkspaceStatusResult,
  type InitFormlessInstanceWorkspaceResult,
  type PlanDeployLocalFormlessWorkspaceResult,
  type PullFormlessInstanceWorkspaceResult,
  type PushFormlessInstanceWorkspaceResult,
  type RefreshFormlessInstanceDeploymentObservationResult,
  type SaveLocalFormlessWorkspaceResult,
} from "./instance-workspace.ts";
import type { RestorePortableArchiveResult } from "./archive-workflows.ts";

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
            allowStale: input.allowStale,
            apply: input.apply,
            replace: input.replace,
            replaceInstallSet: input.replaceInstallSet,
            targetAlias: input.targetAlias,
            workspacePath: input.workspacePath ?? undefined,
          },
          dependencies,
        ),
      );
    case "deployPlan":
      requireDeployPlanDependencies(dependencies);
      return summarizeDeployPlanResult(
        await planDeployLocalFormlessWorkspace(
          {
            allowRemoteDrift: true,
            migrationPolicy: input.migrationPolicy,
            targetAlias: input.targetAlias,
            workspacePath: input.workspacePath ?? undefined,
          },
          dependencies,
        ),
      );
    case "deployApply":
      requireDeployApplyDependencies(dependencies);
      return summarizeDeployApplyResult(
        await deployLocalFormlessWorkspace(
          {
            migrationPolicy: input.migrationPolicy,
            targetAlias: input.targetAlias,
            workspacePath: input.workspacePath ?? undefined,
          },
          dependencies,
        ),
      );
  }
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

  return {
    details: {
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
          remoteDrift: "skipped",
        },
        title: "Workspace check",
      },
    };
  }

  return {
    details: {
      deploymentStatus: result.remote.deploymentStatus ?? null,
      drift: summarizeDrift(result.remote.drift),
      target: result.remote.selectedTarget.alias,
    },
    summary: {
      fields: {
        deployment:
          result.remote.deploymentStatus === undefined
            ? "unavailable"
            : result.remote.deploymentStatus.state,
        drift: result.remote.drift.status,
        mode: "remote",
      },
      title: "Workspace check",
    },
  };
}

function summarizePullResult(
  result: PullFormlessInstanceWorkspaceResult,
): WorkspaceOperationResult {
  const pulledAppState = result.appState;

  return {
    details: {
      appState: pulledAppState.map((state) => state.installId),
      domainCount: result.domains.length,
      target: result.selectedTarget.alias,
    },
    summary: {
      fields: {
        appCount: pulledAppState.length,
        mediaCount: pulledAppState.reduce((count, state) => count + state.mediaCount, 0),
        recordCount: pulledAppState.reduce((count, state) => count + state.recordCount, 0),
      },
      title: "Workspace pulled",
    },
  };
}

function summarizePushResult(
  result: PushFormlessInstanceWorkspaceResult,
): WorkspaceOperationResult {
  return {
    details: {
      applyRestore: result.applyResult ? summarizeRestore(result.applyResult) : null,
      drift: summarizeDrift(result.drift),
      dryRunRestore: summarizeRestore(result.dryRun),
      target: result.selectedTarget.alias,
    },
    summary: {
      fields: {
        applyRestoreOk: result.applyResult?.remote.ok ?? null,
        drift: result.drift.status,
        dryRunRestoreOk: result.dryRun.remote.ok,
        mode: result.mode,
        sourceApps: result.source.appCount,
        sourceMedia: result.source.mediaCount,
        sourceRecords: result.source.recordCount,
      },
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

function summarizeDeployPlanResult(
  result: PlanDeployLocalFormlessWorkspaceResult,
): WorkspaceOperationResult {
  return {
    deployment: {
      builtInResources: deploymentBuiltInResourceSummary("planned"),
      cleanup: notRunDeploymentCleanupSummary(),
      desiredState: {
        logicalIds: result.desiredState.logicalIds,
        resourceCount: result.desiredState.resourceCount,
        resourcesByKind: result.desiredState.resourcesByKind,
        routeTargetCount: result.desiredState.routeTargetCount,
        sourceFingerprint: result.desiredState.sourceFingerprint,
        targetId: result.desiredState.targetId,
      },
      drift:
        result.preflight === undefined
          ? { status: "not-checked" }
          : summarizeDrift(result.preflight.drift),
      evidence: emptyDeploymentEvidenceSummary(),
      expectedUrl: result.plan.expectedUrl.url,
      migrationPolicy: result.plan.migrationPolicy,
      plan: {
        affectedLogicalIds: result.desiredState.logicalIds,
        changes: {
          create: result.desiredState.resourceCount,
          delete: 0,
          noChange: 0,
          update: 0,
        },
        resourceCount: result.desiredState.resourceCount,
        resourcesByKind: result.desiredState.resourcesByKind,
        routeTargetCount: result.desiredState.routeTargetCount,
        targetId: result.desiredState.targetId,
      },
      targetAlias: result.selectedTarget.alias,
      observation: {
        status: "not-run",
      },
      workerName: result.plan.resources.worker.name,
    },
    summary: {
      fields: {
        cleanupStatus: "not-run",
        desiredResourceCount: result.desiredState.resourceCount,
        drift: result.preflight?.drift.status ?? "not-checked",
        evidenceCount: 0,
        expectedUrl: result.plan.expectedUrl.url,
        migrationPolicy: result.plan.migrationPolicy,
        resourcesByKind: result.desiredState.resourcesByKind,
        routeTargetCount: result.desiredState.routeTargetCount,
        observationStatus: "not-run",
        turnstileWidget: "planned",
        workerName: result.plan.resources.worker.name,
      },
      title: "Deploy planned",
    },
    steps: deployPlanOperationSteps(result),
  };
}

function summarizeDeployApplyResult(
  result: DeployFormlessInstanceWorkspaceResult,
): WorkspaceOperationResult {
  const observation = result.deploymentObservation;

  return {
    deployment: {
      builtInResources: deploymentBuiltInResourceSummary("provisioned"),
      cleanup: notRunDeploymentCleanupSummary(),
      drift: result.push ? summarizeDrift(result.push.drift) : { status: "not-checked" },
      evidence: observation?.evidence ?? emptyDeploymentEvidenceSummary(),
      healthCheckVersion: result.healthCheck.version,
      migrationPolicy: result.migrationPolicy,
      observation: observation
        ? {
            desiredState: observation.desiredState,
            evidenceCount: observation.evidenceCount,
            observedAt: observation.observedAt,
            ...(observation.observedError === undefined
              ? {}
              : { observedError: observation.observedError }),
            observedStatus: observation.observedStatus,
            observedSummary: observation.observedSummary,
            resourceCount: observation.resourceCount,
            resourcesByKind: observation.resourcesByKind,
            runnerId: observation.runnerId,
            targetId: observation.targetId,
          }
        : null,
      push: result.push
        ? {
            applyRestoreOk: result.push.applyResult?.remote.ok ?? null,
            drift: result.push.drift.status,
            dryRunRestoreOk: result.push.dryRun.remote.ok,
            mode: result.push.mode,
          }
        : null,
      targetAlias: result.selectedTarget.alias,
      url: result.deployment.url,
      workerName: result.plan.resources.worker.name,
    },
    summary: {
      fields: {
        cleanupStatus: "not-run",
        desiredStateVersion: observation?.desiredState.versionId ?? null,
        drift: result.push?.drift.status ?? "not-checked",
        evidenceCount: observation?.evidenceCount ?? 0,
        healthCheckVersion: result.healthCheck.version,
        migrationPolicy: result.migrationPolicy,
        observationStatus: observation?.observedStatus ?? "not-run",
        resourcesByKind: observation?.resourcesByKind ?? {},
        ...(result.ownerSetup === undefined ? {} : { ownerSetupUrl: result.ownerSetup.url }),
        turnstileWidget: "provisioned",
        url: result.deployment.url,
        workerName: result.plan.resources.worker.name,
      },
      title: "Deploy applied",
    },
    steps: deployApplyOperationSteps(result),
  };
}

type DeploymentOperationStepId =
  | "account-selection"
  | "credentials"
  | "desired-state-plan"
  | "health-check"
  | "observation-refresh"
  | "owner-setup"
  | "worker-deploy"
  | "workspace-push-writeback";

type DeploymentOperationStepInput = Omit<WorkspaceOperationStep, "id" | "label">;

const deploymentOperationStepLabels = {
  "account-selection": "Account selection",
  credentials: "Credentials",
  "desired-state-plan": "Desired-state plan",
  "health-check": "Health check",
  "observation-refresh": "Observation refresh",
  "owner-setup": "Owner setup",
  "worker-deploy": "Worker deploy",
  "workspace-push-writeback": "Workspace push/writeback",
} satisfies Record<DeploymentOperationStepId, string>;

const deploymentOperationStepOrder = [
  "credentials",
  "account-selection",
  "desired-state-plan",
  "worker-deploy",
  "health-check",
  "owner-setup",
  "workspace-push-writeback",
  "observation-refresh",
] satisfies DeploymentOperationStepId[];

function deployPlanOperationSteps(
  result: PlanDeployLocalFormlessWorkspaceResult,
): WorkspaceOperationStep[] {
  return deploymentOperationSteps({
    "account-selection": {
      fields: {
        cloudflareAccountId: result.plan.account.id,
        cloudflareAccountName: result.plan.account.name ?? null,
      },
      status: "succeeded",
    },
    credentials: {
      fields: {
        profile: result.credentialProfile ?? "default",
        source: result.credentialProfileFromConfig ? "deployment-config" : "local",
      },
      status: "succeeded",
    },
    "desired-state-plan": {
      fields: {
        expectedUrl: result.plan.expectedUrl.url,
        resourceCount: result.desiredState.resourceCount,
        routeTargetCount: result.desiredState.routeTargetCount,
        targetId: result.desiredState.targetId,
        workerName: result.plan.resources.worker.name,
      },
      status: "succeeded",
    },
    "health-check": {
      detail: "Health check runs during deploy apply.",
      status: "skipped",
    },
    "observation-refresh": {
      detail: "Observation refresh runs after deploy apply.",
      status: "skipped",
    },
    "owner-setup": {
      detail: "Owner setup runs during first deploy apply.",
      status: "skipped",
    },
    "worker-deploy": {
      detail: "Worker deploy runs during deploy apply.",
      status: "skipped",
    },
    "workspace-push-writeback": {
      detail: "Workspace push/writeback runs during deploy apply.",
      status: "skipped",
    },
  });
}

function deployApplyOperationSteps(
  result: DeployFormlessInstanceWorkspaceResult,
): WorkspaceOperationStep[] {
  return deploymentOperationSteps({
    "account-selection": {
      fields: {
        cloudflareAccountId: result.plan.account.id,
        cloudflareAccountName: result.plan.account.name ?? null,
      },
      status: "succeeded",
    },
    credentials: {
      fields: {
        source: "local workspace",
      },
      status: "succeeded",
    },
    "desired-state-plan": {
      fields: {
        expectedUrl: result.plan.expectedUrl.url,
        migrationPolicy: result.migrationPolicy,
        target: result.selectedTarget.alias,
        workerName: result.plan.resources.worker.name,
      },
      status: "succeeded",
    },
    "health-check": {
      fields: {
        expectedUrl: result.plan.expectedUrl.url,
        metadataUrl: result.healthCheck.metadataUrl,
        version: result.healthCheck.version,
      },
      status: "succeeded",
    },
    "observation-refresh": result.deploymentObservation
      ? {
          fields: {
            observedAt: result.deploymentObservation.observedAt,
            observedStatus: result.deploymentObservation.observedStatus,
            runnerId: result.deploymentObservation.runnerId,
          },
          status: "succeeded",
        }
      : {
          detail: "No deployment observation was persisted.",
          status: "skipped",
        },
    "owner-setup": result.ownerSetup
      ? {
          fields: { ownerSetupUrl: result.ownerSetup.url },
          status: "succeeded",
        }
      : {
          detail: "Existing owner setup reused.",
          status: "skipped",
        },
    "worker-deploy": {
      fields: {
        evidenceCount: result.deployment.resourceEvidence?.length ?? 0,
        url: result.deployment.url,
        workerName: result.plan.resources.worker.name,
      },
      status: "succeeded",
    },
    "workspace-push-writeback": result.push
      ? {
          fields: {
            drift: result.push.drift.status,
            mode: result.push.mode,
            target: result.selectedTarget.alias,
          },
          status: "succeeded",
        }
      : {
          detail: "Workspace push/writeback was not required.",
          status: "skipped",
        },
  });
}

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
    "worker-deploy": {
      detail: "Worker deploy is not required for observation refresh.",
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
  if (input.kind !== "deployApply" || !(error instanceof DeployLocalFormlessWorkspaceStepError)) {
    return undefined;
  }

  return deploymentOperationSteps({
    "account-selection": { status: "succeeded" },
    credentials: { status: "succeeded" },
    "desired-state-plan": { status: "succeeded" },
    "health-check": {
      error: error.message,
      fields: {
        ...error.evidence,
        retryGuidance: error.retryGuidance,
      },
      status: "failed",
    },
    "observation-refresh": {
      detail: "Skipped because deploy apply failed.",
      status: "skipped",
    },
    "owner-setup": {
      detail: "Skipped because health check failed.",
      status: "skipped",
    },
    "worker-deploy": { status: "succeeded" },
    "workspace-push-writeback": {
      detail: "Skipped because health check failed.",
      status: "skipped",
    },
  });
}

function failureWorkspaceOperationSummaryFields(
  message: string,
  error: unknown,
): WorkspaceOperationDisplayObject {
  if (!(error instanceof DeployLocalFormlessWorkspaceStepError)) {
    return { error: message };
  }

  return {
    currentStep: error.stepLabel,
    error: message,
    expectedUrl: error.expectedUrl,
    retryGuidance: error.retryGuidance,
  };
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

function emptyDeploymentEvidenceSummary(): WorkspaceOperationDisplayObject {
  return {
    actionsByKind: {},
    count: 0,
    logicalIds: [],
    resourcesByKind: {},
  };
}

function notRunDeploymentCleanupSummary(): WorkspaceOperationDisplayObject {
  return {
    affectedLogicalIds: [],
    status: "not-run",
  };
}

function deploymentBuiltInResourceSummary(status: "planned" | "provisioned") {
  return {
    turnstileWidget: status,
  };
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

function summarizeDrift(
  drift: FormlessInstanceWorkspaceDriftSummary,
): WorkspaceOperationDisplayObject {
  return {
    changedStatePathCount: drift.changedStatePaths.length,
    changedControlPlaneRecordCount: drift.changedControlPlaneRecords.length,
    changedDomainCount: drift.domainDesiredDrift.length,
    changedMediaCount: drift.changedMedia.length,
    changedRecordCount: drift.changedRecords.length,
    extraInstallCount: drift.extraInstalls.length,
    missingInstallCount: drift.missingInstalls.length,
    status: drift.status,
  };
}

function requireDeployPlanDependencies(
  dependencies: RunFormlessWorkspaceOperationDependencies,
): asserts dependencies is RunFormlessWorkspaceOperationDependencies &
  Pick<DeployLocalFormlessWorkspaceDependencies, "accountDiscovery" | "packageVersion"> {
  if (!dependencies.accountDiscovery || !dependencies.packageVersion) {
    throw new Error("Workspace deploy plan operation requires deployment planning dependencies.");
  }
}

function requireDeployApplyDependencies(
  dependencies: RunFormlessWorkspaceOperationDependencies,
): asserts dependencies is RunFormlessWorkspaceOperationDependencies &
  DeployLocalFormlessWorkspaceDependencies {
  if (
    !dependencies.accountDiscovery ||
    !dependencies.deploymentAdapter ||
    !dependencies.healthCheck ||
    !dependencies.localSecretEnv ||
    !dependencies.packageRoot ||
    !dependencies.packageVersion ||
    !dependencies.randomToken ||
    !dependencies.setupCapability
  ) {
    throw new Error("Workspace deploy apply operation requires deployment apply dependencies.");
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

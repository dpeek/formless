import path from "node:path";

import {
  workspaceOperationInputDisplay,
  type RunnableWorkspaceOperationInput,
  type StatusWorkspaceOperationInput,
  type WorkspaceOperationActor,
  type WorkspaceOperationDisplayObject,
  type WorkspaceOperationResult,
  type WorkspaceOperationState,
} from "@dpeek/formless-workspace";
import {
  createWorkspaceOperationState,
  updateWorkspaceOperationState,
} from "@dpeek/formless-workspace/node";

import {
  checkLocalFormlessWorkspace,
  deployLocalFormlessWorkspace,
  getFormlessInstanceWorkspaceStatus,
  initLocalFormlessWorkspaceOnboarding,
  planDeployLocalFormlessWorkspace,
  pullFormlessInstanceWorkspace,
  pushFormlessInstanceWorkspace,
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
  options: { actor?: WorkspaceOperationActor } = {},
): Promise<WorkspaceOperationState> {
  const workspaceRoot = await resolveWorkspaceOperationRoot(input, dependencies);
  let state = await createWorkspaceOperationState({
    actor: options.actor,
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
      status: "succeeded",
      summary: result.summary,
      workspaceRoot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return updateWorkspaceOperationState(state.id, {
      errors: [{ message }],
      logs: [{ at: dependencies.now(), level: "error", message }],
      status: "failed",
      summary: {
        fields: { error: message },
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
      archives: {
        apps: result.manifest.archives.apps,
        records: result.manifest.source.records,
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
      appArchives: result.appArchives.map((archive) => ({
        installId: archive.installId,
        mediaCount: archive.mediaCount,
        recordCount: archive.recordCount,
      })),
      source: result.source,
    },
    summary: {
      fields: {
        appCount: result.instanceArchive.appCount,
        mediaCount: result.instanceArchive.mediaCount,
        mode: result.mode,
        recordCount: result.instanceArchive.recordCount,
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
      drift: summarizeDrift(result.remote.drift),
      target: result.remote.selectedTarget.alias,
    },
    summary: {
      fields: {
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
  return {
    details: {
      appArchives: result.appArchives.map((archive) => archive.installId),
      domainCount: result.domains.length,
      target: result.selectedTarget.alias,
    },
    summary: {
      fields: {
        appCount: result.instanceArchive.appCount,
        mediaCount: result.instanceArchive.mediaCount,
        recordCount: result.instanceArchive.recordCount,
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

function summarizeDeployPlanResult(
  result: PlanDeployLocalFormlessWorkspaceResult,
): WorkspaceOperationResult {
  return {
    deployment: {
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
      writeback: {
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
        routeTargetCount: result.desiredState.routeTargetCount,
        writebackStatus: "not-run",
        workerName: result.plan.resources.worker.name,
      },
      title: "Deploy planned",
    },
  };
}

function summarizeDeployApplyResult(
  result: DeployFormlessInstanceWorkspaceResult,
): WorkspaceOperationResult {
  const writeback = result.deploymentWriteback;

  return {
    deployment: {
      attempt: writeback?.attempt ?? null,
      cleanup: notRunDeploymentCleanupSummary(),
      drift: result.push ? summarizeDrift(result.push.drift) : { status: "not-checked" },
      evidence: writeback?.evidence ?? emptyDeploymentEvidenceSummary(),
      healthCheckVersion: result.healthCheck.version,
      migrationPolicy: result.migrationPolicy,
      plan: writeback?.plan ?? null,
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
      writeback: writeback
        ? {
            attemptId: writeback.attemptId,
            desiredState: writeback.desiredState,
            evidenceCount: writeback.evidenceCount,
            planRecordedAt: writeback.writeback.planRecordedAt,
            resourceCount: writeback.resourceCount,
            resourcesByKind: writeback.resourcesByKind,
            runnerId: writeback.runnerId,
            status: writeback.status,
            successCompletedAt: writeback.writeback.successCompletedAt,
            targetId: writeback.targetId,
          }
        : null,
      workerName: result.plan.resources.worker.name,
    },
    summary: {
      fields: {
        attemptId: writeback?.attemptId ?? null,
        cleanupStatus: "not-run",
        desiredStateVersion: writeback?.desiredState.versionId ?? null,
        drift: result.push?.drift.status ?? "not-checked",
        evidenceCount: writeback?.evidenceCount ?? 0,
        healthCheckVersion: result.healthCheck.version,
        migrationPolicy: result.migrationPolicy,
        url: result.deployment.url,
        writebackStatus: writeback?.status ?? "not-run",
        workerName: result.plan.resources.worker.name,
      },
      title: "Deploy applied",
    },
  };
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

function summarizeRestore(result: RestorePortableArchiveResult): WorkspaceOperationDisplayObject {
  const summary = result.remote.report?.summary ?? result.remote.plan?.summary;

  return {
    archiveNormalizationEvidenceCount: result.archiveNormalizationEvidence.length,
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
    changedArchivePathCount: drift.changedArchivePaths.length,
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

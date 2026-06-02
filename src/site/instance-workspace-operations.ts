import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

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
import type { FormlessInstanceWorkspaceMigrationPolicy } from "./instance-workspace-config.ts";
import { ensureFormlessInstanceWorkspaceSecretStateIgnored } from "./instance-workspace-secrets.ts";
import type { RestorePortableArchiveResult } from "./archive-workflows.ts";

export const FORMLESS_WORKSPACE_OPERATION_STATE_FILE_KIND = "formless.workspaceOperation";
export const FORMLESS_WORKSPACE_OPERATION_STATE_FILE_VERSION = 1;
export const FORMLESS_WORKSPACE_OPERATION_STATE_ROOT = ".formless/operations";

export type FormlessWorkspaceOperationKind =
  | "check"
  | "credentialSetup"
  | "deployApply"
  | "deployPlan"
  | "init"
  | "pull"
  | "push"
  | "save"
  | "status";

export type FormlessWorkspaceOperationActor = "automation" | "browser" | "cli" | "system";
export type FormlessWorkspaceOperationStatus = "failed" | "queued" | "running" | "succeeded";

export type FormlessWorkspaceOperationDisplayValue =
  | boolean
  | null
  | number
  | string
  | FormlessWorkspaceOperationDisplayValue[]
  | { [key: string]: FormlessWorkspaceOperationDisplayValue };

export type FormlessWorkspaceOperationDisplayObject = {
  [key: string]: FormlessWorkspaceOperationDisplayValue;
};

export type FormlessWorkspaceOperationSummary = {
  fields: FormlessWorkspaceOperationDisplayObject;
  title: string;
};

export type FormlessWorkspaceOperationLog = {
  at: string;
  id: string;
  level: "error" | "info" | "warning";
  message: string;
};

export type FormlessWorkspaceOperationError = {
  at: string;
  message: string;
};

export type FormlessWorkspaceOperationExternalAuthorizationEvent = {
  at: string;
  id: string;
  profileLabel: string;
  provider: "alchemy" | "cloudflare";
  status: "waiting";
  type: "externalAuthorizationUrl";
  url: string;
};

export type FormlessWorkspaceOperationEvent = FormlessWorkspaceOperationExternalAuthorizationEvent;

export type FormlessWorkspaceOperationResult = {
  deployment?: FormlessWorkspaceOperationDisplayObject;
  details?: FormlessWorkspaceOperationDisplayObject;
  summary: FormlessWorkspaceOperationSummary;
};

export type FormlessWorkspaceOperationState = {
  actor: FormlessWorkspaceOperationActor;
  completedAt?: string;
  createdAt: string;
  errors: FormlessWorkspaceOperationError[];
  events: FormlessWorkspaceOperationEvent[];
  id: string;
  input: FormlessWorkspaceOperationDisplayObject;
  kind: typeof FORMLESS_WORKSPACE_OPERATION_STATE_FILE_KIND;
  logs: FormlessWorkspaceOperationLog[];
  operation: FormlessWorkspaceOperationKind;
  result?: FormlessWorkspaceOperationResult;
  startedAt?: string;
  status: FormlessWorkspaceOperationStatus;
  summary: FormlessWorkspaceOperationSummary;
  updatedAt: string;
  version: typeof FORMLESS_WORKSPACE_OPERATION_STATE_FILE_VERSION;
  workspace: {
    label: string;
  };
};

export type InitFormlessWorkspaceOperationInput = {
  kind: "init";
  name?: string | null;
  workspacePath?: string | null;
};

export type StatusFormlessWorkspaceOperationInput = {
  includeDeploymentStatus?: boolean;
  kind: "status";
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type SaveFormlessWorkspaceOperationInput = {
  check?: boolean;
  kind: "save";
  source?: string | null;
  workspacePath?: string | null;
};

export type CheckFormlessWorkspaceOperationInput = {
  kind: "check";
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type PullFormlessWorkspaceOperationInput = {
  kind: "pull";
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type PushFormlessWorkspaceOperationInput = {
  allowStale?: boolean;
  apply?: boolean;
  kind: "push";
  replace?: boolean;
  replaceInstallSet?: boolean;
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type DeployPlanFormlessWorkspaceOperationInput = {
  kind: "deployPlan";
  migrationPolicy?: FormlessInstanceWorkspaceMigrationPolicy | null;
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type DeployApplyFormlessWorkspaceOperationInput = {
  kind: "deployApply";
  migrationPolicy?: FormlessInstanceWorkspaceMigrationPolicy | null;
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type FormlessWorkspaceOperationInput =
  | CheckFormlessWorkspaceOperationInput
  | DeployApplyFormlessWorkspaceOperationInput
  | DeployPlanFormlessWorkspaceOperationInput
  | InitFormlessWorkspaceOperationInput
  | PullFormlessWorkspaceOperationInput
  | PushFormlessWorkspaceOperationInput
  | SaveFormlessWorkspaceOperationInput
  | StatusFormlessWorkspaceOperationInput;

export type RunFormlessWorkspaceOperationDependencies = Pick<
  DeployLocalFormlessWorkspaceDependencies,
  "cwd" | "fetch" | "now"
> &
  Partial<Omit<DeployLocalFormlessWorkspaceDependencies, "cwd" | "fetch" | "now">> & {
    createOperationId?: () => string;
  };

type CreateFormlessWorkspaceOperationStateInput = {
  actor?: FormlessWorkspaceOperationActor;
  id?: string;
  input: FormlessWorkspaceOperationDisplayObject;
  kind: FormlessWorkspaceOperationKind;
  now: () => string;
  workspaceRoot: string;
};

type UpdateFormlessWorkspaceOperationStateInput = {
  errors?: readonly { message: string }[];
  events?: readonly Omit<FormlessWorkspaceOperationEvent, "id">[];
  logs?: readonly Omit<FormlessWorkspaceOperationLog, "id">[];
  result?: FormlessWorkspaceOperationResult;
  status?: FormlessWorkspaceOperationStatus;
  summary?: FormlessWorkspaceOperationSummary;
  workspaceRoot: string;
};

const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;

export async function runFormlessWorkspaceOperation(
  input: FormlessWorkspaceOperationInput,
  dependencies: RunFormlessWorkspaceOperationDependencies,
  options: { actor?: FormlessWorkspaceOperationActor } = {},
): Promise<FormlessWorkspaceOperationState> {
  const workspaceRoot = await resolveWorkspaceOperationRoot(input, dependencies);
  let state = await createFormlessWorkspaceOperationState({
    actor: options.actor,
    id: dependencies.createOperationId?.(),
    input: semanticOperationInput(input),
    kind: input.kind,
    now: dependencies.now,
    workspaceRoot,
  });

  state = await updateFormlessWorkspaceOperationState(state.id, {
    logs: [{ at: dependencies.now(), level: "info", message: `${input.kind} started.` }],
    status: "running",
    workspaceRoot,
  });

  try {
    const result = await runWorkspaceOperationBody(input, dependencies);

    return updateFormlessWorkspaceOperationState(state.id, {
      logs: [{ at: dependencies.now(), level: "info", message: `${input.kind} completed.` }],
      result,
      status: "succeeded",
      summary: result.summary,
      workspaceRoot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return updateFormlessWorkspaceOperationState(state.id, {
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

export function formlessWorkspaceOperationStateRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, FORMLESS_WORKSPACE_OPERATION_STATE_ROOT);
}

export function formlessWorkspaceOperationStatePath(
  workspaceRoot: string,
  operationId: string,
): string {
  return path.join(
    formlessWorkspaceOperationStateRoot(workspaceRoot),
    `${operationStateFileName(operationId)}.json`,
  );
}

export async function createFormlessWorkspaceOperationState(
  input: CreateFormlessWorkspaceOperationStateInput,
): Promise<FormlessWorkspaceOperationState> {
  const now = input.now();
  const id = input.id ?? `op_${randomUUID()}`;
  const state: FormlessWorkspaceOperationState = {
    actor: input.actor ?? "system",
    createdAt: now,
    errors: [],
    events: [],
    id,
    input: redactDisplayObject(input.input, input.workspaceRoot),
    kind: FORMLESS_WORKSPACE_OPERATION_STATE_FILE_KIND,
    logs: [],
    operation: input.kind,
    status: "queued",
    summary: {
      fields: {},
      title: "Operation queued",
    },
    updatedAt: now,
    version: FORMLESS_WORKSPACE_OPERATION_STATE_FILE_VERSION,
    workspace: {
      label: path.basename(input.workspaceRoot) || ".",
    },
  };

  await writeFormlessWorkspaceOperationState(input.workspaceRoot, state);
  return state;
}

export async function readFormlessWorkspaceOperationState(input: {
  operationId: string;
  workspaceRoot: string;
}): Promise<FormlessWorkspaceOperationState> {
  return parseFormlessWorkspaceOperationStateJson(
    await readFile(
      formlessWorkspaceOperationStatePath(input.workspaceRoot, input.operationId),
      "utf8",
    ),
  );
}

export async function listFormlessWorkspaceOperationStates(
  workspaceRoot: string,
): Promise<FormlessWorkspaceOperationState[]> {
  let entries: Array<{ isFile(): boolean; name: string }>;

  try {
    entries = await readdir(formlessWorkspaceOperationStateRoot(workspaceRoot), {
      withFileTypes: true,
    });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const states = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) =>
        readFile(path.join(formlessWorkspaceOperationStateRoot(workspaceRoot), entry.name), "utf8"),
      ),
  );

  return states
    .map(parseFormlessWorkspaceOperationStateJson)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function updateFormlessWorkspaceOperationState(
  operationId: string,
  input: UpdateFormlessWorkspaceOperationStateInput,
): Promise<FormlessWorkspaceOperationState> {
  const current = await readFormlessWorkspaceOperationState({
    operationId,
    workspaceRoot: input.workspaceRoot,
  });
  const timestamp = input.logs?.at(-1)?.at ?? current.updatedAt;
  const status = input.status ?? current.status;
  const completedAt =
    status === "failed" || status === "succeeded" ? timestamp : current.completedAt;
  const next: FormlessWorkspaceOperationState = {
    ...current,
    ...(completedAt === undefined ? {} : { completedAt }),
    errors: [
      ...current.errors,
      ...(input.errors ?? []).map((error) => ({
        at: timestamp,
        message: redactDisplayText(error.message, input.workspaceRoot),
      })),
    ],
    events: [
      ...(current.events ?? []),
      ...(input.events ?? []).map((event, index) =>
        redactOperationEvent(event, input.workspaceRoot, {
          id: `${current.id}-event-${(current.events ?? []).length + index + 1}`,
        }),
      ),
    ],
    logs: [
      ...current.logs,
      ...(input.logs ?? []).map((log, index) => ({
        at: redactDisplayText(log.at, input.workspaceRoot),
        id: `${current.id}-log-${current.logs.length + index + 1}`,
        level: log.level,
        message: redactDisplayText(log.message, input.workspaceRoot),
      })),
    ],
    ...(input.result === undefined
      ? {}
      : { result: redactOperationResult(input.result, input.workspaceRoot) }),
    startedAt:
      status === "running" && current.startedAt === undefined ? timestamp : current.startedAt,
    status,
    summary:
      input.summary === undefined
        ? current.summary
        : redactOperationSummary(input.summary, input.workspaceRoot),
    updatedAt: timestamp,
  };

  await writeFormlessWorkspaceOperationState(input.workspaceRoot, next);
  return next;
}

function parseFormlessWorkspaceOperationStateJson(
  contents: string,
): FormlessWorkspaceOperationState {
  const value = JSON.parse(contents) as Partial<FormlessWorkspaceOperationState>;

  if (
    value.kind !== FORMLESS_WORKSPACE_OPERATION_STATE_FILE_KIND ||
    value.version !== FORMLESS_WORKSPACE_OPERATION_STATE_FILE_VERSION ||
    typeof value.id !== "string" ||
    !isWorkspaceOperationKind(value.operation) ||
    !isWorkspaceOperationStatus(value.status)
  ) {
    throw new Error("Workspace operation state file is invalid.");
  }

  return value as FormlessWorkspaceOperationState;
}

async function writeFormlessWorkspaceOperationState(
  workspaceRoot: string,
  state: FormlessWorkspaceOperationState,
) {
  await mkdir(workspaceRoot, { recursive: true });
  await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);
  await mkdir(formlessWorkspaceOperationStateRoot(workspaceRoot), { recursive: true });
  await writeFile(
    formlessWorkspaceOperationStatePath(workspaceRoot, state.id),
    `${JSON.stringify(state, null, 2)}\n`,
  );
}

async function runWorkspaceOperationBody(
  input: FormlessWorkspaceOperationInput,
  dependencies: RunFormlessWorkspaceOperationDependencies,
): Promise<FormlessWorkspaceOperationResult> {
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
  input: StatusFormlessWorkspaceOperationInput,
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
  input: FormlessWorkspaceOperationInput,
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

function semanticOperationInput(
  input: FormlessWorkspaceOperationInput,
): FormlessWorkspaceOperationDisplayObject {
  switch (input.kind) {
    case "init":
      return input.name === undefined || input.name === null ? {} : { name: input.name };
    case "status":
      return {
        includeDeploymentStatus: input.includeDeploymentStatus ?? false,
        ...(input.targetAlias === undefined || input.targetAlias === null
          ? {}
          : { targetAlias: input.targetAlias }),
      };
    case "save":
      return {
        check: input.check ?? false,
        ...(input.source === undefined || input.source === null ? {} : { source: input.source }),
      };
    case "check":
    case "pull":
      return input.targetAlias === undefined || input.targetAlias === null
        ? {}
        : { targetAlias: input.targetAlias };
    case "push":
      return {
        allowStale: input.allowStale ?? false,
        apply: input.apply ?? false,
        replace: input.replace ?? false,
        replaceInstallSet: input.replaceInstallSet ?? false,
        ...(input.targetAlias === undefined || input.targetAlias === null
          ? {}
          : { targetAlias: input.targetAlias }),
      };
    case "deployPlan":
    case "deployApply":
      return {
        ...(input.migrationPolicy === undefined || input.migrationPolicy === null
          ? {}
          : { migrationPolicy: input.migrationPolicy }),
        ...(input.targetAlias === undefined || input.targetAlias === null
          ? {}
          : { targetAlias: input.targetAlias }),
      };
  }
}

function summarizeInitResult(
  result: InitFormlessInstanceWorkspaceResult,
): FormlessWorkspaceOperationResult {
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
): FormlessWorkspaceOperationResult {
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
      defaultTarget: result.manifest.defaultTarget ?? null,
      selectedTarget: result.selectedTarget?.alias ?? null,
      targetCount: result.manifest.targets.length,
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

function summarizeSaveResult(
  result: SaveLocalFormlessWorkspaceResult,
): FormlessWorkspaceOperationResult {
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

function summarizeCheckResult(
  result: CheckLocalFormlessWorkspaceResult,
): FormlessWorkspaceOperationResult {
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
): FormlessWorkspaceOperationResult {
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
): FormlessWorkspaceOperationResult {
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
): FormlessWorkspaceOperationResult {
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
): FormlessWorkspaceOperationResult {
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

function emptyDeploymentEvidenceSummary(): FormlessWorkspaceOperationDisplayObject {
  return {
    actionsByKind: {},
    count: 0,
    logicalIds: [],
    resourcesByKind: {},
  };
}

function notRunDeploymentCleanupSummary(): FormlessWorkspaceOperationDisplayObject {
  return {
    affectedLogicalIds: [],
    status: "not-run",
  };
}

function summarizeRestore(
  result: RestorePortableArchiveResult,
): FormlessWorkspaceOperationDisplayObject {
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
): FormlessWorkspaceOperationDisplayObject {
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

function operationStateFileName(operationId: string): string {
  if (!operationIdPattern.test(operationId)) {
    throw new Error("Workspace operation id is invalid.");
  }

  return operationId;
}

function redactOperationResult(
  result: FormlessWorkspaceOperationResult,
  workspaceRoot: string,
): FormlessWorkspaceOperationResult {
  return {
    ...(result.deployment === undefined
      ? {}
      : { deployment: redactDisplayObject(result.deployment, workspaceRoot) }),
    ...(result.details === undefined
      ? {}
      : { details: redactDisplayObject(result.details, workspaceRoot) }),
    summary: redactOperationSummary(result.summary, workspaceRoot),
  };
}

function redactOperationSummary(
  summary: FormlessWorkspaceOperationSummary,
  workspaceRoot: string,
): FormlessWorkspaceOperationSummary {
  return {
    fields: redactDisplayObject(summary.fields, workspaceRoot),
    title: redactDisplayText(summary.title, workspaceRoot),
  };
}

function redactOperationEvent(
  event: Omit<FormlessWorkspaceOperationEvent, "id">,
  workspaceRoot: string,
  options: { id: string },
): FormlessWorkspaceOperationEvent {
  switch (event.type) {
    case "externalAuthorizationUrl":
      return {
        at: redactDisplayText(event.at, workspaceRoot),
        id: options.id,
        profileLabel: redactDisplayText(event.profileLabel, workspaceRoot),
        provider: event.provider,
        status: "waiting",
        type: "externalAuthorizationUrl",
        url: allowlistedAuthorizationUrl(event.url, event.provider),
      };
  }
}

function redactDisplayObject(
  value: FormlessWorkspaceOperationDisplayObject,
  workspaceRoot: string,
): FormlessWorkspaceOperationDisplayObject {
  return redactDisplayValue(value, workspaceRoot) as FormlessWorkspaceOperationDisplayObject;
}

function redactDisplayValue(
  value: FormlessWorkspaceOperationDisplayValue,
  workspaceRoot: string,
): FormlessWorkspaceOperationDisplayValue {
  if (typeof value === "string") {
    return redactDisplayText(value, workspaceRoot);
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactDisplayValue(item, workspaceRoot));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      isForbiddenDisplayKey(key) ? "[redacted]" : redactDisplayValue(child, workspaceRoot),
    ]),
  ) as FormlessWorkspaceOperationDisplayObject;
}

function redactDisplayText(value: string, workspaceRoot: string): string {
  return value
    .replaceAll(workspaceRoot, "<workspace>")
    .replace(
      /([A-Z0-9_]*(?:TOKEN|PASSWORD|SECRET|API_KEY|APIKEY)[A-Z0-9_]*=)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1[redacted]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/lease:[A-Za-z0-9._:-]+/gi, "[redacted]")
    .replace(/CF_API_TOKEN[_A-Za-z0-9-]*/g, "[redacted]")
    .replace(/(^|[\s(])\/(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+/g, "$1<path>");
}

function allowlistedAuthorizationUrl(url: string, provider: "alchemy" | "cloudflare"): string {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Workspace operation authorization URL is invalid.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Workspace operation authorization URL must use HTTPS.");
  }

  for (const key of parsed.searchParams.keys()) {
    const normalized = key.toLowerCase().replaceAll(/[-_]/g, "");

    if (
      normalized.includes("token") ||
      normalized.includes("secret") ||
      normalized.includes("password") ||
      normalized.includes("apikey")
    ) {
      throw new Error("Workspace operation authorization URL includes secret-looking parameters.");
    }
  }

  const hostname = parsed.hostname.toLowerCase();
  const authorizationPath = /(?:authorize|authorization|oauth|login)/i.test(parsed.pathname);

  if (provider === "cloudflare") {
    if (hostname === "dash.cloudflare.com" && authorizationPath) {
      return parsed.toString();
    }
  } else if (
    (hostname === "alchemy.com" ||
      hostname.endsWith(".alchemy.com") ||
      hostname === "alchemy.run" ||
      hostname.endsWith(".alchemy.run")) &&
    authorizationPath
  ) {
    return parsed.toString();
  }

  throw new Error("Workspace operation authorization URL is not allowlisted.");
}

function isForbiddenDisplayKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll(/[-_]/g, "");

  return (
    normalized === "secret" ||
    normalized === "secrets" ||
    normalized.endsWith("token") ||
    normalized.endsWith("password") ||
    normalized.includes("apikey") ||
    normalized.includes("credential") ||
    normalized === "leasetoken" ||
    normalized.includes("providerstate") ||
    normalized.startsWith("raw")
  );
}

function isWorkspaceOperationKind(value: unknown): value is FormlessWorkspaceOperationKind {
  return (
    value === "check" ||
    value === "credentialSetup" ||
    value === "deployApply" ||
    value === "deployPlan" ||
    value === "init" ||
    value === "pull" ||
    value === "push" ||
    value === "save" ||
    value === "status"
  );
}

function isWorkspaceOperationStatus(value: unknown): value is FormlessWorkspaceOperationStatus {
  return value === "failed" || value === "queued" || value === "running" || value === "succeeded";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

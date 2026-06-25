import packageJson from "../../package.json";
import path from "node:path";
import {
  createWorkspaceGatewayLocalProxyMiddleware,
  type WorkspaceGatewayLocalProxyDependencies,
  type WorkspaceGatewaySidecarEnv,
  type WorkspaceGatewaySidecarOperationHandlers,
  WORKSPACE_GATEWAY_ROOT_ENV,
} from "@dpeek/formless-gateway/sidecar";
import type {
  WorkspaceGatewayOperation,
  WorkspaceGatewayStartInput,
} from "@dpeek/formless-gateway";
import { isWorkspaceGatewayOperationKind } from "@dpeek/formless-gateway";
import {
  DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
  WORKSPACE_OPERATION_CAPABILITIES,
  initialWorkspaceAutoSaveState,
  nextWorkspaceAutoSaveEnqueuedState,
  nextWorkspaceAutoSaveFailedState,
  nextWorkspaceAutoSaveSavedState,
  nextWorkspaceAutoSaveSavingState,
  nextWorkspaceAutoSaveSuppressedState,
  type WorkspaceAutoSaveEnqueueInput,
  type WorkspaceAutoSaveState,
  type WorkspaceAutoSaveSuppressionReason,
  type WorkspaceAutoSaveWriteSource,
  type WorkspaceOperationInput,
  type WorkspaceOperationRequiredCapability,
  type WorkspaceOperationState,
} from "@dpeek/formless-workspace";
import {
  readInstanceWorkspaceAutoSaveState,
  readWorkspaceOperationState,
  writeInstanceWorkspaceAutoSaveState,
} from "@dpeek/formless-workspace/node";

import { resolveRuntimeProfileKind } from "../shared/runtime-topology.ts";
import { validateOwnerSessionCookie } from "../worker/owner-session.ts";
import { alchemyFormlessInstanceAccountDiscoveryAdapter } from "./instance-onboarding.ts";
import {
  runFormlessWorkspaceOperation,
  type RunFormlessWorkspaceOperationDependencies,
  type WorkspaceCredentialSetupOperationAdapterInput,
  type WorkspaceCredentialSetupOperationAdapterResult,
} from "./instance-workspace-operations.ts";

export type WorkspaceGatewayRuntimeEnv = WorkspaceGatewaySidecarEnv & {
  FORMLESS_OWNER_SESSION_SECRET?: string;
  FORMLESS_RUNTIME_PROFILE?: string;
};

export type WorkspaceGatewayCredentialSetupAdapterInput =
  WorkspaceCredentialSetupOperationAdapterInput;

export type WorkspaceGatewayCredentialSetupAdapterResult =
  WorkspaceCredentialSetupOperationAdapterResult;

export type WorkspaceGatewayRuntimeDependencies = RunFormlessWorkspaceOperationDependencies & {
  autoSaveDebounceMs?: number;
  autoSaveMaxRetries?: number;
  autoSaveRetryBackoffMs?: (retryCount: number) => number;
  autoSaveScheduler?: WorkspaceAutoSaveScheduler;
  createOperationId?: () => string;
  credentialSetup?: (
    input: WorkspaceGatewayCredentialSetupAdapterInput,
  ) => Promise<WorkspaceGatewayCredentialSetupAdapterResult>;
  cwd: string;
  fetch: typeof fetch;
  now: () => string;
  operationCapabilities?: readonly WorkspaceOperationRequiredCapability[];
  proxyFetch?: typeof fetch;
  readOwnerSetupStatus?: (request: Request) => Promise<{ setupComplete: boolean }>;
};

export type StartWorkspaceGatewaySidecarDependencies = WorkspaceGatewayRuntimeDependencies & {
  createProxyToken?: () => string;
};

export type WorkspaceAutoSaveSchedulerSaveInput = {
  dirtyGeneration: number;
  storageIdentities: readonly string[];
  workspaceRoot: string;
  writeSources: readonly WorkspaceAutoSaveWriteSource[];
};

export type WorkspaceAutoSaveScheduler = {
  enqueue: (
    input: WorkspaceAutoSaveEnqueueInput & { workspaceRoot: string },
  ) => Promise<WorkspaceAutoSaveState>;
  recordSuppressed: (input: {
    reason: WorkspaceAutoSaveSuppressionReason;
    workspaceRoot: string;
  }) => Promise<WorkspaceAutoSaveState>;
  runNow: (workspaceRoot: string) => Promise<WorkspaceAutoSaveState>;
  status: (input: { workspaceRoot: string }) => Promise<WorkspaceAutoSaveState>;
};

export type WorkspaceAutoSaveSchedulerDependencies = {
  clearTimeout?: (timer: WorkspaceAutoSaveTimer) => void;
  debounceMs?: number;
  maxRetries?: number;
  now: () => string;
  retryBackoffMs?: (retryCount: number) => number;
  save: (input: WorkspaceAutoSaveSchedulerSaveInput) => Promise<void>;
  setTimeout?: (callback: () => void, delayMs: number) => WorkspaceAutoSaveTimer;
};

type WorkspaceAutoSaveTimer = unknown;

export function createWorkspaceGatewayOperationHandlers(
  dependencies: WorkspaceGatewayRuntimeDependencies,
): WorkspaceGatewaySidecarOperationHandlers {
  const autoSaveScheduler =
    dependencies.autoSaveScheduler ?? createDefaultWorkspaceAutoSaveScheduler(dependencies);

  return {
    autoSaveStatus: async ({ workspaceRoot }) => autoSaveScheduler.status({ workspaceRoot }),
    enqueueAutoSave: async ({ enqueue, workspaceRoot }) =>
      autoSaveScheduler.enqueue({ ...enqueue, workspaceRoot }),
    readOperation: async ({ operationId, workspaceRoot }) => {
      await recordAutoSaveSuppression(autoSaveScheduler, workspaceRoot, "gateway-operation-state");

      try {
        const operation = await readWorkspaceOperationState({
          operationId,
          workspaceRoot,
        });

        return workspaceGatewayOperationFromState(operation);
      } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
          return undefined;
        }

        throw error;
      }
    },
    startOperation: async ({ authorization, operationInput, workspaceRoot }) => {
      await recordAutoSaveSuppression(autoSaveScheduler, workspaceRoot, "gateway-operation-state");
      await recordWorkspaceOperationAutoSaveSuppression(
        autoSaveScheduler,
        workspaceRoot,
        operationInput,
      );

      return requireWorkspaceGatewayOperation(
        await runFormlessWorkspaceOperation(
          withWorkspaceRoot(operationInput, workspaceRoot),
          operationDependencies(dependencies, workspaceRoot),
          {
            actor: authorization.actor,
            capabilities: workspaceGatewayRuntimeCapabilities(dependencies),
          },
        ),
      );
    },
    status: async ({ authorization, workspaceRoot }) => {
      await recordAutoSaveSuppression(autoSaveScheduler, workspaceRoot, "workspace-check-status");

      return requireWorkspaceGatewayOperation(
        await runFormlessWorkspaceOperation(
          {
            includeDeploymentStatus: false,
            kind: "status",
            workspacePath: workspaceRoot,
          },
          operationDependencies(dependencies, workspaceRoot),
          {
            actor: authorization.actor,
            capabilities: workspaceGatewayRuntimeCapabilities(dependencies),
          },
        ),
      );
    },
  };
}

export function createWorkspaceAutoSaveScheduler(
  dependencies: WorkspaceAutoSaveSchedulerDependencies,
): WorkspaceAutoSaveScheduler {
  const entries = new Map<
    string,
    { running?: Promise<void>; runAfterCurrent?: boolean; timer?: WorkspaceAutoSaveTimer }
  >();
  const debounceMs = dependencies.debounceMs ?? 250;
  const maxRetries = dependencies.maxRetries ?? 2;
  const retryBackoffMs = dependencies.retryBackoffMs ?? ((retryCount: number) => retryCount * 1000);
  const setTimer =
    dependencies.setTimeout ??
    ((callback: () => void, delayMs: number): WorkspaceAutoSaveTimer =>
      setTimeout(callback, delayMs));
  const clearTimer =
    dependencies.clearTimeout ??
    ((timer: WorkspaceAutoSaveTimer) => {
      clearTimeout(timer as ReturnType<typeof setTimeout>);
    });

  const status = async (input: { workspaceRoot: string }) => readAutoSaveState(input.workspaceRoot);

  const writeState = (workspaceRoot: string, state: WorkspaceAutoSaveState) =>
    writeInstanceWorkspaceAutoSaveState({
      localStateRoot: workspaceAutoSaveLocalStateRoot(workspaceRoot),
      state,
      workspaceRoot,
    });

  const schedule = (workspaceRoot: string, delayMs: number) => {
    const entry = schedulerEntry(entries, workspaceRoot);

    if (entry.timer !== undefined) {
      clearTimer(entry.timer);
    }

    entry.timer = setTimer(() => {
      entry.timer = undefined;
      void runAutoSave(workspaceRoot).catch(() => undefined);
    }, delayMs);
  };

  const runAutoSave = async (workspaceRoot: string): Promise<void> => {
    const entry = schedulerEntry(entries, workspaceRoot);

    if (entry.running) {
      entry.runAfterCurrent = true;
      await entry.running;
      return;
    }

    const running = runAutoSaveOnce(workspaceRoot).finally(() => {
      entry.running = undefined;

      if (entry.runAfterCurrent) {
        entry.runAfterCurrent = false;
        schedule(workspaceRoot, 0);
      }
    });

    entry.running = running;
    await running;
  };

  const runAutoSaveOnce = async (workspaceRoot: string) => {
    let state = await readAutoSaveState(workspaceRoot);

    if (state.dirtyGeneration <= state.savedGeneration) {
      return;
    }

    state = nextWorkspaceAutoSaveSuppressedState(
      nextWorkspaceAutoSaveSavingState(state, dependencies),
      {
        now: dependencies.now,
        reason: "auto-save",
      },
    );
    await writeState(workspaceRoot, state);

    try {
      await dependencies.save({
        dirtyGeneration: state.inFlightGeneration ?? state.dirtyGeneration,
        storageIdentities: state.storageIdentities,
        workspaceRoot,
        writeSources: state.writeSources,
      });

      state = nextWorkspaceAutoSaveSavedState(await readAutoSaveState(workspaceRoot), dependencies);
      await writeState(workspaceRoot, state);
    } catch (error) {
      state = nextWorkspaceAutoSaveFailedState(await readAutoSaveState(workspaceRoot), {
        error,
        now: dependencies.now,
        workspaceRoot,
      });
      await writeState(workspaceRoot, state);

      if (state.retryCount <= maxRetries) {
        schedule(workspaceRoot, retryBackoffMs(state.retryCount));
      }
    }
  };

  const readAutoSaveState = async (workspaceRoot: string): Promise<WorkspaceAutoSaveState> =>
    (await readInstanceWorkspaceAutoSaveState(workspaceAutoSaveLocalStateRoot(workspaceRoot))) ??
    initialWorkspaceAutoSaveState(dependencies);

  return {
    enqueue: async (input) => {
      const state = nextWorkspaceAutoSaveEnqueuedState(
        await readAutoSaveState(input.workspaceRoot),
        {
          now: dependencies.now,
          source: input.source,
          ...(input.storageIdentity === undefined
            ? {}
            : { storageIdentity: input.storageIdentity }),
        },
      );

      await writeState(input.workspaceRoot, state);
      schedule(input.workspaceRoot, debounceMs);

      return state;
    },
    recordSuppressed: async (input) => {
      const state = nextWorkspaceAutoSaveSuppressedState(
        await readAutoSaveState(input.workspaceRoot),
        {
          now: dependencies.now,
          reason: input.reason,
        },
      );

      await writeState(input.workspaceRoot, state);

      return state;
    },
    runNow: async (workspaceRoot) => {
      await runAutoSave(workspaceRoot);

      return readAutoSaveState(workspaceRoot);
    },
    status,
  };
}

function createDefaultWorkspaceAutoSaveScheduler(
  dependencies: WorkspaceGatewayRuntimeDependencies,
): WorkspaceAutoSaveScheduler {
  return createWorkspaceAutoSaveScheduler({
    debounceMs: dependencies.autoSaveDebounceMs,
    maxRetries: dependencies.autoSaveMaxRetries,
    now: dependencies.now,
    retryBackoffMs: dependencies.autoSaveRetryBackoffMs,
    save: async ({ workspaceRoot }) => {
      const operation = await runFormlessWorkspaceOperation(
        {
          kind: "save",
          workspacePath: workspaceRoot,
        },
        operationDependencies(dependencies, workspaceRoot),
        {
          actor: "system",
          capabilities: workspaceGatewayRuntimeCapabilities(dependencies),
        },
      );

      if (operation.status === "failed") {
        throw new Error(operation.errors[0]?.message ?? "Workspace auto-save failed.");
      }
    },
  });
}

async function recordWorkspaceOperationAutoSaveSuppression(
  autoSaveScheduler: WorkspaceAutoSaveScheduler,
  workspaceRoot: string,
  operationInput: WorkspaceGatewayStartInput,
): Promise<void> {
  const reason = autoSaveSuppressionReasonForWorkspaceOperation(operationInput);

  if (reason === undefined) {
    return;
  }

  await recordAutoSaveSuppression(autoSaveScheduler, workspaceRoot, reason);
}

async function recordAutoSaveSuppression(
  autoSaveScheduler: WorkspaceAutoSaveScheduler,
  workspaceRoot: string,
  reason: WorkspaceAutoSaveSuppressionReason,
): Promise<void> {
  await autoSaveScheduler.recordSuppressed({ reason, workspaceRoot });
}

function autoSaveSuppressionReasonForWorkspaceOperation(
  operationInput: WorkspaceGatewayStartInput,
): WorkspaceAutoSaveSuppressionReason | undefined {
  switch (operationInput.kind) {
    case "check":
    case "status":
      return "workspace-check-status";
    case "push":
      return "push-deploy-remote-apply";
    case "pull":
      return "workspace-pull";
    case "save":
      return operationInput.check ? "workspace-check-status" : "manual-save";
    case "credentialSetup":
      return undefined;
  }
}

function schedulerEntry(
  entries: Map<
    string,
    { running?: Promise<void>; runAfterCurrent?: boolean; timer?: WorkspaceAutoSaveTimer }
  >,
  workspaceRoot: string,
) {
  let entry = entries.get(workspaceRoot);

  if (!entry) {
    entry = {};
    entries.set(workspaceRoot, entry);
  }

  return entry;
}

function workspaceAutoSaveLocalStateRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT);
}

export function createWorkspaceGatewayProxyDependencies(
  env: WorkspaceGatewayRuntimeEnv,
  dependencies: WorkspaceGatewayRuntimeDependencies,
): WorkspaceGatewayLocalProxyDependencies {
  return {
    capabilities: workspaceGatewayRuntimeCapabilities(dependencies),
    proxyFetch: dependencies.proxyFetch ?? dependencies.fetch,
    readOwnerSetupStatus:
      dependencies.readOwnerSetupStatus ??
      (async (request) => {
        const response = await dependencies.fetch(new URL("/api/formless/setup", request.url), {
          headers: { accept: "application/json" },
        });

        if (!response.ok) {
          return { setupComplete: false };
        }

        const body = (await response.json()) as Partial<{ setupComplete: boolean }>;

        return { setupComplete: body.setupComplete === true };
      }),
    routeAvailable: (request) => workspaceGatewayRouteAvailable(request, env),
    validateOwnerSession: (request) => validateOwnerSessionCookie(request, env),
  };
}

export function createWorkspaceGatewayRuntimeMiddleware(
  env: NodeJS.ProcessEnv = process.env,
  dependencyOverrides: Partial<WorkspaceGatewayRuntimeDependencies> = {},
) {
  return createWorkspaceGatewayLocalProxyMiddleware(
    env,
    createWorkspaceGatewayProxyDependencies(env, {
      accountDiscovery: alchemyFormlessInstanceAccountDiscoveryAdapter,
      cwd: env[WORKSPACE_GATEWAY_ROOT_ENV] ?? process.cwd(),
      env,
      fetch,
      now: () => new Date().toISOString(),
      packageVersion: packageJson.version,
      proxyFetch: fetch,
      ...dependencyOverrides,
    }),
  );
}

function workspaceGatewayRouteAvailable(
  request: Request,
  env: WorkspaceGatewayRuntimeEnv,
): boolean {
  const profileKind = resolveRuntimeProfileKind({
    hostname: new URL(request.url).hostname,
    profile: env.FORMLESS_RUNTIME_PROFILE,
  });

  return profileKind === "instance" || profileKind === "dev";
}

function operationDependencies(
  dependencies: WorkspaceGatewayRuntimeDependencies,
  workspaceRoot: string,
): RunFormlessWorkspaceOperationDependencies {
  return {
    ...(dependencies.accountDiscovery === undefined
      ? {}
      : { accountDiscovery: dependencies.accountDiscovery }),
    createOperationId: dependencies.createOperationId,
    ...(dependencies.credentialSetup === undefined
      ? {}
      : { credentialSetup: dependencies.credentialSetup }),
    cwd: workspaceRoot,
    ...(dependencies.deploymentAdapter === undefined
      ? {}
      : { deploymentAdapter: dependencies.deploymentAdapter }),
    ...(dependencies.env === undefined ? {} : { env: dependencies.env }),
    fetch: dependencies.fetch,
    ...(dependencies.healthCheck === undefined ? {} : { healthCheck: dependencies.healthCheck }),
    ...(dependencies.localSecretEnv === undefined
      ? {}
      : { localSecretEnv: dependencies.localSecretEnv }),
    now: dependencies.now,
    ...(dependencies.packageRoot === undefined ? {} : { packageRoot: dependencies.packageRoot }),
    ...(dependencies.packageVersion === undefined
      ? {}
      : { packageVersion: dependencies.packageVersion }),
    ...(dependencies.randomToken === undefined ? {} : { randomToken: dependencies.randomToken }),
    ...(dependencies.setupCapability === undefined
      ? {}
      : { setupCapability: dependencies.setupCapability }),
  };
}

function withWorkspaceRoot(
  input: WorkspaceGatewayStartInput,
  workspaceRoot: string,
): WorkspaceOperationInput {
  return {
    ...input,
    workspacePath: workspaceRoot,
  } as WorkspaceOperationInput;
}

function workspaceGatewayRuntimeCapabilities(
  dependencies: Pick<WorkspaceGatewayRuntimeDependencies, "operationCapabilities">,
): readonly WorkspaceOperationRequiredCapability[] {
  return dependencies.operationCapabilities ?? WORKSPACE_OPERATION_CAPABILITIES;
}

function workspaceGatewayOperationFromState(
  operation: WorkspaceOperationState,
): WorkspaceGatewayOperation | undefined {
  if (!isWorkspaceGatewayOperationKind(operation.operation)) {
    return undefined;
  }

  return operation as WorkspaceGatewayOperation;
}

function requireWorkspaceGatewayOperation(
  operation: WorkspaceOperationState,
): WorkspaceGatewayOperation {
  const gatewayOperation = workspaceGatewayOperationFromState(operation);

  if (!gatewayOperation) {
    throw new Error(`Workspace gateway operation "${operation.operation}" is not supported.`);
  }

  return gatewayOperation;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

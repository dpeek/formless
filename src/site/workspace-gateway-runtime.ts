import packageJson from "../../package.json";
import {
  createWorkspaceGatewayLocalProxyMiddleware,
  type WorkspaceGatewayLocalProxyDependencies,
  type WorkspaceGatewaySidecarEnv,
  type WorkspaceGatewaySidecarOperationHandlers,
  WORKSPACE_GATEWAY_ROOT_ENV,
} from "@dpeek/formless-gateway/sidecar";
import type {
  WorkspaceGatewayActor,
  WorkspaceGatewayCredentialSetupStartInput,
  WorkspaceGatewayOperation,
  WorkspaceGatewayStartInput,
} from "@dpeek/formless-gateway";
import { isWorkspaceGatewayOperationKind } from "@dpeek/formless-gateway";

import { resolveRuntimeProfileKind } from "../shared/runtime-topology.ts";
import { validateOwnerSessionCookie } from "../worker/owner-session.ts";
import { alchemyFormlessInstanceAccountDiscoveryAdapter } from "./instance-onboarding.ts";
import { setupCloudflareCredentialsWithAlchemyProfile } from "./instance-workspace-credential-setup.ts";
import {
  createFormlessWorkspaceOperationState,
  readFormlessWorkspaceOperationState,
  runFormlessWorkspaceOperation,
  updateFormlessWorkspaceOperationState,
  type FormlessWorkspaceOperationEvent,
  type FormlessWorkspaceOperationInput,
  type FormlessWorkspaceOperationResult,
  type FormlessWorkspaceOperationState,
  type FormlessWorkspaceOperationStatus,
  type RunFormlessWorkspaceOperationDependencies,
} from "./instance-workspace-operations.ts";

export type WorkspaceGatewayRuntimeEnv = WorkspaceGatewaySidecarEnv & {
  FORMLESS_OWNER_SESSION_SECRET?: string;
  FORMLESS_RUNTIME_PROFILE?: string;
};

export type WorkspaceGatewayCredentialSetupAdapterInput = {
  accountId?: string | undefined;
  profileLabel?: string | undefined;
  provider: "cloudflare";
  workspaceRoot: string;
};

export type WorkspaceGatewayCredentialSetupAdapterResult = {
  continue?: () => Promise<WorkspaceGatewayCredentialSetupAdapterResult>;
  events?: readonly Omit<FormlessWorkspaceOperationEvent, "id">[];
  result?: FormlessWorkspaceOperationResult;
  status?: FormlessWorkspaceOperationStatus;
};

export type WorkspaceGatewayRuntimeDependencies = RunFormlessWorkspaceOperationDependencies & {
  createOperationId?: () => string;
  credentialSetup?: (
    input: WorkspaceGatewayCredentialSetupAdapterInput,
  ) => Promise<WorkspaceGatewayCredentialSetupAdapterResult>;
  cwd: string;
  fetch: typeof fetch;
  now: () => string;
  proxyFetch?: typeof fetch;
  readOwnerSetupStatus?: (request: Request) => Promise<{ setupComplete: boolean }>;
};

export type StartWorkspaceGatewaySidecarDependencies = WorkspaceGatewayRuntimeDependencies & {
  createProxyToken?: () => string;
};

export function createWorkspaceGatewayOperationHandlers(
  dependencies: WorkspaceGatewayRuntimeDependencies,
): WorkspaceGatewaySidecarOperationHandlers {
  return {
    readOperation: async ({ operationId, workspaceRoot }) => {
      try {
        const operation = await readFormlessWorkspaceOperationState({
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
    startOperation: async ({ authorization, operationInput, workspaceRoot }) =>
      requireWorkspaceGatewayOperation(
        operationInput.kind === "credentialSetup"
          ? await runCredentialSetupGatewayOperation(
              operationInput,
              dependencies,
              workspaceRoot,
              authorization.actor,
            )
          : await runFormlessWorkspaceOperation(
              withWorkspaceRoot(operationInput, workspaceRoot),
              operationDependencies(dependencies, workspaceRoot),
              { actor: authorization.actor },
            ),
      ),
    status: async ({ authorization, workspaceRoot }) =>
      requireWorkspaceGatewayOperation(
        await runFormlessWorkspaceOperation(
          {
            includeDeploymentStatus: false,
            kind: "status",
            workspacePath: workspaceRoot,
          },
          operationDependencies(dependencies, workspaceRoot),
          { actor: authorization.actor },
        ),
      ),
  };
}

export function createWorkspaceGatewayProxyDependencies(
  env: WorkspaceGatewayRuntimeEnv,
  dependencies: WorkspaceGatewayRuntimeDependencies,
): WorkspaceGatewayLocalProxyDependencies {
  return {
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

async function runCredentialSetupGatewayOperation(
  input: WorkspaceGatewayCredentialSetupStartInput,
  dependencies: WorkspaceGatewayRuntimeDependencies,
  workspaceRoot: string,
  actor: WorkspaceGatewayActor,
) {
  let operation = await createFormlessWorkspaceOperationState({
    actor,
    id: dependencies.createOperationId?.(),
    input: {
      provider: input.provider,
      ...(input.accountId ? { accountId: input.accountId } : {}),
      ...(input.profileLabel ? { profileLabel: input.profileLabel } : {}),
    },
    kind: "credentialSetup",
    now: dependencies.now,
    workspaceRoot,
  });

  operation = await updateFormlessWorkspaceOperationState(operation.id, {
    logs: [{ at: dependencies.now(), level: "info", message: "credentialSetup started." }],
    status: "running",
    workspaceRoot,
  });

  try {
    const result = await (
      dependencies.credentialSetup ??
      ((credentialInput) => defaultCloudflareCredentialSetupAdapter(credentialInput, dependencies))
    )({
      accountId: input.accountId ?? undefined,
      profileLabel: input.profileLabel ?? undefined,
      provider: input.provider,
      workspaceRoot,
    });
    const summary = result.result?.summary ?? {
      fields: { provider: input.provider },
      title: "Credential setup started",
    };
    const status = result.status ?? "succeeded";
    const completed = await updateFormlessWorkspaceOperationState(operation.id, {
      events: result.events,
      logs: [
        {
          at: dependencies.now(),
          level: "info",
          message:
            status === "running"
              ? "credentialSetup awaiting authorization."
              : "credentialSetup completed.",
        },
      ],
      result: result.result ?? { summary },
      status,
      summary,
      workspaceRoot,
    });

    if (status === "running" && result.continue) {
      void completeCredentialSetupGatewayOperation({
        continueCredentialSetup: result.continue,
        dependencies,
        operationId: operation.id,
        workspaceRoot,
      });
    }

    return completed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return await updateFormlessWorkspaceOperationState(operation.id, {
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

async function completeCredentialSetupGatewayOperation(input: {
  continueCredentialSetup: () => Promise<WorkspaceGatewayCredentialSetupAdapterResult>;
  dependencies: Pick<WorkspaceGatewayRuntimeDependencies, "now">;
  operationId: string;
  workspaceRoot: string;
}) {
  try {
    const result = await input.continueCredentialSetup();
    const summary = result.result?.summary ?? {
      fields: {},
      title: "Credential setup completed",
    };
    const status = result.status ?? "succeeded";
    const completed = await updateFormlessWorkspaceOperationState(input.operationId, {
      events: result.events,
      logs: [
        {
          at: input.dependencies.now(),
          level: "info",
          message:
            status === "running"
              ? "credentialSetup awaiting authorization."
              : "credentialSetup completed.",
        },
      ],
      result: result.result ?? { summary },
      status,
      summary,
      workspaceRoot: input.workspaceRoot,
    });

    if (status === "running" && result.continue) {
      void completeCredentialSetupGatewayOperation({
        continueCredentialSetup: result.continue,
        dependencies: input.dependencies,
        operationId: input.operationId,
        workspaceRoot: input.workspaceRoot,
      });
    }

    return completed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return updateFormlessWorkspaceOperationState(input.operationId, {
      errors: [{ message }],
      logs: [{ at: input.dependencies.now(), level: "error", message }],
      status: "failed",
      summary: {
        fields: { error: message },
        title: "Operation failed",
      },
      workspaceRoot: input.workspaceRoot,
    });
  }
}

async function defaultCloudflareCredentialSetupAdapter(
  input: WorkspaceGatewayCredentialSetupAdapterInput,
  dependencies: Pick<WorkspaceGatewayRuntimeDependencies, "accountDiscovery" | "env" | "now">,
): Promise<WorkspaceGatewayCredentialSetupAdapterResult> {
  return setupCloudflareCredentialsWithAlchemyProfile(
    {
      accountId: input.accountId,
      env: dependencies.env,
      profileLabel: input.profileLabel,
      workspaceRoot: input.workspaceRoot,
    },
    {
      ...(dependencies.accountDiscovery === undefined
        ? {}
        : { accountDiscovery: dependencies.accountDiscovery }),
      now: dependencies.now,
    },
  );
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
  input: Exclude<WorkspaceGatewayStartInput, WorkspaceGatewayCredentialSetupStartInput>,
  workspaceRoot: string,
): FormlessWorkspaceOperationInput {
  return {
    ...input,
    workspacePath: workspaceRoot,
  } as FormlessWorkspaceOperationInput;
}

function workspaceGatewayOperationFromState(
  operation: FormlessWorkspaceOperationState,
): WorkspaceGatewayOperation | undefined {
  if (!isWorkspaceGatewayOperationKind(operation.operation)) {
    return undefined;
  }

  return operation as WorkspaceGatewayOperation;
}

function requireWorkspaceGatewayOperation(
  operation: FormlessWorkspaceOperationState,
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

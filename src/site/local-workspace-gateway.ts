import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";

import packageJson from "../../package.json";
import { resolveRuntimeProfileKind } from "../shared/runtime-topology.ts";
import {
  LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  LOCAL_WORKSPACE_GATEWAY_ACTOR_HEADER,
  LOCAL_WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  LOCAL_WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  LOCAL_WORKSPACE_GATEWAY_CSRF_HEADER,
  LOCAL_WORKSPACE_GATEWAY_CSRF_TOKEN_ENV,
  LOCAL_WORKSPACE_GATEWAY_ENABLED_ENV,
  LOCAL_WORKSPACE_GATEWAY_OPERATION_KIND_HEADER,
  LOCAL_WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
  LOCAL_WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  LOCAL_WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  LOCAL_WORKSPACE_GATEWAY_ROOT_ENV,
  LOCAL_WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
  LOCAL_WORKSPACE_GATEWAY_STATUS_API_PATH,
  isLocalWorkspaceGatewayPath,
  isLocalWorkspaceGatewayOperationKind,
  localWorkspaceGatewayOperationPath,
  localWorkspaceGatewayReadOperationIntent,
  localWorkspaceGatewayStartOperationIntent,
  localWorkspaceGatewayStatusIntent,
  parseLocalWorkspaceGatewayOperationId,
  parseLocalWorkspaceGatewayStartInput,
  type LocalWorkspaceGatewayActor,
  type LocalWorkspaceGatewayActorFacts,
  type LocalWorkspaceGatewayAuthorizationVia,
  type LocalWorkspaceGatewayCredentialSetupStartInput,
  type LocalWorkspaceGatewayOperationKind,
  type LocalWorkspaceGatewayOperationIntent,
  type LocalWorkspaceGatewayStartInput,
  type LocalWorkspaceGatewayStartInputParseResult,
} from "../shared/workspace-gateway-protocol.ts";
import { setupCloudflareCredentialsWithAlchemyProfile } from "./instance-workspace-credential-setup.ts";
import {
  createFormlessWorkspaceOperationState,
  readFormlessWorkspaceOperationState,
  runFormlessWorkspaceOperation,
  updateFormlessWorkspaceOperationState,
  type FormlessWorkspaceOperationActor,
  type FormlessWorkspaceOperationEvent,
  type FormlessWorkspaceOperationInput,
  type FormlessWorkspaceOperationResult,
  type FormlessWorkspaceOperationStatus,
  type RunFormlessWorkspaceOperationDependencies,
} from "./instance-workspace-operations.ts";
import { alchemyFormlessInstanceAccountDiscoveryAdapter } from "./instance-onboarding.ts";
import { validateOwnerSessionCookie } from "../worker/owner-session.ts";

export type LocalWorkspaceGatewayEnv = {
  FORMLESS_ADMIN_TOKEN?: string;
  FORMLESS_LOCAL_WORKSPACE_GATEWAY?: string;
  FORMLESS_OWNER_SESSION_SECRET?: string;
  FORMLESS_RUNTIME_PROFILE?: string;
  FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_CSRF_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_ROOT?: string;
  FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL?: string;
};

export type LocalWorkspaceCredentialSetupInput = {
  accountId?: string | undefined;
  profileLabel?: string | undefined;
  provider: "cloudflare";
  workspaceRoot: string;
};

export type LocalWorkspaceCredentialSetupResult = {
  continue?: () => Promise<LocalWorkspaceCredentialSetupResult>;
  events?: readonly Omit<FormlessWorkspaceOperationEvent, "id">[];
  result?: FormlessWorkspaceOperationResult;
  status?: FormlessWorkspaceOperationStatus;
};

export type LocalWorkspaceGatewayDependencies = RunFormlessWorkspaceOperationDependencies & {
  createOperationId?: () => string;
  credentialSetup?: (
    input: LocalWorkspaceCredentialSetupInput,
  ) => Promise<LocalWorkspaceCredentialSetupResult>;
  cwd: string;
  fetch: typeof fetch;
  now: () => string;
  proxyFetch?: typeof fetch;
  readOwnerSetupStatus?: (request: Request) => Promise<{ setupComplete: boolean }>;
};

export type LocalWorkspaceGatewaySidecar = {
  close: () => Promise<void>;
  endpoint: string;
  proxyToken: string;
};

export type StartLocalWorkspaceGatewaySidecarDependencies = LocalWorkspaceGatewayDependencies & {
  createProxyToken?: () => string;
};

type GatewayAuthorization =
  | { actor: FormlessWorkspaceOperationActor; via: "admin-bearer" | "bootstrap" | "owner-session" }
  | {
      error: string;
      status: number;
    };

export async function handleLocalWorkspaceGatewayRequest(
  request: Request,
  env: LocalWorkspaceGatewayEnv,
  dependencies: LocalWorkspaceGatewayDependencies,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (!isLocalWorkspaceGatewayPath(url.pathname)) {
    return undefined;
  }

  const proxyTarget = localWorkspaceGatewayProxyTarget(request, env);

  if (!proxyTarget) {
    return displaySafeJson({ error: "Not found." }, 404);
  }

  if (url.pathname === LOCAL_WORKSPACE_GATEWAY_STATUS_API_PATH) {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const intent = localWorkspaceGatewayStatusIntent();
    const authorization = await authorizeGatewayRequest(request, env, dependencies, intent);

    if ("error" in authorization) {
      return displaySafeJson({ error: authorization.error }, authorization.status);
    }

    return proxyWorkspaceGatewayRequest(request, env, dependencies, proxyTarget, authorization, {
      intent,
    });
  }

  if (url.pathname === LOCAL_WORKSPACE_GATEWAY_OPERATIONS_API_PATH) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    const parsed = await parseGatewayStartInput(request.clone());

    if (!parsed.ok) {
      return displaySafeJson({ error: parsed.error }, 400);
    }

    const intent = localWorkspaceGatewayStartOperationIntent(parsed.input);
    const authorization = await authorizeGatewayRequest(request, env, dependencies, intent);

    if ("error" in authorization) {
      return displaySafeJson({ error: authorization.error }, authorization.status);
    }

    return proxyWorkspaceGatewayRequest(request, env, dependencies, proxyTarget, authorization, {
      intent,
    });
  }

  const operationMatch = localWorkspaceGatewayOperationPath(url.pathname);

  if (operationMatch) {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const parsedOperationId = parseLocalWorkspaceGatewayOperationId(operationMatch.operationId);

    if (!parsedOperationId.ok) {
      return displaySafeJson({ error: parsedOperationId.error }, 400);
    }

    const authorization = await authorizeGatewayReadOperationRequest(request, env, dependencies);

    if ("error" in authorization) {
      return displaySafeJson({ error: authorization.error }, authorization.status);
    }

    return proxyWorkspaceGatewayRequest(request, env, dependencies, proxyTarget, authorization, {});
  }

  return displaySafeJson({ error: "Not found." }, 404);
}

export async function handleLocalWorkspaceGatewaySidecarRequest(
  request: Request,
  env: LocalWorkspaceGatewayEnv,
  dependencies: LocalWorkspaceGatewayDependencies,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (!isLocalWorkspaceGatewayPath(url.pathname)) {
    return undefined;
  }

  const workspaceRoot = localWorkspaceGatewaySidecarRoot(env);

  if (!workspaceRoot) {
    return displaySafeJson({ error: "Not found." }, 404);
  }

  if (url.pathname === LOCAL_WORKSPACE_GATEWAY_STATUS_API_PATH) {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    return handleWorkspaceGatewayStatus(request, env, dependencies, workspaceRoot);
  }

  if (url.pathname === LOCAL_WORKSPACE_GATEWAY_OPERATIONS_API_PATH) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    return handleWorkspaceGatewayStartOperation(request, env, dependencies, workspaceRoot);
  }

  const operationMatch = localWorkspaceGatewayOperationPath(url.pathname);

  if (operationMatch) {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    return handleWorkspaceGatewayReadOperation(
      request,
      env,
      workspaceRoot,
      operationMatch.operationId,
    );
  }

  return displaySafeJson({ error: "Not found." }, 404);
}

export async function startLocalWorkspaceGatewaySidecar(
  input: {
    env?: LocalWorkspaceGatewayEnv;
    workspaceRoot: string;
  },
  dependencies: StartLocalWorkspaceGatewaySidecarDependencies,
): Promise<LocalWorkspaceGatewaySidecar> {
  const proxyToken = dependencies.createProxyToken?.() ?? randomBytes(32).toString("base64url");
  const sidecarEnv: LocalWorkspaceGatewayEnv = {
    ...input.env,
    [LOCAL_WORKSPACE_GATEWAY_ENABLED_ENV]: "1",
    [LOCAL_WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: proxyToken,
    [LOCAL_WORKSPACE_GATEWAY_ROOT_ENV]: input.workspaceRoot,
  };
  const server = createServer((req, res) => {
    void createLocalWorkspaceGatewaySidecarHandler(sidecarEnv, dependencies)(req, res);
  });
  const endpoint = await listenLocalWorkspaceGatewaySidecar(server);

  return {
    close: () => closeLocalWorkspaceGatewaySidecar(server),
    endpoint,
    proxyToken,
  };
}

export function createLocalWorkspaceGatewayMiddleware(
  env: NodeJS.ProcessEnv = process.env,
  dependencyOverrides: Partial<LocalWorkspaceGatewayDependencies> = {},
) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const request = await nodeRequestFromIncomingMessage(req);
    const response = await handleLocalWorkspaceGatewayRequest(request, env, {
      accountDiscovery: alchemyFormlessInstanceAccountDiscoveryAdapter,
      cwd: env[LOCAL_WORKSPACE_GATEWAY_ROOT_ENV] ?? process.cwd(),
      env,
      fetch,
      now: () => new Date().toISOString(),
      packageVersion: packageJson.version,
      proxyFetch: fetch,
      ...dependencyOverrides,
    });

    if (!response) {
      next();
      return;
    }

    await sendNodeResponse(res, response);
  };
}

async function handleWorkspaceGatewayStatus(
  request: Request,
  env: LocalWorkspaceGatewayEnv,
  dependencies: LocalWorkspaceGatewayDependencies,
  workspaceRoot: string,
): Promise<Response> {
  const authorization = authorizeSidecarGatewayRequest(
    request,
    env,
    localWorkspaceGatewayStatusIntent(),
  );

  if ("error" in authorization) {
    return displaySafeJson({ error: authorization.error }, authorization.status);
  }

  const operation = await runFormlessWorkspaceOperation(
    {
      includeDeploymentStatus: false,
      kind: "status",
      workspacePath: workspaceRoot,
    },
    operationDependencies(dependencies, workspaceRoot),
    { actor: authorization.actor },
  );

  return sidecarOperationResponse(operation);
}

async function handleWorkspaceGatewayStartOperation(
  request: Request,
  env: LocalWorkspaceGatewayEnv,
  dependencies: LocalWorkspaceGatewayDependencies,
  workspaceRoot: string,
): Promise<Response> {
  const parsed = await parseGatewayStartInput(request);

  if (!parsed.ok) {
    return displaySafeJson({ error: parsed.error }, 400);
  }

  const authorization = authorizeSidecarGatewayRequest(
    request,
    env,
    localWorkspaceGatewayStartOperationIntent(parsed.input),
  );

  if ("error" in authorization) {
    return displaySafeJson({ error: authorization.error }, authorization.status);
  }

  const operation =
    parsed.input.kind === "credentialSetup"
      ? await runCredentialSetupGatewayOperation(
          parsed.input,
          dependencies,
          workspaceRoot,
          authorization.actor,
        )
      : await runFormlessWorkspaceOperation(
          withWorkspaceRoot(parsed.input, workspaceRoot),
          operationDependencies(dependencies, workspaceRoot),
          { actor: authorization.actor },
        );

  return sidecarOperationResponse(operation);
}

async function handleWorkspaceGatewayReadOperation(
  request: Request,
  env: LocalWorkspaceGatewayEnv,
  workspaceRoot: string,
  operationId: string,
): Promise<Response> {
  const parsedOperationId = parseLocalWorkspaceGatewayOperationId(operationId);

  if (!parsedOperationId.ok) {
    return displaySafeJson({ error: parsedOperationId.error }, 400);
  }

  const authorization = authorizeSidecarGatewayReadOperationRequest(request, env);

  if ("error" in authorization) {
    return displaySafeJson({ error: authorization.error }, authorization.status);
  }

  const proxiedOperation = parseProxiedOperationKind(request);

  if (!proxiedOperation.ok) {
    return displaySafeJson({ error: proxiedOperation.error }, 400);
  }

  let operation;

  try {
    operation = await readFormlessWorkspaceOperationState({
      operationId: parsedOperationId.operationId,
      workspaceRoot,
    });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return displaySafeJson({ error: "Workspace operation was not found." }, 404);
    }

    throw error;
  }

  if (proxiedOperation.operation && proxiedOperation.operation !== operation.operation) {
    return displaySafeJson(
      { error: "Workspace operation intent does not match operation state." },
      400,
    );
  }

  if (
    authorization.via === "bootstrap" &&
    !localWorkspaceGatewayReadOperationIntent(operation.operation).bootstrapAllowed
  ) {
    return displaySafeJson(
      { error: "Workspace bootstrap authorization is limited to status and init operations." },
      403,
    );
  }

  return sidecarOperationResponse(operation);
}

async function runCredentialSetupGatewayOperation(
  input: LocalWorkspaceGatewayCredentialSetupStartInput,
  dependencies: LocalWorkspaceGatewayDependencies,
  workspaceRoot: string,
  actor: FormlessWorkspaceOperationActor,
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
  continueCredentialSetup: () => Promise<LocalWorkspaceCredentialSetupResult>;
  dependencies: Pick<LocalWorkspaceGatewayDependencies, "now">;
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
  input: LocalWorkspaceCredentialSetupInput,
  dependencies: Pick<LocalWorkspaceGatewayDependencies, "accountDiscovery" | "env" | "now">,
): Promise<LocalWorkspaceCredentialSetupResult> {
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

function authorizeSidecarGatewayRequest(
  request: Request,
  env: LocalWorkspaceGatewayEnv,
  intent: LocalWorkspaceGatewayOperationIntent,
): GatewayAuthorization {
  const proxied = authorizeSidecarProxyRequest(request, env, intent);

  if (proxied) {
    return proxied;
  }

  return authorizeDirectSidecarAutomationRequest(request, env);
}

function authorizeSidecarGatewayReadOperationRequest(
  request: Request,
  env: LocalWorkspaceGatewayEnv,
): GatewayAuthorization {
  const proxied = authorizeSidecarProxyRequest(request, env);

  if (proxied) {
    return proxied;
  }

  return authorizeDirectSidecarAutomationRequest(request, env);
}

function authorizeSidecarProxyRequest(
  request: Request,
  env: LocalWorkspaceGatewayEnv,
  intent?: LocalWorkspaceGatewayOperationIntent,
): GatewayAuthorization | undefined {
  const proxyToken = request.headers.get(LOCAL_WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER);

  if (proxyToken === null) {
    return undefined;
  }

  if (proxyToken !== expectedProxyToken(env)) {
    return { error: "Workspace gateway proxy authorization is required.", status: 401 };
  }

  const actorFacts = proxiedActorFacts(request);

  if (!actorFacts) {
    return { error: "Workspace gateway proxy actor facts are invalid.", status: 400 };
  }

  if (actorFacts.via === "bootstrap" && intent && !intent.bootstrapAllowed) {
    return {
      error: "Workspace bootstrap authorization is limited to status and init operations.",
      status: 403,
    };
  }

  return actorFacts;
}

function authorizeDirectSidecarAutomationRequest(
  request: Request,
  env: LocalWorkspaceGatewayEnv,
): GatewayAuthorization {
  if (!request.headers.get("Origin") && matchesAdminBearer(request, env)) {
    return { actor: "automation", via: "admin-bearer" };
  }

  return { error: "Workspace gateway proxy authorization is required.", status: 401 };
}

function proxiedActorFacts(request: Request): LocalWorkspaceGatewayActorFacts | undefined {
  const actor = request.headers.get(LOCAL_WORKSPACE_GATEWAY_ACTOR_HEADER);
  const via = request.headers.get(LOCAL_WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER);

  if (!isLocalWorkspaceGatewayActor(actor) || !isLocalWorkspaceGatewayAuthorizationVia(via)) {
    return undefined;
  }

  if ((via === "bootstrap" || via === "owner-session") && actor !== "browser") {
    return undefined;
  }

  if (via === "admin-bearer" && actor === "browser") {
    return undefined;
  }

  return { actor, via };
}

function parseProxiedOperationKind(
  request: Request,
): { ok: true; operation?: LocalWorkspaceGatewayOperationKind } | { error: string; ok: false } {
  const operation = request.headers.get(LOCAL_WORKSPACE_GATEWAY_OPERATION_KIND_HEADER);

  if (operation === null) {
    return { ok: true };
  }

  if (!isLocalWorkspaceGatewayOperationKind(operation)) {
    return { error: "Workspace gateway operation intent is invalid.", ok: false };
  }

  return { ok: true, operation };
}

function isLocalWorkspaceGatewayActor(value: unknown): value is LocalWorkspaceGatewayActor {
  return value === "automation" || value === "browser" || value === "cli" || value === "system";
}

function isLocalWorkspaceGatewayAuthorizationVia(
  value: unknown,
): value is LocalWorkspaceGatewayAuthorizationVia {
  return value === "admin-bearer" || value === "bootstrap" || value === "owner-session";
}

async function authorizeGatewayRequest(
  request: Request,
  env: LocalWorkspaceGatewayEnv,
  dependencies: LocalWorkspaceGatewayDependencies,
  intent: LocalWorkspaceGatewayOperationIntent,
): Promise<GatewayAuthorization> {
  if (!isSameOriginOrNoOrigin(request)) {
    return { error: "Workspace gateway requests must be same-origin.", status: 403 };
  }

  if (matchesBootstrapCapability(request, env)) {
    if (!intent.bootstrapAllowed) {
      return {
        error: "Workspace bootstrap authorization is limited to status and init operations.",
        status: 403,
      };
    }

    if (await ownerSetupComplete(request, dependencies)) {
      return { error: "Workspace bootstrap authorization has expired.", status: 403 };
    }

    return { actor: "browser", via: "bootstrap" };
  }

  if (!request.headers.get("Origin") && matchesAdminBearer(request, env)) {
    return { actor: "automation", via: "admin-bearer" };
  }

  if (intent.mutating && !isSameOriginWithOrigin(request)) {
    return {
      error: "Workspace gateway browser mutations require a same-origin Origin header.",
      status: 403,
    };
  }

  const ownerSession = await validateOwnerSessionCookie(request, env);

  if (ownerSession.ok) {
    if (intent.mutating && !validCsrfProof(request, env)) {
      return { error: "Workspace gateway browser mutations require CSRF proof.", status: 403 };
    }

    return { actor: "browser", via: "owner-session" };
  }

  return {
    error: "Workspace gateway authorization is required.",
    status: 401,
  };
}

async function authorizeGatewayReadOperationRequest(
  request: Request,
  env: LocalWorkspaceGatewayEnv,
  dependencies: LocalWorkspaceGatewayDependencies,
): Promise<GatewayAuthorization> {
  if (!isSameOriginOrNoOrigin(request)) {
    return { error: "Workspace gateway requests must be same-origin.", status: 403 };
  }

  if (matchesBootstrapCapability(request, env)) {
    if (await ownerSetupComplete(request, dependencies)) {
      return { error: "Workspace bootstrap authorization has expired.", status: 403 };
    }

    return { actor: "browser", via: "bootstrap" };
  }

  if (!request.headers.get("Origin") && matchesAdminBearer(request, env)) {
    return { actor: "automation", via: "admin-bearer" };
  }

  const ownerSession = await validateOwnerSessionCookie(request, env);

  if (ownerSession.ok) {
    return { actor: "browser", via: "owner-session" };
  }

  return {
    error: "Workspace gateway authorization is required.",
    status: 401,
  };
}

function matchesBootstrapCapability(request: Request, env: LocalWorkspaceGatewayEnv): boolean {
  const expected = env[LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV]?.trim();

  return (
    expected !== undefined &&
    expected !== "" &&
    request.headers.get(LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_HEADER) === expected
  );
}

function matchesAdminBearer(request: Request, env: LocalWorkspaceGatewayEnv): boolean {
  const adminToken = env.FORMLESS_ADMIN_TOKEN?.trim();
  const authorization = request.headers.get("Authorization")?.trim();

  if (!adminToken || !authorization) {
    return false;
  }

  return authorization.match(/^Bearer\s+(.+)$/i)?.[1] === adminToken;
}

function validCsrfProof(request: Request, env: LocalWorkspaceGatewayEnv): boolean {
  const expected = env[LOCAL_WORKSPACE_GATEWAY_CSRF_TOKEN_ENV]?.trim();

  if (!expected) {
    return false;
  }

  return (
    request.headers.get(LOCAL_WORKSPACE_GATEWAY_CSRF_HEADER) === expected &&
    requestCookie(request, LOCAL_WORKSPACE_GATEWAY_CSRF_COOKIE_NAME) === expected
  );
}

async function ownerSetupComplete(
  request: Request,
  dependencies: LocalWorkspaceGatewayDependencies,
): Promise<boolean> {
  if (dependencies.readOwnerSetupStatus) {
    return (await dependencies.readOwnerSetupStatus(request)).setupComplete;
  }

  const response = await dependencies.fetch(new URL("/api/formless/setup", request.url), {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    return false;
  }

  const body = (await response.json()) as Partial<{ setupComplete: boolean }>;

  return body.setupComplete === true;
}

async function proxyWorkspaceGatewayRequest(
  request: Request,
  env: LocalWorkspaceGatewayEnv,
  dependencies: LocalWorkspaceGatewayDependencies,
  proxyTarget: LocalWorkspaceGatewayProxyTarget,
  authorization: Exclude<GatewayAuthorization, { error: string }>,
  options: { intent?: LocalWorkspaceGatewayOperationIntent },
): Promise<Response> {
  const response = await (dependencies.proxyFetch ?? fetch)(
    sidecarRequestUrl(request, proxyTarget),
    {
      body: await proxyRequestBody(request),
      headers: proxyWorkspaceGatewayHeaders(request, proxyTarget, authorization, options),
      method: request.method,
    },
  );
  const contentType = response.headers.get("Content-Type") ?? "";

  if (!contentType.includes("application/json")) {
    return new Response(await response.arrayBuffer(), {
      headers: displaySafeProxyHeaders(response.headers),
      status: response.status,
    });
  }

  const body = (await response.json()) as unknown;

  if (response.status === 200 && typeof body === "object" && body !== null && "operation" in body) {
    return gatewayOperationResponse(request, env, authorization, body.operation);
  }

  return displaySafeJson(body, response.status, displaySafeProxyHeaders(response.headers));
}

function gatewayOperationResponse(
  request: Request,
  env: LocalWorkspaceGatewayEnv,
  authorization: Exclude<GatewayAuthorization, { error: string }>,
  operation: unknown,
): Response {
  const headers = new Headers();
  const csrfToken = env[LOCAL_WORKSPACE_GATEWAY_CSRF_TOKEN_ENV]?.trim();
  const includeCsrfToken =
    authorization.via === "owner-session" && authorization.actor === "browser";

  if (includeCsrfToken && csrfToken) {
    headers.set(
      "Set-Cookie",
      `${LOCAL_WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${csrfToken}; Path=/; SameSite=Lax${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
    );
  }

  return displaySafeJson(
    {
      ...(includeCsrfToken && csrfToken ? { csrfToken } : {}),
      operation,
    },
    200,
    headers,
  );
}

function sidecarOperationResponse(operation: unknown): Response {
  return displaySafeJson({ operation }, 200);
}

function sidecarRequestUrl(
  request: Request,
  proxyTarget: LocalWorkspaceGatewayProxyTarget,
): string {
  const requested = new URL(request.url);

  return new URL(`${requested.pathname}${requested.search}`, proxyTarget.endpoint).toString();
}

async function proxyRequestBody(request: Request): Promise<ArrayBuffer | undefined> {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  return request.arrayBuffer();
}

function proxyWorkspaceGatewayHeaders(
  request: Request,
  proxyTarget: LocalWorkspaceGatewayProxyTarget,
  authorization: Exclude<GatewayAuthorization, { error: string }>,
  options: { intent?: LocalWorkspaceGatewayOperationIntent },
): Headers {
  const headers = new Headers(request.headers);

  headers.delete("Authorization");
  headers.delete("Cookie");
  headers.delete(LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_HEADER);
  headers.delete(LOCAL_WORKSPACE_GATEWAY_CSRF_HEADER);
  headers.delete(LOCAL_WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER);
  headers.delete(LOCAL_WORKSPACE_GATEWAY_ACTOR_HEADER);
  headers.delete(LOCAL_WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER);
  headers.delete(LOCAL_WORKSPACE_GATEWAY_OPERATION_KIND_HEADER);
  headers.set(LOCAL_WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER, proxyTarget.proxyToken);
  headers.set(LOCAL_WORKSPACE_GATEWAY_ACTOR_HEADER, authorization.actor);
  headers.set(LOCAL_WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER, authorization.via);

  if (options.intent) {
    headers.set(LOCAL_WORKSPACE_GATEWAY_OPERATION_KIND_HEADER, options.intent.operation);
  }

  return headers;
}

function displaySafeProxyHeaders(headers: Headers): Headers {
  const next = new Headers();

  for (const key of ["Allow", "Content-Type"]) {
    const value = headers.get(key);

    if (value) {
      next.set(key, value);
    }
  }

  return next;
}

function operationDependencies(
  dependencies: LocalWorkspaceGatewayDependencies,
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

async function parseGatewayStartInput(request: {
  json: () => Promise<unknown>;
}): Promise<LocalWorkspaceGatewayStartInputParseResult> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return { error: "Workspace gateway operation request must be JSON.", ok: false };
  }

  return parseLocalWorkspaceGatewayStartInput(body);
}

function withWorkspaceRoot(
  input: Exclude<LocalWorkspaceGatewayStartInput, LocalWorkspaceGatewayCredentialSetupStartInput>,
  workspaceRoot: string,
): FormlessWorkspaceOperationInput {
  return {
    ...input,
    workspacePath: workspaceRoot,
  } as FormlessWorkspaceOperationInput;
}

type LocalWorkspaceGatewayProxyTarget = {
  endpoint: string;
  proxyToken: string;
};

function localWorkspaceGatewayProxyTarget(
  request: Request,
  env: LocalWorkspaceGatewayEnv,
): LocalWorkspaceGatewayProxyTarget | undefined {
  if (env[LOCAL_WORKSPACE_GATEWAY_ENABLED_ENV] !== "1") {
    return undefined;
  }

  const profileKind = resolveRuntimeProfileKind({
    hostname: new URL(request.url).hostname,
    profile: env.FORMLESS_RUNTIME_PROFILE,
  });

  if (profileKind !== "instance" && profileKind !== "dev") {
    return undefined;
  }

  const endpoint = env[LOCAL_WORKSPACE_GATEWAY_SIDECAR_URL_ENV]?.trim();
  const proxyToken = expectedProxyToken(env);

  if (!endpoint || !proxyToken || !isLoopbackSidecarEndpoint(endpoint)) {
    return undefined;
  }

  return { endpoint, proxyToken };
}

function localWorkspaceGatewaySidecarRoot(env: LocalWorkspaceGatewayEnv): string | undefined {
  if (env[LOCAL_WORKSPACE_GATEWAY_ENABLED_ENV] !== "1") {
    return undefined;
  }

  const workspaceRoot = env[LOCAL_WORKSPACE_GATEWAY_ROOT_ENV]?.trim();

  return workspaceRoot ? path.resolve(workspaceRoot) : undefined;
}

function expectedProxyToken(env: LocalWorkspaceGatewayEnv): string | undefined {
  const proxyToken = env[LOCAL_WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]?.trim();

  return proxyToken ? proxyToken : undefined;
}

function isLoopbackSidecarEndpoint(value: string): boolean {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return (
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]")
  );
}

function isSameOriginOrNoOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");

  return origin === null || origin === new URL(request.url).origin;
}

function isSameOriginWithOrigin(request: Request): boolean {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

function requestCookie(request: Request, name: string): string | undefined {
  const cookies = request.headers.get("Cookie");

  if (!cookies) {
    return undefined;
  }

  for (const part of cookies.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");

    if (rawName === name) {
      return rawValue.join("=");
    }
  }

  return undefined;
}

function displaySafeJson(body: unknown, status: number, headers: Headers = new Headers()) {
  headers.set("Content-Type", "application/json");

  return new Response(JSON.stringify(body), { headers, status });
}

function methodNotAllowed(methods: string[]) {
  return displaySafeJson(
    { error: "Method not allowed." },
    405,
    new Headers({ Allow: methods.join(", ") }),
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function createLocalWorkspaceGatewaySidecarHandler(
  env: LocalWorkspaceGatewayEnv,
  dependencies: LocalWorkspaceGatewayDependencies,
) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const request = await nodeRequestFromIncomingMessage(req);
    const response =
      (await handleLocalWorkspaceGatewaySidecarRequest(request, env, dependencies)) ??
      displaySafeJson({ error: "Not found." }, 404);

    await sendNodeResponse(res, response);
  };
}

async function listenLocalWorkspaceGatewaySidecar(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    const rejectOnError = (error: Error) => {
      reject(error);
    };

    server.once("error", rejectOnError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectOnError);
      resolve();
    });
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Local workspace gateway sidecar did not bind to a TCP port.");
  }

  return `http://127.0.0.1:${address.port}`;
}

async function closeLocalWorkspaceGatewaySidecar(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function nodeRequestFromIncomingMessage(req: IncomingMessage): Promise<Request> {
  const protocol =
    headerValue(req.headers["x-forwarded-proto"]) ??
    ((req.socket as { encrypted?: boolean }).encrypted ? "https" : "http");
  const host = headerValue(req.headers.host) ?? "localhost";
  const url = new URL(req.url ?? "/", `${protocol}://${host}`);
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else if (value !== undefined) {
      headers.append(key, value);
    }
  }

  if (req.method === "GET" || req.method === "HEAD") {
    return new Request(url, { headers, method: req.method });
  }

  const body = await readIncomingBody(req);

  return new Request(url, {
    body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
    headers,
    method: req.method,
  });
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function readIncomingBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function sendNodeResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status;

  for (const [key, value] of response.headers) {
    res.setHeader(key, value);
  }

  res.end(Buffer.from(await response.arrayBuffer()));
}

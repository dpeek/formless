import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

import packageJson from "../../package.json";
import { resolveRuntimeProfileKind } from "../shared/runtime-topology.ts";
import {
  LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  LOCAL_WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  LOCAL_WORKSPACE_GATEWAY_CSRF_HEADER,
  LOCAL_WORKSPACE_GATEWAY_CSRF_TOKEN_ENV,
  LOCAL_WORKSPACE_GATEWAY_ENABLED_ENV,
  LOCAL_WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
  LOCAL_WORKSPACE_GATEWAY_ROOT_ENV,
  LOCAL_WORKSPACE_GATEWAY_STATUS_API_PATH,
  isLocalWorkspaceGatewayPath,
  localWorkspaceGatewayOperationPath,
  localWorkspaceGatewayReadOperationIntent,
  localWorkspaceGatewayStartOperationIntent,
  localWorkspaceGatewayStatusIntent,
  parseLocalWorkspaceGatewayOperationId,
  parseLocalWorkspaceGatewayStartInput,
  type LocalWorkspaceGatewayCredentialSetupStartInput,
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
  FORMLESS_WORKSPACE_GATEWAY_ROOT?: string;
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
  readOwnerSetupStatus?: (request: Request) => Promise<{ setupComplete: boolean }>;
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

  const workspaceRoot = localWorkspaceGatewayRoot(request, env);

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
      dependencies,
      workspaceRoot,
      operationMatch.operationId,
    );
  }

  return displaySafeJson({ error: "Not found." }, 404);
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
  const authorization = await authorizeGatewayRequest(
    request,
    env,
    dependencies,
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

  return gatewayOperationResponse(request, env, authorization, operation);
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

  const authorization = await authorizeGatewayRequest(
    request,
    env,
    dependencies,
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

  return gatewayOperationResponse(request, env, authorization, operation);
}

async function handleWorkspaceGatewayReadOperation(
  request: Request,
  env: LocalWorkspaceGatewayEnv,
  dependencies: LocalWorkspaceGatewayDependencies,
  workspaceRoot: string,
  operationId: string,
): Promise<Response> {
  const parsedOperationId = parseLocalWorkspaceGatewayOperationId(operationId);

  if (!parsedOperationId.ok) {
    return displaySafeJson({ error: parsedOperationId.error }, 400);
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

  const authorization = await authorizeGatewayRequest(
    request,
    env,
    dependencies,
    localWorkspaceGatewayReadOperationIntent(operation.operation),
  );

  if ("error" in authorization) {
    return displaySafeJson({ error: authorization.error }, authorization.status);
  }

  return gatewayOperationResponse(request, env, authorization, operation);
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

async function parseGatewayStartInput(
  request: Request,
): Promise<LocalWorkspaceGatewayStartInputParseResult> {
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

function localWorkspaceGatewayRoot(
  request: Request,
  env: LocalWorkspaceGatewayEnv,
): string | undefined {
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

  const workspaceRoot = env[LOCAL_WORKSPACE_GATEWAY_ROOT_ENV]?.trim();

  return workspaceRoot ? path.resolve(workspaceRoot) : undefined;
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

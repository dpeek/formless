import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

import { resolveRuntimeProfileKind } from "../shared/runtime-topology.ts";
import {
  createFormlessWorkspaceOperationState,
  readFormlessWorkspaceOperationState,
  runFormlessWorkspaceOperation,
  updateFormlessWorkspaceOperationState,
  type FormlessWorkspaceOperationActor,
  type FormlessWorkspaceOperationEvent,
  type FormlessWorkspaceOperationInput,
  type FormlessWorkspaceOperationKind,
  type FormlessWorkspaceOperationResult,
} from "./instance-workspace-operations.ts";
import { validateOwnerSessionCookie } from "../worker/owner-session.ts";

export const LOCAL_WORKSPACE_GATEWAY_API_ROUTE_PREFIX = "/api/formless/workspace";
export const LOCAL_WORKSPACE_GATEWAY_STATUS_API_PATH = `${LOCAL_WORKSPACE_GATEWAY_API_ROUTE_PREFIX}/status`;
export const LOCAL_WORKSPACE_GATEWAY_OPERATIONS_API_PATH = `${LOCAL_WORKSPACE_GATEWAY_API_ROUTE_PREFIX}/operations`;
export const LOCAL_WORKSPACE_GATEWAY_ENABLED_ENV = "FORMLESS_LOCAL_WORKSPACE_GATEWAY";
export const LOCAL_WORKSPACE_GATEWAY_ROOT_ENV = "FORMLESS_WORKSPACE_GATEWAY_ROOT";
export const LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV =
  "FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN";
export const LOCAL_WORKSPACE_GATEWAY_CSRF_TOKEN_ENV = "FORMLESS_WORKSPACE_GATEWAY_CSRF_TOKEN";
export const LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_HEADER = "x-formless-workspace-bootstrap";
export const LOCAL_WORKSPACE_GATEWAY_CSRF_HEADER = "x-formless-csrf";
export const LOCAL_WORKSPACE_GATEWAY_CSRF_COOKIE_NAME = "formless_workspace_csrf";

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
  profileLabel?: string | undefined;
  provider: "cloudflare";
  workspaceRoot: string;
};

export type LocalWorkspaceCredentialSetupResult = {
  events?: readonly Omit<FormlessWorkspaceOperationEvent, "id">[];
  result?: FormlessWorkspaceOperationResult;
};

export type LocalWorkspaceGatewayDependencies = {
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

type CredentialSetupOperationInput = {
  kind: "credentialSetup";
  profileLabel?: string | null;
  provider: "cloudflare";
};

type GatewayStartInput = CredentialSetupOperationInput | FormlessWorkspaceOperationInput;

const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;

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

  const operationMatch = gatewayOperationPath(url.pathname);

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
      cwd: env[LOCAL_WORKSPACE_GATEWAY_ROOT_ENV] ?? process.cwd(),
      fetch,
      now: () => new Date().toISOString(),
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
  const authorization = await authorizeGatewayRequest(request, env, dependencies, {
    bootstrapOperations: new Set(["status"]),
    mutation: false,
    operation: "status",
  });

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

  if ("error" in parsed) {
    return displaySafeJson({ error: parsed.error }, 400);
  }

  const authorization = await authorizeGatewayRequest(request, env, dependencies, {
    bootstrapOperations: new Set(["init", "status"]),
    mutation: parsed.input.kind !== "status",
    operation: parsed.input.kind,
  });

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
  if (!operationIdPattern.test(operationId)) {
    return displaySafeJson({ error: "Workspace operation id is invalid." }, 400);
  }

  let operation;

  try {
    operation = await readFormlessWorkspaceOperationState({ operationId, workspaceRoot });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return displaySafeJson({ error: "Workspace operation was not found." }, 404);
    }

    throw error;
  }

  const authorization = await authorizeGatewayRequest(request, env, dependencies, {
    bootstrapOperations: new Set(["init", "status"]),
    mutation: false,
    operation: operation.operation,
  });

  if ("error" in authorization) {
    return displaySafeJson({ error: authorization.error }, authorization.status);
  }

  return gatewayOperationResponse(request, env, authorization, operation);
}

async function runCredentialSetupGatewayOperation(
  input: CredentialSetupOperationInput,
  dependencies: LocalWorkspaceGatewayDependencies,
  workspaceRoot: string,
  actor: FormlessWorkspaceOperationActor,
) {
  let operation = await createFormlessWorkspaceOperationState({
    actor,
    id: dependencies.createOperationId?.(),
    input: {
      provider: input.provider,
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
    if (!dependencies.credentialSetup) {
      throw new Error("Workspace credential setup adapter is not configured.");
    }

    const result = await dependencies.credentialSetup({
      profileLabel: input.profileLabel ?? undefined,
      provider: input.provider,
      workspaceRoot,
    });
    const summary = result.result?.summary ?? {
      fields: { provider: input.provider },
      title: "Credential setup started",
    };

    return await updateFormlessWorkspaceOperationState(operation.id, {
      events: result.events,
      logs: [{ at: dependencies.now(), level: "info", message: "credentialSetup completed." }],
      result: result.result ?? { summary },
      status: "succeeded",
      summary,
      workspaceRoot,
    });
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

async function authorizeGatewayRequest(
  request: Request,
  env: LocalWorkspaceGatewayEnv,
  dependencies: LocalWorkspaceGatewayDependencies,
  intent: {
    bootstrapOperations: ReadonlySet<FormlessWorkspaceOperationKind>;
    mutation: boolean;
    operation: FormlessWorkspaceOperationKind;
  },
): Promise<GatewayAuthorization> {
  if (!isSameOriginOrNoOrigin(request)) {
    return { error: "Workspace gateway requests must be same-origin.", status: 403 };
  }

  if (matchesBootstrapCapability(request, env)) {
    if (!intent.bootstrapOperations.has(intent.operation)) {
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

  if (intent.mutation && !isSameOriginWithOrigin(request)) {
    return {
      error: "Workspace gateway browser mutations require a same-origin Origin header.",
      status: 403,
    };
  }

  const ownerSession = await validateOwnerSessionCookie(request, env);

  if (ownerSession.ok) {
    if (intent.mutation && !validCsrfProof(request, env)) {
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
  const expected = env.FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN?.trim();

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
  const expected = env.FORMLESS_WORKSPACE_GATEWAY_CSRF_TOKEN?.trim();

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
  const csrfToken = env.FORMLESS_WORKSPACE_GATEWAY_CSRF_TOKEN?.trim();
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
) {
  return {
    createOperationId: dependencies.createOperationId,
    cwd: workspaceRoot,
    fetch: dependencies.fetch,
    now: dependencies.now,
  };
}

async function parseGatewayStartInput(
  request: Request,
): Promise<{ input: GatewayStartInput } | { error: string }> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return { error: "Workspace gateway operation request must be JSON." };
  }

  const forbidden = forbiddenGatewayInput(body);

  if (forbidden) {
    return { error: forbidden };
  }

  if (!isRecord(body)) {
    return { error: "Workspace gateway operation request must be an object." };
  }

  const kind = typeof body.kind === "string" ? body.kind : body.operation;

  if (typeof kind !== "string") {
    return { error: 'Workspace gateway operation request must include "kind".' };
  }

  try {
    switch (kind) {
      case "init":
        return { input: { kind, name: optionalString(body.name) } };
      case "status":
        return {
          input: {
            includeDeploymentStatus: optionalBoolean(body.includeDeploymentStatus),
            kind,
            targetAlias: optionalString(body.targetAlias),
          },
        };
      case "save":
        return { input: { check: optionalBoolean(body.check), kind } };
      case "check":
      case "pull":
        return { input: { kind, targetAlias: optionalString(body.targetAlias) } };
      case "push":
        return {
          input: {
            allowStale: optionalBoolean(body.allowStale),
            apply: optionalBoolean(body.apply),
            kind,
            replace: optionalBoolean(body.replace),
            replaceInstallSet: optionalBoolean(body.replaceInstallSet),
            targetAlias: optionalString(body.targetAlias),
          },
        };
      case "deployPlan":
      case "deployApply": {
        const migrationPolicy = optionalString(body.migrationPolicy);

        if (
          migrationPolicy !== undefined &&
          migrationPolicy !== null &&
          migrationPolicy !== "existing" &&
          migrationPolicy !== "new"
        ) {
          return { error: 'Workspace gateway migrationPolicy must be "new" or "existing".' };
        }

        return {
          input: {
            kind,
            migrationPolicy,
            targetAlias: optionalString(body.targetAlias),
          },
        };
      }
      case "credentialSetup": {
        const provider = optionalString(body.provider);

        if (provider !== "cloudflare") {
          return { error: 'Workspace credential setup provider must be "cloudflare".' };
        }

        return {
          input: {
            kind,
            profileLabel: optionalString(body.profileLabel),
            provider,
          },
        };
      }
      default:
        return { error: `Workspace gateway operation "${kind}" is not supported.` };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function withWorkspaceRoot(
  input: Exclude<GatewayStartInput, CredentialSetupOperationInput>,
  workspaceRoot: string,
): FormlessWorkspaceOperationInput {
  return {
    ...input,
    workspacePath: workspaceRoot,
  } as FormlessWorkspaceOperationInput;
}

function forbiddenGatewayInput(value: unknown, label = "request"): string | undefined {
  if (typeof value === "string") {
    if (secretLookingText(value)) {
      return `Workspace gateway ${label} includes secret-looking text.`;
    }

    if (pathTraversalText(value) || shellCommandText(value)) {
      return `Workspace gateway ${label} includes forbidden path or shell text.`;
    }

    return undefined;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const forbidden = forbiddenGatewayInput(item, `${label}[${index}]`);

      if (forbidden) {
        return forbidden;
      }
    }

    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const [key, child] of Object.entries(value)) {
    if (forbiddenGatewayInputKey(key)) {
      return `Workspace gateway request includes forbidden key "${key}".`;
    }

    const forbidden = forbiddenGatewayInput(child, `${label}.${key}`);

    if (forbidden) {
      return forbidden;
    }
  }

  return undefined;
}

function forbiddenGatewayInputKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll(/[-_]/g, "");

  return (
    normalized === "path" ||
    normalized === "workspacepath" ||
    normalized === "filepath" ||
    normalized === "filesystem" ||
    normalized === "command" ||
    normalized === "shell" ||
    normalized.startsWith("raw") ||
    normalized.includes("providerstate") ||
    normalized.endsWith("token") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("password") ||
    normalized.includes("apikey")
  );
}

function secretLookingText(value: string): boolean {
  return /(?:TOKEN|PASSWORD|SECRET|API[_-]?KEY)\s*=/i.test(value) || /^Bearer\s+/i.test(value);
}

function pathTraversalText(value: string): boolean {
  return (
    value.includes("../") ||
    value.includes("..\\") ||
    /^\/(?:etc|tmp|Users|var|home)\//.test(value) ||
    /^[A-Za-z]:\\/.test(value)
  );
}

function shellCommandText(value: string): boolean {
  return /(?:^|[;&|]\s*)(?:bash|curl|rm|sh|zsh)(?:\s|$)/.test(value);
}

function localWorkspaceGatewayRoot(
  request: Request,
  env: LocalWorkspaceGatewayEnv,
): string | undefined {
  if (env.FORMLESS_LOCAL_WORKSPACE_GATEWAY !== "1") {
    return undefined;
  }

  const profileKind = resolveRuntimeProfileKind({
    hostname: new URL(request.url).hostname,
    profile: env.FORMLESS_RUNTIME_PROFILE,
  });

  if (profileKind !== "instance" && profileKind !== "dev") {
    return undefined;
  }

  const workspaceRoot = env.FORMLESS_WORKSPACE_GATEWAY_ROOT?.trim();

  return workspaceRoot ? path.resolve(workspaceRoot) : undefined;
}

function isLocalWorkspaceGatewayPath(pathname: string): boolean {
  return (
    pathname === LOCAL_WORKSPACE_GATEWAY_API_ROUTE_PREFIX ||
    pathname.startsWith(`${LOCAL_WORKSPACE_GATEWAY_API_ROUTE_PREFIX}/`)
  );
}

function gatewayOperationPath(pathname: string): { operationId: string } | undefined {
  const suffix = pathname.slice(`${LOCAL_WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/`.length);

  if (pathname === LOCAL_WORKSPACE_GATEWAY_OPERATIONS_API_PATH || suffix === pathname) {
    return undefined;
  }

  const parts = suffix.split("/").filter(Boolean);

  if (parts.length === 1 || (parts.length === 2 && parts[1] === "progress")) {
    return { operationId: parts[0] ?? "" };
  }

  return undefined;
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

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value !== "string") {
    throw new Error("Workspace gateway string field must be a string.");
  }

  return value;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error("Workspace gateway boolean field must be a boolean.");
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

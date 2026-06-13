import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";

import {
  WORKSPACE_GATEWAY_ACTOR_HEADER,
  WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  WORKSPACE_GATEWAY_CSRF_HEADER,
  WORKSPACE_GATEWAY_CSRF_TOKEN_ENV,
  WORKSPACE_GATEWAY_ENABLED_ENV,
  WORKSPACE_GATEWAY_OPERATION_KIND_HEADER,
  WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
  WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_ROOT_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
  WORKSPACE_GATEWAY_STATUS_API_PATH,
  isWorkspaceGatewayOperationKind,
  isWorkspaceGatewayPath,
  parseWorkspaceGatewayOperationId,
  parseWorkspaceGatewayStartInput,
  workspaceGatewayOperationExecutionDecision,
  workspaceGatewayOperationPath,
  workspaceGatewayReadOperationIntent,
  workspaceGatewayStartOperationIntent,
  workspaceGatewayStatusIntent,
  type WorkspaceGatewayActor,
  type WorkspaceGatewayActorFacts,
  type WorkspaceGatewayAuthorizationVia,
  type WorkspaceGatewayOperation,
  type WorkspaceGatewayOperationIntent,
  type WorkspaceGatewayOperationKind,
  type WorkspaceGatewayStartInput,
  type WorkspaceGatewayStartInputParseResult,
} from "./index.ts";
import {
  WORKSPACE_OPERATION_CAPABILITIES,
  type WorkspaceOperationRequiredCapability,
} from "@dpeek/formless-workspace";

export {
  WORKSPACE_GATEWAY_ACTOR_HEADER,
  WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
  WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  WORKSPACE_GATEWAY_CSRF_HEADER,
  WORKSPACE_GATEWAY_CSRF_TOKEN_ENV,
  WORKSPACE_GATEWAY_ENABLED_ENV,
  WORKSPACE_GATEWAY_OPERATION_KIND_HEADER,
  WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
  WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_ROOT_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
  WORKSPACE_GATEWAY_STATUS_API_PATH,
} from "./index.ts";
export type {
  WorkspaceGatewayActor,
  WorkspaceGatewayActorFacts,
  WorkspaceGatewayAuthorizationVia,
  WorkspaceGatewayOperation,
  WorkspaceGatewayOperationKind,
  WorkspaceGatewayResponse,
  WorkspaceGatewayStartInput,
} from "./index.ts";

export type WorkspaceGatewaySidecarEnv = {
  FORMLESS_ADMIN_TOKEN?: string;
  FORMLESS_LOCAL_WORKSPACE_GATEWAY?: string;
  FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_CSRF_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_ROOT?: string;
  FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL?: string;
};

export type WorkspaceGatewaySidecar = {
  close: () => Promise<void>;
  endpoint: string;
  proxyToken: string;
};

export type WorkspaceGatewaySidecarAuthorization = {
  actor: WorkspaceGatewayActor;
  via: WorkspaceGatewayAuthorizationVia;
};

export type WorkspaceGatewaySidecarOperationHandlers = {
  readOperation: (input: {
    authorization: WorkspaceGatewaySidecarAuthorization;
    operationId: string;
    request: Request;
    workspaceRoot: string;
  }) => Promise<WorkspaceGatewayOperation | undefined>;
  startOperation: (input: {
    authorization: WorkspaceGatewaySidecarAuthorization;
    operationInput: WorkspaceGatewayStartInput;
    request: Request;
    workspaceRoot: string;
  }) => Promise<WorkspaceGatewayOperation>;
  status: (input: {
    authorization: WorkspaceGatewaySidecarAuthorization;
    request: Request;
    workspaceRoot: string;
  }) => Promise<WorkspaceGatewayOperation>;
};

export type WorkspaceGatewaySidecarDependencies = {
  createProxyToken: () => string;
  operations: WorkspaceGatewaySidecarOperationHandlers;
};

export type WorkspaceGatewayOwnerSessionValidationResult =
  | { ok: true }
  | { ok: false; reason?: string };

export type WorkspaceGatewayLocalProxyDependencies = {
  capabilities?: readonly WorkspaceOperationRequiredCapability[];
  proxyFetch?: typeof fetch;
  readOwnerSetupStatus?: (request: Request) => Promise<{ setupComplete: boolean }>;
  routeAvailable?: boolean | ((request: Request) => boolean);
  validateOwnerSession?: (
    request: Request,
  ) =>
    | Promise<WorkspaceGatewayOwnerSessionValidationResult>
    | WorkspaceGatewayOwnerSessionValidationResult;
};

export type WorkspaceGatewayProxyTarget = {
  endpoint: string;
  proxyToken: string;
};

type GatewayAuthorization =
  | WorkspaceGatewaySidecarAuthorization
  | {
      error: string;
      status: number;
    };

export async function handleWorkspaceGatewayLocalProxyRequest(
  request: Request,
  env: WorkspaceGatewaySidecarEnv,
  dependencies: WorkspaceGatewayLocalProxyDependencies = {},
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (!isWorkspaceGatewayPath(url.pathname)) {
    return undefined;
  }

  const proxyTarget = workspaceGatewayProxyTargetFromEnv(request, env, dependencies);

  if (!proxyTarget) {
    return displaySafeJson({ error: "Not found." }, 404);
  }

  if (url.pathname === WORKSPACE_GATEWAY_STATUS_API_PATH) {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const intent = workspaceGatewayStatusIntent();
    const authorization = await authorizeGatewayRequest(request, env, dependencies, intent);

    if ("error" in authorization) {
      return displaySafeJson({ error: authorization.error }, authorization.status);
    }

    return proxyWorkspaceGatewayRequest(request, env, dependencies, proxyTarget, authorization, {
      intent,
    });
  }

  if (url.pathname === WORKSPACE_GATEWAY_OPERATIONS_API_PATH) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    const parsed = await parseGatewayStartInput(request.clone());

    if (!parsed.ok) {
      return displaySafeJson({ error: parsed.error }, 400);
    }

    const intent = workspaceGatewayStartOperationIntent(parsed.input);
    const authorization = await authorizeGatewayRequest(request, env, dependencies, intent);

    if ("error" in authorization) {
      return displaySafeJson({ error: authorization.error }, authorization.status);
    }

    return proxyWorkspaceGatewayRequest(request, env, dependencies, proxyTarget, authorization, {
      intent,
    });
  }

  const operationMatch = workspaceGatewayOperationPath(url.pathname);

  if (operationMatch) {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const parsedOperationId = parseWorkspaceGatewayOperationId(operationMatch.operationId);

    if (!parsedOperationId.ok) {
      return displaySafeJson({ error: parsedOperationId.error }, 400);
    }

    const readIntent = readOperationIntentFromRequest(request);

    if (!readIntent.ok) {
      return displaySafeJson({ error: readIntent.error }, 400);
    }

    const authorization = await authorizeGatewayReadOperationRequest(
      request,
      env,
      dependencies,
      readIntent.intent,
    );

    if ("error" in authorization) {
      return displaySafeJson({ error: authorization.error }, authorization.status);
    }

    return proxyWorkspaceGatewayRequest(
      request,
      env,
      dependencies,
      proxyTarget,
      authorization,
      readIntent.intent === undefined ? {} : { intent: readIntent.intent },
    );
  }

  return displaySafeJson({ error: "Not found." }, 404);
}

export async function handleWorkspaceGatewaySidecarRequest(
  request: Request,
  env: WorkspaceGatewaySidecarEnv,
  handlers: WorkspaceGatewaySidecarOperationHandlers,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (!isWorkspaceGatewayPath(url.pathname)) {
    return undefined;
  }

  const workspaceRoot = workspaceGatewaySidecarRoot(env);

  if (!workspaceRoot) {
    return displaySafeJson({ error: "Not found." }, 404);
  }

  if (url.pathname === WORKSPACE_GATEWAY_STATUS_API_PATH) {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const authorization = authorizeSidecarGatewayRequest(
      request,
      env,
      workspaceGatewayStatusIntent(),
    );

    if ("error" in authorization) {
      return displaySafeJson({ error: authorization.error }, authorization.status);
    }

    return sidecarOperationResponse(
      await handlers.status({ authorization, request, workspaceRoot }),
    );
  }

  if (url.pathname === WORKSPACE_GATEWAY_OPERATIONS_API_PATH) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    const parsed = await parseGatewayStartInput(request);

    if (!parsed.ok) {
      return displaySafeJson({ error: parsed.error }, 400);
    }

    const authorization = authorizeSidecarGatewayRequest(
      request,
      env,
      workspaceGatewayStartOperationIntent(parsed.input),
    );

    if ("error" in authorization) {
      return displaySafeJson({ error: authorization.error }, authorization.status);
    }

    return sidecarOperationResponse(
      await handlers.startOperation({
        authorization,
        operationInput: parsed.input,
        request,
        workspaceRoot,
      }),
    );
  }

  const operationMatch = workspaceGatewayOperationPath(url.pathname);

  if (operationMatch) {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const parsedOperationId = parseWorkspaceGatewayOperationId(operationMatch.operationId);

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

    const operation = await handlers.readOperation({
      authorization,
      operationId: parsedOperationId.operationId,
      request,
      workspaceRoot,
    });

    if (!operation) {
      return displaySafeJson({ error: "Workspace operation was not found." }, 404);
    }

    if (proxiedOperation.operation && proxiedOperation.operation !== operation.operation) {
      return displaySafeJson(
        { error: "Workspace operation intent does not match operation state." },
        400,
      );
    }

    if (
      authorization.via === "bootstrap" &&
      (!isWorkspaceGatewayOperationKind(operation.operation) ||
        !workspaceGatewayReadOperationIntent(operation.operation).bootstrapAllowed)
    ) {
      return displaySafeJson(
        { error: "Workspace bootstrap authorization is limited to status operations." },
        403,
      );
    }

    return sidecarOperationResponse(operation);
  }

  return displaySafeJson({ error: "Not found." }, 404);
}

export async function startWorkspaceGatewaySidecar(
  input: {
    env?: WorkspaceGatewaySidecarEnv;
    workspaceRoot: string;
  },
  dependencies: WorkspaceGatewaySidecarDependencies,
): Promise<WorkspaceGatewaySidecar> {
  const proxyToken = dependencies.createProxyToken();
  const sidecarEnv: WorkspaceGatewaySidecarEnv = {
    ...input.env,
    [WORKSPACE_GATEWAY_ENABLED_ENV]: "1",
    [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: proxyToken,
    [WORKSPACE_GATEWAY_ROOT_ENV]: input.workspaceRoot,
  };
  const server = createServer((req, res) => {
    void createWorkspaceGatewaySidecarNodeHandler(sidecarEnv, dependencies.operations)(req, res);
  });
  const endpoint = await listenWorkspaceGatewaySidecar(server);

  return {
    close: () => closeWorkspaceGatewaySidecar(server),
    endpoint,
    proxyToken,
  };
}

export function createWorkspaceGatewayLocalProxyMiddleware(
  env: WorkspaceGatewaySidecarEnv,
  dependencies: WorkspaceGatewayLocalProxyDependencies = {},
) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const request = await nodeRequestFromIncomingMessage(req);
    const response = await handleWorkspaceGatewayLocalProxyRequest(request, env, dependencies);

    if (!response) {
      next();
      return;
    }

    await sendNodeResponse(res, response);
  };
}

export function createWorkspaceGatewaySidecarNodeHandler(
  env: WorkspaceGatewaySidecarEnv,
  handlers: WorkspaceGatewaySidecarOperationHandlers,
) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const request = await nodeRequestFromIncomingMessage(req);
    const response =
      (await handleWorkspaceGatewaySidecarRequest(request, env, handlers)) ??
      displaySafeJson({ error: "Not found." }, 404);

    await sendNodeResponse(res, response);
  };
}

export function workspaceGatewayProxyTargetFromEnv(
  request: Request,
  env: WorkspaceGatewaySidecarEnv,
  dependencies: Pick<WorkspaceGatewayLocalProxyDependencies, "routeAvailable"> = {},
): WorkspaceGatewayProxyTarget | undefined {
  if (env[WORKSPACE_GATEWAY_ENABLED_ENV] !== "1") {
    return undefined;
  }

  const routeAvailable =
    typeof dependencies.routeAvailable === "function"
      ? dependencies.routeAvailable(request)
      : dependencies.routeAvailable !== false;

  if (!routeAvailable) {
    return undefined;
  }

  const endpoint = env[WORKSPACE_GATEWAY_SIDECAR_URL_ENV]?.trim();
  const proxyToken = expectedProxyToken(env);

  if (!endpoint || !proxyToken || !isLoopbackSidecarEndpoint(endpoint)) {
    return undefined;
  }

  return { endpoint, proxyToken };
}

export function workspaceGatewaySidecarRoot(env: WorkspaceGatewaySidecarEnv): string | undefined {
  if (env[WORKSPACE_GATEWAY_ENABLED_ENV] !== "1") {
    return undefined;
  }

  const workspaceRoot = env[WORKSPACE_GATEWAY_ROOT_ENV]?.trim();

  return workspaceRoot ? path.resolve(workspaceRoot) : undefined;
}

export function isLoopbackSidecarEndpoint(value: string): boolean {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return (
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname === "[::1]" ||
      url.hostname === "::1")
  );
}

function authorizeSidecarGatewayRequest(
  request: Request,
  env: WorkspaceGatewaySidecarEnv,
  intent: WorkspaceGatewayOperationIntent,
): GatewayAuthorization {
  const proxied = authorizeSidecarProxyRequest(request, env, intent);

  if (proxied) {
    return proxied;
  }

  return authorizeDirectSidecarAutomationRequest(request, env, intent);
}

function authorizeSidecarGatewayReadOperationRequest(
  request: Request,
  env: WorkspaceGatewaySidecarEnv,
): GatewayAuthorization {
  const proxied = authorizeSidecarProxyRequest(request, env);

  if (proxied) {
    return proxied;
  }

  return authorizeDirectSidecarAutomationRequest(request, env);
}

function authorizeSidecarProxyRequest(
  request: Request,
  env: WorkspaceGatewaySidecarEnv,
  intent?: WorkspaceGatewayOperationIntent,
): GatewayAuthorization | undefined {
  const proxyToken = request.headers.get(WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER);

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
      error: "Workspace bootstrap authorization is limited to status operations.",
      status: 403,
    };
  }

  return intent === undefined
    ? actorFacts
    : authorizeGatewayOperationExecution(actorFacts, WORKSPACE_OPERATION_CAPABILITIES, intent);
}

function authorizeDirectSidecarAutomationRequest(
  request: Request,
  env: WorkspaceGatewaySidecarEnv,
  intent?: WorkspaceGatewayOperationIntent,
): GatewayAuthorization {
  if (!request.headers.get("Origin") && matchesAdminBearer(request, env)) {
    const authorization = { actor: "automation", via: "admin-bearer" } as const;

    return intent === undefined
      ? authorization
      : authorizeGatewayOperationExecution(authorization, WORKSPACE_OPERATION_CAPABILITIES, intent);
  }

  return { error: "Workspace gateway proxy authorization is required.", status: 401 };
}

function proxiedActorFacts(request: Request): WorkspaceGatewayActorFacts | undefined {
  const actor = request.headers.get(WORKSPACE_GATEWAY_ACTOR_HEADER);
  const via = request.headers.get(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER);

  if (!isWorkspaceGatewayActor(actor) || !isWorkspaceGatewayAuthorizationVia(via)) {
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
): { ok: true; operation?: WorkspaceGatewayOperationKind } | { error: string; ok: false } {
  const operation = request.headers.get(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER);

  if (operation === null) {
    return { ok: true };
  }

  if (!isWorkspaceGatewayOperationKind(operation)) {
    return { error: "Workspace gateway operation intent is invalid.", ok: false };
  }

  return { ok: true, operation };
}

function isWorkspaceGatewayActor(value: unknown): value is WorkspaceGatewayActor {
  return value === "automation" || value === "browser" || value === "cli" || value === "system";
}

function isWorkspaceGatewayAuthorizationVia(
  value: unknown,
): value is WorkspaceGatewayAuthorizationVia {
  return value === "admin-bearer" || value === "bootstrap" || value === "owner-session";
}

async function authorizeGatewayRequest(
  request: Request,
  env: WorkspaceGatewaySidecarEnv,
  dependencies: WorkspaceGatewayLocalProxyDependencies,
  intent: WorkspaceGatewayOperationIntent,
): Promise<GatewayAuthorization> {
  if (!isSameOriginOrNoOrigin(request)) {
    return { error: "Workspace gateway requests must be same-origin.", status: 403 };
  }

  if (matchesBootstrapCapability(request, env)) {
    if (!intent.bootstrapAllowed) {
      return {
        error: "Workspace bootstrap authorization is limited to status operations.",
        status: 403,
      };
    }

    if (await ownerSetupComplete(request, dependencies)) {
      return { error: "Workspace bootstrap authorization has expired.", status: 403 };
    }

    return authorizeGatewayOperationExecution(
      { actor: "browser", via: "bootstrap" },
      dependencies.capabilities ?? WORKSPACE_OPERATION_CAPABILITIES,
      intent,
    );
  }

  if (!request.headers.get("Origin") && matchesAdminBearer(request, env)) {
    return authorizeGatewayOperationExecution(
      { actor: "automation", via: "admin-bearer" },
      dependencies.capabilities ?? WORKSPACE_OPERATION_CAPABILITIES,
      intent,
    );
  }

  if (intent.mutating && !isSameOriginWithOrigin(request)) {
    return {
      error: "Workspace gateway browser mutations require a same-origin Origin header.",
      status: 403,
    };
  }

  const ownerSession = await validateOwnerSession(request, dependencies);

  if (ownerSession.ok) {
    if (intent.mutating && !validCsrfProof(request, env)) {
      return { error: "Workspace gateway browser mutations require CSRF proof.", status: 403 };
    }

    return authorizeGatewayOperationExecution(
      { actor: "browser", via: "owner-session" },
      dependencies.capabilities ?? WORKSPACE_OPERATION_CAPABILITIES,
      intent,
    );
  }

  return {
    error: "Workspace gateway authorization is required.",
    status: 401,
  };
}

async function authorizeGatewayReadOperationRequest(
  request: Request,
  env: WorkspaceGatewaySidecarEnv,
  dependencies: WorkspaceGatewayLocalProxyDependencies,
  intent: WorkspaceGatewayOperationIntent | undefined,
): Promise<GatewayAuthorization> {
  if (!isSameOriginOrNoOrigin(request)) {
    return { error: "Workspace gateway requests must be same-origin.", status: 403 };
  }

  if (matchesBootstrapCapability(request, env)) {
    if (!intent) {
      return {
        error: "Workspace gateway operation intent is required for bootstrap reads.",
        status: 400,
      };
    }

    if (!intent.bootstrapAllowed) {
      return {
        error: "Workspace bootstrap authorization is limited to status operations.",
        status: 403,
      };
    }

    if (await ownerSetupComplete(request, dependencies)) {
      return { error: "Workspace bootstrap authorization has expired.", status: 403 };
    }

    return authorizeGatewayOperationExecution(
      { actor: "browser", via: "bootstrap" },
      dependencies.capabilities ?? WORKSPACE_OPERATION_CAPABILITIES,
      intent,
    );
  }

  if (!request.headers.get("Origin") && matchesAdminBearer(request, env)) {
    return intent === undefined
      ? { actor: "automation", via: "admin-bearer" }
      : authorizeGatewayOperationExecution(
          { actor: "automation", via: "admin-bearer" },
          dependencies.capabilities ?? WORKSPACE_OPERATION_CAPABILITIES,
          intent,
        );
  }

  const ownerSession = await validateOwnerSession(request, dependencies);

  if (ownerSession.ok) {
    return intent === undefined
      ? { actor: "browser", via: "owner-session" }
      : authorizeGatewayOperationExecution(
          { actor: "browser", via: "owner-session" },
          dependencies.capabilities ?? WORKSPACE_OPERATION_CAPABILITIES,
          intent,
        );
  }

  return {
    error: "Workspace gateway authorization is required.",
    status: 401,
  };
}

function authorizeGatewayOperationExecution(
  authorization: Exclude<GatewayAuthorization, { error: string }>,
  capabilities: readonly WorkspaceOperationRequiredCapability[],
  intent: WorkspaceGatewayOperationIntent,
): GatewayAuthorization {
  const decision = workspaceGatewayOperationExecutionDecision({
    actor: authorization.actor,
    capabilities,
    intent,
  });

  if (!decision.ok) {
    return { error: decision.error, status: 403 };
  }

  return authorization;
}

async function proxyWorkspaceGatewayRequest(
  request: Request,
  env: WorkspaceGatewaySidecarEnv,
  dependencies: WorkspaceGatewayLocalProxyDependencies,
  proxyTarget: WorkspaceGatewayProxyTarget,
  authorization: Exclude<GatewayAuthorization, { error: string }>,
  options: { intent?: WorkspaceGatewayOperationIntent },
): Promise<Response> {
  let response: Response;

  try {
    response = await (dependencies.proxyFetch ?? fetch)(sidecarRequestUrl(request, proxyTarget), {
      body: await proxyRequestBody(request),
      headers: proxyWorkspaceGatewayHeaders(request, proxyTarget, authorization, options),
      method: request.method,
    });
  } catch {
    return displaySafeJson({ error: "Workspace gateway sidecar is unavailable." }, 502);
  }

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
  env: WorkspaceGatewaySidecarEnv,
  authorization: Exclude<GatewayAuthorization, { error: string }>,
  operation: unknown,
): Response {
  const headers = new Headers();
  const csrfToken = env[WORKSPACE_GATEWAY_CSRF_TOKEN_ENV]?.trim();
  const includeCsrfToken =
    authorization.via === "owner-session" && authorization.actor === "browser";

  if (includeCsrfToken && csrfToken) {
    headers.set(
      "Set-Cookie",
      `${WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${csrfToken}; Path=/; SameSite=Lax${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
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

function sidecarRequestUrl(request: Request, proxyTarget: WorkspaceGatewayProxyTarget): string {
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
  proxyTarget: WorkspaceGatewayProxyTarget,
  authorization: Exclude<GatewayAuthorization, { error: string }>,
  options: { intent?: WorkspaceGatewayOperationIntent },
): Headers {
  const headers = new Headers(request.headers);

  headers.delete("Authorization");
  headers.delete("Cookie");
  headers.delete(WORKSPACE_GATEWAY_BOOTSTRAP_HEADER);
  headers.delete(WORKSPACE_GATEWAY_CSRF_HEADER);
  headers.delete(WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER);
  headers.delete(WORKSPACE_GATEWAY_ACTOR_HEADER);
  headers.delete(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER);
  headers.delete(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER);
  headers.set(WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER, proxyTarget.proxyToken);
  headers.set(WORKSPACE_GATEWAY_ACTOR_HEADER, authorization.actor);
  headers.set(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER, authorization.via);

  if (options.intent) {
    headers.set(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER, options.intent.operation);
  }

  return headers;
}

function readOperationIntentFromRequest(
  request: Request,
): { intent?: WorkspaceGatewayOperationIntent; ok: true } | { error: string; ok: false } {
  const operationKind = request.headers.get(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER);

  if (operationKind === null) {
    return { ok: true };
  }

  if (!isWorkspaceGatewayOperationKind(operationKind)) {
    return { error: "Workspace gateway operation intent is invalid.", ok: false };
  }

  return {
    intent: workspaceGatewayReadOperationIntent(operationKind),
    ok: true,
  };
}

async function parseGatewayStartInput(request: {
  json: () => Promise<unknown>;
}): Promise<WorkspaceGatewayStartInputParseResult> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return { error: "Workspace gateway operation request must be JSON.", ok: false };
  }

  return parseWorkspaceGatewayStartInput(body);
}

async function ownerSetupComplete(
  request: Request,
  dependencies: WorkspaceGatewayLocalProxyDependencies,
): Promise<boolean> {
  if (!dependencies.readOwnerSetupStatus) {
    return false;
  }

  return (await dependencies.readOwnerSetupStatus(request)).setupComplete;
}

async function validateOwnerSession(
  request: Request,
  dependencies: WorkspaceGatewayLocalProxyDependencies,
): Promise<WorkspaceGatewayOwnerSessionValidationResult> {
  if (!dependencies.validateOwnerSession) {
    return { ok: false, reason: "missing-validator" };
  }

  return dependencies.validateOwnerSession(request);
}

function matchesBootstrapCapability(request: Request, env: WorkspaceGatewaySidecarEnv): boolean {
  const expected = env[WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV]?.trim();

  return (
    expected !== undefined &&
    expected !== "" &&
    request.headers.get(WORKSPACE_GATEWAY_BOOTSTRAP_HEADER) === expected
  );
}

function matchesAdminBearer(request: Request, env: WorkspaceGatewaySidecarEnv): boolean {
  const adminToken = env.FORMLESS_ADMIN_TOKEN?.trim();
  const authorization = request.headers.get("Authorization")?.trim();

  if (!adminToken || !authorization) {
    return false;
  }

  return authorization.match(/^Bearer\s+(.+)$/i)?.[1] === adminToken;
}

function validCsrfProof(request: Request, env: WorkspaceGatewaySidecarEnv): boolean {
  const expected = env[WORKSPACE_GATEWAY_CSRF_TOKEN_ENV]?.trim();

  if (!expected) {
    return false;
  }

  return (
    request.headers.get(WORKSPACE_GATEWAY_CSRF_HEADER) === expected &&
    requestCookie(request, WORKSPACE_GATEWAY_CSRF_COOKIE_NAME) === expected
  );
}

function expectedProxyToken(env: WorkspaceGatewaySidecarEnv): string | undefined {
  const proxyToken = env[WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]?.trim();

  return proxyToken ? proxyToken : undefined;
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

async function listenWorkspaceGatewaySidecar(server: Server): Promise<string> {
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

async function closeWorkspaceGatewaySidecar(server: Server): Promise<void> {
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

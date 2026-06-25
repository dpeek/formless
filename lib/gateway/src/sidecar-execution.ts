import {
  WORKSPACE_GATEWAY_ACTOR_HEADER,
  WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  WORKSPACE_GATEWAY_OPERATION_KIND_HEADER,
  WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  isWorkspaceGatewayOperationKind,
  workspaceGatewayOperationExecutionDecision,
  workspaceGatewayReadOperationIntent,
  type WorkspaceGatewayActor,
  type WorkspaceGatewayAuthorizationVia,
  type WorkspaceGatewayOperation,
  type WorkspaceGatewayOperationIntent,
  type WorkspaceGatewayOperationKind,
  type WorkspaceGatewayStartInput,
} from "./index.ts";
import {
  WORKSPACE_OPERATION_CAPABILITIES,
  type WorkspaceOperationRequiredCapability,
} from "@dpeek/formless-workspace";

export type WorkspaceGatewaySidecarExecutionAuthorization = {
  actor: WorkspaceGatewayActor;
  via: WorkspaceGatewayAuthorizationVia;
};

export type WorkspaceGatewaySidecarExecutionAuthorizationEnv = {
  adminToken?: string;
  proxyToken?: string;
};

export type WorkspaceGatewaySidecarExecutionContext = {
  mutating?: boolean;
  operationInput?: WorkspaceGatewayStartInput;
};

export type WorkspaceGatewaySidecarExecutionDecision =
  | { ok: true }
  | { error: string; ok: false; status: number };

export type WorkspaceGatewaySidecarExecutionAuthorizationResult =
  | WorkspaceGatewaySidecarExecutionAuthorization
  | { error: string; status: number };

export function authorizeWorkspaceGatewaySidecarExecutionRequest(
  request: Request,
  env: WorkspaceGatewaySidecarExecutionAuthorizationEnv,
  intent: WorkspaceGatewayOperationIntent,
  context: WorkspaceGatewaySidecarExecutionContext = {},
): WorkspaceGatewaySidecarExecutionAuthorizationResult {
  const proxied = authorizeSidecarProxyRequest(request, env, intent, context);

  if (proxied) {
    return proxied;
  }

  return authorizeDirectSidecarAutomationRequest(request, env, intent, context);
}

export function authorizeWorkspaceGatewaySidecarExecutionReadRequest(
  request: Request,
  env: WorkspaceGatewaySidecarExecutionAuthorizationEnv,
  intent?: WorkspaceGatewayOperationIntent,
): WorkspaceGatewaySidecarExecutionAuthorizationResult {
  const proxied = authorizeSidecarProxyRequest(request, env, intent, { mutating: false });

  if (proxied) {
    return proxied;
  }

  return authorizeDirectSidecarAutomationRequest(request, env, intent, { mutating: false });
}

export function readWorkspaceGatewaySidecarOperationIntent(request: Request):
  | {
      intent?: WorkspaceGatewayOperationIntent;
      ok: true;
      operation?: WorkspaceGatewayOperationKind;
    }
  | {
      error: string;
      ok: false;
    } {
  const operation = request.headers.get(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER);

  if (operation === null) {
    return { ok: true };
  }

  if (!isWorkspaceGatewayOperationKind(operation)) {
    return { error: "Workspace gateway operation intent is invalid.", ok: false };
  }

  return { intent: workspaceGatewayReadOperationIntent(operation), ok: true, operation };
}

export function validateWorkspaceGatewaySidecarOperationStateIntent(input: {
  authorization: WorkspaceGatewaySidecarExecutionAuthorization;
  operation: WorkspaceGatewayOperation;
  expectedOperation?: WorkspaceGatewayOperationKind;
}): WorkspaceGatewaySidecarExecutionDecision {
  if (input.expectedOperation && input.expectedOperation !== input.operation.operation) {
    return {
      error: "Workspace operation intent does not match operation state.",
      ok: false,
      status: 400,
    };
  }

  if (
    input.authorization.via === "bootstrap" &&
    (!isWorkspaceGatewayOperationKind(input.operation.operation) ||
      !workspaceGatewayReadOperationIntent(input.operation.operation).bootstrapAllowed)
  ) {
    return {
      error: "Workspace bootstrap authorization is limited to status operations.",
      ok: false,
      status: 403,
    };
  }

  return { ok: true };
}

function authorizeSidecarProxyRequest(
  request: Request,
  env: WorkspaceGatewaySidecarExecutionAuthorizationEnv,
  intent?: WorkspaceGatewayOperationIntent,
  context: WorkspaceGatewaySidecarExecutionContext = {},
): WorkspaceGatewaySidecarExecutionAuthorizationResult | undefined {
  const proxyToken = request.headers.get(WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER);

  if (proxyToken === null) {
    return undefined;
  }

  if (proxyToken !== sidecarProxyToken(env)) {
    return { error: "Workspace gateway proxy authorization is required.", status: 401 };
  }

  const actorFacts = proxiedActorFacts(request);

  if (!actorFacts) {
    return { error: "Workspace gateway proxy actor facts are invalid.", status: 400 };
  }

  return authorizeSidecarExecution(actorFacts, request, intent, context);
}

function authorizeDirectSidecarAutomationRequest(
  request: Request,
  env: WorkspaceGatewaySidecarExecutionAuthorizationEnv,
  intent?: WorkspaceGatewayOperationIntent,
  context: WorkspaceGatewaySidecarExecutionContext = {},
): WorkspaceGatewaySidecarExecutionAuthorizationResult {
  if (!request.headers.get("Origin") && matchesAdminBearer(request, env)) {
    return authorizeSidecarExecution(
      { actor: "automation", via: "admin-bearer" },
      request,
      intent,
      context,
    );
  }

  return { error: "Workspace gateway proxy authorization is required.", status: 401 };
}

function authorizeSidecarExecution(
  authorization: WorkspaceGatewaySidecarExecutionAuthorization,
  request: Request,
  intent?: WorkspaceGatewayOperationIntent,
  context: WorkspaceGatewaySidecarExecutionContext = {},
): WorkspaceGatewaySidecarExecutionAuthorizationResult {
  const operationIntent = readWorkspaceGatewaySidecarOperationIntent(request);

  if (!operationIntent.ok) {
    return { error: operationIntent.error, status: 400 };
  }

  if (operationIntent.operation && intent && operationIntent.operation !== intent.operation) {
    return { error: "Workspace gateway operation intent is invalid.", status: 400 };
  }

  if (authorization.via === "bootstrap" && intent === undefined) {
    return {
      error: "Workspace gateway operation intent is required for bootstrap reads.",
      status: 400,
    };
  }

  if (authorization.via === "bootstrap" && intent && !intent.bootstrapAllowed) {
    return {
      error: "Workspace bootstrap authorization is limited to status operations.",
      status: 403,
    };
  }

  return intent === undefined
    ? authorization
    : authorizeGatewayOperationExecution(
        authorization,
        WORKSPACE_OPERATION_CAPABILITIES,
        intent,
        context,
      );
}

function proxiedActorFacts(
  request: Request,
): WorkspaceGatewaySidecarExecutionAuthorization | undefined {
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

function isWorkspaceGatewayActor(value: unknown): value is WorkspaceGatewayActor {
  return value === "automation" || value === "browser" || value === "cli" || value === "system";
}

function isWorkspaceGatewayAuthorizationVia(
  value: unknown,
): value is WorkspaceGatewayAuthorizationVia {
  return value === "admin-bearer" || value === "bootstrap" || value === "owner-session";
}

function authorizeGatewayOperationExecution(
  authorization: WorkspaceGatewaySidecarExecutionAuthorization,
  capabilities: readonly WorkspaceOperationRequiredCapability[],
  intent: WorkspaceGatewayOperationIntent,
  context: WorkspaceGatewaySidecarExecutionContext = {},
): WorkspaceGatewaySidecarExecutionAuthorizationResult {
  const decision = workspaceGatewayOperationExecutionDecision({
    actor: authorization.actor,
    capabilities,
    intent,
    ...context,
  });

  if (!decision.ok) {
    return { error: decision.error, status: 403 };
  }

  return authorization;
}

function matchesAdminBearer(
  request: Request,
  env: WorkspaceGatewaySidecarExecutionAuthorizationEnv,
): boolean {
  const adminToken = env.adminToken?.trim();
  const authorization = request.headers.get("Authorization")?.trim();

  if (!adminToken || !authorization) {
    return false;
  }

  return authorization.match(/^Bearer\s+(.+)$/i)?.[1] === adminToken;
}

function sidecarProxyToken(
  env: WorkspaceGatewaySidecarExecutionAuthorizationEnv,
): string | undefined {
  const proxyToken = env.proxyToken?.trim();

  return proxyToken ? proxyToken : undefined;
}

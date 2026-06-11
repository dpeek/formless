import {
  WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
  WORKSPACE_GATEWAY_BOOTSTRAP_OPERATION_KINDS,
  WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
} from "./types.ts";
import {
  isWorkspaceBrowserOperationKind,
  parseWorkspaceOperationId,
} from "@dpeek/formless-workspace";
import type {
  WorkspaceGatewayOperationIdParseResult,
  WorkspaceGatewayOperationIntent,
  WorkspaceGatewayOperationKind,
  WorkspaceGatewayOperationPath,
  WorkspaceGatewayStartInput,
  WorkspaceGatewayStartInputParseResult,
} from "./types.ts";

export {
  LOCAL_SESSION_BOOTSTRAP_API_PATH,
  LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_ACTOR_HEADER,
  WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
  WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  WORKSPACE_GATEWAY_BOOTSTRAP_OPERATION_KINDS,
  WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  WORKSPACE_GATEWAY_CSRF_HEADER,
  WORKSPACE_GATEWAY_CSRF_TOKEN_ENV,
  WORKSPACE_GATEWAY_ENABLED_ENV,
  WORKSPACE_GATEWAY_OPERATION_KIND_HEADER,
  WORKSPACE_GATEWAY_OPERATION_KINDS,
  WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
  WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_ROOT_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
  WORKSPACE_GATEWAY_STATUS_API_PATH,
} from "./types.ts";
export type {
  WorkspaceGatewayActor,
  WorkspaceGatewayActorFacts,
  WorkspaceGatewayApiErrorBody,
  WorkspaceGatewayAuthorizationVia,
  WorkspaceGatewayCheckOrPullStartInput,
  WorkspaceGatewayCredentialSetupStartInput,
  WorkspaceGatewayDeployStartInput,
  WorkspaceGatewayDisplayObject,
  WorkspaceGatewayDisplayValue,
  WorkspaceGatewayExternalAuthorizationEvent,
  WorkspaceGatewayOperation,
  WorkspaceGatewayOperationError,
  WorkspaceGatewayOperationEvent,
  WorkspaceGatewayOperationIdParseResult,
  WorkspaceGatewayOperationIntent,
  WorkspaceGatewayOperationKind,
  WorkspaceGatewayOperationLog,
  WorkspaceGatewayOperationPath,
  WorkspaceGatewayOperationResult,
  WorkspaceGatewayOperationStatus,
  WorkspaceGatewayOperationSummary,
  WorkspaceGatewayPushStartInput,
  WorkspaceGatewayResponse,
  WorkspaceGatewaySaveStartInput,
  WorkspaceGatewayStartInput,
  WorkspaceGatewayStartInputParseResult,
  WorkspaceGatewayStatusStartInput,
} from "./types.ts";

const workspaceGatewayBootstrapOperationKindSet = new Set<string>(
  WORKSPACE_GATEWAY_BOOTSTRAP_OPERATION_KINDS,
);

export function isWorkspaceGatewayPath(pathname: string): boolean {
  return (
    pathname === WORKSPACE_GATEWAY_API_ROUTE_PREFIX ||
    pathname.startsWith(`${WORKSPACE_GATEWAY_API_ROUTE_PREFIX}/`)
  );
}

export function workspaceGatewayStatusApiPath(
  apiBasePath = WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
): string {
  return `${trimWorkspaceGatewayApiBasePath(apiBasePath)}/status`;
}

export function workspaceGatewayOperationsApiPath(
  apiBasePath = WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
): string {
  return `${trimWorkspaceGatewayApiBasePath(apiBasePath)}/operations`;
}

export function workspaceGatewayOperationApiPath(
  operationId: string,
  apiBasePath = WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
): string {
  return `${workspaceGatewayOperationsApiPath(apiBasePath)}/${encodeURIComponent(operationId)}`;
}

export function workspaceGatewayOperationPath(
  pathname: string,
): WorkspaceGatewayOperationPath | undefined {
  const suffix = pathname.slice(`${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/`.length);

  if (pathname === WORKSPACE_GATEWAY_OPERATIONS_API_PATH || suffix === pathname) {
    return undefined;
  }

  const parts = suffix.split("/").filter(Boolean);

  if (parts.length === 1) {
    return { operationId: parts[0] ?? "", progress: false };
  }

  if (parts.length === 2 && parts[1] === "progress") {
    return { operationId: parts[0] ?? "", progress: true };
  }

  return undefined;
}

export function parseWorkspaceGatewayOperationId(
  value: unknown,
): WorkspaceGatewayOperationIdParseResult {
  return parseWorkspaceOperationId(value);
}

export function isWorkspaceGatewayOperationKind(
  value: unknown,
): value is WorkspaceGatewayOperationKind {
  return isWorkspaceBrowserOperationKind(value);
}

export function isWorkspaceGatewayBootstrapOperationKind(
  operation: WorkspaceGatewayOperationKind,
): boolean {
  return workspaceGatewayBootstrapOperationKindSet.has(operation);
}

export function isWorkspaceGatewayMutatingStartOperationKind(
  operation: WorkspaceGatewayOperationKind,
): boolean {
  return operation !== "status";
}

export function workspaceGatewayStatusIntent(): WorkspaceGatewayOperationIntent {
  return {
    bootstrapAllowed: true,
    mutating: false,
    operation: "status",
  };
}

export function workspaceGatewayStartOperationIntent(
  input: WorkspaceGatewayOperationKind | WorkspaceGatewayStartInput,
): WorkspaceGatewayOperationIntent {
  const operation = typeof input === "string" ? input : input.kind;

  return {
    bootstrapAllowed: isWorkspaceGatewayBootstrapOperationKind(operation),
    mutating: isWorkspaceGatewayMutatingStartOperationKind(operation),
    operation,
  };
}

export function workspaceGatewayReadOperationIntent(
  operation: WorkspaceGatewayOperationKind,
): WorkspaceGatewayOperationIntent {
  return {
    bootstrapAllowed: isWorkspaceGatewayBootstrapOperationKind(operation),
    mutating: false,
    operation,
  };
}

export function parseWorkspaceGatewayStartInput(
  body: unknown,
): WorkspaceGatewayStartInputParseResult {
  const forbidden = forbiddenWorkspaceGatewayInput(body);

  if (forbidden) {
    return { error: forbidden, ok: false };
  }

  if (!isRecord(body)) {
    return { error: "Workspace gateway operation request must be an object.", ok: false };
  }

  const kind = typeof body.kind === "string" ? body.kind : body.operation;

  if (typeof kind !== "string") {
    return { error: 'Workspace gateway operation request must include "kind".', ok: false };
  }

  try {
    switch (kind) {
      case "status":
        return {
          input: {
            includeDeploymentStatus: optionalBoolean(body.includeDeploymentStatus),
            kind,
            targetAlias: optionalString(body.targetAlias),
          },
          ok: true,
        };
      case "save":
        return { input: { check: optionalBoolean(body.check), kind }, ok: true };
      case "check":
      case "pull":
      case "deploymentRefresh":
        return { input: { kind, targetAlias: optionalString(body.targetAlias) }, ok: true };
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
          ok: true,
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
          return {
            error: 'Workspace gateway migrationPolicy must be "new" or "existing".',
            ok: false,
          };
        }

        return {
          input: {
            kind,
            migrationPolicy,
            targetAlias: optionalString(body.targetAlias),
          },
          ok: true,
        };
      }
      case "credentialSetup": {
        const provider = optionalString(body.provider);

        if (provider !== "cloudflare") {
          return { error: 'Workspace credential setup provider must be "cloudflare".', ok: false };
        }

        return {
          input: {
            accountId: optionalString(body.accountId),
            kind,
            profileLabel: optionalString(body.profileLabel),
            provider,
          },
          ok: true,
        };
      }
      default:
        return { error: `Workspace gateway operation "${kind}" is not supported.`, ok: false };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}

export function forbiddenWorkspaceGatewayInput(
  value: unknown,
  label = "request",
): string | undefined {
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
      const forbidden = forbiddenWorkspaceGatewayInput(item, `${label}[${index}]`);

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
    if (forbiddenWorkspaceGatewayInputKey(key)) {
      return `Workspace gateway request includes forbidden key "${key}".`;
    }

    const forbidden = forbiddenWorkspaceGatewayInput(child, `${label}.${key}`);

    if (forbidden) {
      return forbidden;
    }
  }

  return undefined;
}

function trimWorkspaceGatewayApiBasePath(apiBasePath: string): string {
  return apiBasePath.replace(/\/+$/, "");
}

function forbiddenWorkspaceGatewayInputKey(key: string): boolean {
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

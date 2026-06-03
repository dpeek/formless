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

export const LOCAL_WORKSPACE_GATEWAY_OPERATION_KINDS = [
  "check",
  "credentialSetup",
  "deployApply",
  "deployPlan",
  "init",
  "pull",
  "push",
  "save",
  "status",
] as const;

export const LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_OPERATION_KINDS = ["init", "status"] as const;

const localWorkspaceGatewayOperationKindSet = new Set<string>(
  LOCAL_WORKSPACE_GATEWAY_OPERATION_KINDS,
);
const localWorkspaceGatewayBootstrapOperationKindSet = new Set<string>(
  LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_OPERATION_KINDS,
);

const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;

export type LocalWorkspaceGatewayOperationKind =
  (typeof LOCAL_WORKSPACE_GATEWAY_OPERATION_KINDS)[number];

export type LocalWorkspaceGatewayOperationStatus = "failed" | "queued" | "running" | "succeeded";

export type LocalWorkspaceGatewayActor = "automation" | "browser" | "cli" | "system";

export type LocalWorkspaceGatewayAuthorizationVia = "admin-bearer" | "bootstrap" | "owner-session";

export type LocalWorkspaceGatewayActorFacts = {
  actor: LocalWorkspaceGatewayActor;
  via: LocalWorkspaceGatewayAuthorizationVia;
};

export type LocalWorkspaceGatewayDisplayValue =
  | boolean
  | null
  | number
  | string
  | LocalWorkspaceGatewayDisplayValue[]
  | { [key: string]: LocalWorkspaceGatewayDisplayValue };

export type LocalWorkspaceGatewayDisplayObject = {
  [key: string]: LocalWorkspaceGatewayDisplayValue;
};

export type LocalWorkspaceGatewayOperationSummary = {
  fields: LocalWorkspaceGatewayDisplayObject;
  title: string;
};

export type LocalWorkspaceGatewayOperationLog = {
  at: string;
  id: string;
  level: "error" | "info" | "warning";
  message: string;
};

export type LocalWorkspaceGatewayOperationError = {
  at: string;
  message: string;
};

export type LocalWorkspaceGatewayExternalAuthorizationEvent = {
  at: string;
  id: string;
  profileLabel: string;
  provider: "alchemy" | "cloudflare";
  status: "waiting";
  type: "externalAuthorizationUrl";
  url: string;
};

export type LocalWorkspaceGatewayOperationEvent = LocalWorkspaceGatewayExternalAuthorizationEvent;

export type LocalWorkspaceGatewayOperationResult = {
  deployment?: LocalWorkspaceGatewayDisplayObject;
  details?: LocalWorkspaceGatewayDisplayObject;
  summary: LocalWorkspaceGatewayOperationSummary;
};

export type LocalWorkspaceGatewayOperation = {
  actor: LocalWorkspaceGatewayActor;
  completedAt?: string;
  createdAt: string;
  errors: LocalWorkspaceGatewayOperationError[];
  events: LocalWorkspaceGatewayOperationEvent[];
  id: string;
  input: LocalWorkspaceGatewayDisplayObject;
  kind: "formless.workspaceOperation";
  logs: LocalWorkspaceGatewayOperationLog[];
  operation: LocalWorkspaceGatewayOperationKind;
  result?: LocalWorkspaceGatewayOperationResult;
  startedAt?: string;
  status: LocalWorkspaceGatewayOperationStatus;
  summary: LocalWorkspaceGatewayOperationSummary;
  updatedAt: string;
  version: 1;
  workspace: {
    label: string;
  };
};

export type LocalWorkspaceGatewaySaveStartInput = {
  check?: boolean;
  kind: "save";
};

export type LocalWorkspaceGatewayStatusStartInput = {
  includeDeploymentStatus?: boolean;
  kind: "status";
  targetAlias?: string | null;
};

export type LocalWorkspaceGatewayCheckOrPullStartInput = {
  kind: "check" | "pull";
  targetAlias?: string | null;
};

export type LocalWorkspaceGatewayPushStartInput = {
  allowStale?: boolean;
  apply?: boolean;
  kind: "push";
  replace?: boolean;
  replaceInstallSet?: boolean;
  targetAlias?: string | null;
};

export type LocalWorkspaceGatewayCredentialSetupStartInput = {
  accountId?: string | null;
  kind: "credentialSetup";
  profileLabel?: string | null;
  provider: "cloudflare";
};

export type LocalWorkspaceGatewayDeployStartInput = {
  kind: "deployApply" | "deployPlan";
  migrationPolicy?: "existing" | "new" | null;
  targetAlias?: string | null;
};

export type LocalWorkspaceGatewayInitStartInput = {
  kind: "init";
  name?: string | null;
};

export type LocalWorkspaceGatewayStartInput =
  | LocalWorkspaceGatewayCheckOrPullStartInput
  | LocalWorkspaceGatewayCredentialSetupStartInput
  | LocalWorkspaceGatewayDeployStartInput
  | LocalWorkspaceGatewayInitStartInput
  | LocalWorkspaceGatewayPushStartInput
  | LocalWorkspaceGatewaySaveStartInput
  | LocalWorkspaceGatewayStatusStartInput;

export type LocalWorkspaceGatewayResponse = {
  csrfToken?: string;
  operation: LocalWorkspaceGatewayOperation;
};

export type LocalWorkspaceGatewayApiErrorBody = {
  error: string;
};

export type LocalWorkspaceGatewayOperationIntent = {
  bootstrapAllowed: boolean;
  mutating: boolean;
  operation: LocalWorkspaceGatewayOperationKind;
};

export type LocalWorkspaceGatewayOperationPath = {
  operationId: string;
  progress: boolean;
};

export type LocalWorkspaceGatewayOperationIdParseResult =
  | { ok: true; operationId: string }
  | { error: string; ok: false };

export type LocalWorkspaceGatewayStartInputParseResult =
  | { input: LocalWorkspaceGatewayStartInput; ok: true }
  | { error: string; ok: false };

export function isLocalWorkspaceGatewayPath(pathname: string): boolean {
  return (
    pathname === LOCAL_WORKSPACE_GATEWAY_API_ROUTE_PREFIX ||
    pathname.startsWith(`${LOCAL_WORKSPACE_GATEWAY_API_ROUTE_PREFIX}/`)
  );
}

export function localWorkspaceGatewayStatusApiPath(
  apiBasePath = LOCAL_WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
): string {
  return `${trimLocalWorkspaceGatewayApiBasePath(apiBasePath)}/status`;
}

export function localWorkspaceGatewayOperationsApiPath(
  apiBasePath = LOCAL_WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
): string {
  return `${trimLocalWorkspaceGatewayApiBasePath(apiBasePath)}/operations`;
}

export function localWorkspaceGatewayOperationApiPath(
  operationId: string,
  apiBasePath = LOCAL_WORKSPACE_GATEWAY_API_ROUTE_PREFIX,
): string {
  return `${localWorkspaceGatewayOperationsApiPath(apiBasePath)}/${encodeURIComponent(operationId)}`;
}

export function localWorkspaceGatewayOperationPath(
  pathname: string,
): LocalWorkspaceGatewayOperationPath | undefined {
  const suffix = pathname.slice(`${LOCAL_WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/`.length);

  if (pathname === LOCAL_WORKSPACE_GATEWAY_OPERATIONS_API_PATH || suffix === pathname) {
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

export function parseLocalWorkspaceGatewayOperationId(
  value: unknown,
): LocalWorkspaceGatewayOperationIdParseResult {
  if (typeof value !== "string" || !operationIdPattern.test(value)) {
    return { error: "Workspace operation id is invalid.", ok: false };
  }

  return { ok: true, operationId: value };
}

export function isLocalWorkspaceGatewayOperationKind(
  value: unknown,
): value is LocalWorkspaceGatewayOperationKind {
  return typeof value === "string" && localWorkspaceGatewayOperationKindSet.has(value);
}

export function isLocalWorkspaceGatewayBootstrapOperationKind(
  operation: LocalWorkspaceGatewayOperationKind,
): boolean {
  return localWorkspaceGatewayBootstrapOperationKindSet.has(operation);
}

export function isLocalWorkspaceGatewayMutatingStartOperationKind(
  operation: LocalWorkspaceGatewayOperationKind,
): boolean {
  return operation !== "status";
}

export function localWorkspaceGatewayStatusIntent(): LocalWorkspaceGatewayOperationIntent {
  return {
    bootstrapAllowed: true,
    mutating: false,
    operation: "status",
  };
}

export function localWorkspaceGatewayStartOperationIntent(
  input: LocalWorkspaceGatewayOperationKind | LocalWorkspaceGatewayStartInput,
): LocalWorkspaceGatewayOperationIntent {
  const operation = typeof input === "string" ? input : input.kind;

  return {
    bootstrapAllowed: isLocalWorkspaceGatewayBootstrapOperationKind(operation),
    mutating: isLocalWorkspaceGatewayMutatingStartOperationKind(operation),
    operation,
  };
}

export function localWorkspaceGatewayReadOperationIntent(
  operation: LocalWorkspaceGatewayOperationKind,
): LocalWorkspaceGatewayOperationIntent {
  return {
    bootstrapAllowed: isLocalWorkspaceGatewayBootstrapOperationKind(operation),
    mutating: false,
    operation,
  };
}

export function parseLocalWorkspaceGatewayStartInput(
  body: unknown,
): LocalWorkspaceGatewayStartInputParseResult {
  const forbidden = forbiddenLocalWorkspaceGatewayInput(body);

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
      case "init":
        return { input: { kind, name: optionalString(body.name) }, ok: true };
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

export function forbiddenLocalWorkspaceGatewayInput(
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
      const forbidden = forbiddenLocalWorkspaceGatewayInput(item, `${label}[${index}]`);

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
    if (forbiddenLocalWorkspaceGatewayInputKey(key)) {
      return `Workspace gateway request includes forbidden key "${key}".`;
    }

    const forbidden = forbiddenLocalWorkspaceGatewayInput(child, `${label}.${key}`);

    if (forbidden) {
      return forbidden;
    }
  }

  return undefined;
}

function trimLocalWorkspaceGatewayApiBasePath(apiBasePath: string): string {
  return apiBasePath.replace(/\/+$/, "");
}

function forbiddenLocalWorkspaceGatewayInputKey(key: string): boolean {
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

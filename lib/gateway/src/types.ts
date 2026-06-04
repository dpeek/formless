/**
 * Versioned public workspace gateway wire contract.
 *
 * This file is intentionally import-free. Keep route strings, environment
 * variable names, header names, operation inputs, and display-safe operation
 * response shapes here so browser, Worker, and sidecar adapters consume the
 * same public contract declarations.
 */

export const WORKSPACE_GATEWAY_API_ROUTE_PREFIX = "/api/formless/workspace";
export const WORKSPACE_GATEWAY_STATUS_API_PATH = `${WORKSPACE_GATEWAY_API_ROUTE_PREFIX}/status`;
export const WORKSPACE_GATEWAY_OPERATIONS_API_PATH = `${WORKSPACE_GATEWAY_API_ROUTE_PREFIX}/operations`;
export const LOCAL_SESSION_BOOTSTRAP_API_PATH = "/api/formless/local-session/bootstrap";

export const WORKSPACE_GATEWAY_ENABLED_ENV = "FORMLESS_LOCAL_WORKSPACE_GATEWAY";
export const WORKSPACE_GATEWAY_ROOT_ENV = "FORMLESS_WORKSPACE_GATEWAY_ROOT";
export const WORKSPACE_GATEWAY_SIDECAR_URL_ENV = "FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL";
export const WORKSPACE_GATEWAY_PROXY_TOKEN_ENV = "FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN";
export const WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV = "FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN";
export const WORKSPACE_GATEWAY_CSRF_TOKEN_ENV = "FORMLESS_WORKSPACE_GATEWAY_CSRF_TOKEN";
export const LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV = "FORMLESS_LOCAL_SESSION_BOOTSTRAP_TOKEN";

export const WORKSPACE_GATEWAY_BOOTSTRAP_HEADER = "x-formless-workspace-bootstrap";
export const WORKSPACE_GATEWAY_CSRF_HEADER = "x-formless-csrf";
export const WORKSPACE_GATEWAY_CSRF_COOKIE_NAME = "formless_workspace_csrf";
export const WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER = "x-formless-workspace-proxy-token";
export const WORKSPACE_GATEWAY_ACTOR_HEADER = "x-formless-workspace-actor";
export const WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER = "x-formless-workspace-authorization-via";
export const WORKSPACE_GATEWAY_OPERATION_KIND_HEADER = "x-formless-workspace-operation-kind";

/**
 * Browser-safe semantic operation allowlist. The values are wire strings.
 */
export const WORKSPACE_GATEWAY_OPERATION_KINDS = [
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

/**
 * Operations allowed before owner setup through the local bootstrap capability.
 */
export const WORKSPACE_GATEWAY_BOOTSTRAP_OPERATION_KINDS = ["init", "status"] as const;

export type WorkspaceGatewayOperationKind = (typeof WORKSPACE_GATEWAY_OPERATION_KINDS)[number];

export type WorkspaceGatewayOperationStatus = "failed" | "queued" | "running" | "succeeded";

export type WorkspaceGatewayActor = "automation" | "browser" | "cli" | "system";

export type WorkspaceGatewayAuthorizationVia = "admin-bearer" | "bootstrap" | "owner-session";

export type WorkspaceGatewayActorFacts = {
  actor: WorkspaceGatewayActor;
  via: WorkspaceGatewayAuthorizationVia;
};

export type WorkspaceGatewayDisplayValue =
  | boolean
  | null
  | number
  | string
  | WorkspaceGatewayDisplayValue[]
  | { [key: string]: WorkspaceGatewayDisplayValue };

export type WorkspaceGatewayDisplayObject = {
  [key: string]: WorkspaceGatewayDisplayValue;
};

export type WorkspaceGatewayOperationSummary = {
  fields: WorkspaceGatewayDisplayObject;
  title: string;
};

export type WorkspaceGatewayOperationLog = {
  at: string;
  id: string;
  level: "error" | "info" | "warning";
  message: string;
};

export type WorkspaceGatewayOperationError = {
  at: string;
  message: string;
};

export type WorkspaceGatewayExternalAuthorizationEvent = {
  at: string;
  id: string;
  profileLabel: string;
  provider: "alchemy" | "cloudflare";
  status: "waiting";
  type: "externalAuthorizationUrl";
  url: string;
};

export type WorkspaceGatewayOperationEvent = WorkspaceGatewayExternalAuthorizationEvent;

export type WorkspaceGatewayOperationResult = {
  deployment?: WorkspaceGatewayDisplayObject;
  details?: WorkspaceGatewayDisplayObject;
  summary: WorkspaceGatewayOperationSummary;
};

/**
 * Display-safe operation state returned by browser-facing gateway responses.
 * Raw filesystem paths, secret values, provider state, and adapter output do
 * not belong in this shape.
 */
export type WorkspaceGatewayOperation = {
  actor: WorkspaceGatewayActor;
  completedAt?: string;
  createdAt: string;
  errors: WorkspaceGatewayOperationError[];
  events: WorkspaceGatewayOperationEvent[];
  id: string;
  input: WorkspaceGatewayDisplayObject;
  kind: "formless.workspaceOperation";
  logs: WorkspaceGatewayOperationLog[];
  operation: WorkspaceGatewayOperationKind;
  result?: WorkspaceGatewayOperationResult;
  startedAt?: string;
  status: WorkspaceGatewayOperationStatus;
  summary: WorkspaceGatewayOperationSummary;
  updatedAt: string;
  version: 1;
  workspace: {
    label: string;
  };
};

export type WorkspaceGatewaySaveStartInput = {
  check?: boolean;
  kind: "save";
};

export type WorkspaceGatewayStatusStartInput = {
  includeDeploymentStatus?: boolean;
  kind: "status";
  targetAlias?: string | null;
};

export type WorkspaceGatewayCheckOrPullStartInput = {
  kind: "check" | "pull";
  targetAlias?: string | null;
};

export type WorkspaceGatewayPushStartInput = {
  allowStale?: boolean;
  apply?: boolean;
  kind: "push";
  replace?: boolean;
  replaceInstallSet?: boolean;
  targetAlias?: string | null;
};

export type WorkspaceGatewayCredentialSetupStartInput = {
  accountId?: string | null;
  kind: "credentialSetup";
  profileLabel?: string | null;
  provider: "cloudflare";
};

export type WorkspaceGatewayDeployStartInput = {
  kind: "deployApply" | "deployPlan";
  migrationPolicy?: "existing" | "new" | null;
  targetAlias?: string | null;
};

export type WorkspaceGatewayInitStartInput = {
  kind: "init";
  name?: string | null;
};

export type WorkspaceGatewayStartInput =
  | WorkspaceGatewayCheckOrPullStartInput
  | WorkspaceGatewayCredentialSetupStartInput
  | WorkspaceGatewayDeployStartInput
  | WorkspaceGatewayInitStartInput
  | WorkspaceGatewayPushStartInput
  | WorkspaceGatewaySaveStartInput
  | WorkspaceGatewayStatusStartInput;

export type WorkspaceGatewayResponse = {
  csrfToken?: string;
  operation: WorkspaceGatewayOperation;
};

export type WorkspaceGatewayApiErrorBody = {
  error: string;
};

export type WorkspaceGatewayOperationIntent = {
  bootstrapAllowed: boolean;
  mutating: boolean;
  operation: WorkspaceGatewayOperationKind;
};

export type WorkspaceGatewayOperationPath = {
  operationId: string;
  progress: boolean;
};

export type WorkspaceGatewayOperationIdParseResult =
  | { ok: true; operationId: string }
  | { error: string; ok: false };

export type WorkspaceGatewayStartInputParseResult =
  | { input: WorkspaceGatewayStartInput; ok: true }
  | { error: string; ok: false };

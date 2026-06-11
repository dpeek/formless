import {
  WORKSPACE_BROWSER_OPERATION_KINDS,
  WORKSPACE_OPERATION_KINDS,
  WORKSPACE_OPERATION_STATE_FILE_KIND,
  WORKSPACE_OPERATION_STATE_FILE_VERSION,
} from "./types.ts";
import type {
  InitialWorkspaceOperationStateInput,
  UpdateWorkspaceOperationStateInput,
  WorkspaceBrowserOperationKind,
  WorkspaceOperationDisplayObject,
  WorkspaceOperationDisplayValue,
  WorkspaceOperationEvent,
  WorkspaceOperationIdParseResult,
  WorkspaceOperationInput,
  WorkspaceOperationKind,
  WorkspaceOperationResult,
  WorkspaceOperationStartInput,
  WorkspaceOperationState,
  WorkspaceOperationStatus,
  WorkspaceOperationStep,
  WorkspaceOperationSummary,
} from "./types.ts";

const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const workspaceOperationKindSet = new Set<string>(WORKSPACE_OPERATION_KINDS);
const workspaceBrowserOperationKindSet = new Set<string>(WORKSPACE_BROWSER_OPERATION_KINDS);

export function isWorkspaceOperationKind(value: unknown): value is WorkspaceOperationKind {
  return typeof value === "string" && workspaceOperationKindSet.has(value);
}

export function isWorkspaceBrowserOperationKind(
  value: unknown,
): value is WorkspaceBrowserOperationKind {
  return typeof value === "string" && workspaceBrowserOperationKindSet.has(value);
}

export function isWorkspaceOperationStatus(value: unknown): value is WorkspaceOperationStatus {
  return value === "failed" || value === "queued" || value === "running" || value === "succeeded";
}

export function parseWorkspaceOperationId(value: unknown): WorkspaceOperationIdParseResult {
  if (typeof value !== "string" || !operationIdPattern.test(value)) {
    return { error: "Workspace operation id is invalid.", ok: false };
  }

  return { ok: true, operationId: value };
}

export function workspaceOperationStateFileName(operationId: string): string {
  const parsed = parseWorkspaceOperationId(operationId);

  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  return parsed.operationId;
}

export function initialWorkspaceOperationState(
  input: InitialWorkspaceOperationStateInput,
): WorkspaceOperationState {
  const id = workspaceOperationStateFileName(input.id);
  const now = input.now();

  return {
    actor: input.actor ?? "system",
    createdAt: now,
    errors: [],
    events: [],
    id,
    input: redactWorkspaceOperationDisplayObject(input.input, input.workspaceRoot),
    kind: WORKSPACE_OPERATION_STATE_FILE_KIND,
    logs: [],
    operation: input.operation,
    status: "queued",
    summary: {
      fields: {},
      title: "Operation queued",
    },
    updatedAt: now,
    version: WORKSPACE_OPERATION_STATE_FILE_VERSION,
    workspace: {
      label: input.workspaceLabel,
    },
  };
}

export function nextWorkspaceOperationState(
  current: WorkspaceOperationState,
  input: UpdateWorkspaceOperationStateInput,
): WorkspaceOperationState {
  const timestamp = input.logs?.at(-1)?.at ?? current.updatedAt;
  const status = input.status ?? current.status;
  const completedAt =
    status === "failed" || status === "succeeded" ? timestamp : current.completedAt;
  const nextSteps = input.steps ?? input.result?.steps;

  return {
    ...current,
    ...(completedAt === undefined ? {} : { completedAt }),
    errors: [
      ...current.errors,
      ...(input.errors ?? []).map((error) => ({
        at: timestamp,
        message: redactWorkspaceOperationDisplayText(error.message, input.workspaceRoot),
      })),
    ],
    events: [
      ...(current.events ?? []),
      ...(input.events ?? []).map((event, index) =>
        redactWorkspaceOperationEvent(event, input.workspaceRoot, {
          id: `${current.id}-event-${(current.events ?? []).length + index + 1}`,
        }),
      ),
    ],
    logs: [
      ...current.logs,
      ...(input.logs ?? []).map((log, index) => ({
        at: redactWorkspaceOperationDisplayText(log.at, input.workspaceRoot),
        id: `${current.id}-log-${current.logs.length + index + 1}`,
        level: log.level,
        message: redactWorkspaceOperationDisplayText(log.message, input.workspaceRoot),
      })),
    ],
    ...(input.result === undefined
      ? {}
      : { result: redactWorkspaceOperationResult(input.result, input.workspaceRoot) }),
    startedAt:
      status === "running" && current.startedAt === undefined ? timestamp : current.startedAt,
    status,
    ...(nextSteps === undefined
      ? {}
      : { steps: redactWorkspaceOperationSteps(nextSteps, input.workspaceRoot) }),
    summary:
      input.summary === undefined
        ? current.summary
        : redactWorkspaceOperationSummary(input.summary, input.workspaceRoot),
    updatedAt: timestamp,
  };
}

export function workspaceOperationInputDisplay(
  input: WorkspaceOperationInput | WorkspaceOperationStartInput,
): WorkspaceOperationDisplayObject {
  switch (input.kind) {
    case "init":
      return input.name === undefined || input.name === null ? {} : { name: input.name };
    case "status":
      return {
        includeDeploymentStatus: input.includeDeploymentStatus ?? false,
        ...(input.targetAlias === undefined || input.targetAlias === null
          ? {}
          : { targetAlias: input.targetAlias }),
      };
    case "save":
      return {
        check: input.check ?? false,
        ...("source" in input && input.source !== undefined && input.source !== null
          ? { source: input.source }
          : {}),
      };
    case "check":
    case "pull":
    case "deploymentRefresh":
      return input.targetAlias === undefined || input.targetAlias === null
        ? {}
        : { targetAlias: input.targetAlias };
    case "push":
      return {
        allowStale: input.allowStale ?? false,
        apply: input.apply ?? false,
        replace: input.replace ?? false,
        replaceInstallSet: input.replaceInstallSet ?? false,
        ...(input.targetAlias === undefined || input.targetAlias === null
          ? {}
          : { targetAlias: input.targetAlias }),
      };
    case "deployPlan":
    case "deployApply":
      return {
        ...(input.migrationPolicy === undefined || input.migrationPolicy === null
          ? {}
          : { migrationPolicy: input.migrationPolicy }),
        ...(input.targetAlias === undefined || input.targetAlias === null
          ? {}
          : { targetAlias: input.targetAlias }),
      };
    case "credentialSetup":
      return {
        provider: input.provider,
        ...(input.accountId === undefined || input.accountId === null
          ? {}
          : { accountId: input.accountId }),
        ...(input.profileLabel === undefined || input.profileLabel === null
          ? {}
          : { profileLabel: input.profileLabel }),
      };
  }
}

export function parseWorkspaceOperationStateJson(contents: string): WorkspaceOperationState {
  return parseWorkspaceOperationState(JSON.parse(contents) as unknown);
}

export function parseWorkspaceOperationState(value: unknown): WorkspaceOperationState {
  if (!isRecord(value)) {
    throw new Error("Workspace operation state file is invalid.");
  }

  if (
    value.kind !== WORKSPACE_OPERATION_STATE_FILE_KIND ||
    value.version !== WORKSPACE_OPERATION_STATE_FILE_VERSION ||
    typeof value.id !== "string" ||
    !isWorkspaceOperationKind(value.operation) ||
    !isWorkspaceOperationStatus(value.status)
  ) {
    throw new Error("Workspace operation state file is invalid.");
  }

  return value as WorkspaceOperationState;
}

export function formatWorkspaceOperationState(state: WorkspaceOperationState): string {
  return `${JSON.stringify(parseWorkspaceOperationState(state), null, 2)}\n`;
}

export function redactWorkspaceOperationResult(
  result: WorkspaceOperationResult,
  workspaceRoot: string,
): WorkspaceOperationResult {
  return {
    ...(result.deployment === undefined
      ? {}
      : { deployment: redactWorkspaceOperationDisplayObject(result.deployment, workspaceRoot) }),
    ...(result.details === undefined
      ? {}
      : { details: redactWorkspaceOperationDisplayObject(result.details, workspaceRoot) }),
    ...(result.steps === undefined
      ? {}
      : { steps: redactWorkspaceOperationSteps(result.steps, workspaceRoot) }),
    summary: redactWorkspaceOperationSummary(result.summary, workspaceRoot),
  };
}

export function redactWorkspaceOperationSummary(
  summary: WorkspaceOperationSummary,
  workspaceRoot: string,
): WorkspaceOperationSummary {
  return {
    fields: redactWorkspaceOperationDisplayObject(summary.fields, workspaceRoot, {
      allowOwnerSetupUrl: true,
    }),
    title: redactWorkspaceOperationDisplayText(summary.title, workspaceRoot),
  };
}

export function redactWorkspaceOperationSteps(
  steps: readonly WorkspaceOperationStep[],
  workspaceRoot: string,
): WorkspaceOperationStep[] {
  return steps.map((step) => ({
    ...(step.detail === undefined
      ? {}
      : { detail: redactWorkspaceOperationDisplayText(step.detail, workspaceRoot) }),
    ...(step.error === undefined
      ? {}
      : { error: redactWorkspaceOperationDisplayText(step.error, workspaceRoot) }),
    ...(step.fields === undefined
      ? {}
      : { fields: redactWorkspaceOperationDisplayObject(step.fields, workspaceRoot) }),
    id: redactWorkspaceOperationDisplayText(step.id, workspaceRoot),
    label: redactWorkspaceOperationDisplayText(step.label, workspaceRoot),
    status: step.status,
  }));
}

export function redactWorkspaceOperationEvent(
  event: Omit<WorkspaceOperationEvent, "id">,
  workspaceRoot: string,
  options: { id: string },
): WorkspaceOperationEvent {
  switch (event.type) {
    case "externalAuthorizationUrl":
      return {
        at: redactWorkspaceOperationDisplayText(event.at, workspaceRoot),
        id: options.id,
        profileLabel: redactWorkspaceOperationDisplayText(event.profileLabel, workspaceRoot),
        provider: event.provider,
        status: "waiting",
        type: "externalAuthorizationUrl",
        url: allowlistedWorkspaceOperationAuthorizationUrl(event.url, event.provider),
      };
  }
}

export function redactWorkspaceOperationDisplayObject(
  value: WorkspaceOperationDisplayObject,
  workspaceRoot: string,
  options: WorkspaceOperationRedactionOptions = {},
): WorkspaceOperationDisplayObject {
  return redactWorkspaceOperationDisplayValue(
    value,
    workspaceRoot,
    options,
  ) as WorkspaceOperationDisplayObject;
}

export function redactWorkspaceOperationDisplayValue(
  value: WorkspaceOperationDisplayValue,
  workspaceRoot: string,
  options: WorkspaceOperationRedactionOptions = {},
  key?: string,
): WorkspaceOperationDisplayValue {
  if (typeof value === "string") {
    if (key && options.allowOwnerSetupUrl && isAllowlistedOwnerSetupUrlDisplayValue(key, value)) {
      return value;
    }

    return redactWorkspaceOperationDisplayText(value, workspaceRoot);
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactWorkspaceOperationDisplayValue(item, workspaceRoot, options));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      isForbiddenDisplayKey(key)
        ? "[redacted]"
        : redactWorkspaceOperationDisplayValue(child, workspaceRoot, options, key),
    ]),
  ) as WorkspaceOperationDisplayObject;
}

type WorkspaceOperationRedactionOptions = {
  allowOwnerSetupUrl?: boolean;
};

export function redactWorkspaceOperationDisplayText(value: string, workspaceRoot: string): string {
  return value
    .replaceAll(workspaceRoot, "<workspace>")
    .replace(
      /([A-Z0-9_]*(?:TOKEN|PASSWORD|SECRET|API_KEY|APIKEY)[A-Z0-9_]*=)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1[redacted]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/lease:[A-Za-z0-9._:-]+/gi, "[redacted]")
    .replace(/CF_API_TOKEN[_A-Za-z0-9-]*/g, "[redacted]")
    .replace(/(^|[\s(])\/(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+/g, "$1<path>");
}

export function allowlistedWorkspaceOperationAuthorizationUrl(
  url: string,
  provider: "alchemy" | "cloudflare",
): string {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Workspace operation authorization URL is invalid.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Workspace operation authorization URL must use HTTPS.");
  }

  for (const key of parsed.searchParams.keys()) {
    const normalized = key.toLowerCase().replaceAll(/[-_]/g, "");

    if (
      normalized.includes("token") ||
      normalized.includes("secret") ||
      normalized.includes("password") ||
      normalized.includes("apikey")
    ) {
      throw new Error("Workspace operation authorization URL includes secret-looking parameters.");
    }
  }

  const hostname = parsed.hostname.toLowerCase();
  const authorizationPath = /(?:authorize|authorization|oauth|login)/i.test(parsed.pathname);

  if (provider === "cloudflare") {
    if (hostname === "dash.cloudflare.com" && authorizationPath) {
      return parsed.toString();
    }
  } else if (
    (hostname === "alchemy.com" ||
      hostname.endsWith(".alchemy.com") ||
      hostname === "alchemy.run" ||
      hostname.endsWith(".alchemy.run")) &&
    authorizationPath
  ) {
    return parsed.toString();
  }

  throw new Error("Workspace operation authorization URL is not allowlisted.");
}

function isForbiddenDisplayKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll(/[-_]/g, "");

  return (
    normalized === "secret" ||
    normalized === "secrets" ||
    normalized.endsWith("token") ||
    normalized.endsWith("password") ||
    normalized.includes("apikey") ||
    normalized.includes("credential") ||
    normalized === "leasetoken" ||
    normalized.includes("providerstate") ||
    normalized.startsWith("raw")
  );
}

function isAllowlistedOwnerSetupUrlDisplayValue(key: string, value: string): boolean {
  const normalizedKey = key.toLowerCase().replaceAll(/[-_]/g, "");

  if (normalizedKey !== "ownersetupurl") {
    return false;
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.pathname !== "/setup" ||
    !parsed.hostname.toLowerCase().endsWith(".workers.dev")
  ) {
    return false;
  }

  const keys = [...parsed.searchParams.keys()];

  return keys.length === 1 && keys[0] === "token" && Boolean(parsed.searchParams.get("token"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

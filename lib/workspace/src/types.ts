/**
 * Versioned public workspace contract declarations.
 *
 * This file is intentionally import-free. Workspace manifest, record-source,
 * local state, and operation declarations move here as their surfaces are
 * extracted into this package.
 */
export const INSTANCE_WORKSPACE_MANIFEST_FILE = "formless.json";
export const LEGACY_INSTANCE_WORKSPACE_MANIFEST_FILES = [
  "formless.instance-workspace.json",
  "formless-workspace.json",
] as const;
export const INSTANCE_WORKSPACE_MANIFEST_VERSION = 1;
export const INSTANCE_WORKSPACE_KIND = "formless-instance-workspace";
export const DEFAULT_INSTANCE_WORKSPACE_TARGET_ALIAS = "remote";
export const DEFAULT_INSTANCE_WORKSPACE_ARCHIVE_ROOT = "archives";
export const DEFAULT_INSTANCE_WORKSPACE_INSTANCE_ARCHIVE_PATH = "archives/instance";
export const DEFAULT_INSTANCE_WORKSPACE_APP_ARCHIVE_ROOT = "archives/apps";
export const DEFAULT_INSTANCE_WORKSPACE_RECORD_SOURCE_PATH = "records/instance-control-plane";
export const DEFAULT_INSTANCE_WORKSPACE_MEDIA_ROOT = "media";
export const DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT = ".formless/local";
export const DEFAULT_INSTANCE_WORKSPACE_SECRET_STATE_ROOT = ".formless";

export const INSTANCE_WORKSPACE_CONTROL_PLANE_SCHEMA_KEY = "instance-control-plane";
export const INSTANCE_WORKSPACE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY = "instance";
export const INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_KIND =
  "formless.instanceControlPlaneRecordSource";
export const INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_VERSION = 1;
export const INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_ENTITIES = [
  "app-install",
  "route",
  "deploy-target",
  "provider-config-ref",
  "deploy-desired-resource",
] as const;
export const INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_EXCLUDED_ENTITIES = [
  "deploy-attempt",
  "deploy-evidence-summary",
  "deploy-drift-report",
] as const;

export const WORKSPACE_OPERATION_STATE_FILE_KIND = "formless.workspaceOperation";
export const WORKSPACE_OPERATION_STATE_FILE_VERSION = 1;
export const WORKSPACE_OPERATION_STATE_ROOT = ".formless/operations";

export const WORKSPACE_OPERATION_KINDS = [
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

export const WORKSPACE_BROWSER_OPERATION_KINDS = [
  "check",
  "credentialSetup",
  "deployApply",
  "deployPlan",
  "pull",
  "push",
  "save",
  "status",
] as const;

export type InstanceWorkspaceControlPlaneRecordSourceEntity =
  (typeof INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_ENTITIES)[number];

export type InstanceWorkspaceControlPlaneRecordSourceExcludedEntity =
  (typeof INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_EXCLUDED_ENTITIES)[number];

export type InstanceWorkspaceRecordValue = string | boolean | number;

export type InstanceWorkspaceRecordValues = Record<string, InstanceWorkspaceRecordValue>;

export type InstanceWorkspaceStoredRecord = {
  createdAt: string;
  deletedAt?: string;
  entity: string;
  id: string;
  values: InstanceWorkspaceRecordValues;
};

export type InstanceWorkspaceControlPlaneRecordSourceControlPlane = {
  schemaKey: typeof INSTANCE_WORKSPACE_CONTROL_PLANE_SCHEMA_KEY;
  schemaUpdatedAt: string;
  records: InstanceWorkspaceStoredRecord[];
};

export type InstanceWorkspaceControlPlaneRecordSourceFile = {
  kind: typeof INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_KIND;
  version: typeof INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_VERSION;
  schemaKey: typeof INSTANCE_WORKSPACE_CONTROL_PLANE_SCHEMA_KEY;
  schemaUpdatedAt: string;
  entity: string;
  records: InstanceWorkspaceStoredRecord[];
};

export type WorkspaceOperationKind = (typeof WORKSPACE_OPERATION_KINDS)[number];

export type WorkspaceBrowserOperationKind = (typeof WORKSPACE_BROWSER_OPERATION_KINDS)[number];

export type WorkspaceOperationActor = "automation" | "browser" | "cli" | "system";

export type WorkspaceOperationStatus = "failed" | "queued" | "running" | "succeeded";

export type WorkspaceOperationDisplayValue =
  | boolean
  | null
  | number
  | string
  | WorkspaceOperationDisplayValue[]
  | { [key: string]: WorkspaceOperationDisplayValue };

export type WorkspaceOperationDisplayObject = {
  [key: string]: WorkspaceOperationDisplayValue;
};

export type WorkspaceOperationSummary = {
  fields: WorkspaceOperationDisplayObject;
  title: string;
};

export type WorkspaceOperationLog = {
  at: string;
  id: string;
  level: "error" | "info" | "warning";
  message: string;
};

export type WorkspaceOperationError = {
  at: string;
  message: string;
};

export type WorkspaceOperationExternalAuthorizationEvent = {
  at: string;
  id: string;
  profileLabel: string;
  provider: "alchemy" | "cloudflare";
  status: "waiting";
  type: "externalAuthorizationUrl";
  url: string;
};

export type WorkspaceOperationEvent = WorkspaceOperationExternalAuthorizationEvent;

export type WorkspaceOperationResult = {
  deployment?: WorkspaceOperationDisplayObject;
  details?: WorkspaceOperationDisplayObject;
  summary: WorkspaceOperationSummary;
};

export type WorkspaceOperationState = {
  actor: WorkspaceOperationActor;
  completedAt?: string;
  createdAt: string;
  errors: WorkspaceOperationError[];
  events: WorkspaceOperationEvent[];
  id: string;
  input: WorkspaceOperationDisplayObject;
  kind: typeof WORKSPACE_OPERATION_STATE_FILE_KIND;
  logs: WorkspaceOperationLog[];
  operation: WorkspaceOperationKind;
  result?: WorkspaceOperationResult;
  startedAt?: string;
  status: WorkspaceOperationStatus;
  summary: WorkspaceOperationSummary;
  updatedAt: string;
  version: typeof WORKSPACE_OPERATION_STATE_FILE_VERSION;
  workspace: {
    label: string;
  };
};

export type InitWorkspaceOperationInput = {
  kind: "init";
  name?: string | null;
  workspacePath?: string | null;
};

export type StatusWorkspaceOperationInput = {
  includeDeploymentStatus?: boolean;
  kind: "status";
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type SaveWorkspaceOperationInput = {
  check?: boolean;
  kind: "save";
  source?: string | null;
  workspacePath?: string | null;
};

export type CheckWorkspaceOperationInput = {
  kind: "check";
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type PullWorkspaceOperationInput = {
  kind: "pull";
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type PushWorkspaceOperationInput = {
  allowStale?: boolean;
  apply?: boolean;
  kind: "push";
  replace?: boolean;
  replaceInstallSet?: boolean;
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type DeployPlanWorkspaceOperationInput = {
  kind: "deployPlan";
  migrationPolicy?: InstanceWorkspaceMigrationPolicy | null;
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type DeployApplyWorkspaceOperationInput = {
  kind: "deployApply";
  migrationPolicy?: InstanceWorkspaceMigrationPolicy | null;
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type CredentialSetupWorkspaceOperationInput = {
  accountId?: string | null;
  kind: "credentialSetup";
  profileLabel?: string | null;
  provider: "cloudflare";
  workspacePath?: string | null;
};

export type WorkspaceOperationInput =
  | CheckWorkspaceOperationInput
  | CredentialSetupWorkspaceOperationInput
  | DeployApplyWorkspaceOperationInput
  | DeployPlanWorkspaceOperationInput
  | InitWorkspaceOperationInput
  | PullWorkspaceOperationInput
  | PushWorkspaceOperationInput
  | SaveWorkspaceOperationInput
  | StatusWorkspaceOperationInput;

export type RunnableWorkspaceOperationInput = Exclude<
  WorkspaceOperationInput,
  CredentialSetupWorkspaceOperationInput
>;

export type WorkspaceOperationSaveStartInput = {
  check?: boolean;
  kind: "save";
};

export type WorkspaceOperationStatusStartInput = {
  includeDeploymentStatus?: boolean;
  kind: "status";
  targetAlias?: string | null;
};

export type WorkspaceOperationCheckOrPullStartInput = {
  kind: "check" | "pull";
  targetAlias?: string | null;
};

export type WorkspaceOperationPushStartInput = {
  allowStale?: boolean;
  apply?: boolean;
  kind: "push";
  replace?: boolean;
  replaceInstallSet?: boolean;
  targetAlias?: string | null;
};

export type WorkspaceOperationCredentialSetupStartInput = {
  accountId?: string | null;
  kind: "credentialSetup";
  profileLabel?: string | null;
  provider: "cloudflare";
};

export type WorkspaceOperationDeployStartInput = {
  kind: "deployApply" | "deployPlan";
  migrationPolicy?: InstanceWorkspaceMigrationPolicy | null;
  targetAlias?: string | null;
};

export type WorkspaceOperationStartInput =
  | WorkspaceOperationCheckOrPullStartInput
  | WorkspaceOperationCredentialSetupStartInput
  | WorkspaceOperationDeployStartInput
  | WorkspaceOperationPushStartInput
  | WorkspaceOperationSaveStartInput
  | WorkspaceOperationStatusStartInput;

export type WorkspaceOperationIdParseResult =
  | { ok: true; operationId: string }
  | { error: string; ok: false };

export type InitialWorkspaceOperationStateInput = {
  actor?: WorkspaceOperationActor;
  id: string;
  input: WorkspaceOperationDisplayObject;
  operation: WorkspaceOperationKind;
  now: () => string;
  workspaceLabel: string;
  workspaceRoot: string;
};

export type UpdateWorkspaceOperationStateInput = {
  errors?: readonly { message: string }[];
  events?: readonly Omit<WorkspaceOperationEvent, "id">[];
  logs?: readonly Omit<WorkspaceOperationLog, "id">[];
  result?: WorkspaceOperationResult;
  status?: WorkspaceOperationStatus;
  summary?: WorkspaceOperationSummary;
  workspaceRoot: string;
};

export type InstanceWorkspaceDefaultAppPolicy = "declared-installs" | "none";

export type InstanceWorkspaceMigrationPolicy = "existing" | "new";

export type InstanceWorkspaceDomainProfile = "app" | "instance" | "publicSite";

export type InstanceWorkspaceManifest = {
  version: typeof INSTANCE_WORKSPACE_MANIFEST_VERSION;
  kind: typeof INSTANCE_WORKSPACE_KIND;
  name: string;
  source: InstanceWorkspaceSource;
  defaultTarget?: string;
  targets: InstanceWorkspaceTarget[];
  archives: InstanceWorkspaceArchives;
  media: InstanceWorkspaceMedia;
  local: InstanceWorkspaceLocalState;
  defaultAppPolicy: InstanceWorkspaceDefaultAppPolicy;
  apps: InstanceWorkspaceApp[];
  domains?: InstanceWorkspaceDomainIntent[];
};

export type FormatInstanceWorkspaceManifestInput = Pick<
  InstanceWorkspaceManifest,
  "kind" | "name" | "version"
> &
  Partial<Omit<InstanceWorkspaceManifest, "archives" | "kind" | "local" | "name" | "version">> & {
    archives?: Partial<InstanceWorkspaceArchives>;
    local?: Partial<InstanceWorkspaceLocalState>;
  };

export type InstanceWorkspaceTarget = {
  alias: string;
  url: string;
};

export type InstanceWorkspaceSource = {
  records: string;
};

export type InstanceWorkspaceArchives = {
  instance: string;
  apps: string;
};

export type InstanceWorkspaceMedia = {
  root: string;
};

export type InstanceWorkspaceLocalState = {
  stateRoot: string;
  secretStateRoot: string;
};

export type InstanceWorkspaceApp = {
  installId: string;
  packageAppKey: string;
  label: string;
  archivePath: string;
  routes?: InstanceWorkspaceAppRoutes;
};

export type InstanceWorkspaceAppRoutes = {
  admin?: `/apps/${string}`;
  schema?: `/apps/${string}/schema`;
  public?: `/sites/${string}`;
};

export type InstanceWorkspaceDomainIntent = {
  enabled: boolean;
  host: string;
  profile: InstanceWorkspaceDomainProfile;
  targetInstallId?: string;
};

const rootKeys = new Set(["archives", "kind", "local", "media", "name", "source", "version"]);
const removedManifestSourceKeys = new Set([
  "apps",
  "defaultAppPolicy",
  "defaultTarget",
  "deploy",
  "domains",
  "targets",
]);
const sourceKeys = new Set(["records"]);
const archivesKeys = new Set(["apps"]);
const mediaKeys = new Set(["root"]);
const localKeys = new Set(["secretStateRoot", "stateRoot"]);
const resourceSlugPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const targetAliasPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const workspaceOperationKindSet = new Set<string>(WORKSPACE_OPERATION_KINDS);
const workspaceBrowserOperationKindSet = new Set<string>(WORKSPACE_BROWSER_OPERATION_KINDS);
const forbiddenSecretKeys = new Set([
  "admintoken",
  "alchemy",
  "alchemypassword",
  "alchemysecret",
  "alchemysecrets",
  "alchemystatetoken",
  "alchemytoken",
  "apitoken",
  "cloudflareapitoken",
  "cloudflaretoken",
  "cfapitoken",
  "credential",
  "credentials",
  "formlessadmintoken",
  "mutationcredential",
  "mutationcredentials",
  "password",
  "providercredential",
  "providercredentials",
  "secret",
  "secrets",
  "statetoken",
  "token",
]);

export function defaultInstanceWorkspaceManifest(input: {
  name: string;
  targetUrl?: string | null;
}): InstanceWorkspaceManifest {
  return {
    version: INSTANCE_WORKSPACE_MANIFEST_VERSION,
    kind: INSTANCE_WORKSPACE_KIND,
    name: parseWorkspaceName(`${INSTANCE_WORKSPACE_MANIFEST_FILE} name`, input.name),
    source: {
      records: DEFAULT_INSTANCE_WORKSPACE_RECORD_SOURCE_PATH,
    },
    targets: [],
    archives: {
      instance: DEFAULT_INSTANCE_WORKSPACE_INSTANCE_ARCHIVE_PATH,
      apps: DEFAULT_INSTANCE_WORKSPACE_APP_ARCHIVE_ROOT,
    },
    media: {
      root: DEFAULT_INSTANCE_WORKSPACE_MEDIA_ROOT,
    },
    local: {
      stateRoot: DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
      secretStateRoot: DEFAULT_INSTANCE_WORKSPACE_SECRET_STATE_ROOT,
    },
    defaultAppPolicy: "none",
    apps: [],
  };
}

export function parseInstanceWorkspaceManifestJson(contents: string): InstanceWorkspaceManifest {
  try {
    return parseInstanceWorkspaceManifest(JSON.parse(contents) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${INSTANCE_WORKSPACE_MANIFEST_FILE} must be valid JSON.`);
    }

    throw error;
  }
}

export function parseInstanceWorkspaceManifest(value: unknown): InstanceWorkspaceManifest {
  if (!isRecord(value)) {
    throw new Error(`${INSTANCE_WORKSPACE_MANIFEST_FILE} must be an object.`);
  }

  assertNoForbiddenSecretKeys(value, INSTANCE_WORKSPACE_MANIFEST_FILE);
  assertNoRemovedManifestSourceKeys(value);
  assertOnlyKeys(value, rootKeys, INSTANCE_WORKSPACE_MANIFEST_FILE);

  if (value.version !== INSTANCE_WORKSPACE_MANIFEST_VERSION) {
    throw new Error(
      `${INSTANCE_WORKSPACE_MANIFEST_FILE} version must be ${INSTANCE_WORKSPACE_MANIFEST_VERSION}.`,
    );
  }

  if (value.kind !== INSTANCE_WORKSPACE_KIND) {
    throw new Error(
      `${INSTANCE_WORKSPACE_MANIFEST_FILE} kind must be "${INSTANCE_WORKSPACE_KIND}".`,
    );
  }

  return {
    version: INSTANCE_WORKSPACE_MANIFEST_VERSION,
    kind: INSTANCE_WORKSPACE_KIND,
    name: parseWorkspaceName(`${INSTANCE_WORKSPACE_MANIFEST_FILE} name`, value.name),
    source: parseSource(value.source),
    targets: [],
    archives: parseArchives(value.archives),
    media: parseMedia(value.media),
    local: parseLocalState(value.local),
    defaultAppPolicy: "none",
    apps: [],
  };
}

export function formatInstanceWorkspaceManifest(
  manifest: FormatInstanceWorkspaceManifestInput,
): string {
  const fallback = defaultInstanceWorkspaceManifest({ name: manifest.name });
  const parsed = parseInstanceWorkspaceManifest({
    version: manifest.version,
    kind: manifest.kind,
    name: manifest.name,
    source: {
      records: manifest.source?.records ?? fallback.source.records,
    },
    archives: {
      apps: manifest.archives?.apps ?? fallback.archives.apps,
    },
    media: {
      root: manifest.media?.root ?? fallback.media.root,
    },
    local: {
      stateRoot: manifest.local?.stateRoot ?? fallback.local.stateRoot,
      secretStateRoot: manifest.local?.secretStateRoot ?? fallback.local.secretStateRoot,
    },
  });
  const formatted: Record<string, unknown> = {
    version: parsed.version,
    kind: parsed.kind,
    name: parsed.name,
    source: {
      records: parsed.source.records,
    },
    archives: {
      apps: parsed.archives.apps,
    },
    media: {
      root: parsed.media.root,
    },
    local: {
      stateRoot: parsed.local.stateRoot,
      secretStateRoot: parsed.local.secretStateRoot,
    },
  };

  return `${JSON.stringify(formatted, null, 2)}\n`;
}

export function parseInstanceWorkspaceTargetAlias(context: string, value: unknown): string {
  const alias = parseRequiredString(context, value);

  if (!targetAliasPattern.test(alias)) {
    throw new Error(
      `${context} must start with a lowercase letter and use lowercase letters, numbers, dots, and single hyphens.`,
    );
  }

  return alias;
}

export function normalizeInstanceWorkspaceTargetUrl(value: string): string {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error();
    }

    return url.origin;
  } catch {
    throw new Error(`Formless instance workspace target URL is invalid: ${value}`);
  }
}

export function parseInstanceWorkspaceResourceSlug(context: string, value: unknown): string {
  const slug = parseRequiredString(context, value);

  if (!resourceSlugPattern.test(slug)) {
    throw new Error(
      `${context} must start with a lowercase letter and use lowercase letters, numbers, and single hyphens.`,
    );
  }

  return slug;
}

export function parseInstanceWorkspaceRelativePath(context: string, value: unknown): string {
  const filePath = parseRequiredString(context, value);
  const parts = filePath.split("/");

  if (
    filePath.startsWith("/") ||
    filePath.includes("\\") ||
    parts.some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`${context} must be a relative workspace path.`);
  }

  return filePath;
}

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
    summary: redactWorkspaceOperationSummary(result.summary, workspaceRoot),
  };
}

export function redactWorkspaceOperationSummary(
  summary: WorkspaceOperationSummary,
  workspaceRoot: string,
): WorkspaceOperationSummary {
  return {
    fields: redactWorkspaceOperationDisplayObject(summary.fields, workspaceRoot),
    title: redactWorkspaceOperationDisplayText(summary.title, workspaceRoot),
  };
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
): WorkspaceOperationDisplayObject {
  return redactWorkspaceOperationDisplayValue(
    value,
    workspaceRoot,
  ) as WorkspaceOperationDisplayObject;
}

export function redactWorkspaceOperationDisplayValue(
  value: WorkspaceOperationDisplayValue,
  workspaceRoot: string,
): WorkspaceOperationDisplayValue {
  if (typeof value === "string") {
    return redactWorkspaceOperationDisplayText(value, workspaceRoot);
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactWorkspaceOperationDisplayValue(item, workspaceRoot));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      isForbiddenDisplayKey(key)
        ? "[redacted]"
        : redactWorkspaceOperationDisplayValue(child, workspaceRoot),
    ]),
  ) as WorkspaceOperationDisplayObject;
}

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

function parseSource(value: unknown): InstanceWorkspaceSource {
  if (!isRecord(value)) {
    throw new Error(`${INSTANCE_WORKSPACE_MANIFEST_FILE} source must be an object.`);
  }

  assertOnlyKeys(value, sourceKeys, `${INSTANCE_WORKSPACE_MANIFEST_FILE} source`);

  return {
    records: parseInstanceWorkspaceRelativePath(
      `${INSTANCE_WORKSPACE_MANIFEST_FILE} source.records`,
      value.records,
    ),
  };
}

function parseArchives(value: unknown): InstanceWorkspaceArchives {
  if (!isRecord(value)) {
    throw new Error(`${INSTANCE_WORKSPACE_MANIFEST_FILE} archives must be an object.`);
  }

  assertOnlyKeys(value, archivesKeys, `${INSTANCE_WORKSPACE_MANIFEST_FILE} archives`);

  return {
    instance: DEFAULT_INSTANCE_WORKSPACE_INSTANCE_ARCHIVE_PATH,
    apps: parseInstanceWorkspaceRelativePath(
      `${INSTANCE_WORKSPACE_MANIFEST_FILE} archives.apps`,
      value.apps,
    ),
  };
}

function parseMedia(value: unknown): InstanceWorkspaceMedia {
  if (!isRecord(value)) {
    throw new Error(`${INSTANCE_WORKSPACE_MANIFEST_FILE} media must be an object.`);
  }

  assertOnlyKeys(value, mediaKeys, `${INSTANCE_WORKSPACE_MANIFEST_FILE} media`);

  return {
    root: parseInstanceWorkspaceRelativePath(
      `${INSTANCE_WORKSPACE_MANIFEST_FILE} media.root`,
      value.root,
    ),
  };
}

function parseLocalState(value: unknown): InstanceWorkspaceLocalState {
  if (!isRecord(value)) {
    throw new Error(`${INSTANCE_WORKSPACE_MANIFEST_FILE} local must be an object.`);
  }

  assertOnlyKeys(value, localKeys, `${INSTANCE_WORKSPACE_MANIFEST_FILE} local`);

  return {
    stateRoot: parseInstanceWorkspaceRelativePath(
      `${INSTANCE_WORKSPACE_MANIFEST_FILE} local.stateRoot`,
      value.stateRoot,
    ),
    secretStateRoot: parseInstanceWorkspaceRelativePath(
      `${INSTANCE_WORKSPACE_MANIFEST_FILE} local.secretStateRoot`,
      value.secretStateRoot,
    ),
  };
}

function parseWorkspaceName(context: string, value: unknown): string {
  return parseInstanceWorkspaceResourceSlug(context, value);
}

function parseRequiredString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function assertOnlyKeys(value: Record<string, unknown>, allowedKeys: Set<string>, context: string) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }
}

function assertNoRemovedManifestSourceKeys(value: Record<string, unknown>) {
  for (const key of Object.keys(value)) {
    if (removedManifestSourceKeys.has(key)) {
      throw new Error(
        `${INSTANCE_WORKSPACE_MANIFEST_FILE} key "${key}" was removed from manifest version 1; store instance intent in workspace record source instead.`,
      );
    }
  }
}

function assertNoForbiddenSecretKeys(value: unknown, context: string) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoForbiddenSecretKeys(child, `${context}[${index}]`));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (forbiddenSecretKeys.has(normalizeSecretKey(key))) {
      throw new Error(
        `${INSTANCE_WORKSPACE_MANIFEST_FILE} must not store secret field "${context}.${key}".`,
      );
    }

    assertNoForbiddenSecretKeys(child, `${context}.${key}`);
  }
}

function normalizeSecretKey(key: string): string {
  return key.toLowerCase().replaceAll(/[-_]/g, "");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

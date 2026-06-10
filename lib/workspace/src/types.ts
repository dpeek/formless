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
  "deployment-config",
] as const;
export const INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_EXCLUDED_ENTITIES = [
  "deploy-desired-resource",
  "deploy-target",
  "deploy-attempt",
  "deploy-evidence-summary",
  "deploy-drift-report",
  "provider-config-ref",
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

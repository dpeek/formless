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
export const DEFAULT_INSTANCE_WORKSPACE_STATE_ROOT = "state";
export const DEFAULT_INSTANCE_WORKSPACE_INSTANCE_STATE_PATH = "state/instance.json";
export const DEFAULT_INSTANCE_WORKSPACE_APP_STATE_ROOT = "state/apps";
export const DEFAULT_INSTANCE_WORKSPACE_MEDIA_ROOT = "state/media";
export const DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT = ".formless/local";
export const DEFAULT_INSTANCE_WORKSPACE_SECRET_STATE_ROOT = ".formless";

export const WORKSPACE_PACKAGE_LINKS_FILE = "formless.packages.json";
export const WORKSPACE_PACKAGE_LINKS_VERSION = 1;
export const WORKSPACE_PACKAGE_LINKS_KIND = "formless.workspacePackages";

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
export const INSTANCE_WORKSPACE_CONTROL_PLANE_DEPLOYMENT_CONFIG_OBSERVED_FIELDS = [
  "observedStatus",
  "observedAt",
  "observedDesiredStateHash",
  "observedSummary",
  "observedError",
  "observedRunnerId",
] as const;

export const WORKSPACE_OPERATION_STATE_FILE_KIND = "formless.workspaceOperation";
export const WORKSPACE_OPERATION_STATE_FILE_VERSION = 1;
export const WORKSPACE_OPERATION_STATE_ROOT = ".formless/operations";

export type WorkspaceOperationActor = "automation" | "browser" | "cli" | "system";

export type WorkspacePackageLink = {
  manifest: string;
};

export type WorkspacePackageLinks = {
  version: typeof WORKSPACE_PACKAGE_LINKS_VERSION;
  kind: typeof WORKSPACE_PACKAGE_LINKS_KIND;
  links: WorkspacePackageLink[];
};

export type FormatWorkspacePackageLinksInput = WorkspacePackageLinks;

export type WorkspaceOperationActorPolicy = {
  allowedActors: readonly WorkspaceOperationActor[];
};

export type WorkspaceOperationMode = "read" | "write";

export type WorkspaceOperationRequiredCapability =
  | "credential-setup"
  | "deployment-apply"
  | "deployment-observe"
  | "deployment-plan"
  | "workspace-read"
  | "workspace-source-sync"
  | "workspace-source-write";

export const WORKSPACE_OPERATION_CAPABILITIES = [
  "workspace-read",
  "workspace-source-write",
  "workspace-source-sync",
  "credential-setup",
  "deployment-plan",
  "deployment-apply",
  "deployment-observe",
] as const satisfies readonly WorkspaceOperationRequiredCapability[];

export type WorkspaceOperationInputFieldValueType = "boolean" | "enum" | "string";

export type WorkspaceOperationInputDisplayPolicy = "always" | "never" | "when-present";

export type WorkspaceOperationInputFieldDefinition = {
  allowedValues?: readonly string[];
  defaultValue?: boolean | null | string;
  display: WorkspaceOperationInputDisplayPolicy;
  key: string;
  required?: boolean;
  valueType: WorkspaceOperationInputFieldValueType;
};

export type WorkspaceOperationCliBindingDefinition = {
  commands: readonly string[];
};

export type WorkspaceOperationGatewayBindingDefinition = {
  bootstrap: boolean;
  inputFields: readonly string[];
  requestKind: string;
};

export type WorkspaceOperationDefinitionContract = {
  actorPolicy: WorkspaceOperationActorPolicy;
  bindings: {
    cli?: WorkspaceOperationCliBindingDefinition;
    gateway?: WorkspaceOperationGatewayBindingDefinition;
  };
  handlerKey: string;
  input: {
    fields: readonly WorkspaceOperationInputFieldDefinition[];
  };
  key: string;
  kind: string;
  label: string;
  mode: WorkspaceOperationMode;
  requiredCapability: WorkspaceOperationRequiredCapability;
};

export type WorkspaceOperationExecutionDecision =
  | { ok: true }
  | {
      error: string;
      ok: false;
      requiredCapability?: WorkspaceOperationRequiredCapability;
    };

const allWorkspaceOperationActors = ["automation", "browser", "cli", "system"] as const;

const targetAliasInputField = {
  display: "when-present",
  key: "targetAlias",
  valueType: "string",
} as const;

const workspacePathInputField = {
  display: "never",
  key: "workspacePath",
  valueType: "string",
} as const;

const migrationPolicyInputField = {
  allowedValues: ["existing", "new"],
  display: "when-present",
  key: "migrationPolicy",
  valueType: "enum",
} as const;

export const WORKSPACE_OPERATION_DEFINITIONS = [
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    bindings: {
      gateway: { bootstrap: false, inputFields: ["targetAlias"], requestKind: "check" },
    },
    handlerKey: "workspace.source.check",
    input: { fields: [targetAliasInputField, workspacePathInputField] },
    key: "workspace.source.check",
    kind: "check",
    label: "Workspace source check",
    mode: "write",
    requiredCapability: "workspace-read",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    bindings: {
      gateway: {
        bootstrap: false,
        inputFields: ["provider", "accountId", "profileLabel"],
        requestKind: "credentialSetup",
      },
    },
    handlerKey: "workspace.credentials.setup",
    input: {
      fields: [
        {
          allowedValues: ["cloudflare"],
          display: "always",
          key: "provider",
          required: true,
          valueType: "enum",
        },
        { display: "when-present", key: "accountId", valueType: "string" },
        { display: "when-present", key: "profileLabel", valueType: "string" },
        workspacePathInputField,
      ],
    },
    key: "workspace.credentials.setup",
    kind: "credentialSetup",
    label: "Credential setup",
    mode: "write",
    requiredCapability: "credential-setup",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    bindings: {
      gateway: {
        bootstrap: false,
        inputFields: ["targetAlias"],
        requestKind: "deploymentRefresh",
      },
    },
    handlerKey: "deployment.refresh",
    input: { fields: [targetAliasInputField, workspacePathInputField] },
    key: "deployment.refresh",
    kind: "deploymentRefresh",
    label: "Deployment refresh",
    mode: "write",
    requiredCapability: "deployment-observe",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    bindings: {
      cli: { commands: ["formless deploy"] },
      gateway: {
        bootstrap: false,
        inputFields: ["migrationPolicy", "targetAlias"],
        requestKind: "deployApply",
      },
    },
    handlerKey: "deployment.apply",
    input: { fields: [migrationPolicyInputField, targetAliasInputField, workspacePathInputField] },
    key: "deployment.apply",
    kind: "deployApply",
    label: "Deployment apply",
    mode: "write",
    requiredCapability: "deployment-apply",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    bindings: {
      cli: { commands: ["formless deploy --dry-run"] },
      gateway: {
        bootstrap: false,
        inputFields: ["migrationPolicy", "targetAlias"],
        requestKind: "deployPlan",
      },
    },
    handlerKey: "deployment.plan",
    input: { fields: [migrationPolicyInputField, targetAliasInputField, workspacePathInputField] },
    key: "deployment.plan",
    kind: "deployPlan",
    label: "Deployment plan",
    mode: "write",
    requiredCapability: "deployment-plan",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    bindings: {},
    handlerKey: "workspace.init",
    input: {
      fields: [
        { display: "when-present", key: "name", valueType: "string" },
        workspacePathInputField,
      ],
    },
    key: "workspace.init",
    kind: "init",
    label: "Workspace init",
    mode: "write",
    requiredCapability: "workspace-source-write",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    bindings: {
      cli: { commands: ["formless pull"] },
      gateway: { bootstrap: false, inputFields: ["targetAlias"], requestKind: "pull" },
    },
    handlerKey: "workspace.source.pull",
    input: { fields: [targetAliasInputField, workspacePathInputField] },
    key: "workspace.source.pull",
    kind: "pull",
    label: "Workspace source pull",
    mode: "write",
    requiredCapability: "workspace-source-sync",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    bindings: {
      cli: { commands: ["formless push"] },
      gateway: {
        bootstrap: false,
        inputFields: ["allowStale", "apply", "replace", "replaceInstallSet", "targetAlias"],
        requestKind: "push",
      },
    },
    handlerKey: "workspace.source.push",
    input: {
      fields: [
        { defaultValue: false, display: "always", key: "allowStale", valueType: "boolean" },
        { defaultValue: false, display: "always", key: "apply", valueType: "boolean" },
        { defaultValue: false, display: "always", key: "replace", valueType: "boolean" },
        {
          defaultValue: false,
          display: "always",
          key: "replaceInstallSet",
          valueType: "boolean",
        },
        targetAliasInputField,
        workspacePathInputField,
      ],
    },
    key: "workspace.source.push",
    kind: "push",
    label: "Workspace source push",
    mode: "write",
    requiredCapability: "workspace-source-sync",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    bindings: {
      cli: { commands: ["formless save"] },
      gateway: { bootstrap: false, inputFields: ["check"], requestKind: "save" },
    },
    handlerKey: "workspace.source.save",
    input: {
      fields: [
        { defaultValue: false, display: "always", key: "check", valueType: "boolean" },
        { display: "when-present", key: "source", valueType: "string" },
        workspacePathInputField,
      ],
    },
    key: "workspace.source.save",
    kind: "save",
    label: "Workspace source save",
    mode: "write",
    requiredCapability: "workspace-source-write",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    bindings: {
      gateway: {
        bootstrap: true,
        inputFields: ["includeDeploymentStatus", "targetAlias"],
        requestKind: "status",
      },
    },
    handlerKey: "workspace.status",
    input: {
      fields: [
        {
          defaultValue: false,
          display: "always",
          key: "includeDeploymentStatus",
          valueType: "boolean",
        },
        targetAliasInputField,
        workspacePathInputField,
      ],
    },
    key: "workspace.status",
    kind: "status",
    label: "Workspace status",
    mode: "read",
    requiredCapability: "workspace-read",
  },
] as const satisfies readonly WorkspaceOperationDefinitionContract[];

export type WorkspaceOperationDefinition = (typeof WORKSPACE_OPERATION_DEFINITIONS)[number];

export type WorkspaceOperationDefinitionKey = WorkspaceOperationDefinition["key"];

export type WorkspaceOperationHandlerKey = WorkspaceOperationDefinition["handlerKey"];

export type WorkspaceOperationKind = WorkspaceOperationDefinition["kind"];

export type WorkspaceCliOperationDefinition = Extract<
  WorkspaceOperationDefinition,
  { readonly bindings: { readonly cli: unknown } }
>;

export type WorkspaceCliOperationKind = WorkspaceCliOperationDefinition["kind"];

export type WorkspaceCliCommandName =
  WorkspaceCliOperationDefinition["bindings"]["cli"]["commands"][number];

export type WorkspaceBrowserOperationDefinition = Extract<
  WorkspaceOperationDefinition,
  { readonly bindings: { readonly gateway: unknown } }
>;

export type WorkspaceBrowserOperationKind = WorkspaceBrowserOperationDefinition["kind"];

export const WORKSPACE_OPERATION_KEYS = WORKSPACE_OPERATION_DEFINITIONS.map(
  (definition) => definition.key,
) as WorkspaceOperationDefinitionKey[];

export const WORKSPACE_OPERATION_KINDS = WORKSPACE_OPERATION_DEFINITIONS.map(
  (definition) => definition.kind,
) as WorkspaceOperationKind[];

export const WORKSPACE_CLI_OPERATION_KINDS = WORKSPACE_OPERATION_DEFINITIONS.filter(
  hasWorkspaceCliBinding,
).map((definition) => definition.kind) as WorkspaceCliOperationKind[];

export const WORKSPACE_CLI_OPERATION_COMMANDS = WORKSPACE_OPERATION_DEFINITIONS.flatMap(
  (definition) =>
    hasWorkspaceCliBinding(definition) ? Array.from(definition.bindings.cli.commands) : [],
) as WorkspaceCliCommandName[];

export const WORKSPACE_BROWSER_OPERATION_KINDS = WORKSPACE_OPERATION_DEFINITIONS.filter(
  hasWorkspaceGatewayBinding,
).map((definition) => definition.kind) as WorkspaceBrowserOperationKind[];

export const WORKSPACE_BOOTSTRAP_OPERATION_KINDS = WORKSPACE_OPERATION_DEFINITIONS.filter(
  (definition) => hasWorkspaceGatewayBinding(definition) && definition.bindings.gateway.bootstrap,
).map((definition) => definition.kind) as WorkspaceBrowserOperationKind[];

function hasWorkspaceCliBinding(
  definition: WorkspaceOperationDefinition,
): definition is WorkspaceCliOperationDefinition {
  return "cli" in definition.bindings;
}

function hasWorkspaceGatewayBinding(
  definition: WorkspaceOperationDefinition,
): definition is WorkspaceBrowserOperationDefinition {
  return "gateway" in definition.bindings;
}

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

export type WorkspaceOperationStepStatus =
  | "failed"
  | "pending"
  | "running"
  | "skipped"
  | "succeeded";

export type WorkspaceOperationStep = {
  detail?: string;
  error?: string;
  fields?: WorkspaceOperationDisplayObject;
  id: string;
  label: string;
  status: WorkspaceOperationStepStatus;
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
  steps?: WorkspaceOperationStep[];
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
  steps?: WorkspaceOperationStep[];
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

export type DeploymentRefreshWorkspaceOperationInput = {
  kind: "deploymentRefresh";
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
  | DeploymentRefreshWorkspaceOperationInput
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

export type WorkspaceOperationDeploymentRefreshStartInput = {
  kind: "deploymentRefresh";
  targetAlias?: string | null;
};

export type WorkspaceOperationStartInput =
  | WorkspaceOperationCheckOrPullStartInput
  | WorkspaceOperationCredentialSetupStartInput
  | WorkspaceOperationDeploymentRefreshStartInput
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
  steps?: readonly WorkspaceOperationStep[];
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
  state: InstanceWorkspaceState;
  defaultTarget?: string;
  targets: InstanceWorkspaceTarget[];
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
  Partial<Omit<InstanceWorkspaceManifest, "kind" | "local" | "name" | "state" | "version">> & {
    local?: Partial<InstanceWorkspaceLocalState>;
    state?: Partial<InstanceWorkspaceState>;
  };

export type InstanceWorkspaceTarget = {
  alias: string;
  url: string;
};

export type InstanceWorkspaceState = {
  root: string;
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

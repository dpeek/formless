import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  projectDeployControlPlaneDesiredState,
  stableDeployJsonStringify,
  type ControlPlaneAppInstallProjectionRecord,
  type ControlPlaneProviderConfigProjectionRecord,
  type ControlPlaneRouteProjectionRecord,
  type ControlPlaneRedirectStatusCode,
  type DeployResource,
  type DeployResourceGraph,
} from "@dpeek/formless-deploy";

import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  formatAppArchive,
  formatInstanceArchive,
  type AppArchive,
  type InstanceArchive,
  type InstanceArchiveControlPlane,
  type PortableArchive,
} from "../shared/archive.ts";
import {
  normalizePortableArchive,
  type ArchiveNormalizationEvidence,
} from "../shared/archive-normalizers.ts";
import {
  findBundledAppPackage,
  packageAppFactsForKey,
  type AppInstall,
} from "../shared/app-installs.ts";
import {
  normalizeInstanceDomainHost,
  type InstanceDomainMapping,
} from "../shared/instance-domain-mappings.ts";
import type {
  DeploymentActor,
  DeploymentAttempt,
  DeploymentDesiredStateVersionRef,
  DeploymentPlanChangeCounts,
  DeploymentPlanSummary,
  DeploymentResourceEvidenceSummary,
  DeploymentResourceKind,
} from "../shared/deployment-runtime.ts";
import type { DomainProviderPlan } from "../shared/domain-provider-protocol.ts";
import {
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  formatInstanceControlPlaneBoundaryEntityName,
  isInstanceControlPlaneEntityName,
} from "../shared/instance-control-plane.ts";
import {
  parseOwnerSetupToken,
  type AppInstallsResponse,
  type RecordValues,
  type StoredRecord,
} from "../shared/protocol.ts";
import {
  CF_API_TOKEN_ENV_NAME,
  CLOUDFLARE_API_TOKEN_ENV_NAME,
  applyCloudflareWorkerDomainPreflightPlan,
  planCloudflareWorkerDomainPreflight,
  type CloudflareDomainApplyResult,
  type CloudflareDomainClient,
  type CloudflareDomainIntent,
  type CloudflareDomainPreflightPlan,
  type CloudflareDomainPreflightPolicy,
} from "./cloudflare-domain-client.ts";
import { formatDotEnv, parseDotEnv } from "./dotenv.ts";
import {
  DEFAULT_FORMLESS_INSTANCE_WORKSPACE_ARCHIVE_ROOT,
  DEFAULT_FORMLESS_INSTANCE_WORKSPACE_APP_ARCHIVE_ROOT,
  FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE,
  LEGACY_FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILES,
  defaultFormlessInstanceWorkspaceManifest,
  formatFormlessInstanceWorkspaceManifest,
  normalizeFormlessInstanceWorkspaceTargetUrl,
  parseFormlessInstanceWorkspaceManifestJson,
  type FormlessInstanceWorkspaceApp,
  type FormlessInstanceWorkspaceDefaultAppPolicy,
  type FormlessInstanceWorkspaceDomainIntent,
  type FormlessInstanceWorkspaceManifest,
  type FormlessInstanceWorkspaceMigrationPolicy,
  type FormlessInstanceWorkspaceTarget,
} from "./instance-workspace-config.ts";
import {
  readFormlessInstanceControlPlaneRecordSource,
  writeFormlessInstanceControlPlaneRecordSource,
} from "./instance-workspace-record-source.ts";
import {
  ensureFormlessInstanceWorkspaceLocalDevSecretState,
  FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME,
  FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_FILE,
  FORMLESS_INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME,
  ensureFormlessInstanceWorkspaceSecretStateIgnored,
  formatFormlessInstanceWorkspaceSecretState,
  formlessInstanceWorkspaceSecretStatePath,
  readFormlessInstanceWorkspaceSecretState,
  resolveFormlessInstanceWorkspaceAdminToken,
  writeFormlessInstanceWorkspaceSecretState,
  type FormlessInstanceWorkspaceLocalDevSecretState,
  type FormlessInstanceWorkspaceSecretState,
} from "./instance-workspace-secrets.ts";
import {
  deployDesiredStateVersionRef,
  type DeployDesiredStateVersionLike,
} from "@dpeek/formless-deploy/client";
import {
  recordFormlessInstanceDomainMappingApplyEvidence,
  readFormlessInstanceDeploymentDesiredState,
  readFormlessInstanceDomainMappings,
  readFormlessInstanceTargetStatus,
  startFormlessInstanceDeploymentAttempt,
  type FormlessInstanceTargetStatus,
  writeFormlessInstanceDeploymentAttemptFailure,
  writeFormlessInstanceDeploymentAttemptPlan,
  writeFormlessInstanceDeploymentAttemptSuccess,
} from "./instance-target-client.ts";
import {
  exportAppArchive,
  exportInstanceArchive,
  PORTABLE_ARCHIVE_MANIFEST_FILE,
  restorePortableArchive,
  type ArchiveDiskMediaFile,
  type ArchiveDiskWriteResult,
  type RestorePortableArchiveResult,
} from "./archive-workflows.ts";
import {
  ALCHEMY_PASSWORD_ENV_NAME,
  FORMLESS_ALCHEMY_APP_NAME,
  FORMLESS_INSTANCE_LOCAL_ENV_FILE,
  planFormlessInstanceDeployment,
  createFormlessInstanceState,
  formatFormlessInstanceState,
  formatFormlessOwnerSetupUrl,
  FORMLESS_INSTANCE_STATE_FILE,
  parseFormlessInstanceStateJson,
  selectOnlyFormlessInstanceAccount,
  type CreateFormlessInstanceOwnerSetupCapabilityResult,
  type CheckFormlessInstanceDeployMetadataResult,
  type DeployFormlessInstanceResult,
  type DestroyFormlessInstanceResult,
  type FormlessInstanceAccountDiscoveryAdapter,
  type FormlessInstanceDeploymentAdapter,
  type FormlessInstanceDeploymentAccount,
  type FormlessInstanceDeploymentHealthCheckAdapter,
  type FormlessInstanceDeploymentPlan,
  type FormlessInstanceOwnerSetupCapabilityAdapter,
  type FormlessInstanceLocalSecretEnvStore,
  type EnsureFormlessInstanceLocalSecretEnvResult,
} from "./instance-onboarding.ts";
import { packageExecCommand } from "./package-commands.ts";
import { SITE_PROJECT_CONFIG_FILE, SITE_PROJECT_RECORDS_FILE } from "./project-config.ts";
import {
  LOCAL_SESSION_BOOTSTRAP_API_PATH,
  LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV,
  LOCAL_WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  LOCAL_WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
} from "../shared/workspace-gateway-protocol.ts";
import type {
  LocalWorkspaceGatewaySidecar,
  StartLocalWorkspaceGatewaySidecarDependencies,
} from "./local-workspace-gateway.ts";

export type InitFormlessInstanceWorkspaceInput = {
  defaultAppPolicy?: FormlessInstanceWorkspaceDefaultAppPolicy;
  fromArchive?: string | null;
  fromRemote?: boolean;
  name?: string | null;
  targetAlias?: string;
  targetUrl?: string | null;
  workspacePath?: string;
};

export type InitLocalFormlessWorkspaceOnboardingInput = {
  name?: string | null;
  workspacePath?: string;
};

export type InitFormlessInstanceWorkspaceDependencies = {
  cwd: string;
  fetch: typeof fetch;
};

export type InitFormlessInstanceWorkspaceResult = {
  archiveSourcePath?: string;
  gitignorePath: string;
  manifest: FormlessInstanceWorkspaceManifest;
  manifestPath: string;
  remoteStatus?: FormlessInstanceTargetStatus;
  workspaceRoot: string;
};

export type FormlessInstanceWorkspaceDiscoveryResult = {
  manifestPath: string;
  workspaceRoot: string;
};

export type FormlessInstanceWorkspaceStatusInput = {
  includeDeploymentStatus?: boolean;
  targetAlias?: string | null;
  workspacePath?: string;
};

export type FormlessInstanceWorkspaceStatusDependencies = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
};

export type FormlessInstanceWorkspaceStatusResult = {
  manifest: FormlessInstanceWorkspaceManifest;
  manifestPath: string;
  remoteStatus?: FormlessInstanceTargetStatus;
  secretState: "env" | "missing" | "stored";
  selectedTarget?: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type PullFormlessInstanceWorkspaceInput = {
  targetAlias?: string | null;
  workspacePath?: string;
};

export type PullFormlessInstanceWorkspaceDependencies = {
  cwd: string;
  fetch: typeof fetch;
  now: () => string;
};

export type PullFormlessInstanceWorkspaceAppArchiveResult = ArchiveDiskWriteResult & {
  archiveRoot: string;
  installId: string;
};

export type PullFormlessInstanceWorkspaceResult = {
  appArchives: PullFormlessInstanceWorkspaceAppArchiveResult[];
  domains: FormlessInstanceWorkspaceDomainIntent[];
  instanceArchive: ArchiveDiskWriteResult;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type CheckFormlessInstanceWorkspaceInput = {
  targetAlias?: string | null;
  workspacePath?: string;
};

export type CheckLocalFormlessWorkspaceInput = {
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type SaveLocalFormlessWorkspaceInput = {
  check?: boolean;
  source?: string | null;
  workspacePath?: string | null;
};

export type CheckFormlessInstanceWorkspaceDependencies = {
  cwd: string;
  fetch: typeof fetch;
  now: () => string;
};

export type SaveLocalFormlessWorkspaceDependencies = {
  cwd: string;
  fetch: typeof fetch;
  now: () => string;
};

export type FormlessInstanceWorkspacePackageMismatch = {
  installId: string;
  localPackageAppKey: string;
  remotePackageAppKey: string;
};

export type FormlessInstanceWorkspaceDriftSummary = {
  archiveNormalizationEvidence: ArchiveNormalizationEvidence[];
  changedArchivePaths: string[];
  changedControlPlaneRecords: string[];
  domainDesiredDrift: FormlessInstanceWorkspaceDomainDesiredDrift[];
  changedMedia: string[];
  changedRecords: string[];
  extraInstalls: string[];
  localDomainCount: number;
  localAppCount: number;
  localControlPlaneRecordCount: number;
  localMediaCount: number;
  localRecordCount: number;
  missingInstalls: string[];
  packageMismatches: FormlessInstanceWorkspacePackageMismatch[];
  remoteDomainCount: number;
  remoteAppCount: number;
  remoteControlPlaneRecordCount: number;
  remoteMediaCount: number;
  remoteRecordCount: number;
  status: "drift" | "no-drift";
};

export type CheckFormlessInstanceWorkspaceResult = {
  drift: FormlessInstanceWorkspaceDriftSummary;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type CheckLocalFormlessWorkspaceResult =
  | {
      manifest: FormlessInstanceWorkspaceManifest;
      manifestPath: string;
      mode: "local";
      workspaceRoot: string;
    }
  | {
      mode: "remote";
      remote: CheckFormlessInstanceWorkspaceResult;
    };

export type SaveLocalFormlessWorkspaceArchiveSummary = {
  appCount: number;
  archivePath: string;
  mediaCount: number;
  recordCount: number;
};

export type SaveLocalFormlessWorkspaceAppArchiveSummary =
  SaveLocalFormlessWorkspaceArchiveSummary & {
    installId: string;
  };

export type SaveLocalFormlessWorkspaceResult = {
  appArchives: SaveLocalFormlessWorkspaceAppArchiveSummary[];
  instanceArchive: SaveLocalFormlessWorkspaceArchiveSummary;
  manifest: FormlessInstanceWorkspaceManifest;
  manifestPath: string;
  mode: "check" | "write";
  source: string;
  workspaceRoot: string;
};

export type PushFormlessInstanceWorkspaceInput = {
  allowStale?: boolean;
  apply?: boolean;
  replace?: boolean;
  replaceInstallSet?: boolean;
  targetAlias?: string | null;
  targetOverride?: FormlessInstanceWorkspaceTarget;
  workspacePath?: string;
};

export type PushFormlessInstanceWorkspaceDependencies = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  now: () => string;
};

export type PushFormlessInstanceWorkspaceSource = {
  archivePath: string;
  appCount: number;
  mediaCount: number;
  recordCount: number;
};

export type PushFormlessInstanceWorkspaceResult = {
  applyResult?: RestorePortableArchiveResult;
  backup?: ArchiveDiskWriteResult;
  drift: FormlessInstanceWorkspaceDriftSummary;
  dryRun: RestorePortableArchiveResult;
  mode: "apply" | "dry-run";
  replace: boolean;
  replaceInstallSet: boolean;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  source: PushFormlessInstanceWorkspaceSource;
  workspaceRoot: string;
};

export type FormlessInstanceWorkspaceDevCommand = {
  args: string[];
  command: string;
  label: string;
};

export type DevFormlessInstanceWorkspaceInput = {
  open?: boolean;
  workspacePath?: string;
};

export type DevFormlessInstanceWorkspaceDependencies = {
  cwd: string;
  devCommand: FormlessInstanceWorkspaceDevCommand;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  log: (message: string) => void;
  now: () => string;
  openBrowser?: (url: string) => Promise<void>;
  packageRoot: string;
  spawn: typeof nodeSpawn;
  startWorkspaceGatewaySidecar?: (
    input: {
      env?: NodeJS.ProcessEnv;
      workspaceRoot: string;
    },
    dependencies: StartLocalWorkspaceGatewaySidecarDependencies,
  ) => Promise<LocalWorkspaceGatewaySidecar>;
} & Partial<
  Pick<
    StartLocalWorkspaceGatewaySidecarDependencies,
    | "accountDiscovery"
    | "deploymentAdapter"
    | "healthCheck"
    | "localSecretEnv"
    | "packageVersion"
    | "randomToken"
    | "setupCapability"
  >
>;

export type ResetFormlessInstanceWorkspaceLocalStateInput = {
  workspacePath?: string;
};

export type ResetFormlessInstanceWorkspaceLocalStateDependencies = {
  cwd: string;
};

export type ResetFormlessInstanceWorkspaceLocalStateResult = {
  localStateRoot: string;
  manifestPath: string;
  workspaceRoot: string;
};

export type DeployFormlessInstanceWorkspaceInput = {
  migrationPolicy?: FormlessInstanceWorkspaceMigrationPolicy | null;
  targetAlias?: string | null;
  workspacePath?: string;
};

export type DeployFormlessInstanceWorkspaceDependencies = {
  cwd: string;
  deploymentAdapter: FormlessInstanceDeploymentAdapter;
  env?: NodeJS.ProcessEnv;
  healthCheck: FormlessInstanceDeploymentHealthCheckAdapter;
  localSecretEnv: FormlessInstanceLocalSecretEnvStore;
  packageRoot: string;
  packageVersion: string;
  randomToken: () => string;
};

export type DeployLocalFormlessWorkspaceInput = {
  migrationPolicy?: FormlessInstanceWorkspaceMigrationPolicy | null;
  targetAlias?: string | null;
  workspacePath?: string;
};

export type DeployLocalFormlessWorkspaceDependencies =
  DeployFormlessInstanceWorkspaceDependencies & {
    accountDiscovery: FormlessInstanceAccountDiscoveryAdapter;
    fetch: typeof fetch;
    now: () => string;
    setupCapability: FormlessInstanceOwnerSetupCapabilityAdapter;
  };

export type PlanDeployLocalFormlessWorkspaceDependencies = Pick<
  DeployLocalFormlessWorkspaceDependencies,
  "accountDiscovery" | "cwd" | "fetch" | "now" | "packageVersion"
>;

export type PlanDeployLocalFormlessWorkspaceResult = LocalWorkspaceDeploymentPlanResult & {
  desiredState: LocalWorkspaceDeploymentDesiredState;
  existingSelectedTarget?: FormlessInstanceWorkspaceTarget;
  manifestPath: string;
  preflight?: CheckFormlessInstanceWorkspaceResult;
  workspaceRoot: string;
};

export type PlanDeployFormlessInstanceWorkspaceDependencies = Pick<
  DeployFormlessInstanceWorkspaceDependencies,
  "cwd" | "packageVersion"
>;

export type PlanDeployFormlessInstanceWorkspaceResult = {
  plan: FormlessInstanceDeploymentPlan;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type DestroyFormlessInstanceWorkspaceInput = {
  confirm: string;
  targetAlias?: string | null;
  workspacePath?: string;
};

export type DestroyFormlessInstanceWorkspaceDependencies = {
  cwd: string;
  deploymentAdapter: FormlessInstanceDeploymentAdapter;
  env?: NodeJS.ProcessEnv;
  packageRoot: string;
  packageVersion: string;
};

export type DestroyLocalFormlessWorkspaceInput = DestroyFormlessInstanceWorkspaceInput;

export type DestroyLocalFormlessWorkspaceDependencies =
  DestroyFormlessInstanceWorkspaceDependencies;

export type DeployLocalFormlessWorkspaceOwnerSetup = {
  capability: CreateFormlessInstanceOwnerSetupCapabilityResult;
  url: string;
};

export type DeployLocalFormlessWorkspaceAttemptSummary = {
  attemptId: string;
  completedAt?: string;
  mode: string;
  runnerId: string | null;
  startedAt: string;
  status: string;
  targetId: string;
};

export type DeployLocalFormlessWorkspacePlanSummary = {
  blockerCount: number;
  changes: DeploymentPlanChangeCounts;
  displayText: string | null;
  recordedAt: string;
  warningCount: number;
};

export type DeployLocalFormlessWorkspaceEvidenceSummary = {
  actionsByKind: Record<string, number>;
  count: number;
  logicalIds: string[];
  resourcesByKind: Record<string, number>;
};

export type DeployLocalFormlessWorkspaceRuntimeWritebackSummary = {
  planRecordedAt: string;
  status: "succeeded";
  successCompletedAt: string;
};

export type DeployLocalFormlessWorkspaceWriteback = {
  attemptId: string;
  attempt: DeployLocalFormlessWorkspaceAttemptSummary;
  desiredState: DeploymentDesiredStateVersionRef;
  evidence: DeployLocalFormlessWorkspaceEvidenceSummary;
  evidenceCount: number;
  plan: DeployLocalFormlessWorkspacePlanSummary;
  resourceCount: number;
  resourcesByKind: Record<DeploymentResourceKind, number>;
  runnerId: string;
  status: "succeeded";
  targetId: string;
  writeback: DeployLocalFormlessWorkspaceRuntimeWritebackSummary;
};

export type DeployFormlessInstanceWorkspaceResult = {
  deployment: DeployFormlessInstanceResult;
  deploymentStateRoot: string;
  deploymentStatePath?: string;
  deploymentWriteback?: DeployLocalFormlessWorkspaceWriteback;
  healthCheck: CheckFormlessInstanceDeployMetadataResult;
  localSecretEnv: EnsureFormlessInstanceLocalSecretEnvResult;
  migrationPolicy: FormlessInstanceWorkspaceMigrationPolicy;
  ownerSetup?: DeployLocalFormlessWorkspaceOwnerSetup;
  plan: FormlessInstanceDeploymentPlan;
  push?: PushFormlessInstanceWorkspaceResult;
  secretPath: string;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type DestroyFormlessInstanceWorkspaceRouteProviderResources = {
  enabledHosts: string[];
  resourceGraph: DeployResourceGraph;
  resourceCount: number;
  routeCount: number;
  source: "instance:route";
};

export type DestroyFormlessInstanceWorkspaceResult = {
  deploymentStatePath: string;
  deploymentStateRoot: string;
  destroy: DestroyFormlessInstanceResult;
  localSecretPath: string;
  plan: FormlessInstanceDeploymentPlan;
  routeProviderResources: DestroyFormlessInstanceWorkspaceRouteProviderResources;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type FormlessInstanceWorkspaceProviderContext = {
  credentialProfile: string | null;
  deploymentStatePath: string;
  deploymentStateRoot: string;
  localSecretPath: string;
  manifest: FormlessInstanceWorkspaceManifest;
  plan: FormlessInstanceDeploymentPlan;
  secrets: {
    ALCHEMY_PASSWORD: string;
    CLOUDFLARE_API_TOKEN?: string;
  };
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type PlanFormlessInstanceWorkspaceDomainsInput = {
  host?: string | null;
  policy?: CloudflareDomainPreflightPolicy;
  targetAlias?: string | null;
  workspacePath?: string;
};

export type PlanFormlessInstanceWorkspaceDomainsDependencies = {
  cloudflareDomainClient: CloudflareDomainClient;
  cwd: string;
  fetch: typeof fetch;
};

export type FormlessInstanceWorkspaceDomainDesiredDrift = {
  host: string;
  live?: FormlessInstanceWorkspaceDomainIntent;
  local?: FormlessInstanceWorkspaceDomainIntent;
  status: "local-only" | "live-only" | "mismatch";
};

export type PlanFormlessInstanceWorkspaceDomainsResult = {
  accountId: string;
  desired: {
    drift: FormlessInstanceWorkspaceDomainDesiredDrift[];
    liveEnabledCount: number;
    source: "live" | "workspace";
    workspaceCount: number;
  };
  preflight: CloudflareDomainPreflightPlan;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workerName: string;
  workspaceRoot: string;
};

export type ApplyFormlessInstanceWorkspaceDomainsInput =
  PlanFormlessInstanceWorkspaceDomainsInput & {
    adminToken?: string | null;
  };

export type ApplyFormlessInstanceWorkspaceDomainsDependencies =
  PlanFormlessInstanceWorkspaceDomainsDependencies & {
    env?: NodeJS.ProcessEnv;
    now: () => string;
  };

export type ApplyFormlessInstanceWorkspaceDomainsResult =
  PlanFormlessInstanceWorkspaceDomainsResult & {
    applied: CloudflareDomainApplyResult;
    evidenceCount: number;
  };

export type AdoptFormlessInstanceWorkspaceAdminTokenInput = {
  adminToken?: string | null;
  targetAlias?: string | null;
  workspacePath?: string;
};

export type AdoptFormlessInstanceWorkspaceAdminTokenDependencies = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

export type AdoptFormlessInstanceWorkspaceAdminTokenResult = {
  secretPath: string;
  selectedTarget?: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type RotateFormlessInstanceWorkspaceAdminTokenInput =
  AdoptFormlessInstanceWorkspaceAdminTokenInput;

export type RotateFormlessInstanceWorkspaceAdminTokenDependencies =
  AdoptFormlessInstanceWorkspaceAdminTokenDependencies & {
    packageRoot: string;
    randomToken: () => string;
    runCommand: (
      command: string,
      args: string[],
      options: { cwd: string; env?: NodeJS.ProcessEnv },
    ) => Promise<void>;
  };

export type RotateFormlessInstanceWorkspaceAdminTokenResult =
  AdoptFormlessInstanceWorkspaceAdminTokenResult & {
    workerName: string;
  };

export async function initFormlessInstanceWorkspace(
  input: InitFormlessInstanceWorkspaceInput,
  dependencies: InitFormlessInstanceWorkspaceDependencies,
): Promise<InitFormlessInstanceWorkspaceResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const manifestPath = workspaceManifestPath(workspaceRoot);

  await assertNoExistingWorkspaceManifest(workspaceRoot);
  await mkdir(workspaceRoot, { recursive: true });

  const name = input.name ?? defaultWorkspaceName(workspaceRoot);
  const targetUrl =
    input.targetUrl === undefined || input.targetUrl === null
      ? null
      : normalizeFormlessInstanceWorkspaceTargetUrl(input.targetUrl);
  const targetAlias = input.targetAlias ?? "remote";
  let manifest = {
    ...defaultFormlessInstanceWorkspaceManifest({ name, targetUrl }),
    ...(input.defaultAppPolicy === undefined ? {} : { defaultAppPolicy: input.defaultAppPolicy }),
  };
  let remoteStatus: FormlessInstanceTargetStatus | undefined;
  let archiveSourcePath: string | undefined;

  if (targetUrl) {
    manifest = withSingleTarget(manifest, { alias: targetAlias, url: targetUrl });
  }

  if (input.fromRemote) {
    if (!targetUrl) {
      throw new Error("Formless instance workspace remote init requires --target-url.");
    }

    remoteStatus = await readFormlessInstanceTargetStatus({ targetUrl }, dependencies);
    manifest = withRemoteStatus(manifest, remoteStatus);
  }

  if (input.fromArchive) {
    const archiveDir = path.resolve(dependencies.cwd, input.fromArchive);
    const archive = await readWorkspaceArchive(archiveDir);

    archiveSourcePath = relativeWorkspacePath(workspaceRoot, archiveDir);
    manifest = withArchiveSource(manifest, archive, archiveSourcePath);
  }

  await prepareWorkspaceDirectories(workspaceRoot, manifest);
  await writeFile(manifestPath, formatFormlessInstanceWorkspaceManifest(manifest));
  const gitignorePath = await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);

  return {
    ...(archiveSourcePath === undefined ? {} : { archiveSourcePath }),
    gitignorePath,
    manifest,
    manifestPath,
    ...(remoteStatus === undefined ? {} : { remoteStatus }),
    workspaceRoot,
  };
}

export async function initLocalFormlessWorkspaceOnboarding(
  input: InitLocalFormlessWorkspaceOnboardingInput,
  dependencies: InitFormlessInstanceWorkspaceDependencies,
): Promise<InitFormlessInstanceWorkspaceResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);

  await assertLocalOnboardingWorkspaceReady(workspaceRoot);

  return initFormlessInstanceWorkspace(
    {
      defaultAppPolicy: "none",
      name: input.name,
      targetUrl: null,
      workspacePath: input.workspacePath,
    },
    dependencies,
  );
}

export async function discoverFormlessInstanceWorkspaceRoot(
  cwd: string,
): Promise<FormlessInstanceWorkspaceDiscoveryResult> {
  let directory = path.resolve(cwd);

  while (true) {
    await assertNoLegacyWorkspaceManifest(directory);

    const manifestPath = workspaceManifestPath(directory);

    if (await pathExists(manifestPath)) {
      return {
        manifestPath,
        workspaceRoot: directory,
      };
    }

    const parent = path.dirname(directory);

    if (parent === directory) {
      throw new Error(
        `Could not find ${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} from ${path.resolve(cwd)}.`,
      );
    }

    directory = parent;
  }
}

export async function resolveFormlessInstanceWorkspaceRoot(input: {
  cwd: string;
  workspacePath?: string | null;
}): Promise<string> {
  if (input.workspacePath === undefined || input.workspacePath === null) {
    return (await discoverFormlessInstanceWorkspaceRoot(input.cwd)).workspaceRoot;
  }

  const workspaceRoot = workspaceRootForInput(input.cwd, input.workspacePath);

  await assertNoLegacyWorkspaceManifest(workspaceRoot);
  return workspaceRoot;
}

export async function getFormlessInstanceWorkspaceStatus(
  input: FormlessInstanceWorkspaceStatusInput,
  dependencies: FormlessInstanceWorkspaceStatusDependencies,
): Promise<FormlessInstanceWorkspaceStatusResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { manifest, manifestPath } = await readWorkspaceManifest(workspaceRoot);
  const selectedTarget = await resolveWorkspaceTarget({
    commandName: "status",
    manifest,
    required: false,
    targetAlias: input.targetAlias,
    workspaceRoot,
  });
  const secretState = await readFormlessInstanceWorkspaceSecretState(workspaceRoot);
  const remoteStatus = selectedTarget
    ? await readFormlessInstanceTargetStatus(
        {
          includeDeploymentStatus: input.includeDeploymentStatus,
          targetUrl: selectedTarget.url,
        },
        dependencies,
      )
    : undefined;

  return {
    manifest,
    manifestPath,
    ...(remoteStatus === undefined ? {} : { remoteStatus }),
    secretState: workspaceSecretStateLabel(secretState, dependencies.env),
    ...(selectedTarget === undefined ? {} : { selectedTarget }),
    workspaceRoot,
  };
}

export async function pullFormlessInstanceWorkspace(
  input: PullFormlessInstanceWorkspaceInput,
  dependencies: PullFormlessInstanceWorkspaceDependencies,
): Promise<PullFormlessInstanceWorkspaceResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { manifest, manifestPath } = await readWorkspaceManifest(workspaceRoot);
  const selectedTarget = await requireWorkspaceTarget({
    commandName: "pull",
    manifest,
    targetAlias: input.targetAlias,
    workspaceRoot,
  });
  const tempRoot = await createWorkspaceTempRoot(workspaceRoot, "pull");

  try {
    const instanceArchiveRoot = path.join(tempRoot, "instance");

    await prepareWorkspaceDirectories(workspaceRoot, manifest);
    const instanceArchive = await exportInstanceArchive(
      {
        outDir: instanceArchiveRoot,
        target: selectedTarget.url,
      },
      dependencies,
    );
    const pulledInstanceArchive = await readArchiveDirectoryForCheck(instanceArchiveRoot);

    if (!pulledInstanceArchive || pulledInstanceArchive.archive.kind !== INSTANCE_ARCHIVE_KIND) {
      throw new Error("Formless instance pull did not write an instance archive.");
    }

    await writeFormlessInstanceControlPlaneRecordSource({
      controlPlane: pulledInstanceArchive.archive.controlPlane,
      manifest,
      workspaceRoot,
    });

    const appArchives: PullFormlessInstanceWorkspaceAppArchiveResult[] = [];

    for (const app of archiveApps(pulledInstanceArchive.archive)) {
      const archiveRoot = path.join(
        workspaceRoot,
        workspaceAppArchivePath(manifest, app.app.installId),
      );
      const archive = await pullWorkspaceAppArchive(
        {
          archiveRoot,
          installId: app.app.installId,
          targetUrl: selectedTarget.url,
        },
        dependencies,
      );

      appArchives.push(archive);
    }

    const domains = await readLiveWorkspaceDomainIntents(selectedTarget, dependencies);
    await writeFile(manifestPath, formatFormlessInstanceWorkspaceManifest(manifest));

    return {
      appArchives: appArchives.sort((left, right) => left.installId.localeCompare(right.installId)),
      domains,
      instanceArchive,
      selectedTarget,
      workspaceRoot,
    };
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

export async function checkFormlessInstanceWorkspace(
  input: CheckFormlessInstanceWorkspaceInput,
  dependencies: CheckFormlessInstanceWorkspaceDependencies,
): Promise<CheckFormlessInstanceWorkspaceResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { manifest } = await readWorkspaceManifest(workspaceRoot);
  const selectedTarget = await requireWorkspaceTarget({
    commandName: "check",
    manifest,
    targetAlias: input.targetAlias,
    workspaceRoot,
  });
  const tempRoot = await createWorkspaceTempRoot(workspaceRoot, "check");

  try {
    const remoteArchiveRoot = path.join(tempRoot, "instance");

    await exportInstanceArchive(
      {
        outDir: remoteArchiveRoot,
        target: selectedTarget.url,
      },
      dependencies,
    );

    const remoteArchive = await readArchiveDirectoryForCheck(remoteArchiveRoot);

    if (!remoteArchive || remoteArchive.archive.kind !== INSTANCE_ARCHIVE_KIND) {
      throw new Error("Formless instance check did not write a remote instance archive.");
    }

    const liveDomains = await readLiveWorkspaceDomainIntents(selectedTarget, dependencies);
    const localControlPlane = await readFormlessInstanceControlPlaneRecordSource({
      manifest,
      workspaceRoot,
    });
    const localAppArchives = await readWorkspaceAppArchiveMapForCheck(
      workspaceRoot,
      manifest,
      localControlPlane,
    );

    return {
      drift: compareWorkspaceArchives({
        domainDesiredDrift: compareWorkspaceDomainIntentToLive(manifest.domains ?? [], liveDomains),
        localControlPlane,
        localDomainCount: manifest.domains?.length ?? 0,
        localAppArchives,
        manifest,
        remoteDomainCount: liveDomains.length,
        remoteArchive,
      }),
      selectedTarget,
      workspaceRoot,
    };
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

export async function checkLocalFormlessWorkspace(
  input: CheckLocalFormlessWorkspaceInput,
  dependencies: CheckFormlessInstanceWorkspaceDependencies,
): Promise<CheckLocalFormlessWorkspaceResult> {
  const workspaceRoot = await resolveFormlessInstanceWorkspaceRoot({
    cwd: dependencies.cwd,
    workspacePath: input.workspacePath,
  });
  const { manifest, manifestPath } = await readWorkspaceManifest(workspaceRoot);
  const selectedTarget = await resolveWorkspaceTarget({
    commandName: "check",
    manifest,
    required: false,
    targetAlias: input.targetAlias,
    workspaceRoot,
  });

  if (!selectedTarget) {
    return {
      manifest,
      manifestPath,
      mode: "local",
      workspaceRoot,
    };
  }

  return {
    mode: "remote",
    remote: await checkFormlessInstanceWorkspace(
      {
        targetAlias: input.targetAlias,
        workspacePath: workspaceRoot,
      },
      dependencies,
    ),
  };
}

export async function saveLocalFormlessWorkspace(
  input: SaveLocalFormlessWorkspaceInput,
  dependencies: SaveLocalFormlessWorkspaceDependencies,
): Promise<SaveLocalFormlessWorkspaceResult> {
  const workspaceRoot = await resolveFormlessInstanceWorkspaceRoot({
    cwd: dependencies.cwd,
    workspacePath: input.workspacePath,
  });
  const { manifest, manifestPath } = await readWorkspaceManifest(workspaceRoot);
  const source = await resolveWorkspaceLocalSource({
    explicitSource: input.source,
    manifest,
    workspaceRoot,
  });
  const tempRoot = await createWorkspaceTempRoot(workspaceRoot, "save");

  try {
    const exported = await exportWorkspaceSourceFromLocalAuthority(
      {
        source,
        tempRoot,
      },
      dependencies,
    );
    const nextManifest = workspaceManifestFromSavedAuthoritySource(manifest, exported.archive);
    const recordSourcePath = path.join(workspaceRoot, nextManifest.source.records);
    const appArchives = savedWorkspaceAppArchiveSummaries(workspaceRoot, nextManifest, exported);
    const result: SaveLocalFormlessWorkspaceResult = {
      appArchives,
      instanceArchive: {
        appCount: exported.archive.apps.length,
        archivePath: recordSourcePath,
        mediaCount: exported.archive.apps.reduce(
          (count, app) => count + app.media.objects.length,
          0,
        ),
        recordCount: exported.archive.controlPlane?.records.length ?? 0,
      },
      manifest: nextManifest,
      manifestPath,
      mode: input.check ? "check" : "write",
      source,
      workspaceRoot,
    };

    if (input.check) {
      const stalePaths = await staleSavedWorkspaceSourcePaths({
        exported,
        manifest,
        manifestPath,
        nextManifest,
        workspaceRoot,
      });

      if (stalePaths.length > 0) {
        throw new Error(
          `Formless workspace source is stale: ${stalePaths.join(", ")}. Run "npx formless save".`,
        );
      }

      return result;
    }

    await writeSavedWorkspaceSource({
      exported,
      manifestPath,
      nextManifest,
      workspaceRoot,
    });

    return result;
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

export async function pushFormlessInstanceWorkspace(
  input: PushFormlessInstanceWorkspaceInput,
  dependencies: PushFormlessInstanceWorkspaceDependencies,
): Promise<PushFormlessInstanceWorkspaceResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { manifest } = await readWorkspaceManifest(workspaceRoot);
  const selectedTarget =
    input.targetOverride ??
    (await requireWorkspaceTarget({
      commandName: "push",
      manifest,
      targetAlias: input.targetAlias,
      workspaceRoot,
    }));
  const tempRoot = await createWorkspaceTempRoot(workspaceRoot, "push");
  const composedArchiveRoot = path.join(tempRoot, "archive");

  try {
    const backup = input.apply
      ? await exportInstanceArchive(
          {
            outDir: workspacePushBackupPath(workspaceRoot, dependencies.now()),
            target: selectedTarget.url,
          },
          dependencies,
        )
      : undefined;
    const remoteArchiveRoot = backup
      ? path.dirname(backup.archivePath)
      : path.join(tempRoot, "remote-check");

    if (!backup) {
      await exportInstanceArchive(
        {
          outDir: remoteArchiveRoot,
          target: selectedTarget.url,
        },
        dependencies,
      );
    }

    const remoteArchive = await readArchiveDirectoryForCheck(remoteArchiveRoot);

    if (!remoteArchive || remoteArchive.archive.kind !== INSTANCE_ARCHIVE_KIND) {
      throw new Error("Formless instance push could not read remote archive state.");
    }

    const liveDomains = await readLiveWorkspaceDomainIntents(selectedTarget, dependencies);
    const exportedAt = dependencies.now();
    const localControlPlane = await readFormlessInstanceControlPlaneRecordSource({
      manifest,
      workspaceRoot,
    });
    const localAppArchives = await readWorkspaceAppArchivesForPush(
      workspaceRoot,
      manifest,
      localControlPlane,
    );
    const source = await writeComposedWorkspacePushArchive({
      archives: localAppArchives,
      archiveRoot: composedArchiveRoot,
      controlPlane: localControlPlane,
      exportedAt,
    });
    const drift = compareWorkspaceArchives({
      domainDesiredDrift: compareWorkspaceDomainIntentToLive(manifest.domains ?? [], liveDomains),
      localControlPlane,
      localDomainCount: manifest.domains?.length ?? 0,
      localAppArchives: new Map(
        localAppArchives.map((archive) => [
          archive.archive.kind === APP_ARCHIVE_KIND ? archive.archive.app.installId : "",
          archive,
        ]),
      ),
      manifest,
      remoteDomainCount: liveDomains.length,
      remoteArchive,
    });

    if (input.apply && drift.status === "drift" && !input.allowStale) {
      throw new Error(
        "Formless instance push apply refused because remote drift was detected; review `formless instance check` and retry with --allow-stale to acknowledge it.",
      );
    }

    if (input.apply && input.replaceInstallSet && drift.extraInstalls.length > 0) {
      throw new Error(
        `Formless instance push cannot replace the remote install set yet; archive restore cannot prune extra remote installs: ${drift.extraInstalls.join(", ")}.`,
      );
    }

    const secretState = await readFormlessInstanceWorkspaceSecretState(workspaceRoot);
    const adminToken = resolveFormlessInstanceWorkspaceAdminToken({
      env: dependencies.env,
      secretState,
    });
    const dryRun = await restorePortableArchive(
      {
        adminToken,
        apply: false,
        archiveDir: composedArchiveRoot,
        includeUpgradePlanning: !input.apply,
        replace: input.replace ?? false,
        target: selectedTarget.url,
        upgradeTarget: {
          label: selectedTarget.alias,
          targetUrl: selectedTarget.url,
        },
      },
      dependencies,
    );

    if (input.apply && !dryRun.remote.ok) {
      throw new Error("Formless instance push apply stopped because dry-run restore failed.");
    }

    const applyResult = input.apply
      ? await restorePortableArchive(
          {
            adminToken,
            apply: true,
            archiveDir: composedArchiveRoot,
            replace: input.replace ?? false,
            target: selectedTarget.url,
          },
          dependencies,
        )
      : undefined;

    return {
      ...(applyResult === undefined ? {} : { applyResult }),
      ...(backup === undefined ? {} : { backup }),
      drift,
      dryRun,
      mode: input.apply ? "apply" : "dry-run",
      replace: input.replace ?? false,
      replaceInstallSet: input.replaceInstallSet ?? false,
      selectedTarget,
      source,
      workspaceRoot,
    };
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

export async function runFormlessInstanceWorkspaceDev(
  input: DevFormlessInstanceWorkspaceInput,
  dependencies: DevFormlessInstanceWorkspaceDependencies,
): Promise<void> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const manifest = await readWorkspaceManifestForDev(workspaceRoot);
  const localStateRoot = formlessInstanceWorkspaceLocalStateRoot(workspaceRoot, manifest);
  const candidateOrigins = new Set(defaultDevSourceCandidates(dependencies.env));

  await prepareWorkspaceDirectories(workspaceRoot, manifest, { appArchiveRoot: false });
  const localDevSecrets = await ensureFormlessInstanceWorkspaceLocalDevSecretState(
    workspaceRoot,
    localStateRoot,
    () => requiredGeneratedToken(createLocalDevSecret(dependencies)),
  );
  const localSessionBootstrapToken = requiredGeneratedToken(createLocalDevSecret(dependencies));

  const sidecar = await startWorkspaceGatewaySidecar(
    {
      env: dependencies.env,
      workspaceRoot,
    },
    dependencies,
  );
  let child: ChildProcessWithoutNullStreams | undefined;

  try {
    child = dependencies.spawn(dependencies.devCommand.command, dependencies.devCommand.args, {
      cwd: dependencies.packageRoot,
      env: formlessInstanceWorkspaceDevEnv(
        dependencies.env ?? {},
        workspaceRoot,
        manifest,
        sidecar,
        {
          localDevSecrets: localDevSecrets.state,
          localSessionBootstrapToken,
        },
      ),
      stdio: "pipe",
    });

    forwardDevOutput(child, dependencies.log, candidateOrigins);

    const source = await waitForInstanceDevServer(child, dependencies.fetch, candidateOrigins);
    const bootstrap = await bootstrapWorkspaceLocalInstance(
      {
        manifest,
        source,
        workspaceRoot,
      },
      dependencies,
    );

    await writeWorkspaceLocalDevState({
      manifest,
      source,
      startedAt: dependencies.now(),
      workspaceRoot,
    });

    if (input.open) {
      if (!dependencies.openBrowser) {
        throw new Error("Formless instance dev --open requires a browser opener.");
      }

      await dependencies.openBrowser(localSessionBootstrapUrl(source, localSessionBootstrapToken));
    }

    dependencies.log(`Instance shell: ${source}/`);
    dependencies.log("Local bootstrap entry: complete workspace setup in the browser.");
    dependencies.log(`Local state: ${relativeDependencyPath(dependencies.cwd, localStateRoot)}.`);

    if (bootstrap.status === "restored") {
      dependencies.log(
        `Workspace archive restored: ${bootstrap.sourceKind} (${bootstrap.appCount} apps, ${bootstrap.recordCount} records, ${bootstrap.mediaCount} media).`,
      );
    } else if (bootstrap.status === "existing") {
      dependencies.log(
        `Workspace archive restore skipped: local installs already exist (${bootstrap.installIds.join(", ") || "none"}).`,
      );
    } else {
      dependencies.log("Workspace archive restore skipped: no workspace archives declared.");
    }

    await waitForChildExit(child);
  } catch (error) {
    child?.kill();
    throw error;
  } finally {
    await sidecar.close();
  }
}

export async function resetFormlessInstanceWorkspaceLocalState(
  input: ResetFormlessInstanceWorkspaceLocalStateInput,
  dependencies: ResetFormlessInstanceWorkspaceLocalStateDependencies,
): Promise<ResetFormlessInstanceWorkspaceLocalStateResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { manifest, manifestPath } = await readWorkspaceManifest(workspaceRoot);
  const localStateRoot = formlessInstanceWorkspaceLocalStateRoot(workspaceRoot, manifest);

  await rm(localStateRoot, { force: true, recursive: true });
  await mkdir(localStateRoot, { recursive: true });

  return {
    localStateRoot,
    manifestPath,
    workspaceRoot,
  };
}

export async function deployLocalFormlessWorkspace(
  input: DeployLocalFormlessWorkspaceInput,
  dependencies: DeployLocalFormlessWorkspaceDependencies,
): Promise<DeployFormlessInstanceWorkspaceResult> {
  const planned = await planDeployLocalFormlessWorkspace(input, dependencies);
  const workspaceRoot = planned.workspaceRoot;
  const secretState = await readFormlessInstanceWorkspaceSecretState(workspaceRoot);
  let adminToken = resolveFormlessInstanceWorkspaceAdminToken({
    env: dependencies.env,
    secretState,
  });

  await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);

  if (!adminToken) {
    adminToken = requiredGeneratedToken(dependencies.randomToken());
    await writeFormlessInstanceWorkspaceSecretState(workspaceRoot, { adminToken });
  }

  const deploymentStateRoot = formlessInstanceWorkspaceDeployStateRoot(workspaceRoot, planned.plan);
  const localSecretEnv = await dependencies.localSecretEnv.ensure({
    createSecret: dependencies.randomToken,
    root: deploymentStateRoot,
  });

  await copyLocalWorkspaceDeploySecretEnv({
    adminToken,
    env: dependencies.env,
    localSecretEnv,
    plan: planned.plan,
  });

  const deploymentStatePath = await writeLocalWorkspaceDeploymentState({
    credentialProfile: null,
    deploymentStateRoot,
    plan: planned.plan,
  });
  const deployment = await dependencies.deploymentAdapter.deploy({
    credentialProfile: null,
    packageRoot: dependencies.packageRoot,
    plan: planned.plan,
    secrets: {
      ALCHEMY_PASSWORD: localSecretEnv.secrets.ALCHEMY_PASSWORD,
      ...optionalCloudflareApiTokenSecret(dependencies.env),
      FORMLESS_ADMIN_TOKEN: adminToken,
    },
    stateRoot: deploymentStateRoot,
  });
  const deploymentUrl = normalizeFormlessInstanceWorkspaceTargetUrl(deployment.url);

  if (deploymentUrl !== planned.plan.expectedUrl.url) {
    throw new Error(
      `Formless deploy returned ${deploymentUrl}, expected target ${planned.plan.expectedUrl.url}.`,
    );
  }

  const healthCheck = await dependencies.healthCheck.check({
    expectedVersion: planned.plan.packageVersion,
    url: deploymentUrl,
  });

  await writeLocalWorkspaceDeployTargetSource({
    manifest: planned.manifest,
    now: dependencies.now(),
    selectedTarget: planned.selectedTarget,
    workspaceRoot,
  });

  const ownerSetup =
    planned.existingSelectedTarget === undefined
      ? await createLocalWorkspaceOwnerSetup({
          adminToken,
          deploymentUrl,
          randomToken: dependencies.randomToken,
          setupCapability: dependencies.setupCapability,
        })
      : undefined;
  const push = await pushFormlessInstanceWorkspace(
    {
      allowStale: planned.existingSelectedTarget === undefined,
      apply: true,
      replace: true,
      replaceInstallSet: false,
      targetAlias: planned.selectedTarget.alias,
      targetOverride: planned.selectedTarget,
      workspacePath: workspaceRoot,
    },
    dependencies,
  );
  const deploymentWriteback = await writeLocalWorkspaceDeploymentApplyWriteback(
    {
      adminToken,
      desiredState: planned.desiredState,
      plan: planned.plan,
      targetUrl: deploymentUrl,
    },
    dependencies,
  );

  return {
    deployment: {
      url: deploymentUrl,
    },
    deploymentStatePath,
    deploymentStateRoot,
    deploymentWriteback,
    healthCheck,
    localSecretEnv,
    migrationPolicy: planned.plan.migrationPolicy,
    ...(ownerSetup === undefined ? {} : { ownerSetup }),
    plan: planned.plan,
    push,
    secretPath: formlessInstanceWorkspaceSecretStatePath(workspaceRoot),
    selectedTarget: planned.selectedTarget,
    workspaceRoot,
  };
}

async function writeLocalWorkspaceDeploymentApplyWriteback(
  input: {
    adminToken: string;
    desiredState: LocalWorkspaceDeploymentDesiredState;
    plan: FormlessInstanceDeploymentPlan;
    targetUrl: string;
  },
  dependencies: Pick<DeployLocalFormlessWorkspaceDependencies, "fetch" | "now">,
): Promise<DeployLocalFormlessWorkspaceWriteback> {
  const runtimeDesiredState = await readFormlessInstanceDeploymentDesiredState(
    {
      targetId: input.desiredState.targetId,
      targetUrl: input.targetUrl,
    },
    dependencies,
  );

  assertRuntimeDesiredStateMatchesLocalProjection({
    local: input.desiredState,
    runtime: runtimeDesiredState.desiredState,
  });

  const desiredState = deployDesiredStateVersionRef(
    runtimeDesiredState.desiredState as DeployDesiredStateVersionLike,
  );
  const runnerId = "local-gateway";
  const actor = localWorkspaceDeploymentActor(runnerId);
  const started = await startFormlessInstanceDeploymentAttempt(
    {
      adminToken: input.adminToken,
      request: {
        actor,
        desiredState,
        idempotencyKey: localWorkspaceDeploymentApplyIdempotencyKey(desiredState),
        mode: "apply",
      },
      targetUrl: input.targetUrl,
    },
    dependencies,
  );

  if (!started.lease) {
    throw new Error("Local workspace deploy apply writeback did not acquire a deployment lease.");
  }

  try {
    const planWriteback = await writeFormlessInstanceDeploymentAttemptPlan(
      {
        adminToken: input.adminToken,
        request: {
          attemptId: started.attempt.attemptId,
          desiredState,
          runnerId,
          summary: localWorkspaceDeploymentPlanSummary(input.desiredState),
        },
        targetUrl: input.targetUrl,
      },
      dependencies,
    );
    const success = await writeFormlessInstanceDeploymentAttemptSuccess(
      {
        adminToken: input.adminToken,
        request: {
          alchemy: {
            app: FORMLESS_ALCHEMY_APP_NAME,
            scope: desiredState.targetId,
            stage: input.plan.instanceName,
          },
          attemptId: started.attempt.attemptId,
          desiredState,
          evidence: [],
          leaseToken: started.lease.token,
          runnerId,
        },
        targetUrl: input.targetUrl,
      },
      dependencies,
    );

    return {
      attemptId: success.attempt.attemptId,
      attempt: summarizeLocalWorkspaceDeploymentAttempt(success.attempt),
      desiredState,
      evidence: summarizeLocalWorkspaceDeploymentEvidence(success.result.evidence),
      evidenceCount: success.result.evidence.length,
      plan: summarizeLocalWorkspaceDeploymentPlan(planWriteback.plan),
      resourceCount: runtimeDesiredState.desiredState.display.resourceCount,
      resourcesByKind: runtimeDesiredResourcesByKind(
        runtimeDesiredState.desiredState.display.resourcesByKind,
      ),
      runnerId,
      status: "succeeded",
      targetId: desiredState.targetId,
      writeback: {
        planRecordedAt: planWriteback.plan.recordedAt,
        status: "succeeded",
        successCompletedAt: success.result.completedAt,
      },
    };
  } catch (error) {
    await writeFormlessInstanceDeploymentAttemptFailure(
      {
        adminToken: input.adminToken,
        request: {
          actor,
          attemptId: started.attempt.attemptId,
          desiredState,
          leaseToken: started.lease.token,
          runnerId,
          summary: localWorkspaceDeploymentFailureSummary(error),
        },
        targetUrl: input.targetUrl,
      },
      dependencies,
    );

    throw error;
  }
}

function summarizeLocalWorkspaceDeploymentAttempt(
  attempt: DeploymentAttempt,
): DeployLocalFormlessWorkspaceAttemptSummary {
  return {
    attemptId: attempt.attemptId,
    ...(attempt.completedAt === undefined ? {} : { completedAt: attempt.completedAt }),
    mode: attempt.mode,
    runnerId: attempt.runnerId ?? null,
    startedAt: attempt.startedAt,
    status: attempt.status,
    targetId: attempt.targetId,
  };
}

function summarizeLocalWorkspaceDeploymentPlan(input: {
  recordedAt: string;
  summary: DeploymentPlanSummary;
}): DeployLocalFormlessWorkspacePlanSummary {
  return {
    blockerCount: input.summary.blockers.length,
    changes: input.summary.changes,
    displayText: input.summary.displayText ?? null,
    recordedAt: input.recordedAt,
    warningCount: input.summary.warnings.length,
  };
}

function summarizeLocalWorkspaceDeploymentEvidence(
  evidence: readonly DeploymentResourceEvidenceSummary[],
): DeployLocalFormlessWorkspaceEvidenceSummary {
  return {
    actionsByKind: countBy(evidence, (entry) => entry.action),
    count: evidence.length,
    logicalIds: evidence.map((entry) => entry.logicalId),
    resourcesByKind: countBy(evidence, (entry) => entry.kind),
  };
}

function countBy<T>(items: readonly T[], selectKey: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const item of items) {
    const key = selectKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
}

function assertRuntimeDesiredStateMatchesLocalProjection(input: {
  local: LocalWorkspaceDeploymentDesiredState;
  runtime: {
    display: {
      resourceCount: number;
      resourcesByKind: Record<string, number>;
    };
    targetId: string;
  };
}): void {
  if (input.runtime.targetId !== input.local.targetId) {
    throw new Error(
      `Local deploy apply desired-state target "${input.local.targetId}" did not match runtime target "${input.runtime.targetId}".`,
    );
  }

  if (input.runtime.display.resourceCount !== input.local.resourceCount) {
    throw new Error(
      `Local deploy apply desired-state resource count ${input.local.resourceCount} did not match runtime resource count ${input.runtime.display.resourceCount}.`,
    );
  }

  if (
    stableDeployJsonStringify(input.runtime.display.resourcesByKind) !==
    stableDeployJsonStringify(input.local.resourcesByKind)
  ) {
    throw new Error("Local deploy apply desired-state resource kinds did not match runtime.");
  }
}

function localWorkspaceDeploymentActor(runnerId: string): DeploymentActor {
  return {
    actorId: "local-gateway.deploy",
    displayName: "Local workspace gateway",
    kind: "cli",
    runnerId,
  };
}

function localWorkspaceDeploymentApplyIdempotencyKey(
  desiredState: DeploymentDesiredStateVersionRef,
): string {
  return `local-gateway-deploy:${desiredState.targetId}:${desiredState.versionId}:${desiredState.hash}`;
}

function localWorkspaceDeploymentPlanSummary(
  desiredState: LocalWorkspaceDeploymentDesiredState,
): DeploymentPlanSummary {
  return {
    blockers: [],
    changes: {
      create: desiredState.resourceCount,
      delete: 0,
      noChange: 0,
      update: 0,
    },
    displayText: `${desiredState.resourceCount} deployment resource${
      desiredState.resourceCount === 1 ? "" : "s"
    } planned from workspace source.`,
    warnings: [],
  };
}

function localWorkspaceDeploymentFailureSummary(error: unknown) {
  const message = error instanceof Error ? error.message : "Local workspace deploy apply failed.";

  return {
    code: "local-gateway-deploy-apply-failed",
    displayMessage: message,
  };
}

function runtimeDesiredResourcesByKind(
  resourcesByKind: Record<string, number>,
): Record<DeploymentResourceKind, number> {
  return Object.fromEntries(Object.entries(resourcesByKind)) as Record<
    DeploymentResourceKind,
    number
  >;
}

export async function planDeployLocalFormlessWorkspace(
  input: DeployLocalFormlessWorkspaceInput,
  dependencies: PlanDeployLocalFormlessWorkspaceDependencies,
): Promise<PlanDeployLocalFormlessWorkspaceResult> {
  const workspaceRoot = await resolveFormlessInstanceWorkspaceRoot({
    cwd: dependencies.cwd,
    workspacePath: input.workspacePath,
  });
  const { manifest, manifestPath } = await readWorkspaceManifest(workspaceRoot);
  const controlPlane = await readFormlessInstanceControlPlaneRecordSource({
    manifest,
    workspaceRoot,
  });
  const deploymentSource = selectLocalWorkspaceDeploymentSource(controlPlane, input.targetAlias);
  const existingSelectedTarget =
    deploymentSource.deployTarget === undefined
      ? undefined
      : workspaceTargetFromDeployTargetRecord(deploymentSource.deployTarget, "deploy");
  const preflight = existingSelectedTarget
    ? await checkFormlessInstanceWorkspace(
        {
          targetAlias: existingSelectedTarget.alias,
          workspacePath: workspaceRoot,
        },
        dependencies,
      )
    : undefined;

  if (preflight?.drift.status === "drift") {
    throw new Error(
      "Formless deploy refused because remote drift was detected; review `formless check` and retry after saving or pulling the workspace source.",
    );
  }

  const account = await resolveLocalWorkspaceDeploymentAccount({
    accountDiscovery: dependencies.accountDiscovery,
    providerConfig: deploymentSource.providerConfig,
  });
  const planned = planLocalWorkspaceDeployment({
    account,
    deployTarget: deploymentSource.deployTarget,
    manifest,
    migrationPolicy: input.migrationPolicy,
    packageVersion: dependencies.packageVersion,
    providerConfig: deploymentSource.providerConfig,
    targetAlias: input.targetAlias,
  });
  const desiredState = projectLocalWorkspaceDeploymentDesiredState({
    controlPlane,
    plan: planned.plan,
    targetId: planned.selectedTarget.alias,
  });

  return {
    ...planned,
    desiredState,
    ...(existingSelectedTarget === undefined ? {} : { existingSelectedTarget }),
    manifestPath,
    ...(preflight === undefined ? {} : { preflight }),
    workspaceRoot,
  };
}

export async function deployFormlessInstanceWorkspace(
  input: DeployFormlessInstanceWorkspaceInput,
  dependencies: DeployFormlessInstanceWorkspaceDependencies,
): Promise<DeployFormlessInstanceWorkspaceResult> {
  const planned = await planDeployFormlessInstanceWorkspace(input, dependencies);
  const { plan, selectedTarget, workspaceRoot } = planned;
  const secretState = await readFormlessInstanceWorkspaceSecretState(workspaceRoot);
  const adminToken = resolveFormlessInstanceWorkspaceAdminToken({
    env: dependencies.env,
    secretState,
  });

  if (!adminToken) {
    throw new Error(missingAdminTokenMessage("deploy"));
  }

  await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);

  const deploymentStateRoot = formlessInstanceWorkspaceDeployStateRoot(workspaceRoot, plan);
  const localSecretEnv = await dependencies.localSecretEnv.ensure({
    createSecret: dependencies.randomToken,
    root: deploymentStateRoot,
  });
  const deployment = await dependencies.deploymentAdapter.deploy({
    credentialProfile: null,
    packageRoot: dependencies.packageRoot,
    plan,
    secrets: {
      ALCHEMY_PASSWORD: localSecretEnv.secrets.ALCHEMY_PASSWORD,
      ...optionalCloudflareApiTokenSecret(dependencies.env),
      FORMLESS_ADMIN_TOKEN: adminToken,
    },
    stateRoot: deploymentStateRoot,
  });
  const deploymentUrl = normalizeFormlessInstanceWorkspaceTargetUrl(deployment.url);

  if (deploymentUrl !== plan.expectedUrl.url) {
    throw new Error(
      `Formless instance deploy returned ${deploymentUrl}, expected claimed target ${plan.expectedUrl.url}.`,
    );
  }

  const healthCheck = await dependencies.healthCheck.check({
    expectedVersion: plan.packageVersion,
    url: deploymentUrl,
  });

  return {
    deployment: {
      url: deploymentUrl,
    },
    deploymentStateRoot,
    healthCheck,
    localSecretEnv,
    migrationPolicy: plan.migrationPolicy,
    plan,
    secretPath: formlessInstanceWorkspaceSecretStatePath(workspaceRoot),
    selectedTarget,
    workspaceRoot,
  };
}

export async function planDeployFormlessInstanceWorkspace(
  input: DeployFormlessInstanceWorkspaceInput,
  dependencies: PlanDeployFormlessInstanceWorkspaceDependencies,
): Promise<PlanDeployFormlessInstanceWorkspaceResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { manifest } = await readWorkspaceManifest(workspaceRoot);
  const controlPlane = await readFormlessInstanceControlPlaneRecordSource({
    manifest,
    workspaceRoot,
  });
  const deploymentSource = selectLocalWorkspaceDeploymentSource(controlPlane, input.targetAlias);
  const selectedTarget =
    deploymentSource.deployTarget === undefined
      ? undefined
      : workspaceTargetFromDeployTargetRecord(deploymentSource.deployTarget, "deploy");

  if (selectedTarget === undefined) {
    throw new Error("Formless instance deploy requires an enabled instance deploy-target record.");
  }

  const plan = formlessInstanceWorkspaceDeploymentPlan({
    migrationPolicy: input.migrationPolicy,
    packageVersion: dependencies.packageVersion,
    providerConfig: deploymentSource.providerConfig,
    selectedTarget,
  });

  return {
    plan,
    selectedTarget,
    workspaceRoot,
  };
}

export async function destroyLocalFormlessWorkspace(
  input: DestroyLocalFormlessWorkspaceInput,
  dependencies: DestroyLocalFormlessWorkspaceDependencies,
): Promise<DestroyFormlessInstanceWorkspaceResult> {
  const workspaceRoot = await resolveFormlessInstanceWorkspaceRoot({
    cwd: dependencies.cwd,
    workspacePath: input.workspacePath,
  });

  return destroyFormlessInstanceWorkspace(
    {
      confirm: input.confirm,
      targetAlias: input.targetAlias,
      workspacePath: workspaceRoot,
    },
    dependencies,
  );
}

export async function destroyFormlessInstanceWorkspace(
  input: DestroyFormlessInstanceWorkspaceInput,
  dependencies: DestroyFormlessInstanceWorkspaceDependencies,
): Promise<DestroyFormlessInstanceWorkspaceResult> {
  const destroy = dependencies.deploymentAdapter.destroy;

  if (!destroy) {
    throw new Error(
      "Formless instance destroy requires a deployment adapter with destroy support.",
    );
  }

  const providerContext = await resolveFormlessInstanceWorkspaceProviderContext(
    {
      commandName: "destroy",
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    dependencies,
  );
  const plan = providerContext.plan;

  if (input.confirm !== plan.resources.worker.name) {
    throw new Error(
      `Formless instance destroy confirmation must match Worker name "${plan.resources.worker.name}".`,
    );
  }

  const routeProviderResources =
    await destroyRouteProviderResourcesFromWorkspaceSource(providerContext);
  const result = await destroy({
    credentialProfile: providerContext.credentialProfile,
    domainProviderPlan: domainProviderPlanFromDeploymentPlan(plan),
    domainProviderResources: routeProviderResources.resourceGraph,
    packageRoot: dependencies.packageRoot,
    plan,
    secrets: providerContext.secrets,
    stateRoot: providerContext.deploymentStateRoot,
  });

  await removeLocalWorkspaceDeployState(providerContext.deploymentStateRoot);

  return {
    deploymentStatePath: providerContext.deploymentStatePath,
    deploymentStateRoot: providerContext.deploymentStateRoot,
    destroy: result,
    localSecretPath: providerContext.localSecretPath,
    plan,
    routeProviderResources,
    selectedTarget: providerContext.selectedTarget,
    workspaceRoot: providerContext.workspaceRoot,
  };
}

export async function resolveFormlessInstanceWorkspaceProviderContext(
  input: {
    commandName: "destroy" | "domains run";
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    packageVersion: string;
  },
): Promise<FormlessInstanceWorkspaceProviderContext> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { manifest } = await readWorkspaceManifest(workspaceRoot);
  const controlPlane = await readFormlessInstanceControlPlaneRecordSource({
    manifest,
    workspaceRoot,
  });
  const deploymentSource = selectLocalWorkspaceDeploymentSource(controlPlane, input.targetAlias);
  const selectedTarget =
    deploymentSource.deployTarget === undefined
      ? undefined
      : workspaceTargetFromDeployTargetRecord(deploymentSource.deployTarget, input.commandName);

  if (selectedTarget === undefined) {
    throw new Error(
      `Formless instance ${input.commandName} requires an enabled instance deploy-target record.`,
    );
  }

  const plan = formlessInstanceWorkspaceDeploymentPlan({
    commandName: input.commandName,
    packageVersion: dependencies.packageVersion,
    providerConfig: deploymentSource.providerConfig,
    selectedTarget,
  });
  const deploymentStateRoot = formlessInstanceWorkspaceDeployStateRoot(workspaceRoot, plan);
  const deploymentStatePath = await readRequiredLocalWorkspaceDeploymentState({
    deploymentStateRoot,
    plan,
  });
  const localSecretEnv = await readDestroyLocalDeploySecretEnv({
    deploymentStateRoot,
    env: dependencies.env,
  });

  return {
    credentialProfile: localSecretEnv.credentialProfile,
    deploymentStatePath,
    deploymentStateRoot,
    localSecretPath: localSecretEnv.path,
    manifest,
    plan,
    secrets: localSecretEnv.secrets,
    selectedTarget,
    workspaceRoot,
  };
}

export async function planFormlessInstanceWorkspaceDomains(
  input: PlanFormlessInstanceWorkspaceDomainsInput,
  dependencies: PlanFormlessInstanceWorkspaceDomainsDependencies,
): Promise<PlanFormlessInstanceWorkspaceDomainsResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { manifest } = await readWorkspaceManifest(workspaceRoot);
  const controlPlane = await readFormlessInstanceControlPlaneRecordSource({
    manifest,
    workspaceRoot,
  });
  const deploymentSource = selectLocalWorkspaceDeploymentSource(controlPlane, input.targetAlias);
  const selectedTarget =
    deploymentSource.deployTarget === undefined
      ? undefined
      : workspaceTargetFromDeployTargetRecord(deploymentSource.deployTarget, "domains plan");

  if (selectedTarget === undefined) {
    throw new Error(
      "Formless instance domains plan requires an enabled instance deploy-target record.",
    );
  }

  const accountId = requireWorkspaceDeployAccountId(deploymentSource.providerConfig);
  const workerName = selectWorkspaceWorkerName(deploymentSource.providerConfig, selectedTarget);
  const workspaceDomains = manifest.domains ?? [];
  const liveDomains = await readLiveWorkspaceDomainIntents(selectedTarget, dependencies);
  const source = workspaceDomains.length > 0 ? "workspace" : "live";
  const enabledSourceDomains = (source === "workspace" ? workspaceDomains : liveDomains).filter(
    (domain) => domain.enabled,
  );
  const intents = selectDomainIntentsForHost({
    host: input.host,
    intents: enabledSourceDomains,
  });
  const preflight = await planCloudflareWorkerDomainPreflight({
    accountId,
    client: dependencies.cloudflareDomainClient,
    intents,
    policy: input.policy ?? "create-only",
    workerName,
  });

  return {
    accountId,
    desired: {
      drift:
        workspaceDomains.length === 0
          ? []
          : compareWorkspaceDomainIntentToLive(workspaceDomains, liveDomains),
      liveEnabledCount: liveDomains.filter((domain) => domain.enabled).length,
      source,
      workspaceCount: workspaceDomains.length,
    },
    preflight,
    selectedTarget,
    workerName,
    workspaceRoot,
  };
}

export async function applyFormlessInstanceWorkspaceDomains(
  input: ApplyFormlessInstanceWorkspaceDomainsInput,
  dependencies: ApplyFormlessInstanceWorkspaceDomainsDependencies,
): Promise<ApplyFormlessInstanceWorkspaceDomainsResult> {
  if ((input.policy ?? "create-only") === "override" && !input.host?.trim()) {
    throw new Error("Formless instance domains apply override requires a single host.");
  }

  const planned = await planFormlessInstanceWorkspaceDomains(input, dependencies);

  if (planned.desired.drift.length > 0) {
    throw new Error(
      "Formless instance domains apply refused because workspace and live desired mappings differ; run `formless instance domains plan` and reconcile desired mappings before applying provider state.",
    );
  }

  const blockedHosts = planned.preflight.hosts.filter((host) => host.blockers.length > 0);

  if (blockedHosts.length > 0) {
    throw new Error(
      `Formless instance domains apply stopped because preflight found blockers: ${blockedHosts
        .map(
          (host) =>
            `${host.host} (${host.blockers.map((issue) => issue.code).join(", ") || "blocked"})`,
        )
        .join("; ")}.`,
    );
  }

  const applied = await applyCloudflareWorkerDomainPreflightPlan({
    client: dependencies.cloudflareDomainClient,
    plan: planned.preflight,
  });
  const secretState = await readFormlessInstanceWorkspaceSecretState(planned.workspaceRoot);
  const adminToken = resolveFormlessInstanceWorkspaceAdminToken({
    env: dependencies.env,
    explicitAdminToken: input.adminToken,
    secretState,
  });

  for (const host of applied.hosts) {
    await recordFormlessInstanceDomainMappingApplyEvidence(
      {
        adminToken,
        evidence: {
          host: host.host,
          profile: host.profile,
          ...(host.targetInstallId === undefined ? {} : { targetInstallId: host.targetInstallId }),
          provider: "cloudflare-worker-custom-domain",
          accountId: planned.accountId,
          zoneId: host.domain.zoneId,
          zoneName: host.domain.zoneName,
          workerName: planned.workerName,
          workerDomainId: host.domain.id,
          action: host.action,
        },
        targetUrl: planned.selectedTarget.url,
      },
      dependencies,
    );
  }

  return {
    ...planned,
    applied,
    evidenceCount: applied.hosts.length,
  };
}

export function formlessInstanceWorkspaceLocalStateRoot(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
): string {
  return path.resolve(workspaceRoot, manifest.local.stateRoot);
}

export function formlessInstanceWorkspaceWranglerPersistPath(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
): string {
  return path.join(formlessInstanceWorkspaceLocalStateRoot(workspaceRoot, manifest), "wrangler");
}

export function formlessInstanceWorkspaceDevEnv(
  env: NodeJS.ProcessEnv,
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
  sidecar?: Pick<LocalWorkspaceGatewaySidecar, "endpoint" | "proxyToken"> | null,
  options: {
    localDevSecrets?: FormlessInstanceWorkspaceLocalDevSecretState;
    localSessionBootstrapToken?: string;
  } = {},
): NodeJS.ProcessEnv {
  const bootstrapToken = randomWorkspaceGatewayToken();
  const csrfToken = randomWorkspaceGatewayToken();
  const localDevSecrets = options.localDevSecrets ?? {
    adminToken:
      env.FORMLESS_ADMIN_TOKEN && env.FORMLESS_ADMIN_TOKEN.trim() !== ""
        ? env.FORMLESS_ADMIN_TOKEN
        : randomWorkspaceGatewayToken(),
    ownerSessionSecret:
      env.FORMLESS_OWNER_SESSION_SECRET && env.FORMLESS_OWNER_SESSION_SECRET.trim() !== ""
        ? env.FORMLESS_OWNER_SESSION_SECRET
        : randomWorkspaceGatewayToken(),
  };
  const nextEnv: NodeJS.ProcessEnv = {
    ...env,
    [FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME]: localDevSecrets.adminToken,
    FORMLESS_LAUNCH_FIXTURE: "empty",
    [FORMLESS_INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME]: localDevSecrets.ownerSessionSecret,
    [LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]:
      options.localSessionBootstrapToken ?? randomWorkspaceGatewayToken(),
    FORMLESS_RUNTIME_PROFILE: "instance",
    FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN: bootstrapToken,
    FORMLESS_WORKSPACE_GATEWAY_CSRF_TOKEN: csrfToken,
    FORMLESS_WRANGLER_PERSIST: formlessInstanceWorkspaceWranglerPersistPath(
      workspaceRoot,
      manifest,
    ),
    VITE_FORMLESS_WORKSPACE_GATEWAY_API: "/api/formless/workspace",
    VITE_FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN: bootstrapToken,
    VITE_FORMLESS_RUNTIME_PROFILE: "instance",
  };

  if (sidecar) {
    nextEnv[LOCAL_WORKSPACE_GATEWAY_SIDECAR_URL_ENV] = sidecar.endpoint;
    nextEnv[LOCAL_WORKSPACE_GATEWAY_PROXY_TOKEN_ENV] = sidecar.proxyToken;
  } else {
    delete nextEnv[LOCAL_WORKSPACE_GATEWAY_SIDECAR_URL_ENV];
    delete nextEnv[LOCAL_WORKSPACE_GATEWAY_PROXY_TOKEN_ENV];
  }

  delete nextEnv.FORMLESS_LOCAL_WORKSPACE_GATEWAY;
  delete nextEnv.FORMLESS_SITE_PROJECT_ID;
  delete nextEnv.FORMLESS_SITE_PROJECT_ROOT;
  delete nextEnv.FORMLESS_WORKSPACE_GATEWAY_ROOT;
  delete nextEnv.VITE_FORMLESS_LOCAL_PUBLISH_BROKER_TOKEN;
  delete nextEnv.VITE_FORMLESS_LOCAL_PUBLISH_BROKER_URL;
  delete nextEnv.VITE_FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN;
  delete nextEnv.VITE_FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL;
  delete nextEnv.VITE_FORMLESS_SITE_PROJECT_ID;

  return nextEnv;
}

function randomWorkspaceGatewayToken(): string {
  return randomBytes(32).toString("base64url");
}

function localSessionBootstrapUrl(source: string, token: string): string {
  const url = new URL(LOCAL_SESSION_BOOTSTRAP_API_PATH, `${source}/`);

  url.searchParams.set("token", token);

  return url.toString();
}

function createLocalDevSecret(dependencies: DevFormlessInstanceWorkspaceDependencies): string {
  return dependencies.randomToken?.() ?? randomWorkspaceGatewayToken();
}

async function startWorkspaceGatewaySidecar(
  input: {
    env?: NodeJS.ProcessEnv;
    workspaceRoot: string;
  },
  dependencies: DevFormlessInstanceWorkspaceDependencies,
): Promise<LocalWorkspaceGatewaySidecar> {
  if (dependencies.startWorkspaceGatewaySidecar) {
    return dependencies.startWorkspaceGatewaySidecar(input, {
      ...workspaceGatewaySidecarDependencies(dependencies),
      ...(dependencies.randomToken === undefined
        ? {}
        : { createProxyToken: dependencies.randomToken }),
    });
  }

  const { startLocalWorkspaceGatewaySidecar } = await import("./local-workspace-gateway.ts");

  return startLocalWorkspaceGatewaySidecar(input, {
    ...workspaceGatewaySidecarDependencies(dependencies),
    ...(dependencies.randomToken === undefined
      ? {}
      : { createProxyToken: dependencies.randomToken }),
  });
}

function workspaceGatewaySidecarDependencies(
  dependencies: DevFormlessInstanceWorkspaceDependencies,
): StartLocalWorkspaceGatewaySidecarDependencies {
  return {
    ...(dependencies.accountDiscovery === undefined
      ? {}
      : { accountDiscovery: dependencies.accountDiscovery }),
    cwd: dependencies.cwd,
    ...(dependencies.deploymentAdapter === undefined
      ? {}
      : { deploymentAdapter: dependencies.deploymentAdapter }),
    env: dependencies.env,
    fetch: dependencies.fetch,
    ...(dependencies.healthCheck === undefined ? {} : { healthCheck: dependencies.healthCheck }),
    ...(dependencies.localSecretEnv === undefined
      ? {}
      : { localSecretEnv: dependencies.localSecretEnv }),
    now: dependencies.now,
    packageRoot: dependencies.packageRoot,
    ...(dependencies.packageVersion === undefined
      ? {}
      : { packageVersion: dependencies.packageVersion }),
    ...(dependencies.randomToken === undefined ? {} : { randomToken: dependencies.randomToken }),
    ...(dependencies.setupCapability === undefined
      ? {}
      : { setupCapability: dependencies.setupCapability }),
  };
}

export async function adoptFormlessInstanceWorkspaceAdminToken(
  input: AdoptFormlessInstanceWorkspaceAdminTokenInput,
  dependencies: AdoptFormlessInstanceWorkspaceAdminTokenDependencies,
): Promise<AdoptFormlessInstanceWorkspaceAdminTokenResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { manifest } = await readWorkspaceManifest(workspaceRoot);
  const selectedTarget = await resolveWorkspaceTarget({
    commandName: "token adopt",
    manifest,
    required: false,
    targetAlias: input.targetAlias,
    workspaceRoot,
  });
  const existingSecretState = await readFormlessInstanceWorkspaceSecretState(workspaceRoot);
  const adminToken = resolveFormlessInstanceWorkspaceAdminToken({
    env: dependencies.env,
    explicitAdminToken: input.adminToken,
    secretState: existingSecretState,
  });

  if (!adminToken) {
    throw new Error(missingAdminTokenMessage("adopt"));
  }

  const write = await writeFormlessInstanceWorkspaceSecretState(workspaceRoot, { adminToken });

  await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);

  return {
    secretPath: write.path,
    ...(selectedTarget === undefined ? {} : { selectedTarget }),
    workspaceRoot,
  };
}

export async function rotateFormlessInstanceWorkspaceAdminToken(
  input: RotateFormlessInstanceWorkspaceAdminTokenInput,
  dependencies: RotateFormlessInstanceWorkspaceAdminTokenDependencies,
): Promise<RotateFormlessInstanceWorkspaceAdminTokenResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { manifest } = await readWorkspaceManifest(workspaceRoot);
  const controlPlane = await readFormlessInstanceControlPlaneRecordSource({
    manifest,
    workspaceRoot,
  });
  const deploymentSource = selectLocalWorkspaceDeploymentSource(controlPlane, input.targetAlias);
  const selectedTarget =
    deploymentSource.deployTarget === undefined
      ? undefined
      : workspaceTargetFromDeployTargetRecord(deploymentSource.deployTarget, "token rotate");
  const workerName = selectWorkspaceWorkerName(deploymentSource.providerConfig, selectedTarget);
  const adminToken =
    resolveFormlessInstanceWorkspaceAdminToken({
      env: dependencies.env,
      explicitAdminToken: input.adminToken,
      secretState: {},
    }) ?? requiredGeneratedToken(dependencies.randomToken());
  const secretPath = formlessInstanceWorkspaceSecretStatePath(workspaceRoot);
  const temporarySecretPath = path.join(
    path.dirname(secretPath),
    `${FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_FILE}.next`,
  );
  const secretContents = formatFormlessInstanceWorkspaceSecretState({ adminToken });

  await mkdir(path.dirname(secretPath), { recursive: true });
  await writeFile(temporarySecretPath, secretContents);

  try {
    const command = packageExecCommand(
      "wrangler",
      ["secret", "bulk", temporarySecretPath, "--name", workerName],
      dependencies.env ?? {},
    );

    await dependencies.runCommand(command.command, command.args, {
      cwd: dependencies.packageRoot,
      env: rotateCommandEnv(dependencies.env, deploymentSource.providerConfig),
    });
    await writeFormlessInstanceWorkspaceSecretState(workspaceRoot, { adminToken });
    await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);
  } finally {
    await rm(temporarySecretPath, { force: true });
  }

  return {
    secretPath,
    ...(selectedTarget === undefined ? {} : { selectedTarget }),
    workerName,
    workspaceRoot,
  };
}

type WorkspaceArchiveDirectory = {
  archive: PortableArchive;
  archivePath: string;
  mediaFiles: ArchiveDiskMediaFile[];
  missingMediaFiles: string[];
  normalizationEvidence: ArchiveNormalizationEvidence[];
};

type WorkspaceInstanceArchiveDirectory = WorkspaceArchiveDirectory & {
  archive: InstanceArchive;
};

type WorkspaceLocalBootstrapResult =
  | {
      appCount: number;
      mediaCount: number;
      recordCount: number;
      sourceKind: "record source";
      status: "restored";
    }
  | {
      status: "empty";
    }
  | {
      installIds: string[];
      status: "existing";
    };

type WorkspaceLocalDevState = {
  sourceUrl: string;
  startedAt: string;
};

type WorkspaceLocalRestoreArchiveSource = {
  appCount: number;
  archiveRoot: string;
  mediaCount: number;
  recordCount: number;
  sourceKind: "record source";
};

const WORKSPACE_LOCAL_DEV_STATE_FILE = "dev.json";
const WORKSPACE_DEFAULT_LOCAL_SOURCE = "http://localhost:5173";

async function bootstrapWorkspaceLocalInstance(
  input: {
    manifest: FormlessInstanceWorkspaceManifest;
    source: string;
    workspaceRoot: string;
  },
  dependencies: Pick<DevFormlessInstanceWorkspaceDependencies, "cwd" | "env" | "fetch" | "now">,
): Promise<WorkspaceLocalBootstrapResult> {
  const registry = await fetchWorkspaceJson<AppInstallsResponse>(
    dependencies.fetch,
    instanceAppInstallsUrl(input.source),
  );
  const installIds = registry.installs
    .map((install) => install.installId)
    .sort((left, right) => left.localeCompare(right));

  if (installIds.length > 0) {
    return {
      installIds,
      status: "existing",
    };
  }

  const tempRoot = await createWorkspaceTempRoot(input.workspaceRoot, "local-dev");

  try {
    const sourceArchive = await workspaceLocalRestoreArchiveSource({
      exportedAt: dependencies.now(),
      manifest: input.manifest,
      tempRoot,
      workspaceRoot: input.workspaceRoot,
    });

    if (!sourceArchive) {
      return { status: "empty" };
    }

    const restore = await restorePortableArchive(
      {
        adminToken: null,
        apply: true,
        archiveDir: sourceArchive.archiveRoot,
        replace: false,
        target: input.source,
      },
      {
        cwd: dependencies.cwd,
        env: withoutAdminToken(dependencies.env),
        fetch: dependencies.fetch,
        now: dependencies.now,
      },
    );

    if (!restore.remote.ok) {
      throw new Error(
        `Formless instance local dev archive restore failed: ${restoreErrors(restore)}.`,
      );
    }

    return {
      appCount: sourceArchive.appCount,
      mediaCount: sourceArchive.mediaCount,
      recordCount: sourceArchive.recordCount,
      sourceKind: sourceArchive.sourceKind,
      status: "restored",
    };
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

async function workspaceLocalRestoreArchiveSource(input: {
  exportedAt: string;
  manifest: FormlessInstanceWorkspaceManifest;
  tempRoot: string;
  workspaceRoot: string;
}): Promise<WorkspaceLocalRestoreArchiveSource | undefined> {
  const controlPlane = await readFormlessInstanceControlPlaneRecordSource({
    manifest: input.manifest,
    workspaceRoot: input.workspaceRoot,
  });

  if (!controlPlane) {
    return undefined;
  }

  const appArchives = await readCompleteWorkspaceAppArchives(
    input.workspaceRoot,
    input.manifest,
    controlPlane,
  );
  const write = await writeComposedWorkspacePushArchive({
    archiveRoot: path.join(input.tempRoot, "archive"),
    archives: appArchives,
    controlPlane,
    exportedAt: input.exportedAt,
  });

  return {
    appCount: write.appCount,
    archiveRoot: path.dirname(write.archivePath),
    mediaCount: write.mediaCount,
    recordCount: write.recordCount,
    sourceKind: "record source",
  };
}

async function resolveWorkspaceLocalSource(input: {
  explicitSource?: string | null;
  manifest: FormlessInstanceWorkspaceManifest;
  workspaceRoot: string;
}): Promise<string> {
  const source =
    input.explicitSource ??
    (await readWorkspaceLocalDevStateSource(input.workspaceRoot, input.manifest)) ??
    WORKSPACE_DEFAULT_LOCAL_SOURCE;

  return normalizeFormlessInstanceWorkspaceTargetUrl(source);
}

async function writeWorkspaceLocalDevState(input: {
  manifest: FormlessInstanceWorkspaceManifest;
  source: string;
  startedAt: string;
  workspaceRoot: string;
}) {
  const statePath = workspaceLocalDevStatePath(input.workspaceRoot, input.manifest);
  const state: WorkspaceLocalDevState = {
    sourceUrl: input.source,
    startedAt: input.startedAt,
  };

  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function readWorkspaceLocalDevStateSource(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
): Promise<string | null> {
  let contents: string;

  try {
    contents = await readFile(workspaceLocalDevStatePath(workspaceRoot, manifest), "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }

  try {
    const value = JSON.parse(contents) as Partial<WorkspaceLocalDevState>;

    return typeof value.sourceUrl === "string" && value.sourceUrl.trim() !== ""
      ? value.sourceUrl
      : null;
  } catch {
    return null;
  }
}

function workspaceLocalDevStatePath(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
): string {
  return path.join(
    formlessInstanceWorkspaceLocalStateRoot(workspaceRoot, manifest),
    WORKSPACE_LOCAL_DEV_STATE_FILE,
  );
}

async function readCompleteWorkspaceAppArchives(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
  controlPlane: InstanceArchiveControlPlane,
): Promise<WorkspaceArchiveDirectory[]> {
  return readRequiredWorkspaceAppArchives({
    controlPlane,
    manifest,
    operation: "local dev",
    workspaceRoot,
  });
}

async function readWorkspaceAppArchiveMapForCheck(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
  controlPlane: InstanceArchiveControlPlane | undefined,
): Promise<Map<string, WorkspaceArchiveDirectory>> {
  const archives = new Map<string, WorkspaceArchiveDirectory>();

  for (const app of controlPlaneAppInstallRecords(controlPlane)) {
    const archive = await readArchiveDirectoryForCheck(
      path.join(workspaceRoot, workspaceAppArchivePath(manifest, app.installId)),
    );

    if (archive) {
      archives.set(app.installId, archive);
    }
  }

  return archives;
}

type WorkspaceControlPlaneAppInstallRecord = {
  installId: string;
  packageAppKey: string;
  packageRevision?: number;
  sourceSchemaHash?: string;
};

function controlPlaneAppInstallRecords(
  controlPlane: InstanceArchiveControlPlane | undefined,
): WorkspaceControlPlaneAppInstallRecord[] {
  return (controlPlane?.records ?? [])
    .filter((record) => record.entity === "app-install" && !record.deletedAt)
    .map((record) => ({
      installId: String(record.values.installId),
      packageAppKey: String(record.values.packageAppKey),
      ...(numberRecordValue(record, "packageRevision") === undefined
        ? {}
        : { packageRevision: numberRecordValue(record, "packageRevision") }),
      ...(stringRecordValue(record, "sourceSchemaHash") === undefined
        ? {}
        : { sourceSchemaHash: stringRecordValue(record, "sourceSchemaHash") }),
    }))
    .sort((left, right) => left.installId.localeCompare(right.installId));
}

async function pullWorkspaceAppArchive(
  input: {
    archiveRoot: string;
    installId: string;
    targetUrl: string;
  },
  dependencies: PullFormlessInstanceWorkspaceDependencies,
): Promise<PullFormlessInstanceWorkspaceAppArchiveResult> {
  await rm(input.archiveRoot, { force: true, recursive: true });

  const write = await exportAppArchive(
    {
      installId: input.installId,
      outDir: input.archiveRoot,
      target: input.targetUrl,
    },
    dependencies,
  );

  return {
    ...write,
    archiveRoot: input.archiveRoot,
    installId: input.installId,
  };
}

async function readArchiveDirectoryForCheck(
  archiveRoot: string,
): Promise<WorkspaceArchiveDirectory | undefined> {
  const archivePath = path.join(archiveRoot, PORTABLE_ARCHIVE_MANIFEST_FILE);
  let contents: string;

  try {
    contents = await readFile(archivePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }

  const normalized = normalizePortableArchive(JSON.parse(contents) as unknown);
  const archive = normalized.archive;
  const mediaFiles: ArchiveDiskMediaFile[] = [];
  const missingMediaFiles: string[] = [];

  for (const app of archiveApps(archive)) {
    for (const object of app.media.objects) {
      try {
        const bytes = new Uint8Array(await readFile(path.join(archiveRoot, object.archivePath)));

        mediaFiles.push({
          archivePath: object.archivePath,
          byteSize: bytes.byteLength,
          bytes,
          contentType: object.contentType,
        });
      } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
          missingMediaFiles.push(object.archivePath);
          continue;
        }

        throw error;
      }
    }
  }

  return {
    archive,
    archivePath,
    mediaFiles,
    missingMediaFiles: missingMediaFiles.sort((left, right) => left.localeCompare(right)),
    normalizationEvidence: normalized.evidence,
  };
}

async function exportWorkspaceSourceFromLocalAuthority(
  input: {
    source: string;
    tempRoot: string;
  },
  dependencies: SaveLocalFormlessWorkspaceDependencies,
): Promise<WorkspaceInstanceArchiveDirectory> {
  const archiveRoot = path.join(input.tempRoot, "authority");

  await exportInstanceArchive(
    {
      outDir: archiveRoot,
      target: input.source,
    },
    dependencies,
  );

  const directory = await readArchiveDirectoryForCheck(archiveRoot);

  if (!directory || directory.archive.kind !== INSTANCE_ARCHIVE_KIND) {
    throw new Error("Formless workspace save did not export an instance archive.");
  }

  return {
    ...directory,
    archive: directory.archive,
  };
}

function workspaceManifestFromSavedAuthoritySource(
  manifest: FormlessInstanceWorkspaceManifest,
  _archive: InstanceArchive,
): FormlessInstanceWorkspaceManifest {
  return parseFormlessInstanceWorkspaceManifestJson(
    formatFormlessInstanceWorkspaceManifest(manifest),
  );
}

function savedWorkspaceAppArchiveSummaries(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
  directory: WorkspaceInstanceArchiveDirectory,
): SaveLocalFormlessWorkspaceAppArchiveSummary[] {
  return directory.archive.apps.map((app) => ({
    appCount: 1,
    archivePath: path.join(
      workspaceRoot,
      workspaceAppArchivePath(manifest, app.app.installId),
      PORTABLE_ARCHIVE_MANIFEST_FILE,
    ),
    installId: app.app.installId,
    mediaCount: app.media.objects.length,
    recordCount: appRecordCount(app),
  }));
}

async function staleSavedWorkspaceSourcePaths(input: {
  exported: WorkspaceInstanceArchiveDirectory;
  manifest: FormlessInstanceWorkspaceManifest;
  manifestPath: string;
  nextManifest: FormlessInstanceWorkspaceManifest;
  workspaceRoot: string;
}): Promise<string[]> {
  const stalePaths = new Set<string>();
  const currentManifest = formatFormlessInstanceWorkspaceManifest(input.manifest);
  const nextManifest = formatFormlessInstanceWorkspaceManifest(input.nextManifest);

  if (currentManifest !== nextManifest) {
    stalePaths.add(path.basename(input.manifestPath));
  }

  const localControlPlane = await readFormlessInstanceControlPlaneRecordSource({
    manifest: input.nextManifest,
    workspaceRoot: input.workspaceRoot,
  });

  if (
    comparableControlPlaneIntentRecordsJson(localControlPlane) !==
    comparableControlPlaneIntentRecordsJson(input.exported.archive.controlPlane)
  ) {
    stalePaths.add(input.nextManifest.source.records);
  }

  for (const exportedApp of input.exported.archive.apps) {
    const appArchivePath = workspaceAppArchivePath(input.nextManifest, exportedApp.app.installId);
    const expected = workspaceAppArchiveDirectoryFromInstanceExport(input.exported, exportedApp);
    const local = await readArchiveDirectoryForCheck(
      path.join(input.workspaceRoot, appArchivePath),
    );

    if (!workspaceArchiveDirectoryMatches(expected, local)) {
      stalePaths.add(appArchivePath);
    }
  }

  return [...stalePaths].sort((left, right) => left.localeCompare(right));
}

async function writeSavedWorkspaceSource(input: {
  exported: WorkspaceInstanceArchiveDirectory;
  manifestPath: string;
  nextManifest: FormlessInstanceWorkspaceManifest;
  workspaceRoot: string;
}) {
  await prepareWorkspaceDirectories(input.workspaceRoot, input.nextManifest);
  await writeFormlessInstanceControlPlaneRecordSource({
    controlPlane: input.exported.archive.controlPlane,
    manifest: input.nextManifest,
    workspaceRoot: input.workspaceRoot,
  });
  await rm(path.join(input.workspaceRoot, input.nextManifest.archives.apps), {
    force: true,
    recursive: true,
  });

  for (const app of input.exported.archive.apps) {
    await writeWorkspaceArchiveDirectory({
      archive: app,
      archiveRoot: path.join(
        input.workspaceRoot,
        workspaceAppArchivePath(input.nextManifest, app.app.installId),
      ),
      mediaFiles: workspaceAppArchiveMediaFiles(input.exported, app),
    });
  }

  await writeFile(input.manifestPath, formatFormlessInstanceWorkspaceManifest(input.nextManifest));
}

async function writeWorkspaceArchiveDirectory(input: {
  archive: PortableArchive;
  archiveRoot: string;
  mediaFiles: readonly ArchiveDiskMediaFile[];
}): Promise<void> {
  await rm(input.archiveRoot, { force: true, recursive: true });
  await mkdir(input.archiveRoot, { recursive: true });
  await writeFile(
    path.join(input.archiveRoot, PORTABLE_ARCHIVE_MANIFEST_FILE),
    input.archive.kind === INSTANCE_ARCHIVE_KIND
      ? formatInstanceArchive(input.archive)
      : formatAppArchive(input.archive),
  );

  for (const file of input.mediaFiles) {
    const filePath = path.join(input.archiveRoot, file.archivePath);

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, file.bytes);
  }
}

function workspaceAppArchiveDirectoryFromInstanceExport(
  directory: WorkspaceInstanceArchiveDirectory,
  app: AppArchive,
): WorkspaceArchiveDirectory {
  return {
    archive: app,
    archivePath: directory.archivePath,
    mediaFiles: workspaceAppArchiveMediaFiles(directory, app),
    missingMediaFiles: directory.missingMediaFiles.filter((archivePath) =>
      app.media.objects.some((object) => object.archivePath === archivePath),
    ),
    normalizationEvidence: directory.normalizationEvidence,
  };
}

function workspaceAppArchiveMediaFiles(
  directory: WorkspaceArchiveDirectory,
  app: AppArchive,
): ArchiveDiskMediaFile[] {
  const archivePaths = new Set(app.media.objects.map((object) => object.archivePath));

  return directory.mediaFiles.filter((file) => archivePaths.has(file.archivePath));
}

function workspaceArchiveDirectoryMatches(
  expected: WorkspaceArchiveDirectory,
  actual: WorkspaceArchiveDirectory | undefined,
): boolean {
  if (!actual || actual.archive.kind !== expected.archive.kind) {
    return false;
  }

  return (
    comparableArchiveJson(actual.archive) === comparableArchiveJson(expected.archive) &&
    comparableArchiveMediaJson(actual, actual.archive) ===
      comparableArchiveMediaJson(expected, expected.archive)
  );
}

function compareWorkspaceArchives(input: {
  domainDesiredDrift: FormlessInstanceWorkspaceDomainDesiredDrift[];
  localControlPlane: InstanceArchiveControlPlane | undefined;
  localDomainCount: number;
  localAppArchives: ReadonlyMap<string, WorkspaceArchiveDirectory>;
  manifest: FormlessInstanceWorkspaceManifest;
  remoteDomainCount: number;
  remoteArchive: WorkspaceArchiveDirectory;
}): FormlessInstanceWorkspaceDriftSummary {
  const remoteApps = archiveApps(input.remoteArchive.archive);
  const remoteAppsByInstall = new Map(remoteApps.map((app) => [app.app.installId, app]));
  const localApps = controlPlaneAppInstallRecords(input.localControlPlane);
  const localAppsByInstall = new Map(localApps.map((app) => [app.installId, app]));
  const changedArchivePaths = new Set<string>();
  const changedControlPlaneRecords = new Set<string>();
  const changedMedia = new Set<string>();
  const changedRecords = new Set<string>();
  const packageMismatches: FormlessInstanceWorkspacePackageMismatch[] = [];
  const remoteControlPlane =
    input.remoteArchive.archive.kind === INSTANCE_ARCHIVE_KIND
      ? input.remoteArchive.archive.controlPlane
      : undefined;
  const missingInstalls = localApps
    .filter((app) => !remoteAppsByInstall.has(app.installId))
    .map((app) => app.installId)
    .sort((left, right) => left.localeCompare(right));
  const extraInstalls = remoteApps
    .filter((app) => !localAppsByInstall.has(app.app.installId))
    .map((app) => app.app.installId)
    .sort((left, right) => left.localeCompare(right));

  for (const installId of missingInstalls) {
    const app = localAppsByInstall.get(installId);

    if (app) {
      changedArchivePaths.add(workspaceAppArchivePath(input.manifest, app.installId));
    }
  }

  for (const remoteApp of remoteApps) {
    const localApp = localAppsByInstall.get(remoteApp.app.installId);

    if (!localApp) {
      continue;
    }

    const archivePath = workspaceAppArchivePath(input.manifest, localApp.installId);
    const localArchive = input.localAppArchives.get(remoteApp.app.installId);

    if (!localArchive || localArchive.archive.kind !== APP_ARCHIVE_KIND) {
      changedArchivePaths.add(archivePath);
      continue;
    }

    const localPackageAppKey = localArchive.archive.app.packageAppKey;

    if (localPackageAppKey !== remoteApp.app.packageAppKey) {
      packageMismatches.push({
        installId: remoteApp.app.installId,
        localPackageAppKey,
        remotePackageAppKey: remoteApp.app.packageAppKey,
      });
      changedArchivePaths.add(archivePath);
      continue;
    }

    if (comparableAppRecordsJson(localArchive.archive) !== comparableAppRecordsJson(remoteApp)) {
      changedRecords.add(remoteApp.app.installId);
      changedArchivePaths.add(archivePath);
    }

    if (
      comparableAppMediaJson(localArchive, localArchive.archive) !==
      comparableAppMediaJson(input.remoteArchive, remoteApp)
    ) {
      changedMedia.add(remoteApp.app.installId);
      changedArchivePaths.add(archivePath);
    }
  }

  if (remoteControlPlane !== undefined) {
    for (const recordKey of changedControlPlaneIntentRecordKeys(
      input.localControlPlane,
      remoteControlPlane,
    )) {
      changedControlPlaneRecords.add(recordKey);
      changedArchivePaths.add(input.manifest.source.records);
    }
  }

  const localArchives = [...input.localAppArchives.values()]
    .map((archive) => (archive.archive.kind === APP_ARCHIVE_KIND ? archive.archive : undefined))
    .filter((archive): archive is AppArchive => archive !== undefined);
  const hasDrift =
    changedArchivePaths.size > 0 ||
    changedControlPlaneRecords.size > 0 ||
    changedMedia.size > 0 ||
    changedRecords.size > 0 ||
    input.domainDesiredDrift.length > 0 ||
    extraInstalls.length > 0 ||
    missingInstalls.length > 0 ||
    packageMismatches.length > 0;

  return {
    archiveNormalizationEvidence: workspaceArchiveNormalizationEvidence(input),
    changedArchivePaths: [...changedArchivePaths].sort((left, right) => left.localeCompare(right)),
    changedControlPlaneRecords: [...changedControlPlaneRecords].sort((left, right) =>
      left.localeCompare(right),
    ),
    domainDesiredDrift: input.domainDesiredDrift,
    changedMedia: [...changedMedia].sort((left, right) => left.localeCompare(right)),
    changedRecords: [...changedRecords].sort((left, right) => left.localeCompare(right)),
    extraInstalls,
    localDomainCount: input.localDomainCount,
    localAppCount: localApps.length,
    localControlPlaneRecordCount: input.localControlPlane?.records.length ?? 0,
    localMediaCount: localArchives.reduce((count, app) => count + app.media.objects.length, 0),
    localRecordCount: localArchives.reduce((count, app) => count + appRecordCount(app), 0),
    missingInstalls,
    packageMismatches: packageMismatches.sort((left, right) =>
      left.installId.localeCompare(right.installId),
    ),
    remoteDomainCount: input.remoteDomainCount,
    remoteAppCount: remoteApps.length,
    remoteControlPlaneRecordCount: remoteControlPlane?.records.length ?? 0,
    remoteMediaCount: remoteApps.reduce((count, app) => count + app.media.objects.length, 0),
    remoteRecordCount: remoteApps.reduce((count, app) => count + appRecordCount(app), 0),
    status: hasDrift ? "drift" : "no-drift",
  };
}

function workspaceArchiveNormalizationEvidence(input: {
  localAppArchives: ReadonlyMap<string, WorkspaceArchiveDirectory>;
  remoteArchive: WorkspaceArchiveDirectory;
}): ArchiveNormalizationEvidence[] {
  return uniqueArchiveNormalizationEvidence([
    ...[...input.localAppArchives.values()].flatMap((archive) => archive.normalizationEvidence),
    ...input.remoteArchive.normalizationEvidence,
  ]);
}

function uniqueArchiveNormalizationEvidence(
  evidence: readonly ArchiveNormalizationEvidence[],
): ArchiveNormalizationEvidence[] {
  const seen = new Set<string>();
  const unique: ArchiveNormalizationEvidence[] = [];

  for (const entry of evidence) {
    const key = JSON.stringify({
      archiveKind: entry.archiveKind,
      details: entry.details ?? [],
      fromVersion: entry.fromVersion,
      normalizerId: entry.normalizerId,
      toVersion: entry.toVersion,
    });

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(entry);
  }

  return unique.sort((left, right) =>
    `${left.normalizerId}:${left.details?.join(";") ?? ""}`.localeCompare(
      `${right.normalizerId}:${right.details?.join(";") ?? ""}`,
    ),
  );
}

function changedControlPlaneIntentRecordKeys(
  local: InstanceArchiveControlPlane | undefined,
  remote: InstanceArchiveControlPlane,
): string[] {
  const localRecords = comparableControlPlaneIntentRecords(local);
  const remoteRecords = comparableControlPlaneIntentRecords(remote);
  const keys = new Set([...localRecords.keys(), ...remoteRecords.keys()]);
  const changed: string[] = [];

  for (const key of keys) {
    if (localRecords.get(key) !== remoteRecords.get(key)) {
      changed.push(key);
    }
  }

  return changed.sort((left, right) => left.localeCompare(right));
}

function comparableControlPlaneIntentRecords(
  controlPlane: InstanceArchiveControlPlane | undefined,
): Map<string, string> {
  const records = new Map<string, string>();

  for (const record of controlPlane?.records ?? []) {
    if (record.deletedAt || !controlPlaneIntentEntities.has(record.entity)) {
      continue;
    }

    records.set(
      controlPlaneRecordKey(record),
      JSON.stringify(
        stableValue({
          entity: record.entity,
          id: record.id,
          values: comparableControlPlaneValues(record),
        }),
      ),
    );
  }

  return records;
}

function comparableControlPlaneIntentRecordsJson(
  controlPlane: InstanceArchiveControlPlane | undefined,
): string {
  return JSON.stringify(
    [...comparableControlPlaneIntentRecords(controlPlane).entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function comparableControlPlaneValues(record: StoredRecord): RecordValues {
  const values = Object.fromEntries(
    Object.entries(record.values).filter(
      ([fieldName]) => fieldName !== "createdAt" && fieldName !== "updatedAt",
    ),
  ) as RecordValues;

  if (record.entity === "app-install" && typeof values.packageAppKey === "string") {
    const packageFacts = packageAppFactsForKey(values.packageAppKey);

    if (packageFacts) {
      values.packageRevision ??= packageFacts.packageRevision;
      values.sourceSchemaHash ??= packageFacts.sourceSchemaHash;
    }
  }

  return values;
}

function controlPlaneRecordKey(record: Pick<StoredRecord, "entity" | "id">) {
  const entityName = isInstanceControlPlaneEntityName(record.entity)
    ? formatInstanceControlPlaneBoundaryEntityName(record.entity)
    : record.entity;

  return `${entityName}:${record.id}`;
}

function comparableArchiveJson(archive: PortableArchive): string {
  const normalized = normalizeGeneratedArchiveTimestamps(archive);

  return normalized.kind === INSTANCE_ARCHIVE_KIND
    ? formatInstanceArchive(normalized)
    : formatAppArchive(normalized);
}

function comparableAppRecordsJson(archive: AppArchive): string {
  return JSON.stringify(stableValue(normalizeGeneratedArchiveTimestamps(archive).data));
}

function comparableAppMediaJson(directory: WorkspaceArchiveDirectory, archive: AppArchive): string {
  return comparableArchiveMediaJson(directory, archive);
}

function comparableArchiveMediaJson(
  directory: WorkspaceArchiveDirectory,
  archive: PortableArchive,
): string {
  const bytesByArchivePath = new Map(
    directory.mediaFiles.map((file) => [
      file.archivePath,
      Buffer.from(file.bytes).toString("base64"),
    ]),
  );
  const missing = new Set(directory.missingMediaFiles);
  const media = archiveApps(archive)
    .flatMap((app) => app.media.objects)
    .map((object) => ({
      archivePath: object.archivePath,
      byteSize: object.byteSize,
      bytesBase64: bytesByArchivePath.get(object.archivePath) ?? null,
      contentType: object.contentType,
      deliveryHref: object.deliveryHref,
      missing: missing.has(object.archivePath),
      storageKey: object.storageKey,
    }))
    .sort((left, right) => {
      const storageKeyOrder = left.storageKey.localeCompare(right.storageKey);

      return storageKeyOrder === 0
        ? left.archivePath.localeCompare(right.archivePath)
        : storageKeyOrder;
    });

  return JSON.stringify(stableValue(media));
}

function stringRecordValue(
  record: StoredRecord | undefined,
  fieldName: string,
): string | undefined {
  const value = record?.values[fieldName];

  return typeof value === "string" ? value : undefined;
}

function booleanRecordValue(
  record: StoredRecord | undefined,
  fieldName: string,
): boolean | undefined {
  const value = record?.values[fieldName];

  return typeof value === "boolean" ? value : undefined;
}

function numberRecordValue(
  record: StoredRecord | undefined,
  fieldName: string,
): number | undefined {
  const value = record?.values[fieldName];

  return typeof value === "number" ? value : undefined;
}

function normalizeGeneratedArchiveTimestamps<T extends PortableArchive>(archive: T): T {
  const nextArchive = jsonClone(archive);
  const generatedAt = "1970-01-01T00:00:00.000Z";

  nextArchive.exportedAt = generatedAt;

  if (nextArchive.kind === INSTANCE_ARCHIVE_KIND) {
    nextArchive.apps = nextArchive.apps.map((app) => normalizeGeneratedArchiveTimestamps(app));

    if (nextArchive.controlPlane) {
      nextArchive.controlPlane.schemaUpdatedAt = generatedAt;
      nextArchive.controlPlane.records = nextArchive.controlPlane.records
        .filter((record) => !record.deletedAt && controlPlaneIntentEntities.has(record.entity))
        .map((record) => ({
          ...record,
          values: normalizeControlPlaneGeneratedValues(record.values, generatedAt),
          createdAt: generatedAt,
        }));
    }

    return nextArchive;
  }

  if (nextArchive.data.kind === "storeSnapshot") {
    nextArchive.data.snapshot.exportedAt = generatedAt;
  }

  return nextArchive;
}

function normalizeControlPlaneGeneratedValues(values: RecordValues, generatedAt: string) {
  return {
    ...values,
    ...(values.createdAt === undefined ? {} : { createdAt: generatedAt }),
    ...(values.updatedAt === undefined ? {} : { updatedAt: generatedAt }),
  };
}

function withSingleTarget(
  manifest: FormlessInstanceWorkspaceManifest,
  target: FormlessInstanceWorkspaceTarget,
): FormlessInstanceWorkspaceManifest {
  return {
    ...manifest,
    defaultTarget: target.alias,
    targets: [target],
  };
}

function withRemoteStatus(
  manifest: FormlessInstanceWorkspaceManifest,
  status: FormlessInstanceTargetStatus,
): FormlessInstanceWorkspaceManifest {
  const appDeclarations = status.appRegistry.installs.map(appDeclarationFromInstall);

  return {
    ...manifest,
    apps: appDeclarations,
    defaultAppPolicy: appDeclarations.length === 0 ? "none" : "declared-installs",
    deploy: {
      ...(workerNameFromWorkersDevUrl(status.targetUrl) === undefined
        ? {}
        : { workerName: workerNameFromWorkersDevUrl(status.targetUrl) }),
      migrationPolicy: "existing",
      workersDevUrl: status.targetUrl,
    },
  };
}

function withArchiveSource(
  manifest: FormlessInstanceWorkspaceManifest,
  archive: PortableArchive,
  archiveSourcePath: string,
): FormlessInstanceWorkspaceManifest {
  const apps = archive.kind === INSTANCE_ARCHIVE_KIND ? archive.apps : [archive];

  return {
    ...manifest,
    archives: {
      ...manifest.archives,
      ...(archive.kind === INSTANCE_ARCHIVE_KIND ? { instance: archiveSourcePath } : {}),
    },
    apps: apps.map((app) =>
      appDeclarationFromArchive(
        app,
        archive.kind === APP_ARCHIVE_KIND
          ? archiveSourcePath
          : `${DEFAULT_FORMLESS_INSTANCE_WORKSPACE_APP_ARCHIVE_ROOT}/${app.app.installId}`,
      ),
    ),
    defaultAppPolicy: "declared-installs",
  };
}

function appDeclarationFromInstall(install: AppInstall): FormlessInstanceWorkspaceApp {
  return {
    installId: install.installId,
    packageAppKey: install.packageAppKey,
    label: install.label,
    archivePath: `${DEFAULT_FORMLESS_INSTANCE_WORKSPACE_APP_ARCHIVE_ROOT}/${install.installId}`,
    routes: {
      admin: install.adminRoute as `/apps/${string}`,
      schema: install.schemaRoute as `/apps/${string}/schema`,
      ...(install.publicRoute === undefined
        ? {}
        : { public: install.publicRoute as `/sites/${string}` }),
    },
  };
}

function appDeclarationFromArchive(
  archive: AppArchive,
  archivePath: string,
): FormlessInstanceWorkspaceApp {
  const installId = archive.app.installId;

  return {
    installId,
    packageAppKey: archive.app.packageAppKey,
    label: archive.app.label,
    archivePath,
    routes: {
      admin: `/apps/${installId}`,
      schema: `/apps/${installId}/schema`,
      ...(archive.app.packageAppKey === "site" ? { public: `/sites/${installId}` } : {}),
    },
  };
}

async function readWorkspaceArchive(archiveDir: string): Promise<PortableArchive> {
  return normalizePortableArchive(
    JSON.parse(
      await readFile(path.join(archiveDir, PORTABLE_ARCHIVE_MANIFEST_FILE), "utf8"),
    ) as unknown,
  ).archive;
}

async function readWorkspaceManifest(workspaceRoot: string): Promise<{
  manifest: FormlessInstanceWorkspaceManifest;
  manifestPath: string;
}> {
  const manifestPath = workspaceManifestPath(workspaceRoot);

  await assertNoLegacyWorkspaceManifest(workspaceRoot);

  return {
    manifest: parseFormlessInstanceWorkspaceManifestJson(await readFile(manifestPath, "utf8")),
    manifestPath,
  };
}

async function readWorkspaceManifestForDev(
  workspaceRoot: string,
): Promise<FormlessInstanceWorkspaceManifest> {
  const manifestPath = workspaceManifestPath(workspaceRoot);

  await assertNoLegacyWorkspaceManifest(workspaceRoot);

  try {
    return parseFormlessInstanceWorkspaceManifestJson(await readFile(manifestPath, "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return defaultFormlessInstanceWorkspaceManifest({
        name: defaultWorkspaceName(workspaceRoot),
      });
    }

    throw error;
  }
}

async function assertNoExistingWorkspaceManifest(workspaceRoot: string) {
  await assertNoLegacyWorkspaceManifest(workspaceRoot);

  const manifestPath = workspaceManifestPath(workspaceRoot);

  if (await pathExists(manifestPath)) {
    throw new Error(`Formless instance workspace already exists at ${manifestPath}.`);
  }
}

async function assertLocalOnboardingWorkspaceReady(workspaceRoot: string) {
  await assertNoExistingWorkspaceManifest(workspaceRoot);
  await assertNoLocalOnboardingConflict(
    workspaceRoot,
    SITE_PROJECT_CONFIG_FILE,
    "standalone Site project file",
    "Import or move the Site project before browser setup.",
  );
  await assertNoLocalOnboardingConflict(
    workspaceRoot,
    SITE_PROJECT_RECORDS_FILE,
    "standalone Site project file",
    "Import or move the Site project before browser setup.",
  );
  await assertNoLocalOnboardingConflict(
    workspaceRoot,
    PORTABLE_ARCHIVE_MANIFEST_FILE,
    "portable archive source",
    "Import or move existing archive source before browser setup.",
  );
  await assertNoLocalOnboardingConflict(
    workspaceRoot,
    DEFAULT_FORMLESS_INSTANCE_WORKSPACE_ARCHIVE_ROOT,
    "reviewable archive root",
    "Move existing archive source before browser setup.",
  );
  await assertNoLocalOnboardingIgnoredStateConflict(workspaceRoot);
}

async function assertNoLocalOnboardingConflict(
  workspaceRoot: string,
  relativePath: string,
  label: string,
  guidance: string,
) {
  const filePath = path.join(workspaceRoot, relativePath);

  if (await fileSystemPathExists(filePath)) {
    throw new Error(
      `Workspace browser setup cannot initialize because ${label} exists at ${filePath}. ${guidance}`,
    );
  }
}

async function assertNoLocalOnboardingIgnoredStateConflict(workspaceRoot: string) {
  const stateRoot = path.join(workspaceRoot, ".formless");
  let entries: Array<{ isDirectory(): boolean; name: string }>;

  try {
    entries = await readdir(stateRoot, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  const hasOnlyIgnoredState = entries.every(
    (entry) => entry.isDirectory() && (entry.name === "local" || entry.name === "operations"),
  );

  if (hasOnlyIgnoredState) {
    return;
  }

  throw new Error(
    `Workspace browser setup cannot initialize because ignored .formless state exists at ${stateRoot}. Remove or move existing local state before browser setup.`,
  );
}

async function assertNoLegacyWorkspaceManifest(workspaceRoot: string) {
  for (const fileName of LEGACY_FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILES) {
    const manifestPath = path.join(workspaceRoot, fileName);

    if (await pathExists(manifestPath)) {
      throw new Error(
        `Legacy Formless workspace manifest found at ${manifestPath}. Local-first workspaces use ${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE}; run \`formless dev\` and complete setup in the browser.`,
      );
    }
  }
}

async function fileSystemPathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath, "utf8");
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function readTextFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function prepareWorkspaceDirectories(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
  options: { appArchiveRoot?: boolean } = {},
) {
  const appArchiveRoot = options.appArchiveRoot ?? true;

  await Promise.all([
    ...(appArchiveRoot
      ? [mkdir(path.join(workspaceRoot, manifest.archives.apps), { recursive: true })]
      : []),
    mkdir(path.join(workspaceRoot, manifest.local.stateRoot), { recursive: true }),
  ]);
}

function archiveApps(archive: PortableArchive): AppArchive[] {
  return archive.kind === INSTANCE_ARCHIVE_KIND ? archive.apps : [archive];
}

function appRecordCount(app: AppArchive): number {
  return app.data.kind === "storeSnapshot"
    ? app.data.snapshot.records.length
    : app.data.records.length;
}

const controlPlaneIntentEntities = new Set([
  "app-install",
  "route",
  "deploy-target",
  "provider-config-ref",
  "deploy-desired-resource",
]);

function workspaceDeployTargetId() {
  return "instance.primary";
}

type WorkspaceTargetCommandName =
  | "check"
  | "deploy"
  | "destroy"
  | "domains plan"
  | "domains run"
  | "pull"
  | "push"
  | "status"
  | "token adopt"
  | "token rotate";

async function requireWorkspaceTarget(input: {
  commandName: WorkspaceTargetCommandName;
  manifest: FormlessInstanceWorkspaceManifest;
  targetAlias: string | null | undefined;
  workspaceRoot: string;
}): Promise<FormlessInstanceWorkspaceTarget> {
  const target = await resolveWorkspaceTarget({
    ...input,
    required: true,
  });

  if (!target) {
    throw new Error(`Formless instance ${input.commandName} requires a workspace target.`);
  }

  return target;
}

async function resolveWorkspaceTarget(input: {
  commandName: WorkspaceTargetCommandName;
  manifest: FormlessInstanceWorkspaceManifest;
  required: boolean;
  targetAlias: string | null | undefined;
  workspaceRoot: string;
}): Promise<FormlessInstanceWorkspaceTarget | undefined> {
  const controlPlane = await readFormlessInstanceControlPlaneRecordSource({
    manifest: input.manifest,
    workspaceRoot: input.workspaceRoot,
  });
  const deployTarget = selectLocalWorkspaceDeployTarget(
    controlPlane?.records.filter((record) => !record.deletedAt) ?? [],
    input.targetAlias,
    {
      commandName: input.commandName,
      required: input.required,
    },
  );

  return deployTarget === undefined
    ? undefined
    : workspaceTargetFromDeployTargetRecord(deployTarget, input.commandName);
}

function requireWorkspaceDeployAccountId(providerConfig: StoredRecord | undefined): string {
  const accountId = stringRecordValue(providerConfig, "accountId")?.trim();

  if (!accountId) {
    throw new Error("Formless instance domains plan requires provider-config-ref.accountId.");
  }

  return accountId;
}

function selectLocalWorkspaceDeploymentSource(
  controlPlane: InstanceArchiveControlPlane | undefined,
  targetAlias: string | null | undefined,
): LocalWorkspaceDeploymentSource {
  if (!controlPlane) {
    if (targetAlias?.trim()) {
      throw new Error(`Formless deploy plan target "${targetAlias.trim()}" was not found.`);
    }

    return {};
  }

  const records = controlPlane.records.filter((record) => !record.deletedAt);
  const deployTarget = selectLocalWorkspaceDeployTarget(records, targetAlias, {
    commandName: "deploy",
    required: false,
  });
  const providerConfig = selectLocalWorkspaceProviderConfig(records);

  return {
    deployTarget,
    ...(providerConfig === undefined ? {} : { providerConfig }),
  };
}

function selectLocalWorkspaceDeployTarget(
  records: readonly StoredRecord[],
  targetAlias: string | null | undefined,
  options: { commandName: WorkspaceTargetCommandName; required: boolean },
): StoredRecord | undefined {
  const targets = records.filter(
    (record) =>
      record.entity === "deploy-target" &&
      record.values.targetKind === "instance" &&
      record.values.enabled !== false,
  );
  const requestedTargetId = targetAlias?.trim();

  if (requestedTargetId) {
    const target = targets.find(
      (record) =>
        record.id === requestedTargetId ||
        stringRecordValue(record, "targetId") === requestedTargetId,
    );

    if (!target) {
      throw new Error(
        `Formless instance ${options.commandName} target "${requestedTargetId}" was not found.`,
      );
    }

    return target;
  }

  const primary = targets.find(
    (record) => stringRecordValue(record, "targetId") === workspaceDeployTargetId(),
  );

  if (primary) {
    return primary;
  }

  if (targets.length === 1 && targets[0]) {
    return targets[0];
  }

  if (targets.length === 0) {
    if (options.required) {
      throw new Error(
        `Formless instance ${options.commandName} requires an enabled instance deploy-target record.`,
      );
    }

    return undefined;
  }

  throw new Error(
    `Formless instance ${options.commandName} targetAlias is required when multiple deploy targets exist.`,
  );
}

function workspaceTargetFromDeployTargetRecord(
  record: StoredRecord,
  commandName: WorkspaceTargetCommandName,
): FormlessInstanceWorkspaceTarget {
  const targetId = stringRecordValue(record, "targetId") ?? record.id;
  const targetUrl = stringRecordValue(record, "targetUrl");

  if (targetUrl === undefined) {
    throw new Error(
      `Formless instance ${commandName} deploy-target "${targetId}" requires targetUrl.`,
    );
  }

  return {
    alias: targetId,
    url: normalizeFormlessInstanceWorkspaceTargetUrl(targetUrl),
  };
}

function selectLocalWorkspaceProviderConfig(
  records: readonly StoredRecord[],
): StoredRecord | undefined {
  const configs = records.filter(
    (record) =>
      record.entity === "provider-config-ref" && record.values.providerFamily === "cloudflare",
  );
  const referencedConfigIds = new Set(
    records
      .filter((record) => record.entity === "route" && !record.deletedAt)
      .map((record) => stringRecordValue(record, "providerConfig"))
      .filter((value): value is string => value !== undefined),
  );
  const referencedConfigs = configs.filter((record) => referencedConfigIds.has(record.id));

  if (referencedConfigs.length === 1) {
    return referencedConfigs[0];
  }

  if (referencedConfigs.length > 1) {
    throw new Error(
      "Formless deploy plan requires one Cloudflare provider-config-ref for provider-scoped routes.",
    );
  }

  if (configs.length === 1) {
    return configs[0];
  }

  if (configs.length > 1) {
    throw new Error(
      "Formless deploy plan requires one Cloudflare provider-config-ref or route providerConfig selection.",
    );
  }

  return undefined;
}

type LocalWorkspaceDeploymentPlanResult = {
  manifest: FormlessInstanceWorkspaceManifest;
  plan: FormlessInstanceDeploymentPlan;
  selectedTarget: FormlessInstanceWorkspaceTarget;
};

type LocalWorkspaceDeploymentDesiredState = {
  logicalIds: string[];
  resourceCount: number;
  resourceGraph: DeployResourceGraph;
  resourcesByKind: Record<string, number>;
  routeTargetCount: number;
  sourceFingerprint: string;
  targetId: string;
};

type LocalWorkspaceDeploymentSource = {
  deployTarget?: StoredRecord;
  providerConfig?: StoredRecord;
};

async function resolveLocalWorkspaceDeploymentAccount(input: {
  accountDiscovery: FormlessInstanceAccountDiscoveryAdapter;
  providerConfig?: StoredRecord;
}): Promise<FormlessInstanceDeploymentAccount> {
  const configuredAccountId = stringRecordValue(input.providerConfig, "accountId");

  const accounts = await input.accountDiscovery.listAccounts({ credentialProfile: null });

  if (!Array.isArray(accounts)) {
    throw new Error("Cloudflare account discovery adapter must return an account array.");
  }

  const account =
    configuredAccountId === undefined || configuredAccountId === ""
      ? selectOnlyFormlessInstanceAccount({ accounts, credentialProfile: null })
      : accounts.find((candidate) => candidate.id === configuredAccountId);

  if (!account) {
    throw new Error(
      `Cloudflare account ${configuredAccountId} was not found for the selected credentials.`,
    );
  }

  return account;
}

function planLocalWorkspaceDeployment(input: {
  account: FormlessInstanceDeploymentAccount;
  deployTarget?: StoredRecord;
  manifest: FormlessInstanceWorkspaceManifest;
  migrationPolicy?: FormlessInstanceWorkspaceMigrationPolicy | null;
  packageVersion: string;
  providerConfig?: StoredRecord;
  targetAlias?: string | null;
}): LocalWorkspaceDeploymentPlanResult {
  const configuredWorkerName = stringRecordValue(input.providerConfig, "workerName");
  const plan = planFormlessInstanceDeployment({
    account: input.account,
    instanceName: configuredWorkerName ?? input.manifest.name,
    migrationPolicy: input.migrationPolicy ?? ("new" as const),
    packageVersion: input.packageVersion,
  });

  const targetAlias =
    input.targetAlias ??
    stringRecordValue(input.deployTarget, "targetId") ??
    input.deployTarget?.id ??
    workspaceDeployTargetId();
  const targetUrl = stringRecordValue(input.deployTarget, "targetUrl");
  const selectedTarget = {
    alias: targetAlias,
    url:
      targetUrl === undefined
        ? plan.expectedUrl.url
        : normalizeFormlessInstanceWorkspaceTargetUrl(targetUrl),
  };

  if (selectedTarget.url !== plan.expectedUrl.url) {
    throw new Error(
      `Formless deploy target "${targetAlias}" targetUrl ${selectedTarget.url} does not match planned URL ${plan.expectedUrl.url}.`,
    );
  }

  return {
    manifest: input.manifest,
    plan,
    selectedTarget,
  };
}

function projectLocalWorkspaceDeploymentDesiredState(input: {
  controlPlane: InstanceArchiveControlPlane | undefined;
  plan: FormlessInstanceDeploymentPlan;
  targetId: string;
}): LocalWorkspaceDeploymentDesiredState {
  const records = input.controlPlane?.records.filter((record) => !record.deletedAt) ?? [];
  const appInstalls = appInstallProjectionRecordsFromStoredRecords(records);
  const routes = records
    .filter((record) => record.entity === "route")
    .map(routeProjectionRecordFromStoredRecord)
    .filter((record): record is ControlPlaneRouteProjectionRecord => record !== undefined);
  const providerConfigs = providerConfigProjectionRecordsFromStoredRecords(records);
  const routeProjection = projectDeployControlPlaneDesiredState({
    appInstalls,
    instanceId: input.plan.runtimeVars.FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID,
    providerConfigs,
    routes,
    targetId: input.targetId,
    workerName: input.plan.resources.worker.name,
  });
  const routeLogicalIds = new Set(
    routeProjection.resourceGraph.resources.map((resource) => resource.logicalId),
  );
  const desiredResources = records
    .filter(
      (record) =>
        record.entity === "deploy-desired-resource" &&
        stringRecordValue(record, "deployTarget") === input.targetId &&
        booleanRecordValue(record, "enabled") !== false,
    )
    .map(deployDesiredResourceFromStoredRecord)
    .filter((resource) => !routeLogicalIds.has(resource.logicalId));
  const resourceGraph: DeployResourceGraph = {
    resources: [...routeProjection.resourceGraph.resources, ...desiredResources].sort(
      compareDeployResources,
    ),
    targetId: input.targetId,
  };
  const sourceFingerprint =
    resourceGraph.resources.length === routeProjection.resourceGraph.resources.length
      ? routeProjection.sourceFingerprint
      : (firstStringRecordValue(records, "deploy-desired-resource", "sourceFingerprint") ??
        routeProjection.sourceFingerprint);

  return {
    logicalIds: resourceGraph.resources.map((resource) => resource.logicalId),
    resourceCount: resourceGraph.resources.length,
    resourceGraph,
    resourcesByKind: resourceCountsByKind(resourceGraph),
    routeTargetCount: routeProjection.routeTargets.length,
    sourceFingerprint,
    targetId: input.targetId,
  };
}

function appInstallProjectionRecordsFromStoredRecords(
  records: readonly StoredRecord[],
): ControlPlaneAppInstallProjectionRecord[] {
  return records
    .filter((record) => record.entity === "app-install")
    .map((record) => {
      const installId = stringRecordValue(record, "installId");
      const packageAppKey = stringRecordValue(record, "packageAppKey");

      if (installId === undefined || packageAppKey === undefined) {
        return undefined;
      }

      return {
        id: record.id,
        installId,
        packageAppKey,
      };
    })
    .filter((record): record is ControlPlaneAppInstallProjectionRecord => record !== undefined)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function deployDesiredResourceFromStoredRecord(record: StoredRecord): DeployResource {
  return {
    dependencies: parseDeployResourceDependenciesJson(
      stringRecordValue(record, "dependenciesJson"),
    ),
    inputs: parseDeployResourceInputsJson(stringRecordValue(record, "inputsJson")),
    kind: stringRecordValue(record, "kind") as DeployResource["kind"],
    logicalId: stringRecordValue(record, "logicalId") ?? record.id,
    providerFamily: stringRecordValue(record, "providerFamily") as DeployResource["providerFamily"],
    targetId: stringRecordValue(record, "deployTarget") ?? workspaceDeployTargetId(),
  };
}

function parseDeployResourceInputsJson(value: string | undefined): DeployResource["inputs"] {
  if (value === undefined) {
    return {};
  }

  const parsed = JSON.parse(value) as unknown;

  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as DeployResource["inputs"];
  }

  throw new Error("Control-plane deploy-desired-resource inputsJson must be an object.");
}

function parseDeployResourceDependenciesJson(
  value: string | undefined,
): DeployResource["dependencies"] {
  if (value === undefined) {
    return [];
  }

  const parsed = JSON.parse(value) as unknown;

  if (Array.isArray(parsed)) {
    return parsed as DeployResource["dependencies"];
  }

  throw new Error("Control-plane deploy-desired-resource dependenciesJson must be an array.");
}

function firstStringRecordValue(
  records: readonly StoredRecord[],
  entity: string,
  fieldName: string,
): string | undefined {
  for (const record of records) {
    if (record.entity !== entity) {
      continue;
    }

    const value = stringRecordValue(record, fieldName);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function resourceCountsByKind(resourceGraph: DeployResourceGraph): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const resource of resourceGraph.resources) {
    counts[resource.kind] = (counts[resource.kind] ?? 0) + 1;
  }

  return counts;
}

function compareDeployResources(left: DeployResource, right: DeployResource): number {
  return (
    left.targetId.localeCompare(right.targetId) ||
    left.providerFamily.localeCompare(right.providerFamily) ||
    left.kind.localeCompare(right.kind) ||
    left.logicalId.localeCompare(right.logicalId)
  );
}

function formlessInstanceWorkspaceDeploymentPlan(input: {
  commandName?: "deploy" | "destroy" | "domains run";
  migrationPolicy?: FormlessInstanceWorkspaceMigrationPolicy | null;
  packageVersion: string;
  providerConfig?: StoredRecord;
  selectedTarget: FormlessInstanceWorkspaceTarget;
}): FormlessInstanceDeploymentPlan {
  const commandName = input.commandName ?? "deploy";
  const targetUrl = input.selectedTarget.url;
  const facts = workersDevTargetFacts(
    targetUrl,
    stringRecordValue(input.providerConfig, "workerName"),
  );
  const accountId = stringRecordValue(input.providerConfig, "accountId")?.trim();

  if (!accountId) {
    throw new Error(`Formless instance ${commandName} requires provider-config-ref.accountId.`);
  }

  const migrationPolicy = input.migrationPolicy ?? ("existing" as const);

  return planFormlessInstanceDeployment({
    account: {
      id: accountId,
      workersDevSubdomain: facts.workersDevSubdomain,
    },
    instanceName: facts.workerName,
    migrationPolicy,
    packageVersion: input.packageVersion,
  });
}

function formlessInstanceWorkspaceDeployStateRoot(
  workspaceRoot: string,
  plan: FormlessInstanceDeploymentPlan,
): string {
  return path.join(workspaceRoot, ".formless/deploy", plan.resources.worker.name);
}

function workersDevTargetFacts(
  targetUrl: string,
  expectedWorkerName: string | undefined,
): { workerName: string; workersDevSubdomain: string } {
  const url = new URL(targetUrl);
  const suffix = ".workers.dev";

  if (url.protocol !== "https:" || !url.hostname.endsWith(suffix)) {
    throw new Error("Formless instance deploy supports workers.dev target URLs only.");
  }

  const labels = url.hostname.slice(0, -suffix.length).split(".");

  if (labels.length !== 2) {
    throw new Error("Formless instance deploy requires a workers.dev target host.");
  }

  const [workerName, workersDevSubdomain] = labels;

  if (!workerName || !workersDevSubdomain) {
    throw new Error("Formless instance deploy requires a workers.dev target host.");
  }

  if (expectedWorkerName !== undefined && expectedWorkerName !== workerName) {
    throw new Error(
      `Formless instance deploy target worker "${workerName}" does not match deploy.workerName "${expectedWorkerName}".`,
    );
  }

  return { workerName, workersDevSubdomain };
}

async function readWorkspaceAppArchivesForPush(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
  controlPlane: InstanceArchiveControlPlane | undefined,
): Promise<WorkspaceArchiveDirectory[]> {
  return readRequiredWorkspaceAppArchives({
    controlPlane,
    manifest,
    operation: "push",
    workspaceRoot,
  });
}

async function readRequiredWorkspaceAppArchives(input: {
  controlPlane: InstanceArchiveControlPlane | undefined;
  manifest: FormlessInstanceWorkspaceManifest;
  operation: "local dev" | "push";
  workspaceRoot: string;
}): Promise<WorkspaceArchiveDirectory[]> {
  const archives: WorkspaceArchiveDirectory[] = [];

  for (const app of controlPlaneAppInstallRecords(input.controlPlane)) {
    const archivePath = workspaceAppArchivePath(input.manifest, app.installId);
    const archiveRoot = path.join(input.workspaceRoot, archivePath);
    const archive = await readArchiveDirectoryForCheck(archiveRoot);

    validateRequiredWorkspaceAppArchive({
      archive,
      archivePath,
      install: app,
      operation: input.operation,
    });

    archives.push(archive as WorkspaceArchiveDirectory);
  }

  return archives.sort((left, right) => {
    const leftInstall = left.archive.kind === APP_ARCHIVE_KIND ? left.archive.app.installId : "";
    const rightInstall = right.archive.kind === APP_ARCHIVE_KIND ? right.archive.app.installId : "";

    return leftInstall.localeCompare(rightInstall);
  });
}

function validateRequiredWorkspaceAppArchive(input: {
  archive: WorkspaceArchiveDirectory | undefined;
  archivePath: string;
  install: WorkspaceControlPlaneAppInstallRecord;
  operation: "local dev" | "push";
}): asserts input is {
  archive: WorkspaceArchiveDirectory;
  archivePath: string;
  install: WorkspaceControlPlaneAppInstallRecord;
  operation: "local dev" | "push";
} {
  const prefix = `Formless instance ${input.operation}`;

  if (!input.archive) {
    throw new Error(`${prefix} requires local app archive ${input.archivePath}.`);
  }

  if (input.archive.archive.kind !== APP_ARCHIVE_KIND) {
    throw new Error(`${prefix} requires ${input.archivePath} to be an app archive.`);
  }

  const archiveApp = input.archive.archive.app;

  if (archiveApp.installId !== input.install.installId) {
    throw new Error(
      `${prefix} app archive ${input.archivePath} has install id "${archiveApp.installId}", expected "${input.install.installId}".`,
    );
  }

  if (archiveApp.packageAppKey !== input.install.packageAppKey) {
    throw new Error(
      `${prefix} app archive ${input.archivePath} has package "${archiveApp.packageAppKey}", expected "${input.install.packageAppKey}".`,
    );
  }

  const packageApp = findBundledAppPackage(input.install.packageAppKey);

  if (!packageApp) {
    throw new Error(
      `${prefix} app install "${input.install.installId}" references unsupported package "${input.install.packageAppKey}".`,
    );
  }

  if (
    input.install.packageRevision !== undefined &&
    input.install.packageRevision !== packageApp.packageRevision
  ) {
    throw new Error(
      `${prefix} app install "${input.install.installId}" has package revision ${input.install.packageRevision}, expected ${packageApp.packageRevision}.`,
    );
  }

  if (
    input.install.sourceSchemaHash !== undefined &&
    input.install.sourceSchemaHash !== packageApp.sourceSchemaHash
  ) {
    throw new Error(
      `${prefix} app install "${input.install.installId}" has source schema hash "${input.install.sourceSchemaHash}", expected "${packageApp.sourceSchemaHash}".`,
    );
  }

  if (archiveApp.packageRevision !== packageApp.packageRevision) {
    throw new Error(
      `${prefix} app archive ${input.archivePath} has package revision ${archiveApp.packageRevision}, expected ${packageApp.packageRevision}.`,
    );
  }

  if (archiveApp.sourceSchemaKey !== packageApp.sourceSchemaKey) {
    throw new Error(
      `${prefix} app archive ${input.archivePath} has source schema key "${archiveApp.sourceSchemaKey}", expected "${packageApp.sourceSchemaKey}".`,
    );
  }

  if (archiveApp.sourceSchemaHash !== packageApp.sourceSchemaHash) {
    throw new Error(
      `${prefix} app archive ${input.archivePath} has source schema hash "${archiveApp.sourceSchemaHash}", expected "${packageApp.sourceSchemaHash}".`,
    );
  }

  validateWorkspaceAppArchiveMediaReferences({
    archive: input.archive,
    archivePath: input.archivePath,
    operation: input.operation,
  });
}

function validateWorkspaceAppArchiveMediaReferences(input: {
  archive: WorkspaceArchiveDirectory;
  archivePath: string;
  operation: "local dev" | "push";
}) {
  const prefix = `Formless instance ${input.operation}`;

  if (input.archive.archive.kind !== APP_ARCHIVE_KIND) {
    return;
  }

  if (input.archive.missingMediaFiles.length > 0) {
    throw new Error(
      `${prefix} app archive ${input.archivePath} is missing media files: ${input.archive.missingMediaFiles.join(", ")}.`,
    );
  }

  const mediaFilesByPath = new Map(
    input.archive.mediaFiles.map((file) => [file.archivePath, file]),
  );
  const seenArchivePaths = new Set<string>();

  for (const object of input.archive.archive.media.objects) {
    if (seenArchivePaths.has(object.archivePath)) {
      throw new Error(
        `${prefix} app archive ${input.archivePath} has duplicate media file "${object.archivePath}".`,
      );
    }

    seenArchivePaths.add(object.archivePath);

    const file = mediaFilesByPath.get(object.archivePath);

    if (!file) {
      throw new Error(
        `${prefix} app archive ${input.archivePath} is missing media file "${object.archivePath}".`,
      );
    }

    if (file.byteSize !== object.byteSize) {
      throw new Error(
        `${prefix} app archive ${input.archivePath} media file "${object.archivePath}" has ${file.byteSize} bytes, expected ${object.byteSize}.`,
      );
    }
  }
}

async function writeComposedWorkspacePushArchive(input: {
  archives: readonly WorkspaceArchiveDirectory[];
  archiveRoot: string;
  controlPlane?: InstanceArchiveControlPlane;
  exportedAt: string;
}): Promise<PushFormlessInstanceWorkspaceSource> {
  const appArchives = input.archives.map((archive) => {
    if (archive.archive.kind !== APP_ARCHIVE_KIND) {
      throw new Error("Formless instance push can compose only app archives.");
    }

    return archive.archive;
  });
  const instanceArchive: InstanceArchive = {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: input.exportedAt,
    capabilities: [
      "installed-app-registry",
      ...(input.controlPlane === undefined ? [] : ["schema-owned-control-plane" as const]),
      "app-store-snapshots",
      "core-media-assets",
    ],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    ...(input.controlPlane === undefined ? {} : { controlPlane: input.controlPlane }),
    apps: appArchives,
  };
  const archivePath = path.join(input.archiveRoot, PORTABLE_ARCHIVE_MANIFEST_FILE);

  await mkdir(input.archiveRoot, { recursive: true });
  await writeFile(archivePath, formatInstanceArchive(instanceArchive));

  for (const directory of input.archives) {
    for (const file of directory.mediaFiles) {
      const filePath = path.join(input.archiveRoot, file.archivePath);

      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, file.bytes);
    }
  }

  return {
    appCount: appArchives.length,
    archivePath,
    mediaCount: appArchives.reduce((count, app) => count + app.media.objects.length, 0),
    recordCount: appArchives.reduce((count, app) => count + appRecordCount(app), 0),
  };
}

function workspacePushBackupPath(workspaceRoot: string, timestamp: string): string {
  return path.join(workspaceRoot, ".formless/backups", `push-${safeTimestamp(timestamp)}`);
}

function safeTimestamp(timestamp: string): string {
  return timestamp.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-+|-+$/g, "");
}

async function createWorkspaceTempRoot(workspaceRoot: string, name: string): Promise<string> {
  const tempParent = path.join(workspaceRoot, ".formless");

  await mkdir(tempParent, { recursive: true });

  return mkdtemp(path.join(tempParent, `${name}-`));
}

function workspaceAppArchivePath(
  manifest: FormlessInstanceWorkspaceManifest,
  installId: string,
): string {
  return (
    manifest.apps.find((app) => app.installId === installId)?.archivePath ??
    `${manifest.archives.apps}/${installId}`
  );
}

function selectWorkspaceWorkerName(
  providerConfig: StoredRecord | undefined,
  target: FormlessInstanceWorkspaceTarget | undefined,
): string {
  const workerName =
    stringRecordValue(providerConfig, "workerName") ?? workerNameFromWorkersDevUrl(target?.url);

  if (!workerName) {
    throw new Error(
      "Formless instance command requires provider-config-ref.workerName or a workers.dev target URL.",
    );
  }

  return workerName;
}

async function readLiveWorkspaceDomainIntents(
  target: FormlessInstanceWorkspaceTarget,
  dependencies: { fetch: typeof fetch },
): Promise<FormlessInstanceWorkspaceDomainIntent[]> {
  const liveMappings = await readFormlessInstanceDomainMappings(
    { targetUrl: target.url },
    dependencies,
  );

  return liveMappings.mappings.map(workspaceDomainIntentFromLiveMapping);
}

function workspaceDomainIntentFromLiveMapping(
  mapping: InstanceDomainMapping,
): FormlessInstanceWorkspaceDomainIntent {
  const targetInstallId = liveMappingTargetInstallId(mapping);

  if (mapping.profile !== "instance" && targetInstallId === undefined) {
    throw new Error(
      `Live domain mapping for host "${mapping.host}" profile "${mapping.profile}" is missing a target install id.`,
    );
  }

  return {
    enabled: mapping.enabled,
    host: mapping.host,
    profile: mapping.profile,
    ...(targetInstallId === undefined ? {} : { targetInstallId }),
  };
}

function liveMappingTargetInstallId(mapping: InstanceDomainMapping): string | undefined {
  return mapping.targetInstallId ?? mapping.installId;
}

function selectDomainIntentsForHost(input: {
  host?: string | null;
  intents: readonly CloudflareDomainIntent[];
}): CloudflareDomainIntent[] {
  if (input.host === undefined || input.host === null || input.host.trim() === "") {
    return [...input.intents];
  }

  const host = normalizeInstanceDomainHost(input.host);

  if (!host.ok) {
    throw new Error(host.error.message);
  }

  const intents = input.intents.filter((intent) => intent.host === host.host);

  if (intents.length === 0) {
    throw new Error(`No desired domain mapping found for host "${host.host}".`);
  }

  return intents;
}

function compareWorkspaceDomainIntentToLive(
  workspaceDomains: readonly FormlessInstanceWorkspaceDomainIntent[],
  liveDomains: readonly FormlessInstanceWorkspaceDomainIntent[],
): FormlessInstanceWorkspaceDomainDesiredDrift[] {
  const workspaceByHost = new Map(workspaceDomains.map((domain) => [domain.host, domain]));
  const liveByHost = new Map(liveDomains.map((domain) => [domain.host, domain]));
  const hosts = new Set([...workspaceByHost.keys(), ...liveByHost.keys()]);
  const drift: FormlessInstanceWorkspaceDomainDesiredDrift[] = [];

  for (const host of [...hosts].sort((left, right) => left.localeCompare(right))) {
    const local = workspaceByHost.get(host);
    const live = liveByHost.get(host);

    if (local && !live) {
      drift.push({
        host,
        local,
        status: "local-only",
      });
      continue;
    }

    if (!local && live) {
      drift.push({
        host,
        live,
        status: "live-only",
      });
      continue;
    }

    if (local && live && !workspaceDomainIntentsEqual(local, live)) {
      drift.push({
        host,
        live,
        local,
        status: "mismatch",
      });
    }
  }

  return drift;
}

function workspaceDomainIntentsEqual(
  left: FormlessInstanceWorkspaceDomainIntent,
  right: FormlessInstanceWorkspaceDomainIntent,
): boolean {
  return (
    left.enabled === right.enabled &&
    left.host === right.host &&
    left.profile === right.profile &&
    left.targetInstallId === right.targetInstallId
  );
}

function workspaceSecretStateLabel(
  secretState: FormlessInstanceWorkspaceSecretState,
  env: NodeJS.ProcessEnv | undefined,
): FormlessInstanceWorkspaceStatusResult["secretState"] {
  if (resolveFormlessInstanceWorkspaceAdminToken({ env, secretState: {} })) {
    return "env";
  }

  return secretState.adminToken ? "stored" : "missing";
}

function rotateCommandEnv(
  env: NodeJS.ProcessEnv | undefined,
  providerConfig: StoredRecord | undefined,
): NodeJS.ProcessEnv {
  const accountId = stringRecordValue(providerConfig, "accountId");

  return {
    ...env,
    ...(accountId === undefined ? {} : { CLOUDFLARE_ACCOUNT_ID: accountId }),
  };
}

function optionalCloudflareApiTokenSecret(
  env: NodeJS.ProcessEnv | undefined,
): { CLOUDFLARE_API_TOKEN: string } | {} {
  const token = optionalCloudflareApiToken(env);

  return token ? { CLOUDFLARE_API_TOKEN: token } : {};
}

function optionalCloudflareApiToken(env: NodeJS.ProcessEnv | undefined): string | undefined {
  const token =
    env?.[CLOUDFLARE_API_TOKEN_ENV_NAME]?.trim() ?? env?.[CF_API_TOKEN_ENV_NAME]?.trim();

  return token ? token : undefined;
}

async function readRequiredLocalWorkspaceDeploymentState(input: {
  deploymentStateRoot: string;
  plan: FormlessInstanceDeploymentPlan;
}): Promise<string> {
  const statePath = path.join(input.deploymentStateRoot, FORMLESS_INSTANCE_STATE_FILE);
  const contents = await readTextFileIfExists(statePath);

  if (contents === null) {
    throw new Error(`Formless instance destroy requires ignored deploy state ${statePath}.`);
  }

  const state = parseFormlessInstanceStateJson(contents);

  assertDeploymentStateMatchesPlan({
    plan: input.plan,
    state,
    statePath,
  });

  return statePath;
}

function assertDeploymentStateMatchesPlan(input: {
  plan: FormlessInstanceDeploymentPlan;
  state: {
    accountId: string;
    authorityNamespaceName: string;
    mediaBucketName: string;
    workerName: string;
    workersDevUrl: string;
  };
  statePath: string;
}): void {
  assertMatchingDeploymentStateField({
    actual: input.state.accountId,
    expected: input.plan.account.id,
    field: "accountId",
    statePath: input.statePath,
  });
  assertMatchingDeploymentStateField({
    actual: input.state.workerName,
    expected: input.plan.resources.worker.name,
    field: "workerName",
    statePath: input.statePath,
  });
  assertMatchingDeploymentStateField({
    actual: input.state.workersDevUrl,
    expected: input.plan.expectedUrl.url,
    field: "workersDevUrl",
    statePath: input.statePath,
  });
  assertMatchingDeploymentStateField({
    actual: input.state.mediaBucketName,
    expected: input.plan.resources.mediaBucket.name,
    field: "mediaBucketName",
    statePath: input.statePath,
  });
  assertMatchingDeploymentStateField({
    actual: input.state.authorityNamespaceName,
    expected: input.plan.resources.authority.namespaceName,
    field: "authorityNamespaceName",
    statePath: input.statePath,
  });
}

function assertMatchingDeploymentStateField(input: {
  actual: string;
  expected: string;
  field: string;
  statePath: string;
}): void {
  if (input.actual !== input.expected) {
    throw new Error(
      `Formless instance destroy deploy state ${input.statePath} field "${input.field}" is "${input.actual}", expected "${input.expected}".`,
    );
  }
}

async function readDestroyLocalDeploySecretEnv(input: {
  deploymentStateRoot: string;
  env: NodeJS.ProcessEnv | undefined;
}): Promise<{
  credentialProfile: string | null;
  path: string;
  secrets: {
    ALCHEMY_PASSWORD: string;
    CLOUDFLARE_API_TOKEN?: string;
  };
}> {
  const secretPath = path.join(input.deploymentStateRoot, FORMLESS_INSTANCE_LOCAL_ENV_FILE);
  const contents = await readTextFileIfExists(secretPath);

  if (contents === null) {
    throw new Error(`Formless instance destroy requires ignored deploy secrets ${secretPath}.`);
  }

  const values = parseDotEnv(contents);
  const alchemyPassword = requiredDeploySecretValue(
    values[ALCHEMY_PASSWORD_ENV_NAME],
    ALCHEMY_PASSWORD_ENV_NAME,
    secretPath,
  );
  const cloudflareApiToken =
    optionalCloudflareApiToken(input.env) ??
    optionalDeploySecretValue(values[CLOUDFLARE_API_TOKEN_ENV_NAME]) ??
    optionalDeploySecretValue(values[CF_API_TOKEN_ENV_NAME]);
  const credentialProfile =
    optionalDeploySecretValue(input.env?.ALCHEMY_PROFILE) ??
    optionalDeploySecretValue(values.ALCHEMY_PROFILE) ??
    null;

  return {
    credentialProfile,
    path: secretPath,
    secrets: {
      ALCHEMY_PASSWORD: alchemyPassword,
      ...(cloudflareApiToken === undefined ? {} : { CLOUDFLARE_API_TOKEN: cloudflareApiToken }),
    },
  };
}

function requiredDeploySecretValue(
  value: string | undefined,
  key: string,
  secretPath: string,
): string {
  const normalized = optionalDeploySecretValue(value);

  if (normalized === undefined) {
    throw new Error(
      `Formless instance destroy requires ${key} in ignored deploy secrets ${secretPath}.`,
    );
  }

  return normalized;
}

function optionalDeploySecretValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  return normalized ? normalized : undefined;
}

function domainProviderPlanFromDeploymentPlan(
  plan: FormlessInstanceDeploymentPlan,
): DomainProviderPlan {
  return {
    blockers: [],
    instanceId: plan.runtimeVars.FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID,
    policy: "create-only",
    resources: [],
    workerName: plan.runtimeVars.FORMLESS_DOMAIN_PROVIDER_WORKER_NAME,
  };
}

async function destroyRouteProviderResourcesFromWorkspaceSource(
  context: FormlessInstanceWorkspaceProviderContext,
): Promise<DestroyFormlessInstanceWorkspaceRouteProviderResources> {
  const source = await readDestroyRouteProjectionSource(context);
  const projection = projectDeployControlPlaneDesiredState({
    instanceId: context.plan.runtimeVars.FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID,
    providerConfigs: source.providerConfigs,
    routes: source.routes,
    targetId: workspaceDeployTargetId(),
    workerName: context.plan.runtimeVars.FORMLESS_DOMAIN_PROVIDER_WORKER_NAME,
  });
  const resourceGraph = projection.resourceGraph;

  return {
    enabledHosts: destroyRouteProviderResourceHosts(resourceGraph),
    resourceGraph,
    resourceCount: resourceGraph.resources.length,
    routeCount: source.routes.filter(routeCanProjectProviderResource).length,
    source: source.source,
  };
}

async function readDestroyRouteProjectionSource(
  context: FormlessInstanceWorkspaceProviderContext,
): Promise<{
  providerConfigs: ControlPlaneProviderConfigProjectionRecord[];
  routes: ControlPlaneRouteProjectionRecord[];
  source: DestroyFormlessInstanceWorkspaceRouteProviderResources["source"];
}> {
  const controlPlane = await readFormlessInstanceControlPlaneRecordSource({
    manifest: context.manifest,
    workspaceRoot: context.workspaceRoot,
  });
  const controlPlaneRecords = controlPlane?.records ?? [];
  const routeRecords = controlPlaneRecords
    .filter((record) => !record.deletedAt && record.entity === "route")
    .map(routeProjectionRecordFromStoredRecord)
    .filter((record): record is ControlPlaneRouteProjectionRecord => record !== undefined);
  const providerRouteRecords = routeRecords.filter(routeHasProviderScope);

  if (providerRouteRecords.length > 0) {
    return {
      providerConfigs: providerConfigProjectionRecordsFromStoredRecords(controlPlaneRecords),
      routes: routeRecords,
      source: "instance:route",
    };
  }

  return {
    providerConfigs: providerConfigProjectionRecordsFromStoredRecords(controlPlaneRecords),
    routes: [],
    source: "instance:route",
  };
}

function routeProjectionRecordFromStoredRecord(
  record: StoredRecord,
): ControlPlaneRouteProjectionRecord | undefined {
  const kind = stringRecordValue(record, "kind");
  const matchPath = stringRecordValue(record, "matchPath");

  if ((kind !== "mount" && kind !== "redirect") || matchPath === undefined) {
    return undefined;
  }

  const statusCode = redirectStatusCodeRecordValue(record, "statusCode");
  const appInstall = stringRecordValue(record, "appInstall");
  const matchHost = stringRecordValue(record, "matchHost");
  const matchPrefix = stringRecordValue(record, "matchPrefix");
  const preservePath = booleanRecordValue(record, "preservePath");
  const preserveQueryString = booleanRecordValue(record, "preserveQueryString");
  const providerConfig = stringRecordValue(record, "providerConfig");
  const surface = routeSurfaceRecordValue(record, "surface");
  const targetProfile = routeTargetProfileRecordValue(record, "targetProfile");
  const toHost = stringRecordValue(record, "toHost");
  const toUrl = stringRecordValue(record, "toUrl");

  return {
    id: record.id,
    enabled: booleanRecordValue(record, "enabled") ?? true,
    kind,
    matchPath,
    ...(appInstall === undefined ? {} : { appInstall }),
    ...(matchHost === undefined ? {} : { matchHost }),
    ...(matchPrefix === undefined ? {} : { matchPrefix }),
    ...(preservePath === undefined ? {} : { preservePath }),
    ...(preserveQueryString === undefined ? {} : { preserveQueryString }),
    ...(providerConfig === undefined ? {} : { providerConfig }),
    ...(statusCode === undefined ? {} : { statusCode }),
    ...(surface === undefined ? {} : { surface }),
    ...(targetProfile === undefined ? {} : { targetProfile }),
    ...(toHost === undefined ? {} : { toHost }),
    ...(toUrl === undefined ? {} : { toUrl }),
  };
}

function providerConfigProjectionRecordsFromStoredRecords(
  records: readonly StoredRecord[],
): ControlPlaneProviderConfigProjectionRecord[] {
  return records
    .filter(
      (record) =>
        !record.deletedAt &&
        record.entity === "provider-config-ref" &&
        stringRecordValue(record, "providerFamily") === "cloudflare",
    )
    .map((record) => {
      const workerName = stringRecordValue(record, "workerName");

      return {
        id: record.id,
        providerFamily: "cloudflare" as const,
        ...(workerName === undefined ? {} : { workerName }),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function redirectStatusCodeRecordValue(
  record: StoredRecord,
  fieldName: string,
): ControlPlaneRedirectStatusCode | `${ControlPlaneRedirectStatusCode}` | undefined {
  const value = record.values[fieldName];

  if (
    value === 301 ||
    value === 302 ||
    value === 303 ||
    value === 307 ||
    value === 308 ||
    value === "301" ||
    value === "302" ||
    value === "303" ||
    value === "307" ||
    value === "308"
  ) {
    return value;
  }

  return undefined;
}

function routeSurfaceRecordValue(
  record: StoredRecord,
  fieldName: string,
): ControlPlaneRouteProjectionRecord["surface"] | undefined {
  const value = stringRecordValue(record, fieldName);

  if (value === "admin" || value === "public-site" || value === "schema") {
    return value;
  }

  return undefined;
}

function routeTargetProfileRecordValue(
  record: StoredRecord,
  fieldName: string,
): ControlPlaneRouteProjectionRecord["targetProfile"] | undefined {
  const value = stringRecordValue(record, fieldName);

  if (value === "app" || value === "instance" || value === "public-site") {
    return value;
  }

  return undefined;
}

function routeHasProviderScope(route: ControlPlaneRouteProjectionRecord): boolean {
  return route.matchHost !== undefined && (route.kind === "redirect" || route.kind === "mount");
}

function routeCanProjectProviderResource(route: ControlPlaneRouteProjectionRecord): boolean {
  if (!route.enabled || route.matchHost === undefined) {
    return false;
  }

  if (route.kind === "redirect") {
    return true;
  }

  return (
    route.targetProfile === "app" ||
    route.targetProfile === "instance" ||
    route.targetProfile === "public-site"
  );
}

function destroyRouteProviderResourceHosts(resourceGraph: DeployResourceGraph): string[] {
  return [
    ...new Set(
      resourceGraph.resources
        .map((resource) => {
          const host = resource.inputs.host ?? resource.inputs.fromHost;

          return typeof host === "string" ? host : undefined;
        })
        .filter((host): host is string => host !== undefined),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

async function removeLocalWorkspaceDeployState(deploymentStateRoot: string): Promise<void> {
  await rm(deploymentStateRoot, { force: true, recursive: true });
}

async function copyLocalWorkspaceDeploySecretEnv(input: {
  adminToken: string;
  env: NodeJS.ProcessEnv | undefined;
  localSecretEnv: EnsureFormlessInstanceLocalSecretEnvResult;
  plan: FormlessInstanceDeploymentPlan;
}): Promise<void> {
  const current = await readTextFileIfExists(input.localSecretEnv.path);
  const values = parseDotEnv(current ?? "");

  values[ALCHEMY_PASSWORD_ENV_NAME] = input.localSecretEnv.secrets.ALCHEMY_PASSWORD;
  values[FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME] = input.adminToken;
  values.CLOUDFLARE_ACCOUNT_ID = input.plan.account.id;

  const cloudflareApiToken = optionalCloudflareApiToken(input.env);
  const alchemyProfile = input.env?.ALCHEMY_PROFILE?.trim();
  const alchemyStateToken = input.env?.ALCHEMY_STATE_TOKEN?.trim();

  if (alchemyProfile) {
    values.ALCHEMY_PROFILE = alchemyProfile;
  }

  if (cloudflareApiToken) {
    values.CLOUDFLARE_API_TOKEN = cloudflareApiToken;
  }

  if (alchemyStateToken) {
    values.ALCHEMY_STATE_TOKEN = alchemyStateToken;
  }

  await mkdir(path.dirname(input.localSecretEnv.path), { recursive: true });
  await writeFile(input.localSecretEnv.path, formatDotEnv(values));
}

async function writeLocalWorkspaceDeploymentState(input: {
  credentialProfile: string | null;
  deploymentStateRoot: string;
  plan: FormlessInstanceDeploymentPlan;
}): Promise<string> {
  const statePath = path.join(input.deploymentStateRoot, FORMLESS_INSTANCE_STATE_FILE);

  await mkdir(input.deploymentStateRoot, { recursive: true });
  await writeFile(
    statePath,
    formatFormlessInstanceState(
      createFormlessInstanceState({
        credentialProfile: input.credentialProfile,
        plan: input.plan,
      }),
    ),
  );

  return statePath;
}

async function writeLocalWorkspaceDeployTargetSource(input: {
  manifest: FormlessInstanceWorkspaceManifest;
  now: string;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
}) {
  const current = await readFormlessInstanceControlPlaneRecordSource({
    manifest: input.manifest,
    workspaceRoot: input.workspaceRoot,
  });
  const targetId = input.selectedTarget.alias;
  const existing = current?.records.find(
    (record) =>
      record.entity === "deploy-target" &&
      (record.id === targetId || stringRecordValue(record, "targetId") === targetId),
  );
  const deployTargetRecord: StoredRecord = {
    id: targetId,
    entity: "deploy-target",
    values: {
      ...existing?.values,
      targetId,
      targetKind: "instance",
      targetUrl: input.selectedTarget.url,
      label: stringRecordValue(existing, "label") ?? targetId,
      enabled: true,
      createdAt: stringRecordValue(existing, "createdAt") ?? input.now,
      updatedAt: input.now,
    },
    createdAt: existing?.createdAt ?? input.now,
  };
  const records = [
    ...(current?.records.filter(
      (record) =>
        !(
          record.entity === "deploy-target" &&
          (record.id === targetId || stringRecordValue(record, "targetId") === targetId)
        ),
    ) ?? []),
    deployTargetRecord,
  ];

  await writeFormlessInstanceControlPlaneRecordSource({
    controlPlane: {
      schemaKey: current?.schemaKey ?? INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
      schemaUpdatedAt: input.now,
      records,
    },
    manifest: input.manifest,
    workspaceRoot: input.workspaceRoot,
  });
}

async function createLocalWorkspaceOwnerSetup(input: {
  adminToken: string;
  deploymentUrl: string;
  randomToken: () => string;
  setupCapability: FormlessInstanceOwnerSetupCapabilityAdapter;
}): Promise<DeployLocalFormlessWorkspaceOwnerSetup> {
  const setupToken = generatedOwnerSetupToken(input.randomToken);
  const capability = await input.setupCapability.create({
    adminToken: input.adminToken,
    deploymentUrl: input.deploymentUrl,
    setupToken,
  });

  return {
    capability,
    url: formatFormlessOwnerSetupUrl({
      deploymentUrl: input.deploymentUrl,
      setupToken,
    }),
  };
}

function generatedOwnerSetupToken(randomToken: () => string): string {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return parseOwnerSetupToken(randomToken());
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function requiredGeneratedToken(value: string): string {
  const token = value.trim();

  if (token === "") {
    throw new Error("Generated Formless admin token must be a non-empty string.");
  }

  return token;
}

function missingAdminTokenMessage(action: "adopt" | "deploy"): string {
  return [
    action === "adopt"
      ? "Formless instance token adopt requires an admin token."
      : "Formless instance deploy requires an admin token.",
    action === "adopt"
      ? `Cloudflare Worker secrets cannot be read back; pass --admin-token or set ${FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME}.`
      : `Cloudflare Worker secrets cannot be read back; run \`formless instance token adopt\`, run \`formless instance token rotate\`, or set ${FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME}.`,
  ].join(" ");
}

function workspaceRootForInput(cwd: string, workspacePath = "."): string {
  return path.resolve(cwd, workspacePath);
}

function workspaceManifestPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE);
}

function defaultWorkspaceName(workspaceRoot: string): string {
  const basename = path.basename(workspaceRoot);
  const normalized = basename
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "formless-instance";
}

function relativeWorkspacePath(workspaceRoot: string, filePath: string): string {
  const relativePath = path.relative(workspaceRoot, filePath).split(path.sep).join("/");

  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith("../") ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Workspace archive path must be inside ${workspaceRoot}.`);
  }

  return relativePath;
}

function workerNameFromWorkersDevUrl(targetUrl: string | undefined): string | undefined {
  if (!targetUrl) {
    return undefined;
  }

  const host = new URL(normalizeFormlessInstanceWorkspaceTargetUrl(targetUrl)).hostname;
  const suffix = ".workers.dev";

  if (!host.endsWith(suffix)) {
    return undefined;
  }

  const withoutSuffix = host.slice(0, -suffix.length);
  const [workerName] = withoutSuffix.split(".");

  return workerName || undefined;
}

function defaultDevSourceCandidates(env: NodeJS.ProcessEnv | undefined): string[] {
  const port = env?.PORT && /^\d+$/.test(env.PORT) ? env.PORT : "5173";

  return [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
}

function forwardDevOutput(
  child: ChildProcessWithoutNullStreams,
  log: (message: string) => void,
  candidateOrigins: Set<string>,
) {
  const handleOutput = (chunk: Buffer) => {
    const text = chunk.toString();

    for (const origin of httpOriginsFromText(text)) {
      candidateOrigins.add(origin);
    }

    for (const line of text.split(/\r?\n/)) {
      if (line.length > 0) {
        log(line);
      }
    }
  };

  child.stdout.on("data", handleOutput);
  child.stderr.on("data", handleOutput);
}

async function waitForInstanceDevServer(
  child: ChildProcessWithoutNullStreams,
  fetcher: typeof fetch,
  candidateOrigins: Set<string>,
): Promise<string> {
  const startedAt = Date.now();
  let spawnError: Error | null = null;

  child.once("error", (error) => {
    spawnError = error;
  });

  while (Date.now() - startedAt < 30_000) {
    if (spawnError) {
      throw spawnError;
    }

    if (child.exitCode !== null) {
      throw new Error(`Formless instance dev server exited with code ${child.exitCode}.`);
    }

    for (const origin of candidateOrigins) {
      if (await isInstanceDevServerReady(fetcher, origin)) {
        return origin;
      }
    }

    await delay(250);
  }

  throw new Error("Timed out waiting for the Formless instance dev server.");
}

async function isInstanceDevServerReady(fetcher: typeof fetch, origin: string): Promise<boolean> {
  try {
    const response = await fetcher(instanceAppInstallsUrl(origin), {
      headers: {
        accept: "application/json",
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}

function httpOriginsFromText(text: string): string[] {
  const origins = new Set<string>();

  for (const match of text.matchAll(/https?:\/\/[^\s),]+/g)) {
    try {
      origins.add(new URL(match[0]).origin);
    } catch {
      // Ignore non-URL terminal fragments.
    }
  }

  return [...origins];
}

function waitForChildExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `Formless instance dev server exited with signal ${signal}.`
            : `Formless instance dev server exited with code ${code ?? "unknown"}.`,
        ),
      );
    });
  });
}

async function fetchWorkspaceJson<T>(fetcher: typeof fetch, url: string): Promise<T> {
  const response = await fetcher(url, { headers: { accept: "application/json" } });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Failed GET ${url}: HTTP ${response.status} ${text}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Failed GET ${url}: response was not JSON.`);
  }
}

function instanceAppInstallsUrl(origin: string): string {
  return new URL("/api/formless/app-installs", `${origin}/`).toString();
}

function restoreErrors(restore: RestorePortableArchiveResult): string {
  return restore.remote.errors?.map((error) => error.message).join("; ") || "unknown error";
}

function withoutAdminToken(env: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
  const nextEnv = { ...env };

  delete nextEnv.FORMLESS_ADMIN_TOKEN;
  return nextEnv;
}

function relativeDependencyPath(cwd: string, filePath: string): string {
  const relativePath = path.relative(cwd, filePath);

  return relativePath === "" ? "." : relativePath.split(path.sep).join("/");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  );
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

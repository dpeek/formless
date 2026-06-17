import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import type { Dirent } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  deployDeploymentAppliedSummary,
  deployDeploymentObservationPatch,
  deployDeploymentObservationPatchFromLatestStatus,
  deployDesiredStateDisplaySummary,
  deployDesiredStateProjectionInputFromControlPlaneRecords,
  deployDisplaySafeFailureSummary,
  deployLatestStatusDisplaySummary,
  projectDeployControlPlaneDesiredState,
  deployResourceCountsByKind,
  stableDeployJsonStringify,
  type DeployDesiredStateResponse,
  type DeployDesiredStateVersionRef,
  type DeployEvidenceSummary,
  type DeployFailureSummary,
  type DeployLatestStatus,
  type DeployLatestStatusDisplaySummary,
  type DeployDesiredStateProjectionInput,
  type DeployResourceGraph,
  type DeployResourceKind,
} from "@dpeek/formless-deploy";

import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  PORTABLE_ARCHIVE_MANIFEST_FILE,
  archiveApps,
  archiveRecordCount,
  parsePortableArchive,
  type AppArchive,
  type InstanceArchive,
  type InstanceArchiveControlPlane as ArchiveControlPlaneSnapshot,
  type PortableArchive,
} from "@dpeek/formless-archive";
import {
  writePortableArchiveDirectory,
  type ArchiveDiskMediaFile,
  type ArchiveDiskWriteResult,
} from "@dpeek/formless-archive/node";
import {
  CORE_IMAGE_KEY_PREFIX,
  CORE_MEDIA_ROUTE_PREFIX,
  coreImageMediaDeliveryFactsForAssetId,
  coreMediaHrefForKey,
  imageMediaContentTypeForKey,
  isRestorableImageMediaKey,
  type MediaAsset,
} from "@dpeek/formless-media";
import { packageAppFactsForKey, type AppInstall } from "@dpeek/formless-installed-apps";
import {
  bundledAppPackageManifests,
  findResolvedAppPackage,
  type AppPackageResolver,
} from "../shared/app-packages.ts";
import {
  normalizeInstanceDomainHost,
  type InstanceDomainMapping,
} from "../shared/instance-domain-mappings.ts";
import type { DomainProviderPlan } from "../shared/domain-provider-protocol.ts";
import {
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  formatInstanceControlPlaneBoundaryEntityName,
  instanceControlPlaneSchema,
  instanceControlPlaneDeploymentConfigObservedFields,
  isInstanceControlPlaneEntityName,
} from "@dpeek/formless-instance-control-plane";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { RecordValues, StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import { parseOwnerSetupToken, type AppInstallsResponse } from "../shared/protocol.ts";
import {
  FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME,
  formatRuntimeWorkspaceAppPackages,
} from "../shared/workspace-runtime-packages.ts";
import {
  CF_API_TOKEN_ENV_NAME,
  CLOUDFLARE_API_TOKEN_ENV_NAME,
  planCloudflareWorkerDomainPreflight,
  type CloudflareDomainClient,
  type CloudflareDomainIntent,
  type CloudflareDomainPreflightPlan,
  type CloudflareDomainPreflightPolicy,
} from "./cloudflare-domain-client.ts";
import {
  DEFAULT_INSTANCE_WORKSPACE_ARCHIVE_ROOT as DEFAULT_FORMLESS_INSTANCE_WORKSPACE_ARCHIVE_ROOT,
  DEFAULT_INSTANCE_WORKSPACE_APP_STATE_ROOT as DEFAULT_FORMLESS_INSTANCE_WORKSPACE_APP_STATE_ROOT,
  DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT as DEFAULT_FORMLESS_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
  INSTANCE_WORKSPACE_MANIFEST_FILE as FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE,
  LEGACY_INSTANCE_WORKSPACE_MANIFEST_FILES as LEGACY_FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILES,
  defaultInstanceWorkspaceManifest as defaultFormlessInstanceWorkspaceManifest,
  formatInstanceWorkspaceManifest as formatFormlessInstanceWorkspaceManifest,
  nextWorkspaceAutoSaveSavedState,
  normalizeInstanceWorkspaceTargetUrl as normalizeFormlessInstanceWorkspaceTargetUrl,
  parseInstanceWorkspaceManifestJson as parseFormlessInstanceWorkspaceManifestJson,
  type InstanceWorkspaceApp as FormlessInstanceWorkspaceApp,
  type InstanceWorkspaceDefaultAppPolicy as FormlessInstanceWorkspaceDefaultAppPolicy,
  type InstanceWorkspaceDomainIntent as FormlessInstanceWorkspaceDomainIntent,
  type InstanceWorkspaceManifest as FormlessInstanceWorkspaceManifest,
  type InstanceWorkspaceTarget as FormlessInstanceWorkspaceTarget,
} from "@dpeek/formless-workspace";
import {
  INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME as FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME,
  INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME as FORMLESS_INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME,
  INSTANCE_WORKSPACE_SECRET_STATE_FILE as FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_FILE,
  ensureInstanceWorkspaceLocalDevSecretState as ensureFormlessInstanceWorkspaceLocalDevSecretState,
  ensureInstanceWorkspaceSecretStateIgnored as ensureFormlessInstanceWorkspaceSecretStateIgnored,
  formatInstanceWorkspaceSecretState as formatFormlessInstanceWorkspaceSecretState,
  formatWorkspaceDotEnv as formatDotEnv,
  createWorkspaceAppPackageResolver,
  instanceWorkspaceAppStateRelativePath,
  instanceWorkspaceInstanceStateRelativePath,
  readInstanceWorkspaceAppStorageSnapshot,
  readInstanceWorkspaceAutoSaveState,
  readInstanceWorkspaceControlPlaneStorageSnapshot,
  instanceWorkspaceSecretStatePath as formlessInstanceWorkspaceSecretStatePath,
  parseWorkspaceDotEnv as parseDotEnv,
  readInstanceWorkspaceLocalDevSecretState as readFormlessInstanceWorkspaceLocalDevSecretState,
  readInstanceWorkspaceMediaFiles,
  readInstanceWorkspaceSecretState as readFormlessInstanceWorkspaceSecretState,
  replaceInstanceWorkspaceAppStorageSnapshots,
  replaceInstanceWorkspaceMediaFiles,
  resolveInstanceWorkspaceAdminToken as resolveFormlessInstanceWorkspaceAdminToken,
  writeInstanceWorkspaceAutoSaveState,
  writeInstanceWorkspaceControlPlaneStorageSnapshot,
  writeInstanceWorkspaceSecretState as writeFormlessInstanceWorkspaceSecretState,
  type InstanceWorkspaceLocalDevSecretState as FormlessInstanceWorkspaceLocalDevSecretState,
  type WorkspaceAppPackageResolverResult,
} from "@dpeek/formless-workspace/node";
import {
  deployDesiredStateVersionRef,
  type DeployDesiredStateVersionLike,
} from "@dpeek/formless-deploy/client";
import {
  patchFormlessInstanceDeploymentConfigObservation,
  readFormlessInstanceDeploymentDesiredState,
  readFormlessInstanceDeploymentStatus,
  readFormlessInstanceDomainMappings,
  readFormlessInstanceTargetStatus,
  type FormlessInstanceTargetStatus,
} from "./instance-target-client.ts";
import type { FormlessInstanceDeploymentObservationPatch } from "./instance-target-client.ts";
import {
  requireSiteCliTargetContext,
  resolveSiteCliTargetContext,
  siteCliTargetFetchHeaders,
  siteCliWorkspaceStatusSecretStateLabel,
} from "./instance-target-context.ts";
import {
  exportInstanceArchive,
  restorePortableArchive,
  restoreWorkspacePushArchive,
  type RestorePortableArchiveResult,
} from "./archive-workflows.ts";
import {
  isLegacySiteMediaHref,
  unsupportedLegacySiteMediaMessage,
} from "@dpeek/formless-site-app/node";
import {
  ALCHEMY_PASSWORD_ENV_NAME,
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
import {
  FORMLESS_ALCHEMY_DEFAULT_PROFILE,
  FORMLESS_ALCHEMY_PROFILE_REF_PREFIX,
} from "./instance-workspace-credential-setup.ts";
import { packageExecCommand } from "./package-commands.ts";
import {
  LOCAL_SESSION_BOOTSTRAP_API_PATH,
  LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
} from "@dpeek/formless-gateway";
import {
  startWorkspaceGatewaySidecar as startPackageWorkspaceGatewaySidecar,
  type WorkspaceGatewaySidecar,
} from "@dpeek/formless-gateway/sidecar";
import {
  createWorkspaceGatewayOperationHandlers,
  type StartWorkspaceGatewaySidecarDependencies,
} from "./workspace-gateway-runtime.ts";

const deploymentConfigObservedFieldSet = new Set<string>(
  instanceControlPlaneDeploymentConfigObservedFields,
);

type WorkspaceControlPlaneRecords = StorageSnapshot;

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
  adminToken?: string | null;
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
  dryRun?: boolean;
  targetAlias?: string | null;
  workspacePath?: string;
};

export type PullFormlessInstanceWorkspaceDependencies = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  now: () => string;
};

export type PullFormlessInstanceWorkspaceAppStateResult = {
  appCount: number;
  installId: string;
  mediaCount: number;
  recordCount: number;
  statePath: string;
  stateRoot: string;
};

export type PullFormlessInstanceWorkspaceReplacementPlan = {
  changedStatePaths: string[];
  prunedStatePaths: string[];
  status: "changes" | "no-changes";
};

export type PullFormlessInstanceWorkspaceResult = {
  appState: PullFormlessInstanceWorkspaceAppStateResult[];
  domains: FormlessInstanceWorkspaceDomainIntent[];
  instanceState: FormlessInstanceWorkspaceStateSummary;
  mode: "apply" | "dry-run";
  noop: boolean;
  replacement: PullFormlessInstanceWorkspaceReplacementPlan;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  syncPlan: FormlessInstanceWorkspaceSyncPlan;
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
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  now: () => string;
};

export type SaveLocalFormlessWorkspaceDependencies = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  now: () => string;
};

export type FormlessInstanceWorkspacePackageMismatch = {
  installId: string;
  localPackageAppKey: string;
  remotePackageAppKey: string;
};

export type FormlessInstanceWorkspaceSyncPlanChangedArea =
  | "apps"
  | "control-plane"
  | "domains"
  | "media"
  | "packages"
  | "records";

export type FormlessInstanceWorkspaceSyncPlanEndpoint = {
  appCount: number;
  controlPlaneRecordCount: number;
  domainCount: number;
  fingerprint: string;
  label: string;
  mediaCount: number;
  recordCount: number;
};

export type FormlessInstanceWorkspaceSyncPlan = {
  changedAreas: FormlessInstanceWorkspaceSyncPlanChangedArea[];
  changedStatePaths: string[];
  changedControlPlaneRecords: string[];
  changedDomainCount: number;
  domainDesiredDrift: FormlessInstanceWorkspaceDomainDesiredDrift[];
  changedMedia: string[];
  changedRecords: string[];
  extraInstalls: string[];
  missingInstalls: string[];
  packageMismatches: FormlessInstanceWorkspacePackageMismatch[];
  source: FormlessInstanceWorkspaceSyncPlanEndpoint;
  target: FormlessInstanceWorkspaceSyncPlanEndpoint;
  status: "changes" | "up-to-date";
};

export type CheckFormlessInstanceWorkspaceResult = {
  deploymentStatus?: DeployLatestStatusDisplaySummary;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  syncPlan: FormlessInstanceWorkspaceSyncPlan;
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

export type FormlessInstanceWorkspaceStateSummary = {
  appCount: number;
  mediaCount: number;
  recordCount: number;
  statePath: string;
};

export type SaveLocalFormlessWorkspaceAppStateSummary = FormlessInstanceWorkspaceStateSummary & {
  installId: string;
};

export type SaveLocalFormlessWorkspaceResult = {
  appState: SaveLocalFormlessWorkspaceAppStateSummary[];
  instanceState: FormlessInstanceWorkspaceStateSummary;
  manifest: FormlessInstanceWorkspaceManifest;
  manifestPath: string;
  mode: "check" | "write";
  source: string;
  workspaceRoot: string;
};

export type PushFormlessInstanceWorkspaceInput = {
  apply?: boolean;
  targetAlias?: string | null;
  targetOverride?: FormlessInstanceWorkspaceTarget;
  workspacePath?: string;
};

export type PushFormlessInstanceWorkspaceDependencies = {
  accountDiscovery: FormlessInstanceAccountDiscoveryAdapter;
  cwd: string;
  deploymentAdapter: FormlessInstanceDeploymentAdapter;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  healthCheck: FormlessInstanceDeploymentHealthCheckAdapter;
  localSecretEnv: FormlessInstanceLocalSecretEnvStore;
  now: () => string;
  packageRoot: string;
  packageVersion: string;
  randomToken: () => string;
  setupCapability: FormlessInstanceOwnerSetupCapabilityAdapter;
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
  deployment?: DeployFormlessInstanceResult;
  deploymentObservation?: DeployLocalFormlessWorkspaceObservation;
  deploymentStatePath?: string;
  deploymentStateRoot?: string;
  dryRun?: RestorePortableArchiveResult;
  healthCheck?: CheckFormlessInstanceDeployMetadataResult;
  localSecretEnv?: EnsureFormlessInstanceLocalSecretEnvResult;
  mode: "apply" | "dry-run";
  noop: boolean;
  ownerSetup?: DeployLocalFormlessWorkspaceOwnerSetup;
  plan?: FormlessInstanceDeploymentPlan;
  secretPath?: string;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  source: PushFormlessInstanceWorkspaceSource;
  syncPlan: FormlessInstanceWorkspaceSyncPlan;
  workspaceRoot: string;
};

export type RefreshFormlessInstanceDeploymentObservationInput = {
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type RefreshFormlessInstanceDeploymentObservationDependencies = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  now: () => string;
};

export type RefreshFormlessInstanceDeploymentObservationResult = {
  deploymentStatus: DeployLatestStatusDisplaySummary;
  observation: DeployLocalFormlessWorkspaceObservation;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type FormlessInstanceWorkspaceDevCommand = {
  args: string[];
  command: string;
  label: string;
};

export type DevFormlessInstanceWorkspaceInput = {
  name?: string | null;
  open?: boolean;
  workspacePath?: string;
};

export type EnsureFormlessInstanceWorkspaceDevBootstrapInput = {
  name?: string | null;
  workspacePath?: string;
};

export type EnsureFormlessInstanceWorkspaceDevBootstrapDependencies = {
  cwd: string;
  randomToken?: () => string;
  selectWorkspaceName?: (
    input: FormlessInstanceWorkspaceDevNameSelectionInput,
  ) => Promise<string | null | undefined>;
};

export type EnsureFormlessInstanceWorkspaceDevBootstrapResult = {
  gitignorePath: string;
  localDevSecretStatePath: string;
  localDevSecrets: FormlessInstanceWorkspaceLocalDevSecretState;
  localStateRoot: string;
  manifest: FormlessInstanceWorkspaceManifest;
  manifestPath: string;
  workspaceRoot: string;
};

export type FormlessInstanceWorkspaceDevNameSelectionInput = {
  defaultName: string;
  workspaceRoot: string;
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
  selectWorkspaceName?: EnsureFormlessInstanceWorkspaceDevBootstrapDependencies["selectWorkspaceName"];
  spawn: typeof nodeSpawn;
  startWorkspaceGatewaySidecar?: (
    input: {
      env?: NodeJS.ProcessEnv;
      workspaceRoot: string;
    },
    dependencies: StartWorkspaceGatewaySidecarDependencies,
  ) => Promise<WorkspaceGatewaySidecar>;
} & Partial<
  Pick<
    StartWorkspaceGatewaySidecarDependencies,
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
  workspaceAppPackages?: string;
  workspaceRoot: string;
};

export type PlanDeployFormlessInstanceWorkspaceDependencies = Pick<
  DeployFormlessInstanceWorkspaceDependencies,
  "cwd" | "packageVersion"
>;

export type PlanDeployFormlessInstanceWorkspaceResult = {
  credentialProfile: string | null;
  plan: FormlessInstanceDeploymentPlan;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceAppPackages?: string;
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

export type DeployLocalFormlessWorkspaceEvidenceSummary = {
  actionsByKind: Record<string, number>;
  count: number;
  logicalIds: string[];
  resourcesByKind: Record<string, number>;
};

export type DeployLocalFormlessWorkspaceObservation = {
  desiredState: DeployDesiredStateVersionRef;
  evidence: DeployLocalFormlessWorkspaceEvidenceSummary;
  evidenceCount: number;
  observedAt: string;
  observedError?: string;
  observedStatus: FormlessInstanceDeploymentObservationPatch["observedStatus"];
  observedSummary: string;
  resourceCount: number;
  resourcesByKind: Record<DeployResourceKind, number>;
  runnerId: string;
  targetId: string;
};

export type DeployFormlessInstanceWorkspaceResult = {
  deployment: DeployFormlessInstanceResult;
  deploymentObservation?: DeployLocalFormlessWorkspaceObservation;
  deploymentStateRoot: string;
  deploymentStatePath?: string;
  healthCheck: CheckFormlessInstanceDeployMetadataResult;
  localSecretEnv: EnsureFormlessInstanceLocalSecretEnvResult;
  ownerSetup?: DeployLocalFormlessWorkspaceOwnerSetup;
  plan: FormlessInstanceDeploymentPlan;
  push?: PushFormlessInstanceWorkspaceResult;
  secretPath: string;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type DeployLocalFormlessWorkspaceFailureStepId = "health-check";

export class DeployLocalFormlessWorkspaceStepError extends Error {
  readonly evidence: Record<string, boolean | number | string | null>;
  readonly expectedUrl: string;
  readonly retryGuidance: string;
  readonly stepId: DeployLocalFormlessWorkspaceFailureStepId;
  readonly stepLabel: string;

  constructor(input: {
    evidence: Record<string, boolean | number | string | null>;
    expectedUrl: string;
    retryGuidance: string;
    stepId: DeployLocalFormlessWorkspaceFailureStepId;
    stepLabel: string;
  }) {
    super(`${input.stepLabel} failed for ${input.expectedUrl}.`);
    this.name = "DeployLocalFormlessWorkspaceStepError";
    this.evidence = input.evidence;
    this.expectedUrl = input.expectedUrl;
    this.retryGuidance = input.retryGuidance;
    this.stepId = input.stepId;
    this.stepLabel = input.stepLabel;
  }
}

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
  env?: NodeJS.ProcessEnv;
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
  let archive: PortableArchive | undefined;
  let archiveDir: string | undefined;
  let archiveSourcePath: string | undefined;

  if (targetUrl) {
    manifest = withSingleTarget(manifest, { alias: targetAlias, url: targetUrl });
  }

  if (input.fromRemote) {
    if (!targetUrl) {
      throw new Error("Formless instance workspace remote init requires --target-url.");
    }

    remoteStatus = await readFormlessInstanceTargetStatus(
      {
        packageResolver: (await createActiveWorkspaceAppPackages(workspaceRoot)).resolver,
        targetUrl,
      },
      dependencies,
    );
    manifest = withRemoteStatus(manifest, remoteStatus);
  }

  if (input.fromArchive) {
    archiveDir = path.resolve(dependencies.cwd, input.fromArchive);
    archive = await readWorkspaceArchive(archiveDir);

    archiveSourcePath = relativeWorkspacePath(workspaceRoot, archiveDir);
    manifest = withArchiveSource(manifest, archive, archiveSourcePath);
  }

  await prepareWorkspaceDirectories(workspaceRoot, manifest);
  await writeFile(manifestPath, formatFormlessInstanceWorkspaceManifest(manifest));
  await writeInitialInstanceWorkspaceState({
    archive,
    archiveDir,
    manifest,
    remoteStatus,
    targetAlias,
    targetUrl,
    workspaceRoot,
  });
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
  const context = await resolveSiteCliTargetContext(
    {
      commandName: "status",
      cwd: dependencies.cwd,
      explicitAdminToken: input.adminToken,
      requireTarget: false,
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    { env: dependencies.env },
  );
  const activePackages = context.selectedTarget
    ? await createActiveWorkspaceAppPackages(context.workspaceRoot)
    : undefined;
  const remoteStatus = context.selectedTarget
    ? await readFormlessInstanceTargetStatus(
        {
          adminToken: context.adminToken,
          includeDeploymentStatus: input.includeDeploymentStatus,
          packageResolver: activePackages?.resolver,
          targetUrl: context.selectedTarget.url,
        },
        dependencies,
      )
    : undefined;

  return {
    manifest: context.manifest,
    manifestPath: context.manifestPath,
    ...(remoteStatus === undefined ? {} : { remoteStatus }),
    secretState: siteCliWorkspaceStatusSecretStateLabel(context),
    ...(context.selectedTarget === undefined ? {} : { selectedTarget: context.selectedTarget }),
    workspaceRoot: context.workspaceRoot,
  };
}

export async function pullFormlessInstanceWorkspace(
  input: PullFormlessInstanceWorkspaceInput,
  dependencies: PullFormlessInstanceWorkspaceDependencies,
): Promise<PullFormlessInstanceWorkspaceResult> {
  const context = await requireSiteCliTargetContext(
    {
      commandName: "pull",
      cwd: dependencies.cwd,
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    { env: dependencies.env },
  );
  const { adminToken, manifest, manifestPath, selectedTarget, workspaceRoot } = context;
  const activePackages = await createActiveWorkspaceAppPackages(workspaceRoot);
  const tempRoot = await createWorkspaceTempRoot(workspaceRoot, "pull");

  try {
    const instanceArchiveRoot = path.join(tempRoot, "instance");

    await exportInstanceArchive(
      {
        adminToken,
        outDir: instanceArchiveRoot,
        packageResolver: activePackages.resolver,
        target: selectedTarget.url,
      },
      dependencies,
    );
    const pulledInstanceArchive = await readArchiveDirectoryForCheck(instanceArchiveRoot);

    if (!pulledInstanceArchive || pulledInstanceArchive.archive.kind !== INSTANCE_ARCHIVE_KIND) {
      throw new Error("Formless instance pull did not write an instance archive.");
    }

    const pulledInstanceDirectory: WorkspaceInstanceArchiveDirectory = {
      ...pulledInstanceArchive,
      archive: pulledInstanceArchive.archive,
    };

    const localControlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest,
      workspaceRoot,
    });
    assertWorkspaceControlPlanePackagesAvailable({
      controlPlane: localControlPlane,
      operation: "check",
      packageResolver: activePackages.resolver,
    });
    const localDomainIntents = workspaceDomainIntentsFromSource(manifest, localControlPlane);
    const domains = await readLiveWorkspaceDomainIntents(
      { adminToken, target: selectedTarget },
      dependencies,
    );
    const domainDesiredDrift = shouldCompareWorkspaceDomainIntents(
      manifest,
      localDomainIntents,
      domains,
    )
      ? compareWorkspaceDomainIntentToLive(localDomainIntents, domains)
      : [];
    const localAppState = await readWorkspaceAppStateMapForCheck(
      workspaceRoot,
      manifest,
      localControlPlane,
      activePackages.resolver,
    );
    const syncPlan = createWorkspaceSyncPlan({
      domainDesiredDrift,
      localControlPlane,
      localAppState,
      localDomains: localDomainIntents,
      manifest,
      packageResolver: activePackages.resolver,
      remoteArchive: pulledInstanceDirectory,
      remoteDomains: domains,
      sourceLabel: selectedTarget.alias,
      sourceSide: "remote",
      targetLabel: "workspace",
    });
    const appState = pulledAppStateResults({
      archive: pulledInstanceArchive.archive,
      manifest,
      workspaceRoot,
    });
    const replacement = await pullWorkspaceReplacementPlan({
      localControlPlane,
      manifest,
      remoteArchive: pulledInstanceDirectory,
      syncPlan,
      workspaceRoot,
    });
    const instanceState: FormlessInstanceWorkspaceStateSummary = {
      appCount: pulledInstanceArchive.archive.apps.length,
      mediaCount: pulledInstanceArchive.archive.apps.reduce(
        (count, app) => count + app.media.objects.length,
        0,
      ),
      recordCount: pulledInstanceArchive.archive.controlPlane?.records.length ?? 0,
      statePath: path.join(workspaceRoot, instanceWorkspaceInstanceStateRelativePath(manifest)),
    };
    const noop = replacement.status === "no-changes";

    if (input.dryRun || noop) {
      return {
        appState,
        domains,
        instanceState,
        mode: input.dryRun ? "dry-run" : "apply",
        noop,
        replacement,
        selectedTarget,
        syncPlan,
        workspaceRoot,
      };
    }

    await prepareWorkspaceDirectories(workspaceRoot, manifest);
    await writeInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest,
      snapshot: pulledInstanceArchive.archive.controlPlane,
      sourceLabel: "Instance archive controlPlane",
      validationContext: "Instance archive controlPlane records",
      workspaceRoot,
    });

    const appSnapshots = pulledInstanceArchive.archive.apps.map((app) => ({
      installId: app.app.installId,
      snapshot: appStorageSnapshotFromArchive(app),
    }));

    await replaceInstanceWorkspaceAppStorageSnapshots({
      manifest,
      snapshots: appSnapshots,
      workspaceRoot,
    });
    await replaceInstanceWorkspaceMediaFiles({
      manifest,
      mediaFiles: pulledInstanceArchive.mediaFiles,
      workspaceRoot,
    });

    await writeFile(manifestPath, formatFormlessInstanceWorkspaceManifest(manifest));

    return {
      appState,
      domains,
      instanceState,
      mode: "apply",
      noop: false,
      replacement,
      selectedTarget,
      syncPlan,
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
  const context = await requireSiteCliTargetContext(
    {
      commandName: "check",
      cwd: dependencies.cwd,
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    { env: dependencies.env },
  );
  const { adminToken, manifest, selectedTarget, workspaceRoot } = context;
  const activePackages = await createActiveWorkspaceAppPackages(workspaceRoot);
  const tempRoot = await createWorkspaceTempRoot(workspaceRoot, "check");

  try {
    const remoteArchiveRoot = path.join(tempRoot, "instance");

    await exportInstanceArchive(
      {
        adminToken,
        outDir: remoteArchiveRoot,
        packageResolver: activePackages.resolver,
        target: selectedTarget.url,
      },
      dependencies,
    );

    const remoteArchive = await readArchiveDirectoryForCheck(remoteArchiveRoot);

    if (!remoteArchive || remoteArchive.archive.kind !== INSTANCE_ARCHIVE_KIND) {
      throw new Error("Formless instance check did not write a remote instance archive.");
    }

    const localControlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest,
      workspaceRoot,
    });
    assertWorkspaceControlPlanePackagesAvailable({
      controlPlane: localControlPlane,
      operation: "check",
      packageResolver: activePackages.resolver,
    });
    const localDomainIntents = workspaceDomainIntentsFromSource(manifest, localControlPlane);
    const liveDomains = await readLiveWorkspaceDomainIntents(
      { adminToken, target: selectedTarget },
      dependencies,
    );
    const deploymentStatus = await readFormlessInstanceDeploymentStatus(
      { adminToken, targetUrl: selectedTarget.url },
      dependencies,
    );
    const domainDesiredDrift = shouldCompareWorkspaceDomainIntents(
      manifest,
      localDomainIntents,
      liveDomains,
    )
      ? compareWorkspaceDomainIntentToLive(localDomainIntents, liveDomains)
      : [];
    const localAppState = await readWorkspaceAppStateMapForCheck(
      workspaceRoot,
      manifest,
      localControlPlane,
      activePackages.resolver,
    );

    return {
      deploymentStatus: deployLatestStatusDisplaySummary(deploymentStatus.status),
      syncPlan: createWorkspaceSyncPlan({
        domainDesiredDrift,
        localControlPlane,
        localAppState,
        localDomains: localDomainIntents,
        manifest,
        packageResolver: activePackages.resolver,
        remoteArchive,
        remoteDomains: liveDomains,
        sourceLabel: "workspace",
        sourceSide: "local",
        targetLabel: selectedTarget.alias,
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
  const activePackages = await createActiveWorkspaceAppPackages(workspaceRoot);
  const controlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest,
    workspaceRoot,
  });

  assertWorkspaceControlPlanePackagesAvailable({
    controlPlane,
    operation: "check",
    packageResolver: activePackages.resolver,
  });

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
  const activePackages = await createActiveWorkspaceAppPackages(workspaceRoot);
  const source = await resolveWorkspaceLocalSource({
    explicitSource: input.source,
    manifest,
    workspaceRoot,
  });
  const adminToken = await readWorkspaceLocalAuthorityAdminToken(
    workspaceRoot,
    manifest,
    dependencies,
  );
  const tempRoot = await createWorkspaceTempRoot(workspaceRoot, "save");

  try {
    const exported = await exportWorkspaceSourceFromLocalAuthority(
      {
        adminToken,
        packageResolver: activePackages.resolver,
        source,
        tempRoot,
      },
      dependencies,
    );
    const nextManifest = workspaceManifestFromSavedAuthoritySource(manifest, exported.archive);
    const currentControlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest: nextManifest,
      workspaceRoot,
    });
    const sourceControlPlane = savedAuthorityControlPlaneForWorkspaceSource({
      current: currentControlPlane,
      exported: exported.archive.controlPlane,
    });
    assertWorkspaceControlPlanePackagesAvailable({
      controlPlane: sourceControlPlane,
      operation: "save",
      packageResolver: activePackages.resolver,
    });
    const instanceStatePath = path.join(
      workspaceRoot,
      instanceWorkspaceInstanceStateRelativePath(nextManifest),
    );
    const appState = savedWorkspaceAppStateSummaries(workspaceRoot, nextManifest, exported);
    const result: SaveLocalFormlessWorkspaceResult = {
      appState,
      instanceState: {
        appCount: exported.archive.apps.length,
        mediaCount: exported.archive.apps.reduce(
          (count, app) => count + app.media.objects.length,
          0,
        ),
        recordCount: sourceControlPlane?.records.length ?? 0,
        statePath: instanceStatePath,
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
        packageResolver: activePackages.resolver,
        sourceControlPlane,
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
      sourceControlPlane,
      workspaceRoot,
    });
    await markWorkspaceAutoSaveSavedAfterWorkspaceSourceWrite({
      now: dependencies.now,
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
  const planned = await planDeployLocalFormlessWorkspace(
    {
      targetAlias: input.targetOverride?.alias ?? input.targetAlias,
      workspacePath: input.workspacePath,
    },
    dependencies,
  );
  const workspaceRoot = planned.workspaceRoot;
  const selectedTarget = input.targetOverride ?? planned.selectedTarget;
  const tempRoot = await createWorkspaceTempRoot(workspaceRoot, "push");
  const composedArchiveRoot = path.join(tempRoot, "archive");

  try {
    const exportedAt = dependencies.now();
    const providerApply =
      input.apply && planned.existingSelectedTarget === undefined
        ? await applyWorkspacePushProviderReconciliation(planned, dependencies)
        : undefined;
    const adminToken =
      providerApply?.adminToken ?? (await readWorkspaceAdminToken(workspaceRoot, dependencies));

    if (providerApply?.ownerSetup !== undefined) {
      await writeLocalWorkspaceDeploymentConfigSource({
        manifest: planned.manifest,
        now: dependencies.now(),
        plan: planned.plan,
        selectedTarget,
        workspaceRoot,
      });
    }

    const activePackages = await createActiveWorkspaceAppPackages(workspaceRoot);
    const localControlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest: planned.manifest,
      workspaceRoot,
    });
    assertWorkspaceControlPlanePackagesAvailable({
      controlPlane: localControlPlane,
      operation: "push",
      packageResolver: activePackages.resolver,
    });
    const localDomainIntents = workspaceDomainIntentsFromSource(
      planned.manifest,
      localControlPlane,
    );
    const liveDomains =
      planned.existingSelectedTarget === undefined
        ? []
        : await readLiveWorkspaceDomainIntents(
            {
              adminToken,
              target: selectedTarget,
            },
            dependencies,
          );
    const domainDesiredDrift = shouldCompareWorkspaceDomainIntents(
      planned.manifest,
      localDomainIntents,
      liveDomains,
    )
      ? compareWorkspaceDomainIntentToLive(localDomainIntents, liveDomains)
      : [];
    const localAppState = await readWorkspaceAppStateForPush(
      workspaceRoot,
      planned.manifest,
      localControlPlane,
      activePackages.resolver,
    );
    const source = await writeComposedWorkspacePushArchive({
      archiveRoot: composedArchiveRoot,
      appState: localAppState,
      controlPlane: localControlPlane,
      exportedAt,
    });
    const remoteArchive =
      planned.existingSelectedTarget === undefined
        ? emptyRemoteInstanceArchiveDirectory(exportedAt)
        : await readRemoteWorkspaceArchiveForPush(
            {
              adminToken,
              packageResolver: activePackages.resolver,
              remoteArchiveRoot: path.join(tempRoot, "remote-check"),
              selectedTarget,
            },
            dependencies,
          );
    const syncPlan = createWorkspaceSyncPlan({
      domainDesiredDrift,
      localControlPlane,
      localAppState: new Map(localAppState.map((state) => [state.appArchive.app.installId, state])),
      localDomains: localDomainIntents,
      manifest: planned.manifest,
      packageResolver: activePackages.resolver,
      remoteArchive,
      remoteDomains: liveDomains,
      sourceLabel: "workspace",
      sourceSide: "local",
      targetLabel: selectedTarget.alias,
    });

    if (syncPlan.status === "up-to-date") {
      return {
        mode: input.apply ? "apply" : "dry-run",
        noop: true,
        selectedTarget,
        source,
        syncPlan,
        workspaceRoot,
      };
    }

    const backup = input.apply
      ? planned.existingSelectedTarget === undefined
        ? undefined
        : await exportInstanceArchive(
            {
              adminToken: providerApply?.adminToken ?? adminToken,
              outDir: workspacePushBackupPath(workspaceRoot, dependencies.now()),
              packageResolver: activePackages.resolver,
              target: selectedTarget.url,
            },
            dependencies,
          )
      : undefined;
    const dryRunBeforeProvider = planned.existingSelectedTarget !== undefined;
    const dryRun =
      !input.apply || dryRunBeforeProvider
        ? await restoreWorkspacePushArchive(
            {
              adminToken: providerApply?.adminToken ?? adminToken,
              apply: false,
              archiveDir: composedArchiveRoot,
              target: selectedTarget.url,
            },
            dependencies,
          )
        : undefined;

    if (input.apply && dryRun && !dryRun.remote.ok) {
      throw new Error("Formless instance push apply stopped because dry-run restore failed.");
    }

    const provider =
      input.apply && providerApply === undefined
        ? await applyWorkspacePushProviderReconciliation(planned, dependencies)
        : providerApply;
    const firstApplyDryRun =
      input.apply && dryRun === undefined
        ? await restoreWorkspacePushArchive(
            {
              adminToken: provider?.adminToken ?? adminToken,
              apply: false,
              archiveDir: composedArchiveRoot,
              target: selectedTarget.url,
            },
            dependencies,
          )
        : undefined;
    const restoreDryRun = dryRun ?? firstApplyDryRun;

    if (input.apply && restoreDryRun && !restoreDryRun.remote.ok) {
      throw new Error("Formless instance push apply stopped because dry-run restore failed.");
    }

    const applyResult = input.apply
      ? await restoreWorkspacePushArchive(
          {
            adminToken: provider?.adminToken ?? adminToken,
            apply: true,
            archiveDir: composedArchiveRoot,
            target: selectedTarget.url,
          },
          dependencies,
        )
      : undefined;
    const deploymentObservation =
      provider === undefined
        ? undefined
        : await writeLocalWorkspaceDeploymentObservation(
            {
              adminToken: provider.adminToken,
              desiredState: planned.desiredState,
              observedStatus: "deployed",
              resourceEvidence: provider.deployment.resourceEvidence ?? [],
              summary: deployDeploymentAppliedSummary({
                resourceCount: planned.desiredState.resourceCount,
                sourceLabel: "workspace source",
              }),
              targetUrl: provider.deployment.url,
            },
            dependencies,
          );

    return {
      ...(applyResult === undefined ? {} : { applyResult }),
      ...(backup === undefined ? {} : { backup }),
      ...(provider === undefined
        ? {}
        : {
            deployment: provider.deployment,
            ...(deploymentObservation === undefined ? {} : { deploymentObservation }),
            deploymentStatePath: provider.deploymentStatePath,
            deploymentStateRoot: provider.deploymentStateRoot,
            healthCheck: provider.healthCheck,
            localSecretEnv: provider.localSecretEnv,
            ...(provider.ownerSetup === undefined ? {} : { ownerSetup: provider.ownerSetup }),
            plan: planned.plan,
            secretPath: provider.secretPath,
          }),
      ...(restoreDryRun === undefined ? {} : { dryRun: restoreDryRun }),
      mode: input.apply ? "apply" : "dry-run",
      noop: false,
      selectedTarget,
      source,
      syncPlan,
      workspaceRoot,
    };
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

type WorkspacePushProviderReconciliationResult = {
  adminToken: string;
  deployment: DeployFormlessInstanceResult;
  deploymentStatePath: string;
  deploymentStateRoot: string;
  healthCheck: CheckFormlessInstanceDeployMetadataResult;
  localSecretEnv: EnsureFormlessInstanceLocalSecretEnvResult;
  ownerSetup?: DeployLocalFormlessWorkspaceOwnerSetup;
  secretPath: string;
};

async function applyWorkspacePushProviderReconciliation(
  planned: PlanDeployLocalFormlessWorkspaceResult,
  dependencies: PushFormlessInstanceWorkspaceDependencies,
): Promise<WorkspacePushProviderReconciliationResult> {
  const workspaceRoot = planned.workspaceRoot;
  const secretState = await readFormlessInstanceWorkspaceSecretState(workspaceRoot);
  let adminToken = resolveFormlessInstanceWorkspaceAdminToken({
    env: dependencies.env,
    secretState,
  });

  await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);

  if (!adminToken) {
    if (planned.existingSelectedTarget !== undefined) {
      throw new Error(missingAdminTokenMessage("push"));
    }

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
    credentialProfile: planned.credentialProfile,
    credentialProfileFromConfig: planned.credentialProfileFromConfig,
    env: dependencies.env,
    localSecretEnv,
    plan: planned.plan,
  });

  const deploymentSecrets = await readDestroyLocalDeploySecretEnv({
    deploymentStateRoot,
    env: dependencies.env,
  });
  const deploymentStatePath = await writeLocalWorkspaceDeploymentState({
    credentialProfile: planned.credentialProfile,
    deploymentStateRoot,
    plan: planned.plan,
  });

  try {
    const deploymentResult = await dependencies.deploymentAdapter.deploy({
      credentialProfile: planned.credentialProfile,
      deploymentResourceGraph: planned.desiredState.resourceGraph,
      packageRoot: dependencies.packageRoot,
      plan: planned.plan,
      secrets: {
        ALCHEMY_PASSWORD: deploymentSecrets.secrets.ALCHEMY_PASSWORD,
        ...(deploymentSecrets.secrets.CLOUDFLARE_API_TOKEN === undefined
          ? {}
          : { CLOUDFLARE_API_TOKEN: deploymentSecrets.secrets.CLOUDFLARE_API_TOKEN }),
        FORMLESS_ADMIN_TOKEN: adminToken,
      },
      stateRoot: deploymentStateRoot,
      ...(planned.workspaceAppPackages === undefined
        ? {}
        : { workspaceAppPackages: planned.workspaceAppPackages }),
    });
    const deploymentUrl = normalizeFormlessInstanceWorkspaceTargetUrl(deploymentResult.url);

    if (deploymentUrl !== planned.plan.expectedUrl.url) {
      throw new Error(
        `Formless push provider reconciliation returned ${deploymentUrl}, expected target ${planned.plan.expectedUrl.url}.`,
      );
    }

    const healthCheck = await checkLocalWorkspaceDeploymentHealth({
      dependencies,
      deploymentUrl,
      plan: planned.plan,
      selectedTarget: planned.selectedTarget,
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

    return {
      adminToken,
      deployment: {
        ...deploymentResult,
        url: deploymentUrl,
      },
      deploymentStatePath,
      deploymentStateRoot,
      healthCheck,
      localSecretEnv,
      ...(ownerSetup === undefined ? {} : { ownerSetup }),
      secretPath: formlessInstanceWorkspaceSecretStatePath(workspaceRoot),
    };
  } catch (error) {
    await tryWriteLocalWorkspaceDeploymentFailureObservation(
      {
        adminToken,
        desiredState: planned.desiredState,
        error,
        targetUrl: planned.selectedTarget.url,
      },
      dependencies,
    );

    throw error;
  }
}

async function readRemoteWorkspaceArchiveForPush(
  input: {
    adminToken: string | null;
    packageResolver: AppPackageResolver;
    remoteArchiveRoot: string;
    selectedTarget: FormlessInstanceWorkspaceTarget;
  },
  dependencies: Pick<PushFormlessInstanceWorkspaceDependencies, "cwd" | "fetch" | "now">,
): Promise<WorkspaceArchiveDirectory> {
  await exportInstanceArchive(
    {
      adminToken: input.adminToken,
      outDir: input.remoteArchiveRoot,
      packageResolver: input.packageResolver,
      target: input.selectedTarget.url,
    },
    dependencies,
  );

  const remoteArchive = await readArchiveDirectoryForCheck(input.remoteArchiveRoot);

  if (!remoteArchive || remoteArchive.archive.kind !== INSTANCE_ARCHIVE_KIND) {
    throw new Error("Formless instance push could not read remote archive state.");
  }

  return remoteArchive;
}

function emptyRemoteInstanceArchiveDirectory(exportedAt: string): WorkspaceArchiveDirectory {
  const controlPlane = workspaceControlPlaneSnapshotFromRecords({
    current: undefined,
    exportedAt,
    records: [],
    schemaUpdatedAt: exportedAt,
  });

  return {
    archive: {
      kind: INSTANCE_ARCHIVE_KIND,
      version: ARCHIVE_VERSION,
      exportedAt,
      capabilities: [
        "installed-app-registry",
        "schema-owned-control-plane",
        "app-store-snapshots",
        "core-media-assets",
      ],
      restorePolicy: { dryRun: true, installCollisions: "reject" },
      controlPlane,
      apps: [],
    },
    archivePath: "",
    mediaFiles: [],
    missingMediaFiles: [],
  };
}

export async function refreshFormlessInstanceDeploymentObservation(
  input: RefreshFormlessInstanceDeploymentObservationInput,
  dependencies: RefreshFormlessInstanceDeploymentObservationDependencies,
): Promise<RefreshFormlessInstanceDeploymentObservationResult> {
  const workspaceRoot = await resolveFormlessInstanceWorkspaceRoot({
    cwd: dependencies.cwd,
    workspacePath: input.workspacePath,
  });
  const { manifest } = await readWorkspaceManifest(workspaceRoot);
  const selectedTarget = await requireWorkspaceTarget({
    commandName: "deployment refresh",
    manifest,
    targetAlias: input.targetAlias,
    workspaceRoot,
  });
  const adminToken = await readWorkspaceAdminToken(workspaceRoot, dependencies);

  if (!adminToken) {
    throw new Error(
      "Formless instance deployment refresh requires an admin token; run `formless instance token adopt` or pass FORMLESS_ADMIN_TOKEN.",
    );
  }

  const desiredStateResponse = await readFormlessInstanceDeploymentDesiredState(
    {
      adminToken,
      targetId: selectedTarget.alias,
      targetUrl: selectedTarget.url,
    },
    dependencies,
  );
  const statusResponse = await readFormlessInstanceDeploymentStatus(
    {
      adminToken,
      targetId: selectedTarget.alias,
      targetUrl: selectedTarget.url,
    },
    dependencies,
  );
  const observation = await patchDeploymentStatusObservation(
    {
      adminToken,
      desiredState: desiredStateResponse.desiredState,
      status: statusResponse.status,
      targetUrl: selectedTarget.url,
    },
    dependencies,
  );

  return {
    deploymentStatus: deployLatestStatusDisplaySummary(statusResponse.status),
    observation,
    selectedTarget,
    workspaceRoot,
  };
}

export async function runFormlessInstanceWorkspaceDev(
  input: DevFormlessInstanceWorkspaceInput,
  dependencies: DevFormlessInstanceWorkspaceDependencies,
): Promise<void> {
  const devBootstrap = await ensureFormlessInstanceWorkspaceDevBootstrap(input, dependencies);
  const { localDevSecrets, localStateRoot, manifest, workspaceRoot } = devBootstrap;
  const activePackages = await createActiveWorkspaceAppPackages(workspaceRoot);
  const controlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest,
    workspaceRoot,
  });

  if (controlPlane !== undefined) {
    await readRequiredWorkspaceAppState({
      controlPlane,
      manifest,
      operation: "local dev",
      packageResolver: activePackages.resolver,
      workspaceRoot,
    });
  }

  const candidateOrigins = new Set<string>();

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
          localDevSecrets,
          localSessionBootstrapToken,
          workspaceAppPackages: runtimeWorkspaceAppPackagesEnvValue(activePackages),
        },
      ),
      stdio: "pipe",
    });

    forwardDevOutput(child, dependencies.log, candidateOrigins);

    const source = await waitForInstanceDevServer(
      child,
      dependencies.fetch,
      candidateOrigins,
      localDevSecrets.adminToken,
    );
    const bootstrap = await bootstrapWorkspaceLocalInstance(
      {
        adminToken: localDevSecrets.adminToken,
        activePackages,
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
        `Workspace storage restored: ${bootstrap.sourceKind} (${bootstrap.appCount} apps, ${bootstrap.recordCount} records, ${bootstrap.mediaCount} media).`,
      );
    } else if (bootstrap.status === "existing") {
      dependencies.log(
        `Workspace storage restore skipped: local installs already exist (${bootstrap.installIds.join(", ") || "none"}).`,
      );
    } else {
      dependencies.log("Workspace storage restore skipped: no workspace state found.");
    }

    await waitForChildExit(child);
  } catch (error) {
    child?.kill();
    throw error;
  } finally {
    await sidecar.close();
  }
}

export async function ensureFormlessInstanceWorkspaceDevBootstrap(
  input: EnsureFormlessInstanceWorkspaceDevBootstrapInput,
  dependencies: EnsureFormlessInstanceWorkspaceDevBootstrapDependencies,
): Promise<EnsureFormlessInstanceWorkspaceDevBootstrapResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const manifestPath = workspaceManifestPath(workspaceRoot);
  let manifest: FormlessInstanceWorkspaceManifest;

  await assertNoLegacyWorkspaceManifest(workspaceRoot);

  if (await pathExists(manifestPath)) {
    manifest = parseFormlessInstanceWorkspaceManifestJson(await readFile(manifestPath, "utf8"));
  } else {
    await assertLocalOnboardingWorkspaceReady(workspaceRoot);
    await mkdir(workspaceRoot, { recursive: true });

    const defaultName = input.name ?? defaultWorkspaceName(workspaceRoot);
    manifest = defaultFormlessInstanceWorkspaceManifest({
      name:
        input.name ??
        (await selectFormlessInstanceWorkspaceDevName(
          { defaultName, workspaceRoot },
          dependencies,
        )),
    });
    await writeFile(manifestPath, formatFormlessInstanceWorkspaceManifest(manifest));
  }

  const localStateRoot = formlessInstanceWorkspaceLocalStateRoot(workspaceRoot, manifest);
  const localDevSecrets = await ensureFormlessInstanceWorkspaceLocalDevSecretState(
    workspaceRoot,
    localStateRoot,
    () => requiredGeneratedToken(dependencies.randomToken?.() ?? randomWorkspaceGatewayToken()),
  );
  const gitignorePath = await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);

  return {
    gitignorePath,
    localDevSecretStatePath: localDevSecrets.path,
    localDevSecrets: localDevSecrets.state,
    localStateRoot,
    manifest,
    manifestPath,
    workspaceRoot,
  };
}

async function selectFormlessInstanceWorkspaceDevName(
  input: FormlessInstanceWorkspaceDevNameSelectionInput,
  dependencies: Pick<
    EnsureFormlessInstanceWorkspaceDevBootstrapDependencies,
    "selectWorkspaceName"
  >,
): Promise<string> {
  const selected = await dependencies.selectWorkspaceName?.(input);
  const trimmed = selected?.trim();

  return trimmed ? trimmed : input.defaultName;
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
    credentialProfile: planned.credentialProfile,
    credentialProfileFromConfig: planned.credentialProfileFromConfig,
    env: dependencies.env,
    localSecretEnv,
    plan: planned.plan,
  });

  const deploymentSecrets = await readDestroyLocalDeploySecretEnv({
    deploymentStateRoot,
    env: dependencies.env,
  });

  const deploymentStatePath = await writeLocalWorkspaceDeploymentState({
    credentialProfile: planned.credentialProfile,
    deploymentStateRoot,
    plan: planned.plan,
  });
  try {
    const deployment = await dependencies.deploymentAdapter.deploy({
      credentialProfile: planned.credentialProfile,
      deploymentResourceGraph: planned.desiredState.resourceGraph,
      packageRoot: dependencies.packageRoot,
      plan: planned.plan,
      secrets: {
        ALCHEMY_PASSWORD: deploymentSecrets.secrets.ALCHEMY_PASSWORD,
        ...(deploymentSecrets.secrets.CLOUDFLARE_API_TOKEN === undefined
          ? {}
          : { CLOUDFLARE_API_TOKEN: deploymentSecrets.secrets.CLOUDFLARE_API_TOKEN }),
        FORMLESS_ADMIN_TOKEN: adminToken,
      },
      stateRoot: deploymentStateRoot,
      ...(planned.workspaceAppPackages === undefined
        ? {}
        : { workspaceAppPackages: planned.workspaceAppPackages }),
    });
    const deploymentUrl = normalizeFormlessInstanceWorkspaceTargetUrl(deployment.url);

    if (deploymentUrl !== planned.plan.expectedUrl.url) {
      throw new Error(
        `Formless provider reconciliation returned ${deploymentUrl}, expected target ${planned.plan.expectedUrl.url}.`,
      );
    }

    const healthCheck = await checkLocalWorkspaceDeploymentHealth({
      dependencies,
      deploymentUrl,
      plan: planned.plan,
      selectedTarget: planned.selectedTarget,
    });

    await writeLocalWorkspaceDeploymentConfigSource({
      manifest: planned.manifest,
      now: dependencies.now(),
      plan: planned.plan,
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
    const deploymentObservation = await writeLocalWorkspaceDeploymentObservation(
      {
        adminToken,
        desiredState: planned.desiredState,
        observedStatus: "deployed",
        resourceEvidence: deployment.resourceEvidence ?? [],
        summary: deployDeploymentAppliedSummary({
          resourceCount: planned.desiredState.resourceCount,
          sourceLabel: "workspace source",
        }),
        targetUrl: deploymentUrl,
      },
      dependencies,
    );

    return {
      deployment: {
        url: deploymentUrl,
      },
      deploymentObservation,
      deploymentStatePath,
      deploymentStateRoot,
      healthCheck,
      localSecretEnv,
      ...(ownerSetup === undefined ? {} : { ownerSetup }),
      plan: planned.plan,
      secretPath: formlessInstanceWorkspaceSecretStatePath(workspaceRoot),
      selectedTarget: planned.selectedTarget,
      workspaceRoot,
    };
  } catch (error) {
    await tryWriteLocalWorkspaceDeploymentFailureObservation(
      {
        adminToken,
        desiredState: planned.desiredState,
        error,
        targetUrl: planned.selectedTarget.url,
      },
      dependencies,
    );

    throw error;
  }
}

async function writeLocalWorkspaceDeploymentObservation(
  input: {
    adminToken: string;
    desiredState: LocalWorkspaceDeploymentDesiredState;
    observedError?: string;
    observedStatus: FormlessInstanceDeploymentObservationPatch["observedStatus"];
    resourceEvidence: DeployEvidenceSummary[];
    summary: string;
    targetUrl: string;
  },
  dependencies: Pick<DeployLocalFormlessWorkspaceDependencies, "fetch" | "now">,
): Promise<DeployLocalFormlessWorkspaceObservation> {
  const runtimeDesiredState = await readFormlessInstanceDeploymentDesiredState(
    {
      adminToken: input.adminToken,
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
  const observation = deployDeploymentObservationPatch({
    desiredState,
    observedAt: dependencies.now(),
    observedError: input.observedError,
    observedStatus: input.observedStatus,
    observedSummary: input.summary,
    runnerId,
  });
  const observedError =
    typeof observation.observedError === "string" ? observation.observedError : undefined;

  await patchFormlessInstanceDeploymentConfigObservation(
    {
      adminToken: input.adminToken,
      observation,
      targetId: desiredState.targetId,
      targetUrl: input.targetUrl,
    },
    dependencies,
  );

  return {
    desiredState,
    evidence: summarizeLocalWorkspaceDeploymentEvidence(input.resourceEvidence),
    evidenceCount: input.resourceEvidence.length,
    observedAt: observation.observedAt,
    ...(observedError === undefined ? {} : { observedError }),
    observedStatus: observation.observedStatus,
    observedSummary: observation.observedSummary ?? "",
    resourceCount: runtimeDesiredState.desiredState.display.resourceCount,
    resourcesByKind: runtimeDesiredState.desiredState.display.resourcesByKind,
    runnerId,
    targetId: desiredState.targetId,
  };
}

async function tryWriteLocalWorkspaceDeploymentFailureObservation(
  input: {
    adminToken: string;
    desiredState: LocalWorkspaceDeploymentDesiredState;
    error: unknown;
    targetUrl: string;
  },
  dependencies: Pick<DeployLocalFormlessWorkspaceDependencies, "fetch" | "now">,
): Promise<void> {
  const failure = localWorkspaceDeployFailureSummary(input.error);

  try {
    await writeLocalWorkspaceDeploymentObservation(
      {
        adminToken: input.adminToken,
        desiredState: input.desiredState,
        observedError: failure.displayMessage,
        observedStatus: "failed",
        resourceEvidence: [],
        summary: failure.displayMessage,
        targetUrl: input.targetUrl,
      },
      dependencies,
    );
  } catch {
    // Preserve the original deploy failure; observation writes are best effort on failure paths.
  }
}

async function checkLocalWorkspaceDeploymentHealth(input: {
  dependencies: Pick<DeployLocalFormlessWorkspaceDependencies, "healthCheck">;
  deploymentUrl: string;
  plan: FormlessInstanceDeploymentPlan;
  selectedTarget: FormlessInstanceWorkspaceTarget;
}): Promise<CheckFormlessInstanceDeployMetadataResult> {
  try {
    return await input.dependencies.healthCheck.check({
      expectedVersion: input.plan.packageVersion,
      url: input.deploymentUrl,
    });
  } catch {
    throw new DeployLocalFormlessWorkspaceStepError({
      evidence: {
        deploymentUrl: input.deploymentUrl,
        expectedVersion: input.plan.packageVersion,
        expectedUrl: input.plan.expectedUrl.url,
        providerFamily: "cloudflare",
        targetAlias: input.selectedTarget.alias,
        targetKind: "workers.dev",
        workerName: input.plan.resources.worker.name,
      },
      expectedUrl: input.plan.expectedUrl.url,
      retryGuidance:
        "Retry push after provider propagation, then check the Worker runtime and deploy metadata endpoint if the health check still fails.",
      stepId: "health-check",
      stepLabel: "Health check",
    });
  }
}

async function patchDeploymentStatusObservation(
  input: {
    adminToken: string;
    desiredState: DeployDesiredStateResponse["desiredState"];
    status: DeployLatestStatus;
    targetUrl: string;
  },
  dependencies: Pick<RefreshFormlessInstanceDeploymentObservationDependencies, "fetch" | "now">,
): Promise<DeployLocalFormlessWorkspaceObservation> {
  const desiredState = deployDesiredStateVersionRef(
    input.desiredState as DeployDesiredStateVersionLike,
  );
  const observation = deployDeploymentObservationPatchFromLatestStatus({
    desiredState,
    fallbackRunnerId: "local-gateway",
    status: input.status,
  });
  const observedError =
    typeof observation.observedError === "string" ? observation.observedError : undefined;
  const runnerId = observation.observedRunnerId ?? "local-gateway";

  await patchFormlessInstanceDeploymentConfigObservation(
    {
      adminToken: input.adminToken,
      observation,
      targetId: desiredState.targetId,
      targetUrl: input.targetUrl,
    },
    dependencies,
  );

  return {
    desiredState,
    evidence: summarizeLocalWorkspaceDeploymentEvidence([]),
    evidenceCount: 0,
    observedAt: observation.observedAt,
    ...(observedError === undefined ? {} : { observedError }),
    observedStatus: observation.observedStatus,
    observedSummary: observation.observedSummary ?? "",
    resourceCount: input.desiredState.display.resourceCount,
    resourcesByKind: input.desiredState.display.resourcesByKind,
    runnerId,
    targetId: desiredState.targetId,
  };
}

function summarizeLocalWorkspaceDeploymentEvidence(
  evidence: readonly DeployEvidenceSummary[],
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
  runtime: DeployDesiredStateResponse["desiredState"];
}): void {
  if (input.runtime.targetId !== input.local.targetId) {
    throw new Error(
      `Local push provider desired-state target "${input.local.targetId}" did not match runtime target "${input.runtime.targetId}".`,
    );
  }

  const localDisplay = deployDesiredStateDisplaySummary(input.local.resourceGraph);

  if (input.runtime.display.resourceCount !== localDisplay.resourceCount) {
    throw new Error(
      `Local push provider desired-state resource count ${localDisplay.resourceCount} did not match runtime resource count ${input.runtime.display.resourceCount}.`,
    );
  }

  if (
    stableDeployJsonStringify(input.runtime.display.resourcesByKind) !==
    stableDeployJsonStringify(localDisplay.resourcesByKind)
  ) {
    throw new Error("Local push provider desired-state resource kinds did not match runtime.");
  }
}

function localWorkspaceDeployFailureSummary(_error: unknown): DeployFailureSummary {
  return deployDisplaySafeFailureSummary({
    code: "local-gateway-deploy-apply-failed",
    displayMessage: "Local workspace push provider reconciliation failed.",
  });
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
  const controlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest,
    workspaceRoot,
  });
  const activePackages = await createActiveWorkspaceAppPackages(workspaceRoot);
  assertWorkspaceControlPlanePackagesAvailable({
    controlPlane,
    operation: "deploy",
    packageResolver: activePackages.resolver,
  });
  const deploymentSource = selectLocalWorkspaceDeploymentSource(controlPlane, input.targetAlias, {
    commandName: "push",
  });

  if (deploymentSource.deploymentConfig === undefined) {
    throw new Error(
      "Formless instance push requires an enabled instance deployment-config record.",
    );
  }

  const configuredSelectedTarget =
    deploymentSource.deploymentConfig === undefined
      ? undefined
      : workspaceTargetFromDeploymentConfig(deploymentSource.deploymentConfig, "push");
  let existingSelectedTarget = configuredSelectedTarget;
  let preflight: CheckFormlessInstanceWorkspaceResult | undefined;

  if (configuredSelectedTarget) {
    try {
      preflight = await checkFormlessInstanceWorkspace(
        {
          targetAlias: configuredSelectedTarget.alias,
          workspacePath: workspaceRoot,
        },
        dependencies,
      );
    } catch (error) {
      if (!isMissingWorkersDevScriptError(error)) {
        throw error;
      }

      existingSelectedTarget = undefined;
    }
  }

  const account = await resolveLocalWorkspaceDeploymentAccount({
    accountDiscovery: dependencies.accountDiscovery,
    credentialProfile: deploymentSource.credentialProfile,
    deploymentConfig: deploymentSource.deploymentConfig,
  });
  const planned = planLocalWorkspaceDeployment({
    account,
    adoptExistingDeployment: existingSelectedTarget !== undefined,
    credentialProfile: deploymentSource.credentialProfile,
    deploymentConfig: deploymentSource.deploymentConfig,
    manifest,
    packageVersion: dependencies.packageVersion,
    targetAlias: input.targetAlias,
  });
  const desiredState = projectLocalWorkspaceDeploymentDesiredState({
    controlPlane,
    plan: planned.plan,
    targetId: planned.selectedTarget.alias,
  });
  const workspaceAppPackages = runtimeWorkspaceAppPackagesEnvValue(activePackages);

  return {
    ...planned,
    desiredState,
    ...(existingSelectedTarget === undefined ? {} : { existingSelectedTarget }),
    manifestPath,
    ...(preflight === undefined ? {} : { preflight }),
    ...(workspaceAppPackages === undefined ? {} : { workspaceAppPackages }),
    workspaceRoot,
  };
}

function isMissingWorkersDevScriptError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

  return (
    message.includes("workers_dev_script_not_found") ||
    (message.includes("error 1042") && message.includes("no workers script"))
  );
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
    credentialProfile: planned.credentialProfile,
    packageRoot: dependencies.packageRoot,
    plan,
    secrets: {
      ALCHEMY_PASSWORD: localSecretEnv.secrets.ALCHEMY_PASSWORD,
      ...optionalCloudflareApiTokenSecret(dependencies.env),
      FORMLESS_ADMIN_TOKEN: adminToken,
    },
    stateRoot: deploymentStateRoot,
    ...(planned.workspaceAppPackages === undefined
      ? {}
      : { workspaceAppPackages: planned.workspaceAppPackages }),
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
  const controlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest,
    workspaceRoot,
  });
  const activePackages = await createActiveWorkspaceAppPackages(workspaceRoot);
  assertWorkspaceControlPlanePackagesAvailable({
    controlPlane,
    operation: "deploy",
    packageResolver: activePackages.resolver,
  });
  const deploymentSource = selectLocalWorkspaceDeploymentSource(controlPlane, input.targetAlias, {
    commandName: "deploy",
  });
  const selectedTarget =
    deploymentSource.deploymentConfig === undefined
      ? undefined
      : workspaceTargetFromDeploymentConfig(deploymentSource.deploymentConfig, "deploy");

  if (selectedTarget === undefined) {
    throw new Error(
      "Formless instance deploy requires an enabled instance deployment-config record.",
    );
  }

  const plan = formlessInstanceWorkspaceDeploymentPlan({
    deploymentConfig: deploymentSource.deploymentConfig,
    manifest,
    packageVersion: dependencies.packageVersion,
    selectedTarget,
  });
  const workspaceAppPackages = runtimeWorkspaceAppPackagesEnvValue(activePackages);

  return {
    credentialProfile: deploymentSource.credentialProfile ?? null,
    plan,
    selectedTarget,
    ...(workspaceAppPackages === undefined ? {} : { workspaceAppPackages }),
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
  const controlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest,
    workspaceRoot,
  });
  const activePackages = await createActiveWorkspaceAppPackages(workspaceRoot);
  assertWorkspaceControlPlanePackagesAvailable({
    controlPlane,
    operation: input.commandName,
    packageResolver: activePackages.resolver,
  });
  const deploymentSource = selectLocalWorkspaceDeploymentSource(controlPlane, input.targetAlias, {
    commandName: input.commandName,
  });
  const selectedTarget =
    deploymentSource.deploymentConfig === undefined
      ? undefined
      : workspaceTargetFromDeploymentConfig(deploymentSource.deploymentConfig, input.commandName);

  if (selectedTarget === undefined) {
    throw new Error(
      `Formless instance ${input.commandName} requires an enabled instance deployment-config record.`,
    );
  }

  const plan = formlessInstanceWorkspaceDeploymentPlan({
    commandName: input.commandName,
    deploymentConfig: deploymentSource.deploymentConfig,
    manifest,
    packageVersion: dependencies.packageVersion,
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
    credentialProfile:
      deploymentSource.credentialProfile === undefined
        ? localSecretEnv.credentialProfile
        : deploymentSource.credentialProfile,
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
  const context = await requireSiteCliTargetContext(
    {
      commandName: "domains plan",
      cwd: dependencies.cwd,
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    { env: dependencies.env },
  );
  const { adminToken, manifest, selectedTarget, workspaceRoot } = context;
  const controlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest,
    workspaceRoot,
  });
  const deploymentSource = selectLocalWorkspaceDeploymentSource(controlPlane, input.targetAlias, {
    commandName: "domains plan",
  });

  if (deploymentSource.deploymentConfig === undefined) {
    throw new Error(
      "Formless instance domains plan requires an enabled instance deployment-config record.",
    );
  }

  const accountId = requireWorkspaceDeployAccountId(deploymentSource.deploymentConfig);
  const workerName = selectWorkspaceWorkerName(deploymentSource.deploymentConfig, selectedTarget);
  const workspaceDomains = workspaceDomainIntentsFromSource(manifest, controlPlane);
  const liveDomains = await readLiveWorkspaceDomainIntents(
    { adminToken, target: selectedTarget },
    dependencies,
  );
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
  sidecar?: Pick<WorkspaceGatewaySidecar, "endpoint" | "proxyToken"> | null,
  options: {
    localDevSecrets?: FormlessInstanceWorkspaceLocalDevSecretState;
    localSessionBootstrapToken?: string;
    workspaceAppPackages?: string;
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
    nextEnv[WORKSPACE_GATEWAY_SIDECAR_URL_ENV] = sidecar.endpoint;
    nextEnv[WORKSPACE_GATEWAY_PROXY_TOKEN_ENV] = sidecar.proxyToken;
  } else {
    delete nextEnv[WORKSPACE_GATEWAY_SIDECAR_URL_ENV];
    delete nextEnv[WORKSPACE_GATEWAY_PROXY_TOKEN_ENV];
  }

  if (options.workspaceAppPackages) {
    nextEnv[FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME] = options.workspaceAppPackages;
  } else {
    delete nextEnv[FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME];
  }

  delete nextEnv.FORMLESS_LOCAL_WORKSPACE_GATEWAY;
  delete nextEnv.FORMLESS_WORKSPACE_GATEWAY_ROOT;
  delete nextEnv.VITE_FORMLESS_LOCAL_PUBLISH_BROKER_TOKEN;
  delete nextEnv.VITE_FORMLESS_LOCAL_PUBLISH_BROKER_URL;
  delete nextEnv.VITE_FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN;
  delete nextEnv.VITE_FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL;

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
): Promise<WorkspaceGatewaySidecar> {
  const sidecarDependencies = {
    ...workspaceGatewaySidecarDependencies(dependencies),
    createProxyToken: () => createLocalDevSecret(dependencies),
  };

  if (dependencies.startWorkspaceGatewaySidecar) {
    return dependencies.startWorkspaceGatewaySidecar(input, sidecarDependencies);
  }

  return startPackageWorkspaceGatewaySidecar(input, {
    createProxyToken: sidecarDependencies.createProxyToken,
    operations: createWorkspaceGatewayOperationHandlers(sidecarDependencies),
  });
}

function workspaceGatewaySidecarDependencies(
  dependencies: DevFormlessInstanceWorkspaceDependencies,
): StartWorkspaceGatewaySidecarDependencies {
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
  const controlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest,
    workspaceRoot,
  });
  const deploymentSource = selectLocalWorkspaceDeploymentSource(controlPlane, input.targetAlias, {
    commandName: "token rotate",
  });
  const selectedTarget =
    deploymentSource.deploymentConfig === undefined
      ? undefined
      : workspaceTargetFromDeploymentConfig(deploymentSource.deploymentConfig, "token rotate");
  const workerName = selectWorkspaceWorkerName(deploymentSource.deploymentConfig, selectedTarget);
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
      env: rotateCommandEnv(dependencies.env, deploymentSource.deploymentConfig),
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
};

type WorkspaceInstanceArchiveDirectory = WorkspaceArchiveDirectory & {
  archive: InstanceArchive;
};

type WorkspaceAppStateArchive = {
  appArchive: AppArchive;
  mediaFiles: ArchiveDiskMediaFile[];
  missingMediaFiles: string[];
  statePath: string;
};

type WorkspaceArchiveMediaComparisonSource = {
  mediaFiles: ArchiveDiskMediaFile[];
  missingMediaFiles: string[];
};

type WorkspaceLocalBootstrapResult =
  | {
      appCount: number;
      mediaCount: number;
      recordCount: number;
      sourceKind: "storage state";
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
  sourceKind: "storage state";
};

const WORKSPACE_LOCAL_DEV_STATE_FILE = "dev.json";
const WORKSPACE_DEFAULT_LOCAL_SOURCE = "http://localhost:5173";

type ActiveWorkspaceAppPackages = WorkspaceAppPackageResolverResult;

async function createActiveWorkspaceAppPackages(
  workspaceRoot: string,
): Promise<ActiveWorkspaceAppPackages> {
  return createWorkspaceAppPackageResolver({
    bundledManifests: bundledAppPackageManifests,
    workspaceRoot,
  });
}

function runtimeWorkspaceAppPackagesEnvValue(
  activePackages: ActiveWorkspaceAppPackages,
): string | undefined {
  if (activePackages.linkedPackages.length === 0) {
    return undefined;
  }

  return formatRuntimeWorkspaceAppPackages(
    activePackages.linkedPackages.map((appPackage) => ({
      manifest: appPackage.manifest,
      sourceSchema: appPackage.sourceSchema,
      seedRecords: appPackage.seedRecords,
    })),
  );
}

async function bootstrapWorkspaceLocalInstance(
  input: {
    adminToken: string;
    activePackages: ActiveWorkspaceAppPackages;
    manifest: FormlessInstanceWorkspaceManifest;
    source: string;
    workspaceRoot: string;
  },
  dependencies: Pick<DevFormlessInstanceWorkspaceDependencies, "cwd" | "env" | "fetch" | "now">,
): Promise<WorkspaceLocalBootstrapResult> {
  const registry = await fetchWorkspaceJson<AppInstallsResponse>(
    dependencies.fetch,
    instanceAppInstallsUrl(input.source),
    { adminToken: input.adminToken },
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
      activePackages: input.activePackages,
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
        adminToken: input.adminToken,
        apply: true,
        archiveDir: sourceArchive.archiveRoot,
        replace: false,
        target: input.source,
      },
      {
        cwd: dependencies.cwd,
        env: dependencies.env,
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
  activePackages: ActiveWorkspaceAppPackages;
  exportedAt: string;
  manifest: FormlessInstanceWorkspaceManifest;
  tempRoot: string;
  workspaceRoot: string;
}): Promise<WorkspaceLocalRestoreArchiveSource | undefined> {
  const controlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest: input.manifest,
    workspaceRoot: input.workspaceRoot,
  });

  if (!controlPlane) {
    return undefined;
  }

  assertWorkspaceControlPlanePackagesAvailable({
    controlPlane,
    operation: "local dev",
    packageResolver: input.activePackages.resolver,
  });

  const appState = await readCompleteWorkspaceAppState(
    input.workspaceRoot,
    input.manifest,
    controlPlane,
    input.activePackages.resolver,
  );
  const write = await writeComposedWorkspacePushArchive({
    archiveRoot: path.join(input.tempRoot, "archive"),
    appState,
    controlPlane,
    exportedAt: input.exportedAt,
  });

  return {
    appCount: write.appCount,
    archiveRoot: path.dirname(write.archivePath),
    mediaCount: write.mediaCount,
    recordCount: write.recordCount,
    sourceKind: "storage state",
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

async function readCompleteWorkspaceAppState(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
  controlPlane: WorkspaceControlPlaneRecords,
  packageResolver: AppPackageResolver,
): Promise<WorkspaceAppStateArchive[]> {
  return readRequiredWorkspaceAppState({
    controlPlane,
    manifest,
    operation: "local dev",
    packageResolver,
    workspaceRoot,
  });
}

async function readWorkspaceAppStateMapForCheck(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
  controlPlane: WorkspaceControlPlaneRecords | undefined,
  packageResolver: AppPackageResolver,
): Promise<Map<string, WorkspaceAppStateArchive>> {
  const appState = new Map<string, WorkspaceAppStateArchive>();

  for (const app of controlPlaneAppInstallRecords(controlPlane)) {
    const state = await readWorkspaceAppStateForCheck({
      install: app,
      manifest,
      packageResolver,
      workspaceRoot,
    });

    if (state) {
      appState.set(app.installId, state);
    }
  }

  return appState;
}

async function readWorkspaceAppStateForCheck(input: {
  install: WorkspaceControlPlaneAppInstallRecord;
  manifest: FormlessInstanceWorkspaceManifest;
  packageResolver: AppPackageResolver;
  workspaceRoot: string;
}): Promise<WorkspaceAppStateArchive | undefined> {
  const snapshot = await readInstanceWorkspaceAppStorageSnapshot({
    installId: input.install.installId,
    manifest: input.manifest,
    workspaceRoot: input.workspaceRoot,
  });

  if (snapshot === undefined) {
    return undefined;
  }

  return workspaceAppStateArchiveFromSnapshot({
    install: input.install,
    manifest: input.manifest,
    packageResolver: input.packageResolver,
    snapshot,
    workspaceRoot: input.workspaceRoot,
  });
}

type WorkspaceControlPlaneAppInstallRecord = {
  createdAt: string;
  installId: string;
  label: string;
  packageAppKey: string;
  packageRevision?: number;
  sourceSchemaHash?: AppArchive["app"]["sourceSchemaHash"];
  status: "installed";
  updatedAt: string;
};

function controlPlaneAppInstallRecords(
  controlPlane: WorkspaceControlPlaneRecords | undefined,
): WorkspaceControlPlaneAppInstallRecord[] {
  return (controlPlane?.records ?? [])
    .filter(
      (record) =>
        record.entity === "app-install" &&
        !record.deletedAt &&
        stringRecordValue(record, "status") === "installed",
    )
    .map((record) => ({
      createdAt: stringRecordValue(record, "createdAt") ?? record.createdAt,
      installId: String(record.values.installId),
      label: stringRecordValue(record, "label") ?? String(record.values.installId),
      packageAppKey: String(record.values.packageAppKey),
      ...(numberRecordValue(record, "packageRevision") === undefined
        ? {}
        : { packageRevision: numberRecordValue(record, "packageRevision") }),
      ...(sourceSchemaHashRecordValue(record) === undefined
        ? {}
        : { sourceSchemaHash: sourceSchemaHashRecordValue(record) }),
      status: "installed" as const,
      updatedAt: stringRecordValue(record, "updatedAt") ?? record.createdAt,
    }))
    .sort((left, right) => left.installId.localeCompare(right.installId));
}

function assertWorkspaceControlPlanePackagesAvailable(input: {
  controlPlane: WorkspaceControlPlaneRecords | undefined;
  operation: "check" | "deploy" | "destroy" | "domains run" | "local dev" | "push" | "save";
  packageResolver: AppPackageResolver;
}): void {
  const missing = controlPlaneAppInstallRecords(input.controlPlane).filter(
    (install) => !findResolvedAppPackage(install.packageAppKey, input.packageResolver),
  );

  if (missing.length === 0) {
    return;
  }

  const labels = missing
    .map((install) => `${install.installId} (${install.packageAppKey})`)
    .join(", ");

  throw new Error(
    `Formless instance ${input.operation} cannot continue because active app installs reference unavailable package apps: ${labels}. Add the packages to formless.packages.json or install bundled packages.`,
  );
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

  const archive = parsePortableArchive(JSON.parse(contents) as unknown);
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
  };
}

async function exportWorkspaceSourceFromLocalAuthority(
  input: {
    adminToken?: string | null;
    packageResolver: AppPackageResolver;
    source: string;
    tempRoot: string;
  },
  dependencies: SaveLocalFormlessWorkspaceDependencies,
): Promise<WorkspaceInstanceArchiveDirectory> {
  const archiveRoot = path.join(input.tempRoot, "authority");

  await exportInstanceArchive(
    {
      adminToken: input.adminToken,
      outDir: archiveRoot,
      packageResolver: input.packageResolver,
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

function savedWorkspaceAppStateSummaries(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
  directory: WorkspaceInstanceArchiveDirectory,
): SaveLocalFormlessWorkspaceAppStateSummary[] {
  return directory.archive.apps.map((app) => ({
    appCount: 1,
    statePath: path.join(
      workspaceRoot,
      instanceWorkspaceAppStateRelativePath(manifest, app.app.installId),
    ),
    installId: app.app.installId,
    mediaCount: app.media.objects.length,
    recordCount: archiveRecordCount(app),
  }));
}

function savedAuthorityControlPlaneForWorkspaceSource(input: {
  current: WorkspaceControlPlaneRecords | undefined;
  exported: WorkspaceControlPlaneRecords | undefined;
}): WorkspaceControlPlaneRecords | undefined {
  if (input.exported === undefined || input.current === undefined) {
    return input.exported;
  }

  const records = [...input.exported.records];

  for (const entity of sourceOnlyDeploymentIntentEntities) {
    const exportedHasEntity = records.some((record) => controlPlaneRecordEntity(record) === entity);

    if (exportedHasEntity) {
      continue;
    }

    records.push(
      ...input.current.records.filter((record) => controlPlaneRecordEntity(record) === entity),
    );
  }

  return {
    ...input.exported,
    records,
  };
}

function controlPlaneRecordEntity(record: StoredRecord): string | undefined {
  const entity = record.entity.startsWith("instance:")
    ? record.entity.slice("instance:".length)
    : record.entity;

  return isInstanceControlPlaneEntityName(entity) ? entity : undefined;
}

async function staleSavedWorkspaceSourcePaths(input: {
  exported: WorkspaceInstanceArchiveDirectory;
  manifest: FormlessInstanceWorkspaceManifest;
  manifestPath: string;
  nextManifest: FormlessInstanceWorkspaceManifest;
  packageResolver: AppPackageResolver;
  sourceControlPlane: WorkspaceControlPlaneRecords | undefined;
  workspaceRoot: string;
}): Promise<string[]> {
  const stalePaths = new Set<string>();
  const currentManifest = formatFormlessInstanceWorkspaceManifest(input.manifest);
  const nextManifest = formatFormlessInstanceWorkspaceManifest(input.nextManifest);

  if (currentManifest !== nextManifest) {
    stalePaths.add(path.basename(input.manifestPath));
  }

  const localControlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest: input.nextManifest,
    workspaceRoot: input.workspaceRoot,
  });

  if (
    comparableControlPlaneIntentRecordsJson(localControlPlane, input.packageResolver) !==
    comparableControlPlaneIntentRecordsJson(input.sourceControlPlane, input.packageResolver)
  ) {
    stalePaths.add(instanceWorkspaceInstanceStateRelativePath(input.nextManifest));
  }

  for (const exportedApp of input.exported.archive.apps) {
    const appStatePath = instanceWorkspaceAppStateRelativePath(
      input.nextManifest,
      exportedApp.app.installId,
    );
    const expected = workspaceAppStateArchiveFromInstanceExport(
      input.exported,
      exportedApp,
      appStatePath,
    );
    const install = controlPlaneAppInstallRecords(input.sourceControlPlane).find(
      (candidate) => candidate.installId === exportedApp.app.installId,
    );
    const local =
      install === undefined
        ? undefined
        : await readWorkspaceAppStateForCheck({
            install,
            manifest: input.nextManifest,
            packageResolver: input.packageResolver,
            workspaceRoot: input.workspaceRoot,
          });

    if (!workspaceAppStateMatches(expected, local)) {
      stalePaths.add(appStatePath);
    }
  }

  return [...stalePaths].sort((left, right) => left.localeCompare(right));
}

async function writeSavedWorkspaceSource(input: {
  exported: WorkspaceInstanceArchiveDirectory;
  manifestPath: string;
  nextManifest: FormlessInstanceWorkspaceManifest;
  sourceControlPlane: WorkspaceControlPlaneRecords | undefined;
  workspaceRoot: string;
}) {
  await prepareWorkspaceDirectories(input.workspaceRoot, input.nextManifest);
  await writeInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest: input.nextManifest,
    snapshot: input.sourceControlPlane,
    workspaceRoot: input.workspaceRoot,
  });
  await replaceInstanceWorkspaceAppStorageSnapshots({
    manifest: input.nextManifest,
    snapshots: input.exported.archive.apps.map((app) => ({
      installId: app.app.installId,
      snapshot: appStorageSnapshotFromArchive(app),
    })),
    workspaceRoot: input.workspaceRoot,
  });
  await replaceInstanceWorkspaceMediaFiles({
    manifest: input.nextManifest,
    mediaFiles: input.exported.mediaFiles,
    workspaceRoot: input.workspaceRoot,
  });

  await writeFile(input.manifestPath, formatFormlessInstanceWorkspaceManifest(input.nextManifest));
}

async function markWorkspaceAutoSaveSavedAfterWorkspaceSourceWrite(input: {
  now: () => string;
  workspaceRoot: string;
}) {
  const localStateRoot = path.join(
    input.workspaceRoot,
    DEFAULT_FORMLESS_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
  );
  const current = await readInstanceWorkspaceAutoSaveState(localStateRoot);

  if (current === undefined || current.dirtyGeneration <= current.savedGeneration) {
    return;
  }

  await writeInstanceWorkspaceAutoSaveState({
    localStateRoot,
    state: nextWorkspaceAutoSaveSavedState(current, { now: input.now }),
    workspaceRoot: input.workspaceRoot,
  });
}

function workspaceAppStateArchiveFromInstanceExport(
  directory: WorkspaceInstanceArchiveDirectory,
  app: AppArchive,
  statePath: string,
): WorkspaceAppStateArchive {
  return {
    appArchive: app,
    mediaFiles: workspaceAppArchiveMediaFiles(directory, app),
    missingMediaFiles: directory.missingMediaFiles.filter((archivePath) =>
      app.media.objects.some((object) => object.archivePath === archivePath),
    ),
    statePath,
  };
}

async function workspaceAppStateArchiveFromSnapshot(input: {
  install: WorkspaceControlPlaneAppInstallRecord;
  manifest: FormlessInstanceWorkspaceManifest;
  packageResolver: AppPackageResolver;
  snapshot: StorageSnapshot;
  workspaceRoot: string;
}): Promise<WorkspaceAppStateArchive> {
  const statePath = instanceWorkspaceAppStateRelativePath(input.manifest, input.install.installId);
  const appArchive = appArchiveFromWorkspaceSnapshot(input);
  const media = await workspaceAppArchiveMediaFromSnapshot({
    archive: appArchive,
    manifest: input.manifest,
    workspaceRoot: input.workspaceRoot,
  });

  return {
    appArchive: {
      ...appArchive,
      media: { objects: media.objects },
    },
    mediaFiles: media.mediaFiles,
    missingMediaFiles: media.missingMediaFiles,
    statePath,
  };
}

function appArchiveFromWorkspaceSnapshot(input: {
  install: WorkspaceControlPlaneAppInstallRecord;
  packageResolver: AppPackageResolver;
  snapshot: StorageSnapshot;
}): AppArchive {
  const packageApp = findResolvedAppPackage(input.install.packageAppKey, input.packageResolver);
  const packageRevision = input.install.packageRevision ?? packageApp?.packageRevision;
  const sourceSchemaHash = input.install.sourceSchemaHash ?? packageApp?.sourceSchemaHash;

  if (!packageApp || packageRevision === undefined || sourceSchemaHash === undefined) {
    throw new Error(
      `Workspace app state ${input.install.installId} references unavailable package "${input.install.packageAppKey}".`,
    );
  }

  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: input.snapshot.exportedAt,
    capabilities: ["app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    app: {
      installId: input.install.installId,
      packageAppKey: input.install.packageAppKey,
      packageRevision,
      sourceSchemaKey: packageApp.sourceSchemaKey,
      sourceSchemaHash,
      label: input.install.label,
      status: input.install.status,
      createdAt: input.install.createdAt,
      updatedAt: input.install.updatedAt,
    },
    data: input.snapshot,
    media: { objects: [] },
  };
}

async function workspaceAppArchiveMediaFromSnapshot(input: {
  archive: AppArchive;
  manifest: FormlessInstanceWorkspaceManifest;
  workspaceRoot: string;
}): Promise<{
  mediaFiles: ArchiveDiskMediaFile[];
  missingMediaFiles: string[];
  objects: AppArchive["media"]["objects"];
}> {
  const references = appMediaReferences(input.archive.data.records);
  const archivePaths = references.map(
    (reference) => `media/${input.archive.app.installId}/${reference.storageKey}`,
  );
  const diskMedia = await readInstanceWorkspaceMediaFiles({
    archivePaths,
    manifest: input.manifest,
    workspaceRoot: input.workspaceRoot,
  });
  const filesByPath = new Map(diskMedia.mediaFiles.map((file) => [file.archivePath, file]));
  const objects = references.map((reference) => {
    const archivePath = `media/${input.archive.app.installId}/${reference.storageKey}`;
    const file = filesByPath.get(archivePath);
    const byteSize = file?.byteSize ?? 0;

    return {
      archivePath,
      ...(reference.asset === undefined
        ? {}
        : { asset: { ...reference.asset, byteSize } satisfies MediaAsset }),
      byteSize,
      contentType: reference.contentType,
      deliveryHref: reference.deliveryHref,
      storageKey: reference.storageKey,
    };
  });

  return {
    mediaFiles: diskMedia.mediaFiles.map((file) => ({
      ...file,
      contentType:
        objects.find((object) => object.archivePath === file.archivePath)?.contentType ??
        file.contentType,
    })),
    missingMediaFiles: diskMedia.missingMediaFiles,
    objects,
  };
}

function appStorageSnapshotFromArchive(app: AppArchive): StorageSnapshot {
  if (app.data.kind !== STORAGE_SNAPSHOT_KIND) {
    throw new Error(`Workspace app state for "${app.app.installId}" must be a storage snapshot.`);
  }

  return app.data;
}

function pulledAppStateResults(input: {
  archive: InstanceArchive;
  manifest: FormlessInstanceWorkspaceManifest;
  workspaceRoot: string;
}): PullFormlessInstanceWorkspaceAppStateResult[] {
  return archiveApps(input.archive)
    .map((app) => {
      const statePath = path.join(
        input.workspaceRoot,
        instanceWorkspaceAppStateRelativePath(input.manifest, app.app.installId),
      );

      return {
        appCount: 1,
        installId: app.app.installId,
        mediaCount: app.media.objects.length,
        recordCount: archiveRecordCount(app),
        statePath,
        stateRoot: path.dirname(statePath),
      };
    })
    .sort((left, right) => left.installId.localeCompare(right.installId));
}

async function pullWorkspaceReplacementPlan(input: {
  localControlPlane: WorkspaceControlPlaneRecords | undefined;
  manifest: FormlessInstanceWorkspaceManifest;
  remoteArchive: WorkspaceInstanceArchiveDirectory;
  syncPlan: FormlessInstanceWorkspaceSyncPlan;
  workspaceRoot: string;
}): Promise<PullFormlessInstanceWorkspaceReplacementPlan> {
  const changedStatePaths = new Set(input.syncPlan.changedStatePaths);
  const prunedStatePaths = new Set<string>();
  const remoteApps = archiveApps(input.remoteArchive.archive);
  const remoteAppStatePaths = new Set(
    remoteApps.map((app) =>
      instanceWorkspaceAppStateRelativePath(input.manifest, app.app.installId),
    ),
  );
  const localAppStatePaths = await listWorkspaceRelativeFiles(
    path.join(input.workspaceRoot, input.manifest.state.root, "apps"),
    path.posix.join(input.manifest.state.root, "apps"),
  );

  for (const installId of input.syncPlan.extraInstalls) {
    changedStatePaths.add(instanceWorkspaceAppStateRelativePath(input.manifest, installId));
  }

  for (const statePath of localAppStatePaths) {
    if (!remoteAppStatePaths.has(statePath)) {
      changedStatePaths.add(statePath);
      prunedStatePaths.add(statePath);
    }
  }

  const remoteMediaPaths = new Set(
    input.remoteArchive.mediaFiles.map((file) =>
      path.posix.join(input.manifest.media.root, file.archivePath),
    ),
  );
  const localMediaPaths = await listWorkspaceRelativeFiles(
    path.join(input.workspaceRoot, input.manifest.media.root),
    input.manifest.media.root,
  );
  const changedMediaInstalls = new Set([
    ...input.syncPlan.changedMedia,
    ...input.syncPlan.extraInstalls,
  ]);

  for (const app of remoteApps) {
    if (!changedMediaInstalls.has(app.app.installId)) {
      continue;
    }

    for (const file of input.remoteArchive.mediaFiles) {
      if (app.media.objects.some((object) => object.archivePath === file.archivePath)) {
        changedStatePaths.add(path.posix.join(input.manifest.media.root, file.archivePath));
      }
    }
  }

  for (const mediaPath of localMediaPaths) {
    if (!remoteMediaPaths.has(mediaPath)) {
      changedStatePaths.add(mediaPath);
      prunedStatePaths.add(mediaPath);
    }
  }

  if (
    input.remoteArchive.archive.controlPlane === undefined &&
    input.localControlPlane !== undefined
  ) {
    const instancePath = instanceWorkspaceInstanceStateRelativePath(input.manifest);

    changedStatePaths.add(instancePath);
    prunedStatePaths.add(instancePath);
  }

  const sortedChangedStatePaths = [...changedStatePaths].sort((left, right) =>
    left.localeCompare(right),
  );

  return {
    changedStatePaths: sortedChangedStatePaths,
    prunedStatePaths: [...prunedStatePaths].sort((left, right) => left.localeCompare(right)),
    status: sortedChangedStatePaths.length === 0 ? "no-changes" : "changes",
  };
}

async function listWorkspaceRelativeFiles(root: string, relativeRoot: string): Promise<string[]> {
  let entries: Dirent[];

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const files: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryRoot = path.join(root, entry.name);
    const entryRelativePath = path.posix.join(relativeRoot, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listWorkspaceRelativeFiles(entryRoot, entryRelativePath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryRelativePath);
    }
  }

  return files;
}

function workspaceAppArchiveMediaFiles(
  directory: WorkspaceArchiveDirectory,
  app: AppArchive,
): ArchiveDiskMediaFile[] {
  const archivePaths = new Set(app.media.objects.map((object) => object.archivePath));

  return directory.mediaFiles.filter((file) => archivePaths.has(file.archivePath));
}

function appMediaReferences(records: readonly StoredRecord[]): AppArchive["media"]["objects"] {
  const referencesByKey = new Map<string, AppArchive["media"]["objects"][number]>();

  for (const record of records) {
    if (record.deletedAt !== undefined) {
      continue;
    }

    for (const [fieldName, value] of Object.entries(record.values)) {
      if (fieldName === "mediaAssetId" && typeof value === "string") {
        const facts = coreImageMediaDeliveryFactsForAssetId(value);

        if (facts) {
          referencesByKey.set(facts.storageKey, coreMediaReference(facts.storageKey, facts.href));
        }
      }

      if (typeof value === "string") {
        const coreStorageKey = storageKeyFromDeliveryHref(value, CORE_MEDIA_ROUTE_PREFIX);

        if (
          coreStorageKey &&
          isRestorableImageMediaKey(coreStorageKey, {
            keyPrefix: mediaKeyPrefix(CORE_IMAGE_KEY_PREFIX),
          }) &&
          !referencesByKey.has(coreStorageKey)
        ) {
          referencesByKey.set(
            coreStorageKey,
            coreMediaReference(coreStorageKey, coreMediaHrefForKey(coreStorageKey)),
          );
          continue;
        }

        if (isLegacySiteMediaHref(value)) {
          throw new Error(unsupportedLegacySiteMediaMessage(value, "workspace state"));
        }
      }
    }
  }

  return [...referencesByKey.values()].sort((left, right) =>
    left.storageKey.localeCompare(right.storageKey),
  );
}

function coreMediaReference(
  storageKey: string,
  deliveryHref: string,
): AppArchive["media"]["objects"][number] {
  const contentType = imageMediaContentTypeForKey(storageKey);
  const assetId = storageKey.startsWith(mediaKeyPrefix(CORE_IMAGE_KEY_PREFIX))
    ? storageKey.slice(mediaKeyPrefix(CORE_IMAGE_KEY_PREFIX).length)
    : storageKey;

  if (!contentType) {
    throw new Error(`Media key "${storageKey}" has unsupported content type.`);
  }

  return {
    archivePath: "",
    asset: {
      byteSize: 0,
      contentType,
      deliveryHref,
      id: assetId,
      kind: "image",
      label: assetId,
      provider: "r2",
      status: "ready",
      storageKey,
    },
    byteSize: 0,
    contentType,
    deliveryHref,
    storageKey,
  };
}

function storageKeyFromDeliveryHref(href: string, routePrefix: string): string | undefined {
  const prefix = routePrefix.endsWith("/") ? routePrefix : `${routePrefix}/`;

  return href.startsWith(prefix) ? href.slice(prefix.length) : undefined;
}

function mediaKeyPrefix(prefix: string): string {
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

function workspaceAppStateMatches(
  expected: WorkspaceAppStateArchive,
  actual: WorkspaceAppStateArchive | undefined,
): boolean {
  if (!actual) {
    return false;
  }

  return (
    comparableAppRecordsJson(actual.appArchive) === comparableAppRecordsJson(expected.appArchive) &&
    comparableAppMediaJson(actual, actual.appArchive) ===
      comparableAppMediaJson(expected, expected.appArchive)
  );
}

function createWorkspaceSyncPlan(input: {
  domainDesiredDrift: FormlessInstanceWorkspaceDomainDesiredDrift[];
  localControlPlane: WorkspaceControlPlaneRecords | undefined;
  localAppState: ReadonlyMap<string, WorkspaceAppStateArchive>;
  localDomains: readonly FormlessInstanceWorkspaceDomainIntent[];
  manifest: FormlessInstanceWorkspaceManifest;
  packageResolver: AppPackageResolver;
  remoteArchive: WorkspaceArchiveDirectory;
  remoteDomains: readonly FormlessInstanceWorkspaceDomainIntent[];
  sourceLabel: string;
  sourceSide: "local" | "remote";
  targetLabel: string;
}): FormlessInstanceWorkspaceSyncPlan {
  const remoteApps = archiveApps(input.remoteArchive.archive);
  const remoteAppsByInstall = new Map(remoteApps.map((app) => [app.app.installId, app]));
  const localApps = controlPlaneAppInstallRecords(input.localControlPlane);
  const localAppsByInstall = new Map(localApps.map((app) => [app.installId, app]));
  const changedStatePaths = new Set<string>();
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
      changedStatePaths.add(instanceWorkspaceAppStateRelativePath(input.manifest, app.installId));
    }
  }

  for (const remoteApp of remoteApps) {
    const localApp = localAppsByInstall.get(remoteApp.app.installId);

    if (!localApp) {
      continue;
    }

    const statePath = instanceWorkspaceAppStateRelativePath(input.manifest, localApp.installId);
    const localState = input.localAppState.get(remoteApp.app.installId);

    if (!localState) {
      changedStatePaths.add(statePath);
      continue;
    }

    const localPackageAppKey = localState.appArchive.app.packageAppKey;

    if (localPackageAppKey !== remoteApp.app.packageAppKey) {
      packageMismatches.push({
        installId: remoteApp.app.installId,
        localPackageAppKey,
        remotePackageAppKey: remoteApp.app.packageAppKey,
      });
      changedStatePaths.add(statePath);
      continue;
    }

    if (comparableAppRecordsJson(localState.appArchive) !== comparableAppRecordsJson(remoteApp)) {
      changedRecords.add(remoteApp.app.installId);
      changedStatePaths.add(statePath);
    }

    if (
      comparableAppMediaJson(localState, localState.appArchive) !==
      comparableAppMediaJson(input.remoteArchive, remoteApp)
    ) {
      changedMedia.add(remoteApp.app.installId);
      changedStatePaths.add(statePath);
    }
  }

  if (remoteControlPlane !== undefined) {
    for (const recordKey of changedControlPlaneIntentRecordKeys(
      input.localControlPlane,
      remoteControlPlane,
      input.packageResolver,
    )) {
      changedControlPlaneRecords.add(recordKey);
      changedStatePaths.add(instanceWorkspaceInstanceStateRelativePath(input.manifest));
    }
  }

  const localAppArchivePayloads = [...input.localAppState.values()].map(
    (state) => state.appArchive,
  );
  const changedDomainCount =
    input.domainDesiredDrift.length > 0
      ? input.domainDesiredDrift.length
      : comparableWorkspaceDomainIntentsJson(input.localDomains) ===
          comparableWorkspaceDomainIntentsJson(input.remoteDomains)
        ? 0
        : Math.max(input.localDomains.length, input.remoteDomains.length);
  const changedAreas = workspaceSyncPlanChangedAreas({
    changedControlPlaneRecordCount: changedControlPlaneRecords.size,
    changedDomainCount,
    changedMediaCount: changedMedia.size,
    changedRecordCount: changedRecords.size,
    extraInstallCount: extraInstalls.length,
    missingInstallCount: missingInstalls.length,
    packageMismatchCount: packageMismatches.length,
  });
  const localEndpoint = workspaceSyncPlanEndpoint({
    appCount: localApps.length,
    apps: localApps.map((app) =>
      comparableWorkspaceSyncApp(
        app.installId,
        input.localAppState.get(app.installId),
        app.packageAppKey,
      ),
    ),
    controlPlane: input.localControlPlane,
    controlPlaneRecordCount: input.localControlPlane?.records.length ?? 0,
    domains: input.localDomains,
    label: input.sourceSide === "local" ? input.sourceLabel : input.targetLabel,
    mediaCount: localAppArchivePayloads.reduce((count, app) => count + app.media.objects.length, 0),
    packageResolver: input.packageResolver,
    recordCount: localAppArchivePayloads.reduce((count, app) => count + archiveRecordCount(app), 0),
  });
  const remoteControlPlaneRecordCount = remoteControlPlane?.records.length ?? 0;
  const remoteEndpoint = workspaceSyncPlanEndpoint({
    appCount: remoteApps.length,
    apps: remoteApps.map((app) =>
      comparableWorkspaceSyncApp(
        app.app.installId,
        workspaceSyncComparableAppSource(input.remoteArchive, app),
      ),
    ),
    controlPlane: remoteControlPlane,
    controlPlaneRecordCount: remoteControlPlaneRecordCount,
    domains: input.remoteDomains,
    label: input.sourceSide === "remote" ? input.sourceLabel : input.targetLabel,
    mediaCount: remoteApps.reduce((count, app) => count + app.media.objects.length, 0),
    packageResolver: input.packageResolver,
    recordCount: remoteApps.reduce((count, app) => count + archiveRecordCount(app), 0),
  });
  const source = input.sourceSide === "local" ? localEndpoint : remoteEndpoint;
  const target = input.sourceSide === "local" ? remoteEndpoint : localEndpoint;

  return {
    changedAreas,
    changedStatePaths: [...changedStatePaths].sort((left, right) => left.localeCompare(right)),
    changedControlPlaneRecords: [...changedControlPlaneRecords].sort((left, right) =>
      left.localeCompare(right),
    ),
    changedDomainCount,
    domainDesiredDrift: input.domainDesiredDrift,
    changedMedia: [...changedMedia].sort((left, right) => left.localeCompare(right)),
    changedRecords: [...changedRecords].sort((left, right) => left.localeCompare(right)),
    extraInstalls,
    missingInstalls,
    packageMismatches: packageMismatches.sort((left, right) =>
      left.installId.localeCompare(right.installId),
    ),
    source,
    target,
    status: source.fingerprint === target.fingerprint ? "up-to-date" : "changes",
  };
}

function workspaceSyncPlanChangedAreas(input: {
  changedControlPlaneRecordCount: number;
  changedDomainCount: number;
  changedMediaCount: number;
  changedRecordCount: number;
  extraInstallCount: number;
  missingInstallCount: number;
  packageMismatchCount: number;
}): FormlessInstanceWorkspaceSyncPlanChangedArea[] {
  const areas: FormlessInstanceWorkspaceSyncPlanChangedArea[] = [];

  if (input.extraInstallCount > 0 || input.missingInstallCount > 0) {
    areas.push("apps");
  }

  if (input.changedControlPlaneRecordCount > 0) {
    areas.push("control-plane");
  }

  if (input.changedDomainCount > 0) {
    areas.push("domains");
  }

  if (input.changedMediaCount > 0) {
    areas.push("media");
  }

  if (input.packageMismatchCount > 0) {
    areas.push("packages");
  }

  if (input.changedRecordCount > 0) {
    areas.push("records");
  }

  return areas;
}

function workspaceSyncPlanEndpoint(input: {
  appCount: number;
  apps: WorkspaceSyncComparableApp[];
  controlPlane: WorkspaceControlPlaneRecords | undefined;
  controlPlaneRecordCount: number;
  domains: readonly FormlessInstanceWorkspaceDomainIntent[];
  label: string;
  mediaCount: number;
  packageResolver: AppPackageResolver;
  recordCount: number;
}): FormlessInstanceWorkspaceSyncPlanEndpoint {
  return {
    appCount: input.appCount,
    controlPlaneRecordCount: input.controlPlaneRecordCount,
    domainCount: input.domains.length,
    fingerprint: workspaceSyncFingerprint({
      apps: [...input.apps].sort((left, right) => left.installId.localeCompare(right.installId)),
      controlPlane: comparableControlPlaneIntentRecordsJson(
        input.controlPlane,
        input.packageResolver,
      ),
      domains: comparableWorkspaceDomainIntentsJson(input.domains),
    }),
    label: input.label,
    mediaCount: input.mediaCount,
    recordCount: input.recordCount,
  };
}

type WorkspaceSyncComparableApp = {
  installId: string;
  mediaJson: string | null;
  missingState: boolean;
  packageAppKey: string;
  recordsJson: string | null;
};

type WorkspaceSyncComparableAppSource = {
  appArchive: AppArchive;
  mediaFiles: ArchiveDiskMediaFile[];
  missingMediaFiles: string[];
};

function comparableWorkspaceSyncApp(
  installId: string,
  archive: WorkspaceSyncComparableAppSource | undefined,
  packageAppKey = "missing",
): WorkspaceSyncComparableApp {
  if (archive === undefined) {
    return {
      installId,
      mediaJson: null,
      missingState: true,
      packageAppKey,
      recordsJson: null,
    };
  }

  return {
    installId,
    mediaJson: comparableAppMediaJson(archive, archive.appArchive),
    missingState: false,
    packageAppKey: archive.appArchive.app.packageAppKey,
    recordsJson: comparableAppRecordsJson(archive.appArchive),
  };
}

function workspaceSyncComparableAppSource(
  directory: WorkspaceArchiveDirectory,
  app: AppArchive,
): WorkspaceSyncComparableAppSource {
  return {
    appArchive: app,
    mediaFiles: workspaceAppArchiveMediaFiles(directory, app),
    missingMediaFiles: directory.missingMediaFiles,
  };
}

function comparableWorkspaceDomainIntentsJson(
  domains: readonly FormlessInstanceWorkspaceDomainIntent[],
): string {
  return JSON.stringify(
    stableValue(
      [...domains].sort(compareWorkspaceDomainIntents).map((domain) => ({
        enabled: domain.enabled,
        host: domain.host,
        profile: domain.profile,
        targetInstallId: domain.targetInstallId ?? null,
      })),
    ),
  );
}

function workspaceSyncFingerprint(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex")}`;
}

function changedControlPlaneIntentRecordKeys(
  local: WorkspaceControlPlaneRecords | undefined,
  remote: WorkspaceControlPlaneRecords,
  packageResolver: AppPackageResolver,
): string[] {
  const localRecords = comparableControlPlaneIntentRecords(local, packageResolver);
  const remoteRecords = comparableControlPlaneIntentRecords(remote, packageResolver);
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
  controlPlane: WorkspaceControlPlaneRecords | undefined,
  packageResolver: AppPackageResolver,
): Map<string, string> {
  const records = new Map<string, string>();

  for (const record of controlPlane?.records ?? []) {
    if (record.deletedAt || controlPlaneRecordEntity(record) === undefined) {
      continue;
    }

    records.set(
      controlPlaneRecordKey(record),
      JSON.stringify(
        stableValue({
          entity: record.entity,
          id: record.id,
          values: comparableControlPlaneValues(record, packageResolver),
        }),
      ),
    );
  }

  return records;
}

function comparableControlPlaneIntentRecordsJson(
  controlPlane: WorkspaceControlPlaneRecords | undefined,
  packageResolver: AppPackageResolver,
): string {
  return JSON.stringify(
    [...comparableControlPlaneIntentRecords(controlPlane, packageResolver).entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    ),
  );
}

function comparableControlPlaneValues(
  record: StoredRecord,
  packageResolver: AppPackageResolver,
): RecordValues {
  const values = Object.fromEntries(
    Object.entries(record.values).filter(
      ([fieldName]) =>
        fieldName !== "createdAt" &&
        fieldName !== "updatedAt" &&
        (controlPlaneRecordEntity(record) !== "deployment-config" ||
          !deploymentConfigObservedFieldSet.has(fieldName)),
    ),
  ) as RecordValues;

  if (record.entity === "app-install" && typeof values.packageAppKey === "string") {
    const packageFacts = packageAppFactsForKey(values.packageAppKey, packageResolver);

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

function comparableAppRecordsJson(archive: AppArchive): string {
  const data = normalizeGeneratedArchiveTimestamps(archive).data;

  return JSON.stringify(
    stableValue({
      ...data,
      records: [...data.records].sort(compareRecordsByEntityAndId),
    }),
  );
}

function compareRecordsByEntityAndId(
  left: Pick<StoredRecord, "entity" | "id">,
  right: Pick<StoredRecord, "entity" | "id">,
): number {
  const entityOrder = left.entity.localeCompare(right.entity);

  return entityOrder === 0 ? left.id.localeCompare(right.id) : entityOrder;
}

function comparableAppMediaJson(
  source: WorkspaceArchiveMediaComparisonSource,
  archive: AppArchive,
): string {
  const bytesByArchivePath = new Map(
    source.mediaFiles.map((file) => [file.archivePath, Buffer.from(file.bytes).toString("base64")]),
  );
  const missing = new Set(source.missingMediaFiles);
  const media = archive.media.objects
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

function sourceSchemaHashRecordValue(
  record: StoredRecord | undefined,
): AppArchive["app"]["sourceSchemaHash"] | undefined {
  const value = stringRecordValue(record, "sourceSchemaHash");

  return value?.startsWith("sha256:")
    ? (value as AppArchive["app"]["sourceSchemaHash"])
    : undefined;
}

function normalizeGeneratedArchiveTimestamps<T extends PortableArchive>(archive: T): T {
  const nextArchive = jsonClone(archive);
  const generatedAt = "1970-01-01T00:00:00.000Z";

  nextArchive.exportedAt = generatedAt;

  if (nextArchive.kind === INSTANCE_ARCHIVE_KIND) {
    nextArchive.apps = nextArchive.apps.map((app) => normalizeGeneratedArchiveTimestamps(app));

    if (nextArchive.controlPlane) {
      nextArchive.controlPlane.exportedAt = generatedAt;
      nextArchive.controlPlane.schemaUpdatedAt = generatedAt;
      nextArchive.controlPlane.sourceCursor = 0;
      nextArchive.controlPlane.records = nextArchive.controlPlane.records
        .filter((record) => !record.deletedAt && controlPlaneRecordEntity(record) !== undefined)
        .map((record) => ({
          ...record,
          values: normalizeControlPlaneGeneratedValues(record.values, generatedAt),
          createdAt: generatedAt,
        }));
    }

    return nextArchive;
  }

  nextArchive.data.exportedAt = generatedAt;
  nextArchive.data.schemaUpdatedAt = generatedAt;
  nextArchive.data.sourceCursor = 0;

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
  };
}

function withArchiveSource(
  manifest: FormlessInstanceWorkspaceManifest,
  archive: PortableArchive,
  archiveSourcePath: string,
): FormlessInstanceWorkspaceManifest {
  const apps = archiveApps(archive);

  return {
    ...manifest,
    apps: apps.map((app) =>
      appDeclarationFromArchive(
        app,
        archive.kind === APP_ARCHIVE_KIND
          ? archiveSourcePath
          : `${DEFAULT_FORMLESS_INSTANCE_WORKSPACE_APP_STATE_ROOT}/${app.app.installId}.json`,
      ),
    ),
    defaultAppPolicy: "declared-installs",
  };
}

async function writeInitialInstanceWorkspaceState(input: {
  archive: PortableArchive | undefined;
  archiveDir: string | undefined;
  manifest: FormlessInstanceWorkspaceManifest;
  remoteStatus: FormlessInstanceTargetStatus | undefined;
  targetAlias: string;
  targetUrl: string | null;
  workspaceRoot: string;
}) {
  const records = [
    ...(input.targetUrl === null
      ? []
      : [
          deploymentConfigRecordFromTarget({
            targetAlias: input.targetAlias,
            targetUrl: input.targetUrl,
          }),
        ]),
    ...(input.remoteStatus?.appRegistry.installs.flatMap(appInstallControlPlaneRecords) ?? []),
  ];
  const archiveControlPlane =
    input.archive?.kind === INSTANCE_ARCHIVE_KIND ? input.archive.controlPlane : undefined;
  const archiveRecords =
    archiveControlPlane?.records ??
    (input.archive === undefined
      ? []
      : archiveApps(input.archive).flatMap((app) => appArchiveControlPlaneRecords(app)));
  const controlPlaneRecords =
    archiveRecords.length === 0 ? records : [...records, ...archiveRecords];

  if (controlPlaneRecords.length > 0) {
    await writeInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest: input.manifest,
      snapshot: workspaceControlPlaneSnapshotFromRecords({
        current: archiveControlPlane,
        exportedAt: archiveControlPlane?.exportedAt ?? "1970-01-01T00:00:00.000Z",
        records: controlPlaneRecords,
        schemaUpdatedAt: archiveControlPlane?.schemaUpdatedAt ?? "1970-01-01T00:00:00.000Z",
      }),
      ...(archiveRecords.length === 0
        ? {}
        : {
            sourceLabel: "Instance archive controlPlane",
            validationContext: "Instance archive controlPlane records",
          }),
      workspaceRoot: input.workspaceRoot,
    });
  }

  if (input.archive) {
    await replaceInstanceWorkspaceAppStorageSnapshots({
      manifest: input.manifest,
      snapshots: archiveApps(input.archive).map((app) => ({
        installId: app.app.installId,
        snapshot: appStorageSnapshotFromArchive(app),
      })),
      workspaceRoot: input.workspaceRoot,
    });

    if (input.archiveDir) {
      await replaceInstanceWorkspaceMediaFiles({
        manifest: input.manifest,
        mediaFiles: await readArchiveMediaFiles(input.archiveDir, input.archive),
        workspaceRoot: input.workspaceRoot,
      });
    }
  }
}

function deploymentConfigRecordFromTarget(input: {
  targetAlias: string;
  targetUrl: string;
}): StoredRecord {
  const now = "1970-01-01T00:00:00.000Z";
  const workerName = workerNameFromWorkersDevUrl(input.targetUrl);

  return {
    id: input.targetAlias,
    entity: "deployment-config",
    values: {
      targetId: input.targetAlias,
      targetKind: "instance",
      label: input.targetAlias,
      enabled: true,
      targetUrl: input.targetUrl,
      providerFamily: "cloudflare",
      ...(workerName === undefined ? {} : { workerName }),
      createdAt: now,
      updatedAt: now,
    },
    createdAt: now,
  };
}

function appArchiveControlPlaneRecords(archive: AppArchive): StoredRecord[] {
  return appInstallControlPlaneRecords({
    adminRoute: `/apps/${archive.app.installId}` as `/apps/${string}`,
    createdAt: archive.app.createdAt,
    installId: archive.app.installId,
    label: archive.app.label,
    packageAppKey: archive.app.packageAppKey,
    packageRevision: archive.app.packageRevision,
    publicRoute:
      archive.app.packageAppKey === "site"
        ? (`/sites/${archive.app.installId}` as `/sites/${string}`)
        : undefined,
    publicRoutePrefix:
      archive.app.packageAppKey === "site"
        ? (`/sites/${archive.app.installId}/` as `/sites/${string}/`)
        : undefined,
    schemaRoute: `/apps/${archive.app.installId}/schema` as `/apps/${string}/schema`,
    sourceSchemaHash: archive.app.sourceSchemaHash,
    status: archive.app.status,
    updatedAt: archive.app.updatedAt,
  });
}

function appInstallControlPlaneRecords(install: AppInstall): StoredRecord[] {
  const appInstallRecord: StoredRecord = {
    id: install.installId,
    entity: "app-install",
    values: {
      installId: install.installId,
      packageAppKey: install.packageAppKey,
      packageRevision: install.packageRevision,
      sourceSchemaHash: install.sourceSchemaHash,
      label: install.label,
      status: install.status,
      storageIdentity: `app:${install.installId}`,
      createdAt: install.createdAt,
      updatedAt: install.updatedAt,
    },
    createdAt: install.createdAt,
  };
  const routes: StoredRecord[] = [
    {
      id: `route:${install.installId}:admin`,
      entity: "route",
      values: {
        enabled: true,
        matchPath: install.adminRoute,
        kind: "mount",
        targetProfile: "app",
        appInstall: install.installId,
        surface: "admin",
        createdAt: install.createdAt,
        updatedAt: install.updatedAt,
      },
      createdAt: install.createdAt,
    },
    {
      id: `route:${install.installId}:schema`,
      entity: "route",
      values: {
        enabled: true,
        matchPath: install.schemaRoute,
        kind: "mount",
        targetProfile: "app",
        appInstall: install.installId,
        surface: "schema",
        createdAt: install.createdAt,
        updatedAt: install.updatedAt,
      },
      createdAt: install.createdAt,
    },
  ];

  if (install.publicRoute !== undefined) {
    routes.push({
      id: `route:${install.installId}:public-site`,
      entity: "route",
      values: {
        enabled: true,
        matchPath: install.publicRoute,
        ...(install.publicRoutePrefix === undefined
          ? {}
          : { matchPrefix: install.publicRoutePrefix }),
        kind: "mount",
        targetProfile: "public-site",
        appInstall: install.installId,
        surface: "public-site",
        createdAt: install.createdAt,
        updatedAt: install.updatedAt,
      },
      createdAt: install.createdAt,
    });
  }

  return [appInstallRecord, ...routes];
}

async function readArchiveMediaFiles(
  archiveDir: string,
  archive: PortableArchive,
): Promise<ArchiveDiskMediaFile[]> {
  const files: ArchiveDiskMediaFile[] = [];

  for (const app of archiveApps(archive)) {
    for (const object of app.media.objects) {
      const filePath = path.join(archiveDir, object.archivePath);

      try {
        const bytes = await readFile(filePath);

        files.push({
          archivePath: object.archivePath,
          byteSize: bytes.byteLength,
          bytes,
          contentType: object.contentType,
        });
      } catch (error) {
        if (!isNodeError(error) || error.code !== "ENOENT") {
          throw error;
        }
      }
    }
  }

  return files;
}

function appDeclarationFromInstall(install: AppInstall): FormlessInstanceWorkspaceApp {
  return {
    installId: install.installId,
    packageAppKey: install.packageAppKey,
    label: install.label,
    statePath: `${DEFAULT_FORMLESS_INSTANCE_WORKSPACE_APP_STATE_ROOT}/${install.installId}.json`,
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
  statePath: string,
): FormlessInstanceWorkspaceApp {
  const installId = archive.app.installId;

  return {
    installId,
    packageAppKey: archive.app.packageAppKey,
    label: archive.app.label,
    statePath,
    routes: {
      admin: `/apps/${installId}`,
      schema: `/apps/${installId}/schema`,
      ...(archive.app.packageAppKey === "site" ? { public: `/sites/${installId}` } : {}),
    },
  };
}

async function readWorkspaceArchive(archiveDir: string): Promise<PortableArchive> {
  return parsePortableArchive(
    JSON.parse(
      await readFile(path.join(archiveDir, PORTABLE_ARCHIVE_MANIFEST_FILE), "utf8"),
    ) as unknown,
  );
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
  _options: { appArchiveRoot?: boolean } = {},
) {
  await mkdir(path.join(workspaceRoot, manifest.local.stateRoot), { recursive: true });
}

const sourceOnlyDeploymentIntentEntities = new Set(["deployment-config"]);

function workspaceDeployTargetId() {
  return "instance.primary";
}

type WorkspaceTargetCommandName =
  | "check"
  | "deployment refresh"
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
  const controlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest: input.manifest,
    workspaceRoot: input.workspaceRoot,
  });
  const deploymentConfig = selectLocalWorkspaceDeploymentConfig(
    controlPlane?.records.filter((record) => !record.deletedAt) ?? [],
    input.targetAlias,
    {
      commandName: input.commandName,
      required: input.required,
    },
  );

  return deploymentConfig === undefined
    ? undefined
    : workspaceTargetFromDeploymentConfig(deploymentConfig, input.commandName);
}

function requireWorkspaceDeployAccountId(deploymentConfig: StoredRecord | undefined): string {
  const accountId = stringRecordValue(deploymentConfig, "accountId")?.trim();

  if (!accountId) {
    throw new Error("Formless instance domains plan requires deployment-config.accountId.");
  }

  return accountId;
}

function selectLocalWorkspaceDeploymentSource(
  controlPlane: WorkspaceControlPlaneRecords | undefined,
  targetAlias: string | null | undefined,
  options: { commandName: WorkspaceTargetCommandName },
): LocalWorkspaceDeploymentSource {
  if (!controlPlane) {
    if (targetAlias?.trim()) {
      throw new Error(
        `Formless instance ${options.commandName} target "${targetAlias.trim()}" was not found.`,
      );
    }

    return {};
  }

  const records = controlPlane.records.filter((record) => !record.deletedAt);
  const deploymentConfig = selectLocalWorkspaceDeploymentConfig(records, targetAlias, {
    commandName: options.commandName,
    required: false,
  });
  const credentialProfile =
    deploymentConfig === undefined
      ? undefined
      : credentialProfileFromDeploymentConfig(deploymentConfig);

  return {
    deploymentConfig,
    ...(credentialProfile === undefined ? {} : { credentialProfile }),
  };
}

function selectLocalWorkspaceDeploymentConfig(
  records: readonly StoredRecord[],
  targetAlias: string | null | undefined,
  options: { commandName: WorkspaceTargetCommandName; required: boolean },
): StoredRecord | undefined {
  const targets = records.filter(
    (record) =>
      record.entity === "deployment-config" &&
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
        `Formless instance ${options.commandName} requires an enabled instance deployment-config record.`,
      );
    }

    return undefined;
  }

  throw new Error(
    `Formless instance ${options.commandName} targetAlias is required when multiple deployment configs exist.`,
  );
}

function workspaceTargetFromDeploymentConfig(
  record: StoredRecord,
  commandName: WorkspaceTargetCommandName,
): FormlessInstanceWorkspaceTarget {
  const targetId = stringRecordValue(record, "targetId") ?? record.id;
  const targetUrl = stringRecordValue(record, "targetUrl");

  if (targetUrl === undefined) {
    throw new Error(
      `Formless instance ${commandName} deployment-config "${targetId}" requires targetUrl.`,
    );
  }

  return {
    alias: targetId,
    url: normalizeFormlessInstanceWorkspaceTargetUrl(targetUrl),
  };
}

function credentialProfileFromDeploymentConfig(record: StoredRecord): string | null | undefined {
  const credentialRef = stringRecordValue(record, "credentialRef")?.trim();

  if (credentialRef === undefined || credentialRef === "") {
    return undefined;
  }

  if (!credentialRef.startsWith(FORMLESS_ALCHEMY_PROFILE_REF_PREFIX)) {
    throw new Error(
      `Formless instance deployment-config "${record.id}" credentialRef must use ${FORMLESS_ALCHEMY_PROFILE_REF_PREFIX}<profile>.`,
    );
  }

  const profile = credentialRef.slice(FORMLESS_ALCHEMY_PROFILE_REF_PREFIX.length).trim();

  if (!profile) {
    throw new Error(`Formless instance deployment-config "${record.id}" credentialRef is empty.`);
  }

  return profile === FORMLESS_ALCHEMY_DEFAULT_PROFILE ? null : profile;
}

type LocalWorkspaceDeploymentPlanResult = {
  credentialProfile: string | null;
  credentialProfileFromConfig: boolean;
  manifest: FormlessInstanceWorkspaceManifest;
  plan: FormlessInstanceDeploymentPlan;
  selectedTarget: FormlessInstanceWorkspaceTarget;
};

type LocalWorkspaceDeploymentDesiredState = {
  logicalIds: string[];
  resourceCount: number;
  resourceGraph: DeployResourceGraph;
  resourcesByKind: Record<DeployResourceKind, number>;
  routeTargetCount: number;
  sourceFingerprint: string;
  targetId: string;
};

type LocalWorkspaceDeploymentSource = {
  credentialProfile?: string | null;
  deploymentConfig?: StoredRecord;
};

async function resolveLocalWorkspaceDeploymentAccount(input: {
  accountDiscovery: FormlessInstanceAccountDiscoveryAdapter;
  credentialProfile?: string | null;
  deploymentConfig?: StoredRecord;
}): Promise<FormlessInstanceDeploymentAccount> {
  const credentialProfile = input.credentialProfile ?? null;
  const configuredAccountId = stringRecordValue(input.deploymentConfig, "accountId");

  const accounts = await input.accountDiscovery.listAccounts({ credentialProfile });

  if (!Array.isArray(accounts)) {
    throw new Error("Cloudflare account discovery adapter must return an account array.");
  }

  const account =
    configuredAccountId === undefined || configuredAccountId === ""
      ? selectOnlyFormlessInstanceAccount({ accounts, credentialProfile })
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
  adoptExistingDeployment: boolean;
  credentialProfile?: string | null;
  deploymentConfig?: StoredRecord;
  manifest: FormlessInstanceWorkspaceManifest;
  packageVersion: string;
  targetAlias?: string | null;
}): LocalWorkspaceDeploymentPlanResult {
  const credentialProfile = input.credentialProfile ?? null;
  const credentialProfileFromConfig = input.credentialProfile !== undefined;
  const workerName = deploymentWorkerNameFromConfigOrManifest({
    deploymentConfig: input.deploymentConfig,
    manifest: input.manifest,
  });
  const plan = planFormlessInstanceDeployment({
    account: input.account,
    adoptExistingDeployment: input.adoptExistingDeployment,
    instanceName: workerName,
    packageVersion: input.packageVersion,
  });

  const targetAlias =
    input.targetAlias ??
    stringRecordValue(input.deploymentConfig, "targetId") ??
    input.deploymentConfig?.id ??
    workspaceDeployTargetId();
  const targetUrl = stringRecordValue(input.deploymentConfig, "targetUrl");
  const selectedTarget = {
    alias: targetAlias,
    url:
      targetUrl === undefined
        ? plan.expectedUrl.url
        : normalizeFormlessInstanceWorkspaceTargetUrl(targetUrl),
  };

  if (selectedTarget.url !== plan.expectedUrl.url) {
    throw new Error(
      `Formless push target "${targetAlias}" targetUrl ${selectedTarget.url} does not match planned URL ${plan.expectedUrl.url}.`,
    );
  }

  return {
    credentialProfile,
    credentialProfileFromConfig,
    manifest: input.manifest,
    plan,
    selectedTarget,
  };
}

function projectLocalWorkspaceDeploymentDesiredState(input: {
  controlPlane: WorkspaceControlPlaneRecords | undefined;
  plan: FormlessInstanceDeploymentPlan;
  targetId: string;
}): LocalWorkspaceDeploymentDesiredState {
  const routeProjection = projectDeployControlPlaneDesiredState(
    deployDesiredStateProjectionInputFromControlPlaneRecords({
      records: input.controlPlane?.records ?? [],
      instanceId: input.plan.runtimeVars.FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID,
      targetId: input.targetId,
      workerName: input.plan.resources.worker.name,
    }),
  );
  const resourceGraph = routeProjection.resourceGraph;

  return {
    logicalIds: resourceGraph.resources.map((resource) => resource.logicalId),
    resourceCount: resourceGraph.resources.length,
    resourceGraph,
    resourcesByKind: deployResourceCountsByKind(resourceGraph),
    routeTargetCount: routeProjection.routeTargets.length,
    sourceFingerprint: routeProjection.sourceFingerprint,
    targetId: input.targetId,
  };
}

function formlessInstanceWorkspaceDeploymentPlan(input: {
  commandName?: "deploy" | "destroy" | "domains run";
  deploymentConfig?: StoredRecord;
  manifest: FormlessInstanceWorkspaceManifest;
  packageVersion: string;
  selectedTarget: FormlessInstanceWorkspaceTarget;
}): FormlessInstanceDeploymentPlan {
  const commandName = input.commandName ?? "deploy";
  const targetUrl = input.selectedTarget.url;
  const workerName = deploymentWorkerNameFromConfigOrManifest({
    deploymentConfig: input.deploymentConfig,
    manifest: input.manifest,
  });
  const facts = workersDevTargetFacts(targetUrl, workerName);
  const accountId = stringRecordValue(input.deploymentConfig, "accountId")?.trim();

  if (!accountId) {
    throw new Error(`Formless instance ${commandName} requires deployment-config.accountId.`);
  }

  return planFormlessInstanceDeployment({
    account: {
      id: accountId,
      workersDevSubdomain: facts.workersDevSubdomain,
    },
    adoptExistingDeployment: true,
    instanceName: facts.workerName,
    packageVersion: input.packageVersion,
  });
}

function deploymentWorkerNameFromConfigOrManifest(input: {
  deploymentConfig?: StoredRecord;
  manifest: FormlessInstanceWorkspaceManifest;
}): string {
  const workerName = stringRecordValue(input.deploymentConfig, "workerName")?.trim();

  return workerName === undefined || workerName === "" ? input.manifest.name : workerName;
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
    throw new Error("Formless push provider reconciliation supports workers.dev target URLs only.");
  }

  const labels = url.hostname.slice(0, -suffix.length).split(".");

  if (labels.length !== 2) {
    throw new Error("Formless push provider reconciliation requires a workers.dev target host.");
  }

  const [workerName, workersDevSubdomain] = labels;

  if (!workerName || !workersDevSubdomain) {
    throw new Error("Formless push provider reconciliation requires a workers.dev target host.");
  }

  if (expectedWorkerName !== undefined && expectedWorkerName !== workerName) {
    throw new Error(
      `Formless push provider target worker "${workerName}" does not match deployment-config.workerName or manifest name "${expectedWorkerName}".`,
    );
  }

  return { workerName, workersDevSubdomain };
}

async function readWorkspaceAppStateForPush(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
  controlPlane: WorkspaceControlPlaneRecords | undefined,
  packageResolver: AppPackageResolver,
): Promise<WorkspaceAppStateArchive[]> {
  return readRequiredWorkspaceAppState({
    controlPlane,
    manifest,
    operation: "push",
    packageResolver,
    workspaceRoot,
  });
}

async function readRequiredWorkspaceAppState(input: {
  controlPlane: WorkspaceControlPlaneRecords | undefined;
  manifest: FormlessInstanceWorkspaceManifest;
  operation: "local dev" | "push";
  packageResolver: AppPackageResolver;
  workspaceRoot: string;
}): Promise<WorkspaceAppStateArchive[]> {
  const appState: WorkspaceAppStateArchive[] = [];

  for (const app of controlPlaneAppInstallRecords(input.controlPlane)) {
    const statePath = instanceWorkspaceAppStateRelativePath(input.manifest, app.installId);
    const state = await readWorkspaceAppStateForCheck({
      install: app,
      manifest: input.manifest,
      packageResolver: input.packageResolver,
      workspaceRoot: input.workspaceRoot,
    });

    validateRequiredWorkspaceAppState({
      install: app,
      operation: input.operation,
      packageResolver: input.packageResolver,
      state,
      statePath,
    });

    appState.push(state as WorkspaceAppStateArchive);
  }

  return appState.sort((left, right) =>
    left.appArchive.app.installId.localeCompare(right.appArchive.app.installId),
  );
}

function validateRequiredWorkspaceAppState(input: {
  install: WorkspaceControlPlaneAppInstallRecord;
  operation: "local dev" | "push";
  packageResolver: AppPackageResolver;
  state: WorkspaceAppStateArchive | undefined;
  statePath: string;
}): asserts input is {
  install: WorkspaceControlPlaneAppInstallRecord;
  operation: "local dev" | "push";
  packageResolver: AppPackageResolver;
  state: WorkspaceAppStateArchive;
  statePath: string;
} {
  const prefix = `Formless instance ${input.operation}`;

  if (!input.state) {
    throw new Error(`${prefix} requires local app state ${input.statePath}.`);
  }

  const archiveApp = input.state.appArchive.app;

  if (archiveApp.installId !== input.install.installId) {
    throw new Error(
      `${prefix} app state ${input.statePath} has install id "${archiveApp.installId}", expected "${input.install.installId}".`,
    );
  }

  if (archiveApp.packageAppKey !== input.install.packageAppKey) {
    throw new Error(
      `${prefix} app state ${input.statePath} has package "${archiveApp.packageAppKey}", expected "${input.install.packageAppKey}".`,
    );
  }

  const packageApp = findResolvedAppPackage(input.install.packageAppKey, input.packageResolver);

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
      `${prefix} app state ${input.statePath} has package revision ${archiveApp.packageRevision}, expected ${packageApp.packageRevision}.`,
    );
  }

  if (archiveApp.sourceSchemaKey !== packageApp.sourceSchemaKey) {
    throw new Error(
      `${prefix} app state ${input.statePath} has source schema key "${archiveApp.sourceSchemaKey}", expected "${packageApp.sourceSchemaKey}".`,
    );
  }

  if (archiveApp.sourceSchemaHash !== packageApp.sourceSchemaHash) {
    throw new Error(
      `${prefix} app state ${input.statePath} has source schema hash "${archiveApp.sourceSchemaHash}", expected "${packageApp.sourceSchemaHash}".`,
    );
  }

  validateWorkspaceAppStateMediaReferences({
    operation: input.operation,
    state: input.state,
    statePath: input.statePath,
  });
}

function validateWorkspaceAppStateMediaReferences(input: {
  operation: "local dev" | "push";
  state: WorkspaceAppStateArchive;
  statePath: string;
}) {
  const prefix = `Formless instance ${input.operation}`;

  if (input.state.missingMediaFiles.length > 0) {
    throw new Error(
      `${prefix} app state ${input.statePath} is missing media files: ${input.state.missingMediaFiles.join(", ")}.`,
    );
  }

  const mediaFilesByPath = new Map(input.state.mediaFiles.map((file) => [file.archivePath, file]));
  const seenArchivePaths = new Set<string>();

  for (const object of input.state.appArchive.media.objects) {
    if (seenArchivePaths.has(object.archivePath)) {
      throw new Error(
        `${prefix} app state ${input.statePath} has duplicate media file "${object.archivePath}".`,
      );
    }

    seenArchivePaths.add(object.archivePath);

    const file = mediaFilesByPath.get(object.archivePath);

    if (!file) {
      throw new Error(
        `${prefix} app state ${input.statePath} is missing media file "${object.archivePath}".`,
      );
    }

    if (file.byteSize !== object.byteSize) {
      throw new Error(
        `${prefix} app state ${input.statePath} media file "${object.archivePath}" has ${file.byteSize} bytes, expected ${object.byteSize}.`,
      );
    }
  }
}

async function writeComposedWorkspacePushArchive(input: {
  archiveRoot: string;
  appState: readonly WorkspaceAppStateArchive[];
  controlPlane?: WorkspaceControlPlaneRecords;
  exportedAt: string;
}): Promise<PushFormlessInstanceWorkspaceSource> {
  const appArchives = input.appState.map((state) => state.appArchive);
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
    ...(input.controlPlane === undefined
      ? {}
      : { controlPlane: controlPlaneSnapshotForArchive(input.controlPlane, input.exportedAt) }),
    apps: appArchives,
  };
  return writePortableArchiveDirectory(
    {
      archive: instanceArchive,
      mediaFiles: input.appState.flatMap((state) => state.mediaFiles),
      outDir: input.archiveRoot,
    },
    { cwd: "/" },
  );
}

function controlPlaneSnapshotForArchive(
  controlPlane: WorkspaceControlPlaneRecords,
  exportedAt: string,
): ArchiveControlPlaneSnapshot {
  return workspaceControlPlaneSnapshotFromRecords({
    current: controlPlane,
    exportedAt,
    records: controlPlane.records,
    schemaUpdatedAt: controlPlane.schemaUpdatedAt,
  });
}

function workspaceControlPlaneSnapshotFromRecords(input: {
  current: WorkspaceControlPlaneRecords | undefined;
  exportedAt: string;
  records: StoredRecord[];
  schemaUpdatedAt: string;
}): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
    schemaKey: input.current?.schemaKey ?? INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
    exportedAt: input.exportedAt,
    schemaUpdatedAt: input.schemaUpdatedAt,
    sourceCursor: input.records.length,
    schema: input.current?.schema ?? instanceControlPlaneSchema,
    records: input.records,
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

function selectWorkspaceWorkerName(
  deploymentConfig: StoredRecord | undefined,
  target: FormlessInstanceWorkspaceTarget | undefined,
): string {
  const workerName =
    stringRecordValue(deploymentConfig, "workerName") ?? workerNameFromWorkersDevUrl(target?.url);

  if (!workerName) {
    throw new Error(
      "Formless instance command requires deployment-config.workerName or a workers.dev target URL.",
    );
  }

  return workerName;
}

async function readLiveWorkspaceDomainIntents(
  input: {
    adminToken?: string | null;
    target: FormlessInstanceWorkspaceTarget;
  },
  dependencies: { fetch: typeof fetch },
): Promise<FormlessInstanceWorkspaceDomainIntent[]> {
  const liveMappings = await readFormlessInstanceDomainMappings(
    { adminToken: input.adminToken, targetUrl: input.target.url },
    dependencies,
  );

  return liveMappings.mappings.map(workspaceDomainIntentFromLiveMapping);
}

function workspaceDomainIntentsFromSource(
  manifest: FormlessInstanceWorkspaceManifest,
  controlPlane: WorkspaceControlPlaneRecords | undefined,
): FormlessInstanceWorkspaceDomainIntent[] {
  if (manifest.domains !== undefined) {
    return [...manifest.domains].sort(compareWorkspaceDomainIntents);
  }

  return (controlPlane?.records ?? [])
    .filter(
      (record) =>
        !record.deletedAt &&
        record.entity === "route" &&
        stringRecordValue(record, "kind") === "mount" &&
        stringRecordValue(record, "matchHost") !== undefined,
    )
    .map(workspaceDomainIntentFromRouteRecord)
    .sort(compareWorkspaceDomainIntents);
}

function shouldCompareWorkspaceDomainIntents(
  manifest: FormlessInstanceWorkspaceManifest,
  localDomainIntents: readonly FormlessInstanceWorkspaceDomainIntent[],
  liveDomains: readonly FormlessInstanceWorkspaceDomainIntent[],
): boolean {
  return (
    manifest.domains !== undefined || (localDomainIntents.length > 0 && liveDomains.length > 0)
  );
}

function workspaceDomainIntentFromRouteRecord(
  record: StoredRecord,
): FormlessInstanceWorkspaceDomainIntent {
  const host = stringRecordValue(record, "matchHost");
  const profile = workspaceDomainProfileFromRouteTargetProfile(
    stringRecordValue(record, "targetProfile"),
  );
  const targetInstallId = stringRecordValue(record, "appInstall");

  if (host === undefined) {
    throw new Error(`Workspace route "${record.id}" is missing matchHost.`);
  }

  if (profile !== "instance" && targetInstallId === undefined) {
    throw new Error(`Workspace route "${record.id}" profile "${profile}" is missing appInstall.`);
  }

  return {
    enabled: booleanRecordValue(record, "enabled") ?? true,
    host,
    profile,
    ...(targetInstallId === undefined ? {} : { targetInstallId }),
  };
}

function workspaceDomainProfileFromRouteTargetProfile(
  targetProfile: string | undefined,
): FormlessInstanceWorkspaceDomainIntent["profile"] {
  switch (targetProfile) {
    case "app":
    case "instance":
      return targetProfile;
    case "public-site":
      return "publicSite";
    default:
      throw new Error(`Workspace domain route targetProfile is invalid: ${targetProfile ?? ""}`);
  }
}

function compareWorkspaceDomainIntents(
  left: FormlessInstanceWorkspaceDomainIntent,
  right: FormlessInstanceWorkspaceDomainIntent,
): number {
  return (
    left.host.localeCompare(right.host) ||
    left.profile.localeCompare(right.profile) ||
    (left.targetInstallId ?? "").localeCompare(right.targetInstallId ?? "")
  );
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

async function readWorkspaceAdminToken(
  workspaceRoot: string,
  dependencies: { env?: NodeJS.ProcessEnv },
): Promise<string | null> {
  const secretState = await readFormlessInstanceWorkspaceSecretState(workspaceRoot);

  return resolveFormlessInstanceWorkspaceAdminToken({
    env: dependencies.env,
    secretState,
  });
}

async function readWorkspaceLocalAuthorityAdminToken(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
  dependencies: { env?: NodeJS.ProcessEnv },
): Promise<string | null> {
  const envAdminToken = resolveFormlessInstanceWorkspaceAdminToken({ env: dependencies.env });

  if (envAdminToken) {
    return envAdminToken;
  }

  const localDevSecretState = await readFormlessInstanceWorkspaceLocalDevSecretState(
    formlessInstanceWorkspaceLocalStateRoot(workspaceRoot, manifest),
  );
  const localDevAdminToken = resolveFormlessInstanceWorkspaceAdminToken({
    explicitAdminToken: localDevSecretState.adminToken,
  });

  if (localDevAdminToken) {
    return localDevAdminToken;
  }

  return readWorkspaceAdminToken(workspaceRoot, dependencies);
}

function rotateCommandEnv(
  env: NodeJS.ProcessEnv | undefined,
  deploymentConfig: StoredRecord | undefined,
): NodeJS.ProcessEnv {
  const accountId = stringRecordValue(deploymentConfig, "accountId");

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
  const projection = projectDeployControlPlaneDesiredState(source.projectionInput);
  const resourceGraph = projection.resourceGraph;
  const enabledHosts = destroyRouteProviderResourceHosts(resourceGraph);

  return {
    enabledHosts,
    resourceGraph,
    resourceCount: resourceGraph.resources.length,
    routeCount: enabledHosts.length,
    source: source.source,
  };
}

async function readDestroyRouteProjectionSource(
  context: FormlessInstanceWorkspaceProviderContext,
): Promise<{
  projectionInput: DeployDesiredStateProjectionInput;
  source: DestroyFormlessInstanceWorkspaceRouteProviderResources["source"];
}> {
  const controlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest: context.manifest,
    workspaceRoot: context.workspaceRoot,
  });

  return {
    projectionInput: deployDesiredStateProjectionInputFromControlPlaneRecords({
      records: controlPlane?.records ?? [],
      instanceId: context.plan.runtimeVars.FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID,
      targetId: workspaceDeployTargetId(),
      workerName: context.plan.runtimeVars.FORMLESS_DOMAIN_PROVIDER_WORKER_NAME,
    }),
    source: "instance:route",
  };
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
  credentialProfile: string | null;
  credentialProfileFromConfig: boolean;
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
  const alchemyProfile = input.credentialProfileFromConfig
    ? input.credentialProfile
    : (input.credentialProfile ?? input.env?.ALCHEMY_PROFILE?.trim());
  const alchemyStateToken = input.env?.ALCHEMY_STATE_TOKEN?.trim();

  if (alchemyProfile) {
    values.ALCHEMY_PROFILE = alchemyProfile;
  } else if (input.credentialProfileFromConfig) {
    delete values.ALCHEMY_PROFILE;
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

async function writeLocalWorkspaceDeploymentConfigSource(input: {
  manifest: FormlessInstanceWorkspaceManifest;
  now: string;
  plan: FormlessInstanceDeploymentPlan;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
}) {
  const current = await readInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest: input.manifest,
    workspaceRoot: input.workspaceRoot,
  });
  const targetId = input.selectedTarget.alias;
  const existing = current?.records.find(
    (record) =>
      record.entity === "deployment-config" &&
      (record.id === targetId || stringRecordValue(record, "targetId") === targetId),
  );
  const deploymentConfigRecord: StoredRecord = {
    id: targetId,
    entity: "deployment-config",
    values: {
      ...existing?.values,
      targetId,
      targetKind: "instance",
      label: stringRecordValue(existing, "label") ?? targetId,
      enabled: true,
      targetUrl: input.selectedTarget.url,
      providerFamily: "cloudflare",
      accountId: input.plan.account.id,
      workerName: input.plan.resources.worker.name,
      createdAt: stringRecordValue(existing, "createdAt") ?? input.now,
      updatedAt: input.now,
    },
    createdAt: existing?.createdAt ?? input.now,
  };
  const records = [
    ...(current?.records.filter(
      (record) =>
        !(
          record.entity === "deployment-config" &&
          (record.id === targetId || stringRecordValue(record, "targetId") === targetId)
        ),
    ) ?? []),
    deploymentConfigRecord,
  ];

  await writeInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest: input.manifest,
    snapshot: workspaceControlPlaneSnapshotFromRecords({
      current,
      exportedAt: input.now,
      records,
      schemaUpdatedAt: input.now,
    }),
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

function missingAdminTokenMessage(action: "adopt" | "deploy" | "push"): string {
  return [
    action === "adopt"
      ? "Formless instance token adopt requires an admin token."
      : action === "push"
        ? "Formless push requires an admin token."
        : "Formless instance deploy requires an admin token.",
    action === "adopt"
      ? `Cloudflare Worker secrets cannot be read back; pass --admin-token or set ${FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME}.`
      : `Cloudflare Worker secrets cannot be read back; run \`formless token adopt\`, run \`formless token rotate\`, or set ${FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME}.`,
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
    throw new Error(`Workspace path must be inside ${workspaceRoot}.`);
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
  adminToken: string,
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
      if (await isInstanceDevServerReady(fetcher, origin, adminToken)) {
        return origin;
      }
    }

    await delay(250);
  }

  throw new Error("Timed out waiting for the Formless instance dev server.");
}

async function isInstanceDevServerReady(
  fetcher: typeof fetch,
  origin: string,
  adminToken: string,
): Promise<boolean> {
  try {
    const response = await fetcher(instanceAppInstallsUrl(origin), {
      headers: siteCliTargetFetchHeaders({ accept: "application/json", adminToken }),
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
  const signalCode = child.signalCode ?? null;

  if (child.exitCode !== null || signalCode !== null) {
    return settleChildExit(child.exitCode, signalCode);
  }

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      settleChildExit(code, signal).then(resolve, reject);
    });
  });
}

function settleChildExit(code: number | null, signal: NodeJS.Signals | null): Promise<void> {
  if (code === 0) {
    return Promise.resolve();
  }

  return Promise.reject(
    new Error(
      signal
        ? `Formless instance dev server exited with signal ${signal}.`
        : `Formless instance dev server exited with code ${code ?? "unknown"}.`,
    ),
  );
}

async function fetchWorkspaceJson<T>(
  fetcher: typeof fetch,
  url: string,
  options: { adminToken?: string | null } = {},
): Promise<T> {
  const response = await fetcher(url, {
    headers: siteCliTargetFetchHeaders({
      accept: "application/json",
      adminToken: options.adminToken,
    }),
  });
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

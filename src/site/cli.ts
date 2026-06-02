import { spawn as nodeSpawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import packageJson from "../../package.json";
import {
  exportAppArchive as exportAppArchiveCommand,
  exportInstanceArchive as exportInstanceArchiveCommand,
  importSiteProjectArchive as importSiteProjectArchiveCommand,
  restoreAppArchive as restoreAppArchiveCommand,
  restorePortableArchive as restorePortableArchiveCommand,
  type ArchiveDiskWriteResult,
  type ImportSiteProjectArchiveResult,
  type RestorePortableArchiveResult,
} from "./archive-workflows.ts";
import {
  cloudflareDomainClientFromEnv,
  type CloudflareDnsRecord,
  type CloudflareDomainApplyHostResult,
  type CloudflareDomainClient,
  type CloudflareDomainIntent,
  type CloudflareDomainPreflightHostPlan,
  type CloudflareDomainPreflightIssue,
  type CloudflareWorkerDomain,
  type CloudflareWorkerRoute,
} from "./cloudflare-domain-client.ts";
import { formlessCliUsage, parseFormlessCliArgs } from "./cli-command.ts";
import type {
  ForgetInstanceDomainProviderRedirectIntentResponse,
  InstanceDomainProviderManualCleanupResponse,
  InstanceDomainProviderPlanResponse,
} from "../shared/domain-provider-api.ts";
import type { ForgetInstanceDomainMappingResponse } from "../shared/instance-domain-mappings.ts";
import {
  nodeAlchemyDomainProviderRuntime,
  runFormlessInstanceDomainProviderApply as runFormlessInstanceDomainProviderApplyCommand,
  runFormlessInstanceDomainProviderDelete as runFormlessInstanceDomainProviderDeleteCommand,
  type RunFormlessInstanceDomainProviderApplyDependencies,
  type RunFormlessInstanceDomainProviderApplyResult,
  type RunFormlessInstanceDomainProviderDeleteInput,
  type RunFormlessInstanceDomainProviderDeleteResult,
} from "./domain-provider-runner.ts";
import { type FormlessInstanceWorkspaceTarget } from "./instance-workspace-config.ts";
import type { ArchiveNormalizationEvidence } from "../shared/archive-normalizers.ts";
import {
  FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_PATH,
  readFormlessInstanceWorkspaceSecretState,
  resolveFormlessInstanceWorkspaceAdminToken,
} from "./instance-workspace-secrets.ts";
import {
  adoptFormlessInstanceWorkspaceAdminToken as adoptFormlessInstanceWorkspaceAdminTokenCommand,
  applyFormlessInstanceWorkspaceDomains as applyFormlessInstanceWorkspaceDomainsCommand,
  checkFormlessInstanceWorkspace as checkFormlessInstanceWorkspaceCommand,
  destroyLocalFormlessWorkspace as destroyLocalFormlessWorkspaceCommand,
  destroyFormlessInstanceWorkspace as destroyFormlessInstanceWorkspaceCommand,
  deployLocalFormlessWorkspace as deployLocalFormlessWorkspaceCommand,
  deployFormlessInstanceWorkspace as deployFormlessInstanceWorkspaceCommand,
  getFormlessInstanceWorkspaceStatus as getFormlessInstanceWorkspaceStatusCommand,
  initFormlessInstanceWorkspace as initFormlessInstanceWorkspaceCommand,
  planFormlessInstanceWorkspaceDomains as planFormlessInstanceWorkspaceDomainsCommand,
  resolveFormlessInstanceWorkspaceProviderContext,
  resolveFormlessInstanceWorkspaceRoot as resolveFormlessInstanceWorkspaceRootCommand,
  resetFormlessInstanceWorkspaceLocalState as resetFormlessInstanceWorkspaceLocalStateCommand,
  runFormlessInstanceWorkspaceDev as runFormlessInstanceWorkspaceDevCommand,
  saveLocalFormlessWorkspace as saveLocalFormlessWorkspaceCommand,
  pullFormlessInstanceWorkspace as pullFormlessInstanceWorkspaceCommand,
  pushFormlessInstanceWorkspace as pushFormlessInstanceWorkspaceCommand,
  rotateFormlessInstanceWorkspaceAdminToken as rotateFormlessInstanceWorkspaceAdminTokenCommand,
  type AdoptFormlessInstanceWorkspaceAdminTokenResult,
  type ApplyFormlessInstanceWorkspaceDomainsInput,
  type ApplyFormlessInstanceWorkspaceDomainsResult,
  type CheckFormlessInstanceWorkspaceResult,
  type DestroyLocalFormlessWorkspaceInput,
  type DestroyFormlessInstanceWorkspaceInput,
  type DestroyFormlessInstanceWorkspaceResult,
  type DeployLocalFormlessWorkspaceInput,
  type DeployFormlessInstanceWorkspaceInput,
  type DeployFormlessInstanceWorkspaceResult,
  type FormlessInstanceWorkspaceDevCommand,
  type FormlessInstanceWorkspaceStatusResult,
  type FormlessInstanceWorkspaceProviderContext,
  type InitFormlessInstanceWorkspaceResult,
  type PlanFormlessInstanceWorkspaceDomainsInput,
  type PlanFormlessInstanceWorkspaceDomainsResult,
  type PullFormlessInstanceWorkspaceResult,
  type PushFormlessInstanceWorkspaceResult,
  type ResetFormlessInstanceWorkspaceLocalStateResult,
  type RotateFormlessInstanceWorkspaceAdminTokenResult,
  type SaveLocalFormlessWorkspaceInput,
  type SaveLocalFormlessWorkspaceResult,
} from "./instance-workspace.ts";
import {
  runFormlessWorkspaceOperation,
  type FormlessWorkspaceOperationDisplayObject,
  type FormlessWorkspaceOperationDisplayValue,
  type FormlessWorkspaceOperationInput,
  type FormlessWorkspaceOperationState,
} from "./instance-workspace-operations.ts";
import {
  forgetFormlessInstanceDomainMapping,
  forgetFormlessInstanceDomainProviderRedirect,
  markFormlessInstanceDomainProviderResourceManuallyRemoved,
  readFormlessInstanceDomainProviderPlan,
} from "./instance-target-client.ts";
import { packageRunScriptCommand } from "./package-commands.ts";
import { formatCliUpgradePlanningReport } from "./upgrade-plan.ts";
import {
  alchemyFormlessInstanceAccountDiscoveryAdapter,
  alchemyFormlessInstanceDeploymentAdapter,
  fetchFormlessInstanceDeploymentHealthCheckAdapter,
  fetchFormlessInstanceOwnerSetupCapabilityAdapter,
  ensureFormlessInstanceLocalSecretEnv,
  FORMLESS_HOME_DIRECTORY,
  FORMLESS_ALCHEMY_APP_NAME,
  writeFormlessInstanceState,
  type FormlessInstanceAccountDiscoveryAdapter,
  type FormlessInstanceDeploymentAdapter,
  type FormlessInstanceDeploymentHealthCheckAdapter,
  type FormlessInstanceLocalSecretEnvStore,
  type FormlessInstanceOwnerSetupCapabilityAdapter,
  type FormlessInstanceStateWriter,
} from "./instance-onboarding.ts";

export {
  formlessCliUsage,
  normalizeSourceUrl,
  parseFormlessCliArgs,
  type FormlessCliCommand,
} from "./cli-command.ts";
export {
  CF_API_TOKEN_ENV_NAME,
  CLOUDFLARE_API_TOKEN_ENV_NAME,
  cloudflareDomainClientFromEnv,
  createFetchCloudflareDomainClient,
  planCloudflareWorkerDomainPreflight,
  workerRoutePatternMatchesHost,
  type CloudflareDnsRecord,
  type CloudflareDomainApplyHostResult,
  type CloudflareDomainClient,
  type CloudflareDomainIntent,
  type CloudflareDomainPreflightHostPlan,
  type CloudflareDomainPreflightIssue,
  type CloudflareDomainPreflightPlan,
  type CloudflareDomainPreflightPolicy,
  type CloudflareWorkerDomain,
  type CloudflareWorkerRoute,
  type CloudflareZone,
} from "./cloudflare-domain-client.ts";
export {
  ALCHEMY_STATE_TOKEN_ENV_NAME,
  nodeAlchemyDomainProviderRuntime,
  runFormlessInstanceDomainProviderApply,
  runFormlessInstanceDomainProviderDelete,
  type DomainProviderAlchemyRuntime,
  type RunFormlessInstanceDomainProviderApplyInput,
  type RunFormlessInstanceDomainProviderApplyResult,
  type RunFormlessInstanceDomainProviderDeleteInput,
  type RunFormlessInstanceDomainProviderDeleteResult,
} from "./domain-provider-runner.ts";
export {
  DEFAULT_FORMLESS_INSTANCE_WORKSPACE_APP_ARCHIVE_ROOT,
  DEFAULT_FORMLESS_INSTANCE_WORKSPACE_ARCHIVE_ROOT,
  DEFAULT_FORMLESS_INSTANCE_WORKSPACE_INSTANCE_ARCHIVE_PATH,
  DEFAULT_FORMLESS_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
  DEFAULT_FORMLESS_INSTANCE_WORKSPACE_TARGET_ALIAS,
  FORMLESS_INSTANCE_WORKSPACE_KIND,
  FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE,
  FORMLESS_INSTANCE_WORKSPACE_VERSION,
  defaultFormlessInstanceWorkspaceManifest,
  formatFormlessInstanceWorkspaceManifest,
  normalizeFormlessInstanceWorkspaceTargetUrl,
  parseFormlessInstanceWorkspaceManifest,
  parseFormlessInstanceWorkspaceManifestJson,
  parseFormlessInstanceWorkspaceTargetAlias,
  type FormlessInstanceWorkspaceApp,
  type FormlessInstanceWorkspaceAppRoutes,
  type FormlessInstanceWorkspaceArchives,
  type FormlessInstanceWorkspaceDefaultAppPolicy,
  type FormlessInstanceWorkspaceDeploy,
  type FormlessInstanceWorkspaceDomainIntent,
  type FormlessInstanceWorkspaceLocalState,
  type FormlessInstanceWorkspaceManifest,
  type FormlessInstanceWorkspaceMigrationPolicy,
  type FormlessInstanceWorkspaceTarget,
} from "./instance-workspace-config.ts";
export {
  FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME,
  FORMLESS_INSTANCE_WORKSPACE_GITIGNORE_ENTRY,
  FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_DIRECTORY,
  FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_FILE,
  FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_PATH,
  ensureFormlessInstanceWorkspaceSecretStateIgnored,
  formlessInstanceWorkspaceSecretStatePath,
  formatFormlessInstanceWorkspaceSecretState,
  parseFormlessInstanceWorkspaceSecretState,
  readFormlessInstanceWorkspaceSecretState,
  resolveFormlessInstanceWorkspaceAdminToken,
  writeFormlessInstanceWorkspaceSecretState,
  type FormlessInstanceWorkspaceSecretState,
  type WriteFormlessInstanceWorkspaceSecretStateResult,
} from "./instance-workspace-secrets.ts";
export {
  checkLocalFormlessWorkspace,
  discoverFormlessInstanceWorkspaceRoot,
  formlessInstanceWorkspaceDevEnv,
  formlessInstanceWorkspaceLocalStateRoot,
  formlessInstanceWorkspaceWranglerPersistPath,
  resolveFormlessInstanceWorkspaceProviderContext,
  resolveFormlessInstanceWorkspaceRoot,
  type AdoptFormlessInstanceWorkspaceAdminTokenDependencies,
  type AdoptFormlessInstanceWorkspaceAdminTokenInput,
  type AdoptFormlessInstanceWorkspaceAdminTokenResult,
  type ApplyFormlessInstanceWorkspaceDomainsDependencies,
  type ApplyFormlessInstanceWorkspaceDomainsInput,
  type ApplyFormlessInstanceWorkspaceDomainsResult,
  type CheckFormlessInstanceWorkspaceDependencies,
  type CheckFormlessInstanceWorkspaceInput,
  type CheckFormlessInstanceWorkspaceResult,
  type CheckLocalFormlessWorkspaceInput,
  type CheckLocalFormlessWorkspaceResult,
  type DestroyFormlessInstanceWorkspaceDependencies,
  type DestroyFormlessInstanceWorkspaceInput,
  type DestroyFormlessInstanceWorkspaceResult,
  type DestroyLocalFormlessWorkspaceDependencies,
  type DestroyLocalFormlessWorkspaceInput,
  type DeployFormlessInstanceWorkspaceDependencies,
  type DeployFormlessInstanceWorkspaceInput,
  type DeployFormlessInstanceWorkspaceResult,
  type DevFormlessInstanceWorkspaceDependencies,
  type DevFormlessInstanceWorkspaceInput,
  type FormlessInstanceWorkspaceStatusDependencies,
  type FormlessInstanceWorkspaceStatusInput,
  type FormlessInstanceWorkspaceStatusResult,
  type FormlessInstanceWorkspaceProviderContext,
  type FormlessInstanceWorkspaceDevCommand,
  type FormlessInstanceWorkspaceDiscoveryResult,
  type FormlessInstanceWorkspaceDriftSummary,
  type FormlessInstanceWorkspacePackageMismatch,
  type InitFormlessInstanceWorkspaceDependencies,
  type InitFormlessInstanceWorkspaceInput,
  type InitFormlessInstanceWorkspaceResult,
  type PullFormlessInstanceWorkspaceAppArchiveResult,
  type PlanFormlessInstanceWorkspaceDomainsDependencies,
  type PlanFormlessInstanceWorkspaceDomainsInput,
  type PlanFormlessInstanceWorkspaceDomainsResult,
  type PullFormlessInstanceWorkspaceDependencies,
  type PullFormlessInstanceWorkspaceInput,
  type PullFormlessInstanceWorkspaceResult,
  type PushFormlessInstanceWorkspaceDependencies,
  type PushFormlessInstanceWorkspaceInput,
  type PushFormlessInstanceWorkspaceResult,
  type ResetFormlessInstanceWorkspaceLocalStateDependencies,
  type ResetFormlessInstanceWorkspaceLocalStateInput,
  type ResetFormlessInstanceWorkspaceLocalStateResult,
  type RotateFormlessInstanceWorkspaceAdminTokenDependencies,
  type RotateFormlessInstanceWorkspaceAdminTokenInput,
  type RotateFormlessInstanceWorkspaceAdminTokenResult,
  type SaveLocalFormlessWorkspaceDependencies,
  type SaveLocalFormlessWorkspaceInput,
  type SaveLocalFormlessWorkspaceResult,
} from "./instance-workspace.ts";
export {
  readFormlessInstanceAppRegistry,
  readFormlessInstanceDeployMetadata,
  readFormlessInstanceDomainMappings,
  readFormlessInstanceOwnerSetupStatus,
  readFormlessInstanceTargetStatus,
  forgetFormlessInstanceDomainMapping,
  forgetFormlessInstanceDomainProviderRedirect,
  markFormlessInstanceDomainProviderResourceManuallyRemoved,
  type FormlessInstanceTargetClientDependencies,
  type FormlessInstanceTargetDeployMetadata,
  type FormlessInstanceTargetStatus,
} from "./instance-target-client.ts";
export {
  buildSiteProjectAppArchiveEntry,
  readSiteProjectAppArchiveEntry,
  type SiteProjectAppArchiveEntry,
  type SiteProjectAppArchiveMediaFile,
  type SiteProjectAppArchiveReport,
} from "./project-archive.ts";
export {
  PORTABLE_ARCHIVE_MANIFEST_FILE,
  type ArchiveRestoreRemoteResult,
} from "./archive-workflows.ts";
export {
  ALCHEMY_PASSWORD_ENV_NAME,
  alchemyFormlessInstanceAccountDiscoveryAdapter,
  alchemyFormlessInstanceDeploymentAdapter,
  checkFormlessInstanceDeployMetadata,
  createFormlessInstanceState,
  DEFAULT_FORMLESS_INSTANCE_NAME,
  deployFormlessInstanceWithAlchemy,
  createFormlessInstanceOwnerSetupCapability,
  ensureFormlessInstanceLocalSecretEnv,
  fetchFormlessInstanceDeploymentHealthCheckAdapter,
  fetchFormlessInstanceOwnerSetupCapabilityAdapter,
  FORMLESS_ALCHEMY_APP_NAME,
  FORMLESS_HOME_DIRECTORY,
  FORMLESS_INSTANCE_DIRECTORY,
  FORMLESS_INSTANCE_LOCAL_ENV_FILE,
  FORMLESS_OWNER_SETUP_ROUTE_PATH,
  formatFormlessInstanceState,
  formlessInstanceStateRoot,
  formatFormlessOwnerSetupUrl,
  FORMLESS_WORKER_COMPATIBILITY_DATE,
  listFormlessInstanceAccountsWithAlchemy,
  normalizeFormlessInstanceName,
  parseFormlessInstanceState,
  parseFormlessInstanceStateJson,
  planFormlessInstanceDeployment,
  runFormlessInstanceOnboarding,
  selectOnlyFormlessInstanceAccount,
  writeFormlessInstanceState,
  type AlchemyFormlessInstanceAccountDiscoveryDependencies,
  type AlchemyFormlessInstanceDeploymentAppOptions,
  type AlchemyFormlessInstanceDeploymentDependencies,
  type AlchemyFormlessInstanceDeploymentWorkerProps,
  type CheckFormlessInstanceDeployMetadataDependencies,
  type CheckFormlessInstanceDeployMetadataInput,
  type CheckFormlessInstanceDeployMetadataResult,
  type CreateFormlessInstanceOwnerSetupCapabilityDependencies,
  type CreateFormlessInstanceOwnerSetupCapabilityInput,
  type CreateFormlessInstanceOwnerSetupCapabilityResult,
  type DeployFormlessInstanceInput,
  type DeployFormlessInstanceResult,
  type DestroyFormlessInstanceInput,
  type DestroyFormlessInstanceResourceStatus,
  type DestroyFormlessInstanceResourceSummary,
  type DestroyFormlessInstanceResult,
  type EnsureFormlessInstanceLocalSecretEnvDependencies,
  type EnsureFormlessInstanceLocalSecretEnvInput,
  type EnsureFormlessInstanceLocalSecretEnvResult,
  type FormlessInstanceAccountDiscoveryAdapter,
  type FormlessInstanceDeploymentAdapter,
  type FormlessInstanceDeploymentHealthCheckAdapter,
  type FormlessInstanceDeploymentPlan,
  type FormlessInstanceDeploymentSecrets,
  type FormlessInstanceLocalSecretEnv,
  type FormlessInstanceLocalSecretEnvStore,
  type FormlessInstanceOwnerSetupCapabilityAdapter,
  type FormlessInstanceState,
  type FormlessInstanceStateWriter,
  type ListFormlessInstanceAccountsInput,
  type RunFormlessInstanceOnboardingDependencies,
  type RunFormlessInstanceOnboardingInput,
  type RunFormlessInstanceOnboardingResult,
  type SelectFormlessInstanceAccountInput,
  type WriteFormlessInstanceStateDependencies,
  type WriteFormlessInstanceStateInput,
  type WriteFormlessInstanceStateResult,
} from "./instance-onboarding.ts";

export type FormlessCliRunCommandOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

export type FormlessCliDependencies = {
  accountDiscovery: FormlessInstanceAccountDiscoveryAdapter;
  cloudflareDomainClient: () => CloudflareDomainClient;
  cwd: string;
  deploymentAdapter: FormlessInstanceDeploymentAdapter;
  domainProviderApplyRuntime?: RunFormlessInstanceDomainProviderApplyDependencies["runtime"];
  env: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  healthCheck: FormlessInstanceDeploymentHealthCheckAdapter;
  localSecretEnv: FormlessInstanceLocalSecretEnvStore;
  log: (message: string) => void;
  now: () => string;
  openBrowser: (url: string) => Promise<void>;
  packageRoot: string;
  randomToken: () => string;
  runCommand: (
    command: string,
    args: string[],
    options: FormlessCliRunCommandOptions,
  ) => Promise<void>;
  spawn: typeof nodeSpawn;
  stateRoot: string;
  stateWriter: FormlessInstanceStateWriter;
  setupCapability: FormlessInstanceOwnerSetupCapabilityAdapter;
};

async function resolveTopLevelFormlessWorkspacePath(
  input: { workspacePath?: string | null },
  dependencies: Pick<FormlessCliDependencies, "cwd">,
): Promise<string> {
  return resolveFormlessInstanceWorkspaceRootCommand({
    cwd: dependencies.cwd,
    workspacePath: input.workspacePath,
  });
}

export async function runFormlessCli(
  args: string[],
  dependencies: FormlessCliDependencies = nodeFormlessCliDependencies(),
) {
  const command = parseFormlessCliArgs(args);

  switch (command.kind) {
    case "help":
      dependencies.log(formlessCliUsage());
      return;
    case "workspaceDev": {
      await runCliWorkspaceOperation(
        {
          includeDeploymentStatus: false,
          kind: "status",
          workspacePath: command.workspacePath,
        },
        dependencies,
      );
      await runFormlessInstanceWorkspaceDev(
        {
          workspacePath: await resolveTopLevelFormlessWorkspacePath(command, dependencies),
        },
        dependencies,
        {
          devCommand: packageRunScriptCommand("dev", dependencies.env),
        },
      );
      return;
    }
    case "workspaceCheck": {
      const result = await runCliWorkspaceOperation(
        {
          kind: "check",
          targetAlias: command.targetAlias,
          workspacePath: command.workspacePath,
        },
        dependencies,
      );
      dependencies.log(formatCliWorkspaceOperationResult(result));
      return;
    }
    case "workspaceSave": {
      const result = await runCliWorkspaceOperation(
        {
          check: command.check,
          kind: "save",
          workspacePath: command.workspacePath,
        },
        dependencies,
      );
      dependencies.log(formatCliWorkspaceOperationResult(result));
      return;
    }
    case "workspaceDeploy": {
      const result = await runCliWorkspaceOperation(
        {
          kind: "deployApply",
          migrationPolicy: command.migrationPolicy,
          targetAlias: command.targetAlias,
          workspacePath: command.workspacePath,
        },
        dependencies,
      );
      dependencies.log(formatCliWorkspaceOperationResult(result));
      return;
    }
    case "workspaceDestroy": {
      const result = await destroyLocalFormlessWorkspace(
        {
          confirm: command.confirm,
          targetAlias: command.targetAlias,
          workspacePath: await resolveTopLevelFormlessWorkspacePath(command, dependencies),
        },
        dependencies,
      );
      dependencies.log(formatInstanceWorkspaceDestroyResult(result, dependencies.cwd));
      return;
    }
    case "archiveExport": {
      const result = await exportInstanceArchive(command, dependencies);
      dependencies.log(
        formatArchiveWriteResult("Instance archive exported", result, dependencies.cwd),
      );
      return;
    }
    case "archiveExportApp": {
      const result = await exportAppArchive(command, dependencies);
      dependencies.log(
        formatArchiveWriteResult(
          `App archive exported for ${command.installId}`,
          result,
          dependencies.cwd,
        ),
      );
      return;
    }
    case "archiveRestore": {
      const result = await restorePortableArchive(command, dependencies);
      dependencies.log(
        formatArchiveRestoreResult("Archive restore", command.apply, result, dependencies.cwd),
      );
      return;
    }
    case "archiveRestoreApp": {
      const result = await restoreAppArchive(command, dependencies);
      dependencies.log(
        formatArchiveRestoreResult(
          `App archive restore for ${command.installId}`,
          command.apply,
          result,
          dependencies.cwd,
        ),
      );
      return;
    }
    case "archiveImportSite": {
      const result = await importSiteProjectArchive(command, dependencies);
      dependencies.log(
        [
          `Site project archive written for ${result.report.installId}.`,
          `Archive: ${formatCliPath(dependencies.cwd, result.archivePath)}.`,
          `Records: ${result.recordCount}.`,
          `Media files: ${result.mediaCount}.`,
        ].join("\n"),
      );
      return;
    }
    case "instanceInitWorkspace": {
      const result = await initFormlessInstanceWorkspace(command, dependencies);
      dependencies.log(formatInstanceWorkspaceInitResult(result, dependencies.cwd));
      return;
    }
    case "instanceStatus": {
      const result = await runCliWorkspaceOperation(
        {
          includeDeploymentStatus: true,
          kind: "status",
          targetAlias: command.targetAlias,
          workspacePath: command.workspacePath,
        },
        dependencies,
      );
      dependencies.log(formatCliWorkspaceOperationResult(result));
      return;
    }
    case "instancePull": {
      const result = await runCliWorkspaceOperation(
        {
          kind: "pull",
          targetAlias: command.targetAlias,
          workspacePath: command.workspacePath,
        },
        dependencies,
      );
      dependencies.log(formatCliWorkspaceOperationResult(result));
      return;
    }
    case "instanceCheck": {
      const result = await runCliWorkspaceOperation(
        {
          kind: "check",
          targetAlias: command.targetAlias,
          workspacePath: command.workspacePath,
        },
        dependencies,
      );
      dependencies.log(formatCliWorkspaceOperationResult(result));
      return;
    }
    case "instancePush": {
      const result = await runCliWorkspaceOperation(
        {
          allowStale: command.allowStale,
          apply: command.apply,
          kind: "push",
          replace: command.replace,
          replaceInstallSet: command.replaceInstallSet,
          targetAlias: command.targetAlias,
          workspacePath: command.workspacePath,
        },
        dependencies,
      );
      dependencies.log(formatCliWorkspaceOperationResult(result));
      return;
    }
    case "instanceDev":
      await runCliWorkspaceOperation(
        {
          includeDeploymentStatus: false,
          kind: "status",
          workspacePath: command.workspacePath,
        },
        dependencies,
      );
      await runFormlessInstanceWorkspaceDev(command, dependencies, {
        devCommand: packageRunScriptCommand("dev", dependencies.env),
      });
      return;
    case "instanceResetLocal": {
      const result = await resetFormlessInstanceWorkspaceLocalState(command, dependencies);
      dependencies.log(formatInstanceWorkspaceResetLocalResult(result, dependencies.cwd));
      return;
    }
    case "instanceTokenAdopt": {
      const result = await adoptFormlessInstanceWorkspaceAdminToken(command, dependencies);
      dependencies.log(formatInstanceWorkspaceTokenAdoptResult(result, dependencies.cwd));
      return;
    }
    case "instanceTokenRotate": {
      const result = await rotateFormlessInstanceWorkspaceAdminToken(command, dependencies);
      dependencies.log(formatInstanceWorkspaceTokenRotateResult(result, dependencies.cwd));
      return;
    }
    case "instanceDeploy": {
      const result = await runCliWorkspaceOperation(
        {
          kind: "deployApply",
          migrationPolicy: command.migrationPolicy,
          targetAlias: command.targetAlias,
          workspacePath: command.workspacePath,
        },
        dependencies,
      );
      dependencies.log(formatCliWorkspaceOperationResult(result));
      return;
    }
    case "instanceDestroy": {
      const result = await destroyFormlessInstanceWorkspace(command, dependencies);
      dependencies.log(formatInstanceWorkspaceDestroyResult(result, dependencies.cwd));
      return;
    }
    case "instanceDomainsRemotePlan": {
      const result = await planFormlessInstanceDomainProviderFromWorkspace(command, dependencies);
      dependencies.log(formatInstanceDomainProviderPlanResult(result, dependencies.cwd));
      return;
    }
    case "instanceDomainsPlan": {
      const result = await planFormlessInstanceWorkspaceDomains(command, dependencies);
      dependencies.log(formatInstanceWorkspaceDomainPlanResult(result, dependencies.cwd));
      return;
    }
    case "instanceDomainsApply": {
      const result = await applyFormlessInstanceWorkspaceDomains(command, dependencies);
      dependencies.log(formatInstanceWorkspaceDomainApplyResult(result, dependencies.cwd));
      return;
    }
    case "instanceDomainsRunApply": {
      const result = await runFormlessInstanceDomainProviderApplyFromWorkspace(
        command,
        dependencies,
      );
      dependencies.log(formatInstanceDomainProviderRunApplyResult(result));
      return;
    }
    case "instanceDomainsRunDelete": {
      const result = await runFormlessInstanceDomainProviderDeleteFromWorkspace(
        command,
        dependencies,
      );
      dependencies.log(formatInstanceDomainProviderRunDeleteResult(result));
      return;
    }
    case "instanceDomainsForgetRoute": {
      const result = await forgetFormlessInstanceDomainRouteFromWorkspace(command, dependencies);
      dependencies.log(formatInstanceDomainRouteForgetResult(result, dependencies.cwd));
      return;
    }
    case "instanceDomainsForgetRedirect": {
      const result = await forgetFormlessInstanceDomainRedirectFromWorkspace(command, dependencies);
      dependencies.log(formatInstanceDomainRedirectForgetResult(result, dependencies.cwd));
      return;
    }
    case "instanceDomainsMarkManuallyRemoved": {
      const result = await markFormlessInstanceDomainProviderResourceManuallyRemovedFromWorkspace(
        command,
        dependencies,
      );
      dependencies.log(formatInstanceDomainProviderManualCleanupResult(result, dependencies.cwd));
      return;
    }
  }
}

async function runCliWorkspaceOperation(
  input: FormlessWorkspaceOperationInput,
  dependencies: FormlessCliDependencies,
): Promise<FormlessWorkspaceOperationState> {
  const state = await runFormlessWorkspaceOperation(
    input,
    {
      ...dependencies,
      packageVersion: packageJson.version,
    },
    { actor: "cli" },
  );

  if (state.status === "failed") {
    throw new Error(state.errors[0]?.message ?? "Workspace operation failed.");
  }

  return state;
}

export async function exportInstanceArchive(
  input: { outDir: string; target: string },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "fetch" | "now"
  > = nodeFormlessCliDependencies(),
): Promise<ArchiveDiskWriteResult> {
  return exportInstanceArchiveCommand(input, dependencies);
}

export async function exportAppArchive(
  input: { installId: string; outDir: string; target: string },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "fetch" | "now"
  > = nodeFormlessCliDependencies(),
): Promise<ArchiveDiskWriteResult> {
  return exportAppArchiveCommand(input, dependencies);
}

export async function restorePortableArchive(
  input: {
    adminToken?: string | null;
    apply: boolean;
    archiveDir: string;
    replace: boolean;
    target: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "fetch" | "now"
  > = nodeFormlessCliDependencies(),
): Promise<RestorePortableArchiveResult> {
  return restorePortableArchiveCommand(input, dependencies);
}

export async function restoreAppArchive(
  input: {
    adminToken?: string | null;
    apply: boolean;
    archiveDir: string;
    installId: string;
    replace: boolean;
    target: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "fetch" | "now"
  > = nodeFormlessCliDependencies(),
): Promise<RestorePortableArchiveResult> {
  return restoreAppArchiveCommand(input, dependencies);
}

export async function importSiteProjectArchive(
  input: {
    installId: string;
    label?: string | null;
    outDir: string;
    projectPath: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "fetch" | "now"
  > = nodeFormlessCliDependencies(),
): Promise<ImportSiteProjectArchiveResult> {
  return importSiteProjectArchiveCommand(input, dependencies);
}

export async function initFormlessInstanceWorkspace(
  input: {
    fromArchive?: string | null;
    fromRemote?: boolean;
    name?: string | null;
    targetAlias?: string;
    targetUrl?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<FormlessCliDependencies, "cwd" | "fetch"> = nodeFormlessCliDependencies(),
): Promise<InitFormlessInstanceWorkspaceResult> {
  return initFormlessInstanceWorkspaceCommand(input, dependencies);
}

export async function getFormlessInstanceWorkspaceStatus(
  input: {
    includeDeploymentStatus?: boolean;
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "fetch"
  > = nodeFormlessCliDependencies(),
): Promise<FormlessInstanceWorkspaceStatusResult> {
  return getFormlessInstanceWorkspaceStatusCommand(input, dependencies);
}

export async function pullFormlessInstanceWorkspace(
  input: {
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "fetch" | "now"
  > = nodeFormlessCliDependencies(),
): Promise<PullFormlessInstanceWorkspaceResult> {
  return pullFormlessInstanceWorkspaceCommand(input, dependencies);
}

export async function checkFormlessInstanceWorkspace(
  input: {
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "fetch" | "now"
  > = nodeFormlessCliDependencies(),
): Promise<CheckFormlessInstanceWorkspaceResult> {
  return checkFormlessInstanceWorkspaceCommand(input, dependencies);
}

export async function saveLocalFormlessWorkspace(
  input: SaveLocalFormlessWorkspaceInput,
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "fetch" | "now"
  > = nodeFormlessCliDependencies(),
): Promise<SaveLocalFormlessWorkspaceResult> {
  return saveLocalFormlessWorkspaceCommand(input, dependencies);
}

export async function pushFormlessInstanceWorkspace(
  input: {
    allowStale?: boolean;
    apply?: boolean;
    replace?: boolean;
    replaceInstallSet?: boolean;
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "fetch" | "now"
  > = nodeFormlessCliDependencies(),
): Promise<PushFormlessInstanceWorkspaceResult> {
  return pushFormlessInstanceWorkspaceCommand(input, dependencies);
}

export async function runFormlessInstanceWorkspaceDev(
  input: {
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "fetch" | "log" | "now" | "packageRoot" | "spawn"
  > = nodeFormlessCliDependencies(),
  options: {
    devCommand?: FormlessInstanceWorkspaceDevCommand;
  } = {},
): Promise<void> {
  return runFormlessInstanceWorkspaceDevCommand(input, {
    ...dependencies,
    devCommand: options.devCommand ?? packageRunScriptCommand("dev", dependencies.env),
  });
}

export async function resetFormlessInstanceWorkspaceLocalState(
  input: {
    workspacePath?: string;
  },
  dependencies: Pick<FormlessCliDependencies, "cwd"> = nodeFormlessCliDependencies(),
): Promise<ResetFormlessInstanceWorkspaceLocalStateResult> {
  return resetFormlessInstanceWorkspaceLocalStateCommand(input, dependencies);
}

export async function deployFormlessInstanceWorkspace(
  input: DeployFormlessInstanceWorkspaceInput,
  dependencies: Pick<
    FormlessCliDependencies,
    | "cwd"
    | "deploymentAdapter"
    | "env"
    | "healthCheck"
    | "localSecretEnv"
    | "packageRoot"
    | "randomToken"
  > = nodeFormlessCliDependencies(),
): Promise<DeployFormlessInstanceWorkspaceResult> {
  return deployFormlessInstanceWorkspaceCommand(input, {
    cwd: dependencies.cwd,
    deploymentAdapter: dependencies.deploymentAdapter,
    env: dependencies.env,
    healthCheck: dependencies.healthCheck,
    localSecretEnv: dependencies.localSecretEnv,
    packageRoot: dependencies.packageRoot,
    packageVersion: packageJson.version,
    randomToken: dependencies.randomToken,
  });
}

export async function deployLocalFormlessWorkspace(
  input: DeployLocalFormlessWorkspaceInput,
  dependencies: Pick<
    FormlessCliDependencies,
    | "accountDiscovery"
    | "cwd"
    | "deploymentAdapter"
    | "env"
    | "fetch"
    | "healthCheck"
    | "localSecretEnv"
    | "now"
    | "packageRoot"
    | "randomToken"
    | "setupCapability"
  > = nodeFormlessCliDependencies(),
): Promise<DeployFormlessInstanceWorkspaceResult> {
  return deployLocalFormlessWorkspaceCommand(input, {
    accountDiscovery: dependencies.accountDiscovery,
    cwd: dependencies.cwd,
    deploymentAdapter: dependencies.deploymentAdapter,
    env: dependencies.env,
    fetch: dependencies.fetch,
    healthCheck: dependencies.healthCheck,
    localSecretEnv: dependencies.localSecretEnv,
    now: dependencies.now,
    packageRoot: dependencies.packageRoot,
    packageVersion: packageJson.version,
    randomToken: dependencies.randomToken,
    setupCapability: dependencies.setupCapability,
  });
}

export async function destroyFormlessInstanceWorkspace(
  input: DestroyFormlessInstanceWorkspaceInput,
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "deploymentAdapter" | "env" | "packageRoot"
  > = nodeFormlessCliDependencies(),
): Promise<DestroyFormlessInstanceWorkspaceResult> {
  return destroyFormlessInstanceWorkspaceCommand(input, {
    cwd: dependencies.cwd,
    deploymentAdapter: dependencies.deploymentAdapter,
    env: dependencies.env,
    packageRoot: dependencies.packageRoot,
    packageVersion: packageJson.version,
  });
}

export async function destroyLocalFormlessWorkspace(
  input: DestroyLocalFormlessWorkspaceInput,
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "deploymentAdapter" | "env" | "packageRoot"
  > = nodeFormlessCliDependencies(),
): Promise<DestroyFormlessInstanceWorkspaceResult> {
  return destroyLocalFormlessWorkspaceCommand(input, {
    cwd: dependencies.cwd,
    deploymentAdapter: dependencies.deploymentAdapter,
    env: dependencies.env,
    packageRoot: dependencies.packageRoot,
    packageVersion: packageJson.version,
  });
}

export type PlanFormlessInstanceDomainProviderResult = {
  plan: InstanceDomainProviderPlanResponse;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type ForgetFormlessInstanceDomainRouteResult = {
  response: ForgetInstanceDomainMappingResponse;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type ForgetFormlessInstanceDomainRedirectResult = {
  response: ForgetInstanceDomainProviderRedirectIntentResponse;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type MarkFormlessInstanceDomainProviderResourceManuallyRemovedResult = {
  response: InstanceDomainProviderManualCleanupResponse;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export async function planFormlessInstanceDomainProviderFromWorkspace(
  input: {
    host?: string | null;
    policy?: ApplyFormlessInstanceWorkspaceDomainsInput["policy"];
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "fetch"
  > = nodeFormlessCliDependencies(),
): Promise<PlanFormlessInstanceDomainProviderResult> {
  const status = await getFormlessInstanceWorkspaceStatus(
    {
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    {
      cwd: dependencies.cwd,
      env: dependencies.env,
      fetch: dependencies.fetch,
    },
  );

  if (!status.selectedTarget) {
    throw new Error("Formless instance domains remote-plan requires a selected target.");
  }

  return {
    plan: await readFormlessInstanceDomainProviderPlan(
      {
        host: input.host,
        policy: input.policy,
        targetUrl: status.selectedTarget.url,
      },
      dependencies,
    ),
    selectedTarget: status.selectedTarget,
    workspaceRoot: status.workspaceRoot,
  };
}

export async function planFormlessInstanceWorkspaceDomains(
  input: {
    host?: string | null;
    policy?: PlanFormlessInstanceWorkspaceDomainsInput["policy"];
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cloudflareDomainClient" | "cwd" | "fetch"
  > = nodeFormlessCliDependencies(),
): Promise<PlanFormlessInstanceWorkspaceDomainsResult> {
  return planFormlessInstanceWorkspaceDomainsCommand(input, {
    cloudflareDomainClient: dependencies.cloudflareDomainClient(),
    cwd: dependencies.cwd,
    fetch: dependencies.fetch,
  });
}

export async function applyFormlessInstanceWorkspaceDomains(
  input: {
    adminToken?: string | null;
    host?: string | null;
    policy?: ApplyFormlessInstanceWorkspaceDomainsInput["policy"];
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cloudflareDomainClient" | "cwd" | "env" | "fetch" | "now"
  > = nodeFormlessCliDependencies(),
): Promise<ApplyFormlessInstanceWorkspaceDomainsResult> {
  return applyFormlessInstanceWorkspaceDomainsCommand(input, {
    cloudflareDomainClient: dependencies.cloudflareDomainClient(),
    cwd: dependencies.cwd,
    env: dependencies.env,
    fetch: dependencies.fetch,
    now: dependencies.now,
  });
}

export async function runFormlessInstanceDomainProviderApplyFromWorkspace(
  input: {
    adminToken?: string | null;
    host?: string | null;
    policy?: ApplyFormlessInstanceWorkspaceDomainsInput["policy"];
    runnerId?: string | null;
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "domainProviderApplyRuntime" | "env" | "fetch" | "randomToken"
  > = nodeFormlessCliDependencies(),
): Promise<RunFormlessInstanceDomainProviderApplyResult> {
  const status = await getFormlessInstanceWorkspaceStatus(
    {
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    {
      cwd: dependencies.cwd,
      env: dependencies.env,
      fetch: dependencies.fetch,
    },
  );

  if (!status.selectedTarget) {
    throw new Error("Formless instance domains run-apply requires a selected target.");
  }

  const secretState = await readFormlessInstanceWorkspaceSecretState(status.workspaceRoot);
  const adminToken = resolveFormlessInstanceWorkspaceAdminToken({
    env: dependencies.env,
    explicitAdminToken: input.adminToken,
    secretState,
  });

  if (!adminToken) {
    throw new Error(
      "Formless instance domains run-apply requires an admin token; run `formless instance token adopt` or pass --admin-token.",
    );
  }

  const providerContext = await resolveFormlessInstanceWorkspaceProviderContext(
    {
      commandName: "domains run",
      targetAlias: input.targetAlias,
      workspacePath: status.workspaceRoot,
    },
    {
      cwd: dependencies.cwd,
      env: dependencies.env,
      packageVersion: packageJson.version,
    },
  );

  return runFormlessInstanceDomainProviderApplyCommand(
    {
      adminToken,
      host: input.host,
      policy: input.policy,
      runnerId: input.runnerId,
      targetUrl: status.selectedTarget.url,
    },
    {
      createRunnerId: () => `formless-cli-${dependencies.randomToken()}`,
      env: dependencies.env,
      fetch: dependencies.fetch,
      ...(dependencies.domainProviderApplyRuntime === undefined
        ? { runtime: workspaceDomainProviderAlchemyRuntime(providerContext) }
        : { runtime: dependencies.domainProviderApplyRuntime }),
    },
  );
}

export async function runFormlessInstanceDomainProviderDeleteFromWorkspace(
  input: {
    adminToken?: string | null;
    host: string;
    logicalId: string;
    resourceKind: RunFormlessInstanceDomainProviderDeleteInput["kind"];
    runnerId?: string | null;
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "domainProviderApplyRuntime" | "env" | "fetch" | "randomToken"
  > = nodeFormlessCliDependencies(),
): Promise<RunFormlessInstanceDomainProviderDeleteResult> {
  const status = await getFormlessInstanceWorkspaceStatus(
    {
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    {
      cwd: dependencies.cwd,
      env: dependencies.env,
      fetch: dependencies.fetch,
    },
  );

  if (!status.selectedTarget) {
    throw new Error("Formless instance domains run-delete requires a selected target.");
  }

  const adminToken = await requireFormlessInstanceDomainCommandAdminToken(
    {
      explicitAdminToken: input.adminToken,
      workspaceRoot: status.workspaceRoot,
    },
    dependencies,
    "run-delete",
  );
  const providerContext = await resolveFormlessInstanceWorkspaceProviderContext(
    {
      commandName: "domains run",
      targetAlias: input.targetAlias,
      workspacePath: status.workspaceRoot,
    },
    {
      cwd: dependencies.cwd,
      env: dependencies.env,
      packageVersion: packageJson.version,
    },
  );

  return runFormlessInstanceDomainProviderDeleteCommand(
    {
      adminToken,
      host: input.host,
      kind: input.resourceKind,
      logicalId: input.logicalId,
      runnerId: input.runnerId,
      targetUrl: status.selectedTarget.url,
    },
    {
      createRunnerId: () => `formless-cli-${dependencies.randomToken()}`,
      env: dependencies.env,
      fetch: dependencies.fetch,
      ...(dependencies.domainProviderApplyRuntime === undefined
        ? { runtime: workspaceDomainProviderAlchemyRuntime(providerContext) }
        : { runtime: dependencies.domainProviderApplyRuntime }),
    },
  );
}

export function workspaceDomainProviderAlchemyRuntime(
  context: FormlessInstanceWorkspaceProviderContext,
  createRuntime: typeof nodeAlchemyDomainProviderRuntime = nodeAlchemyDomainProviderRuntime,
): RunFormlessInstanceDomainProviderApplyDependencies["runtime"] {
  return ({ accountId, env }) =>
    createRuntime({
      accountId,
      appName: FORMLESS_ALCHEMY_APP_NAME,
      env: workspaceDomainProviderEnv(env, context),
      rootDir: context.deploymentStateRoot,
      stage: context.plan.instanceName,
    });
}

function workspaceDomainProviderEnv(
  env: NodeJS.ProcessEnv,
  context: FormlessInstanceWorkspaceProviderContext,
): NodeJS.ProcessEnv {
  return {
    ...env,
    ALCHEMY_PASSWORD: context.secrets.ALCHEMY_PASSWORD,
    ...(context.credentialProfile === null ? {} : { ALCHEMY_PROFILE: context.credentialProfile }),
    ...(context.secrets.CLOUDFLARE_API_TOKEN === undefined
      ? {}
      : { CLOUDFLARE_API_TOKEN: context.secrets.CLOUDFLARE_API_TOKEN }),
  };
}

export async function forgetFormlessInstanceDomainRouteFromWorkspace(
  input: {
    adminToken?: string | null;
    host: string;
    profile: ForgetFormlessInstanceDomainRouteResult["response"]["mapping"]["profile"];
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "fetch"
  > = nodeFormlessCliDependencies(),
): Promise<ForgetFormlessInstanceDomainRouteResult> {
  const status = await getFormlessInstanceWorkspaceStatus(
    {
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    {
      cwd: dependencies.cwd,
      env: dependencies.env,
      fetch: dependencies.fetch,
    },
  );

  if (!status.selectedTarget) {
    throw new Error("Formless instance domains forget-route requires a selected target.");
  }

  const adminToken = await requireFormlessInstanceDomainCommandAdminToken(
    {
      explicitAdminToken: input.adminToken,
      workspaceRoot: status.workspaceRoot,
    },
    dependencies,
    "forget-route",
  );

  return {
    response: await forgetFormlessInstanceDomainMapping(
      {
        adminToken,
        request: {
          host: input.host,
          profile: input.profile,
        },
        targetUrl: status.selectedTarget.url,
      },
      dependencies,
    ),
    selectedTarget: status.selectedTarget,
    workspaceRoot: status.workspaceRoot,
  };
}

export async function forgetFormlessInstanceDomainRedirectFromWorkspace(
  input: {
    adminToken?: string | null;
    fromHost: string;
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "fetch"
  > = nodeFormlessCliDependencies(),
): Promise<ForgetFormlessInstanceDomainRedirectResult> {
  const status = await getFormlessInstanceWorkspaceStatus(
    {
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    {
      cwd: dependencies.cwd,
      env: dependencies.env,
      fetch: dependencies.fetch,
    },
  );

  if (!status.selectedTarget) {
    throw new Error("Formless instance domains forget-redirect requires a selected target.");
  }

  const adminToken = await requireFormlessInstanceDomainCommandAdminToken(
    {
      explicitAdminToken: input.adminToken,
      workspaceRoot: status.workspaceRoot,
    },
    dependencies,
    "forget-redirect",
  );

  return {
    response: await forgetFormlessInstanceDomainProviderRedirect(
      {
        adminToken,
        request: {
          fromHost: input.fromHost,
        },
        targetUrl: status.selectedTarget.url,
      },
      dependencies,
    ),
    selectedTarget: status.selectedTarget,
    workspaceRoot: status.workspaceRoot,
  };
}

export async function markFormlessInstanceDomainProviderResourceManuallyRemovedFromWorkspace(
  input: {
    adminToken?: string | null;
    host: string;
    logicalId: string;
    resourceKind: MarkFormlessInstanceDomainProviderResourceManuallyRemovedResult["response"]["target"]["kind"];
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "fetch"
  > = nodeFormlessCliDependencies(),
): Promise<MarkFormlessInstanceDomainProviderResourceManuallyRemovedResult> {
  const status = await getFormlessInstanceWorkspaceStatus(
    {
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    {
      cwd: dependencies.cwd,
      env: dependencies.env,
      fetch: dependencies.fetch,
    },
  );

  if (!status.selectedTarget) {
    throw new Error("Formless instance domains mark-manually-removed requires a selected target.");
  }

  const adminToken = await requireFormlessInstanceDomainCommandAdminToken(
    {
      explicitAdminToken: input.adminToken,
      workspaceRoot: status.workspaceRoot,
    },
    dependencies,
    "mark-manually-removed",
  );

  return {
    response: await markFormlessInstanceDomainProviderResourceManuallyRemoved(
      {
        adminToken,
        request: {
          host: input.host,
          kind: input.resourceKind,
          logicalId: input.logicalId,
        },
        targetUrl: status.selectedTarget.url,
      },
      dependencies,
    ),
    selectedTarget: status.selectedTarget,
    workspaceRoot: status.workspaceRoot,
  };
}

async function requireFormlessInstanceDomainCommandAdminToken(
  input: { explicitAdminToken?: string | null; workspaceRoot: string },
  dependencies: Pick<FormlessCliDependencies, "env">,
  commandName: "forget-redirect" | "forget-route" | "mark-manually-removed" | "run-delete",
): Promise<string> {
  const secretState = await readFormlessInstanceWorkspaceSecretState(input.workspaceRoot);
  const adminToken = resolveFormlessInstanceWorkspaceAdminToken({
    env: dependencies.env,
    explicitAdminToken: input.explicitAdminToken,
    secretState,
  });

  if (!adminToken) {
    throw new Error(
      `Formless instance domains ${commandName} requires an admin token; run \`formless instance token adopt\` or pass --admin-token.`,
    );
  }

  return adminToken;
}

export async function adoptFormlessInstanceWorkspaceAdminToken(
  input: {
    adminToken?: string | null;
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<FormlessCliDependencies, "cwd" | "env"> = nodeFormlessCliDependencies(),
): Promise<AdoptFormlessInstanceWorkspaceAdminTokenResult> {
  return adoptFormlessInstanceWorkspaceAdminTokenCommand(input, dependencies);
}

export async function rotateFormlessInstanceWorkspaceAdminToken(
  input: {
    adminToken?: string | null;
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "packageRoot" | "randomToken" | "runCommand"
  > = nodeFormlessCliDependencies(),
): Promise<RotateFormlessInstanceWorkspaceAdminTokenResult> {
  return rotateFormlessInstanceWorkspaceAdminTokenCommand(input, dependencies);
}

function runCommandWithSpawn(
  spawn: typeof nodeSpawn,
  command: string,
  args: string[],
  options: FormlessCliRunCommandOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `${command} ${args.join(" ")} exited with signal ${signal}.`
            : `${command} ${args.join(" ")} exited with code ${code ?? "unknown"}.`,
        ),
      );
    });
  });
}

function formatArchiveWriteResult(
  label: string,
  result: ArchiveDiskWriteResult,
  cwd: string,
): string {
  return [
    `${label}.`,
    `Archive: ${formatCliPath(cwd, result.archivePath)}.`,
    `Apps: ${result.appCount}.`,
    `Records: ${result.recordCount}.`,
    `Media files: ${result.mediaCount}.`,
  ].join("\n");
}

function formatArchiveRestoreResult(
  label: string,
  applied: boolean,
  result: RestorePortableArchiveResult,
  cwd: string,
): string {
  const summary = result.remote.report?.summary ?? result.remote.plan?.summary;
  const status = applied ? "applied" : "dry run";
  const upgradePlanning =
    !applied && result.upgradePlanning
      ? formatCliUpgradePlanningReport(result.upgradePlanning).trimEnd()
      : null;
  const archiveNormalizationEvidence = formatArchiveNormalizationEvidence(
    result.archiveNormalizationEvidence,
  );

  if (!result.remote.ok) {
    return [
      upgradePlanning,
      `${label} ${status} failed.`,
      `Archive: ${formatCliPath(cwd, result.archivePath)}.`,
      archiveNormalizationEvidence,
      ...(result.remote.errors ?? []).map((error) => `Error: ${error.message}`),
    ]
      .filter((line): line is string => line !== null)
      .join("\n");
  }

  return [
    upgradePlanning,
    `${label} ${status} ok.`,
    `Archive: ${formatCliPath(cwd, result.archivePath)}.`,
    archiveNormalizationEvidence,
    summary ? `Apps: ${summary.appCount}.` : null,
    summary ? `Created installs: ${summary.createdInstalls.join(", ") || "none"}.` : null,
    summary ? `Replaced installs: ${summary.replacedInstalls.join(", ") || "none"}.` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function formatArchiveNormalizationEvidence(
  evidence: readonly ArchiveNormalizationEvidence[],
): string | null {
  if (evidence.length === 0) {
    return null;
  }

  return `Archive normalization: ${evidence
    .map((entry) => {
      const details =
        entry.details === undefined || entry.details.length === 0
          ? ""
          : ` (${entry.details.join("; ")})`;

      return `${entry.normalizerId} ${entry.archiveKind} version ${entry.fromVersion}->${entry.toVersion}${details}`;
    })
    .join("; ")}.`;
}

function formatCliWorkspaceOperationResult(state: FormlessWorkspaceOperationState): string {
  return [
    `Workspace operation: ${formatWorkspaceOperationLabel(state.operation)} (${state.status}).`,
    "Workspace source: layout-only manifest, control-plane record source, app archives.",
    `Summary: ${state.summary.title}.`,
    ...formatCliDisplayFields(state.summary.fields),
    ...(state.result?.details === undefined
      ? []
      : ["Details:", ...formatCliDisplayFields(state.result.details)]),
    ...(state.result?.deployment === undefined
      ? []
      : ["Deployment execution summary:", ...formatCliDisplayFields(state.result.deployment)]),
  ].join("\n");
}

function formatWorkspaceOperationLabel(operation: FormlessWorkspaceOperationState["operation"]) {
  switch (operation) {
    case "credentialSetup":
      return "credential setup";
    case "deployApply":
      return "deploy apply";
    case "deployPlan":
      return "deploy plan";
    default:
      return operation;
  }
}

function formatCliDisplayFields(fields: FormlessWorkspaceOperationDisplayObject): string[] {
  return Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}: ${formatCliDisplayValue(value)}.`);
}

function formatCliDisplayValue(value: FormlessWorkspaceOperationDisplayValue): string {
  if (value === null) {
    return "none";
  }

  if (Array.isArray(value)) {
    return value.length === 0
      ? "none"
      : value.map((entry) => formatCliDisplayValue(entry)).join(", ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatInstanceWorkspaceInitResult(
  result: InitFormlessInstanceWorkspaceResult,
  cwd: string,
): string {
  return [
    "Instance workspace initialized.",
    `Workspace: ${formatCliPath(cwd, result.workspaceRoot)}.`,
    `Manifest: ${formatCliPath(cwd, result.manifestPath)}.`,
    `Record source: ${result.manifest.source.records}.`,
    `App archives: ${result.manifest.archives.apps}.`,
    `Secret state: ${formatCliPath(cwd, path.join(result.workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_PATH))}.`,
    result.archiveSourcePath ? `Archive source: ${result.archiveSourcePath}.` : null,
    result.remoteStatus
      ? `Deploy metadata: ${formatDeployMetadataVersion(result.remoteStatus.deployMetadata.version)}.`
      : null,
    result.remoteStatus
      ? `Owner setup: ${formatOwnerSetup(result.remoteStatus.ownerSetup)}.`
      : null,
    result.remoteStatus
      ? `Remote apps: ${formatRemoteInstalls(result.remoteStatus.appRegistry.installs)}.`
      : null,
    "Next: run `npx formless dev` and complete setup in the browser.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function formatInstanceWorkspaceResetLocalResult(
  result: ResetFormlessInstanceWorkspaceLocalStateResult,
  cwd: string,
): string {
  return [
    "Instance workspace local state reset.",
    `Workspace: ${formatCliPath(cwd, result.workspaceRoot)}.`,
    `Manifest: ${formatCliPath(cwd, result.manifestPath)}.`,
    `Local state: ${formatCliPath(cwd, result.localStateRoot)}.`,
    "Next dev run will rebuild local runtime state from workspace archives.",
  ].join("\n");
}

function formatInstanceWorkspaceTokenAdoptResult(
  result: AdoptFormlessInstanceWorkspaceAdminTokenResult,
  cwd: string,
): string {
  return [
    "Instance workspace admin token adopted.",
    `Workspace: ${formatCliPath(cwd, result.workspaceRoot)}.`,
    `Secret state: ${formatCliPath(cwd, result.secretPath)}.`,
    `Target: ${formatSelectedTarget(result.selectedTarget)}.`,
  ].join("\n");
}

function formatInstanceWorkspaceTokenRotateResult(
  result: RotateFormlessInstanceWorkspaceAdminTokenResult,
  cwd: string,
): string {
  return [
    "Instance workspace admin token rotated.",
    `Workspace: ${formatCliPath(cwd, result.workspaceRoot)}.`,
    `Secret state: ${formatCliPath(cwd, result.secretPath)}.`,
    `Worker: ${result.workerName}.`,
    `Target: ${formatSelectedTarget(result.selectedTarget)}.`,
  ].join("\n");
}

function formatInstanceWorkspaceDestroyResult(
  result: DestroyFormlessInstanceWorkspaceResult,
  cwd: string,
): string {
  const resources = result.destroy.resources;

  return [
    "Instance workspace destroyed.",
    `Workspace: ${formatCliPath(cwd, result.workspaceRoot)}.`,
    `Target: ${formatSelectedTarget(result.selectedTarget)}.`,
    `Worker: ${result.plan.resources.worker.name}.`,
    `Durable Object namespace: ${result.plan.resources.authority.namespaceName}.`,
    `Media bucket: ${result.plan.resources.mediaBucket.name}.`,
    `Route provider resources: ${formatDestroyRouteProviderResources(
      result.routeProviderResources,
    )}.`,
    `Destroyed resources: Worker ${resources.worker}, Durable Object namespace ${resources.durableObjectNamespace}, R2 media bucket ${resources.mediaBucket}, Worker assets ${resources.workerAssets}, Worker secrets ${resources.workerSecrets}, custom domains ${resources.customDomains}, DNS records ${resources.dnsRecords}, redirects ${resources.redirectRules}, Alchemy state ${resources.alchemyState}.`,
    `Ignored deploy state: ${formatCliPath(cwd, result.deploymentStateRoot)}.`,
    `Deployment facts: ${formatCliPath(cwd, result.deploymentStatePath)}.`,
    `Local deploy secrets: ${formatCliPath(cwd, result.localSecretPath)}.`,
  ].join("\n");
}

function formatDestroyRouteProviderResources(
  resources: DestroyFormlessInstanceWorkspaceResult["routeProviderResources"],
): string {
  if (resources.resourceCount === 0) {
    return "none";
  }

  return `${resources.resourceCount} provider resource${
    resources.resourceCount === 1 ? "" : "s"
  } from ${resources.routeCount} route${resources.routeCount === 1 ? "" : "s"} (${
    resources.source
  }; ${resources.enabledHosts.length === 0 ? "no hosts" : resources.enabledHosts.join(", ")})`;
}

function formatInstanceDomainProviderPlanResult(
  result: PlanFormlessInstanceDomainProviderResult,
  cwd: string,
): string {
  const plan = result.plan;

  return [
    "Instance domain remote provider plan.",
    `Workspace: ${formatCliPath(cwd, result.workspaceRoot)}.`,
    `Target: ${formatSelectedTarget(result.selectedTarget)}.`,
    `Provider config: plan ${plan.config.planReady ? "ready" : "blocked"}, apply ${
      plan.config.applyReady ? "ready" : "blocked"
    }.`,
    `Account: ${plan.config.accountId ?? "missing"}.`,
    `Worker: ${plan.config.workerName ?? plan.plan.workerName}.`,
    `Policy: ${plan.plan.policy}.`,
    `Zones: ${formatList(plan.config.zones.map((zone) => `${zone.name} (${zone.id})`))}.`,
    `Config issues: ${formatList(plan.config.issues.map((issue) => issue.code))}.`,
    `Resources: ${formatDomainProviderResourceCounts(plan)}.`,
    `Blockers: ${formatDomainProviderPlanBlockers(plan)}.`,
    ...plan.plan.resources.map(formatDomainProviderResource),
  ].join("\n");
}

function formatInstanceWorkspaceDomainPlanResult(
  result: PlanFormlessInstanceWorkspaceDomainsResult,
  cwd: string,
): string {
  return [
    "Instance domain direct Cloudflare fallback plan dry run.",
    `Workspace: ${formatCliPath(cwd, result.workspaceRoot)}.`,
    `Target: ${formatSelectedTarget(result.selectedTarget)}.`,
    `Account: ${result.accountId}.`,
    `Worker: ${result.workerName}.`,
    `Policy: ${result.preflight.policy}.`,
    `Desired source: ${result.desired.source} (${result.desired.workspaceCount} workspace, ${result.desired.liveEnabledCount} live enabled).`,
    `Desired drift: ${formatDomainDesiredDrift(result.desired.drift)}.`,
    `Domains: ${formatList(result.preflight.hosts.map((host) => host.host))}.`,
    ...result.preflight.hosts.map(formatDomainHostPlan),
  ].join("\n");
}

function formatInstanceWorkspaceDomainApplyResult(
  result: ApplyFormlessInstanceWorkspaceDomainsResult,
  cwd: string,
): string {
  return [
    "Instance domain direct Cloudflare fallback apply complete.",
    `Workspace: ${formatCliPath(cwd, result.workspaceRoot)}.`,
    `Target: ${formatSelectedTarget(result.selectedTarget)}.`,
    `Account: ${result.accountId}.`,
    `Worker: ${result.workerName}.`,
    `Policy: ${result.preflight.policy}.`,
    `Domains: ${formatList(result.applied.hosts.map((host) => host.host))}.`,
    `Evidence writes: ${result.evidenceCount}.`,
    ...result.applied.hosts.map(formatDomainAppliedHost),
  ].join("\n");
}

function formatInstanceDomainProviderRunApplyResult(
  result: RunFormlessInstanceDomainProviderApplyResult,
): string {
  return [
    "Instance domain Alchemy apply complete.",
    `Target: ${result.targetUrl}.`,
    `Job: ${result.apply.job.jobId}.`,
    ...(result.deployment === undefined
      ? []
      : [
          `Desired-state version: ${result.deployment.desiredState.versionId} (revision ${result.deployment.desiredState.revision}).`,
          `Deployment attempt: ${result.deployment.attemptId}.`,
          `Deployment target: ${result.deployment.targetId}.`,
          `Deployment resources: ${formatDeploymentResourceCounts(result.deployment)}.`,
          `Deployment writeback: ${result.deployment.writebackStatus}.`,
        ]),
    `Job status: ${result.completion.job.status}.`,
    `Runner: ${result.runnerId}.`,
    `Policy: ${result.apply.plan.policy}.`,
    `Resources: ${result.alchemy.resources.length}.`,
    `Evidence writes: ${result.evidenceCount}.`,
  ].join("\n");
}

function formatDeploymentResourceCounts(
  deployment: RunFormlessInstanceDomainProviderApplyResult["deployment"],
): string {
  if (deployment === undefined) {
    return "none";
  }

  return `${deployment.resourceCount} (custom domains ${
    deployment.resourcesByKind["cloudflare-worker-custom-domain"] ?? 0
  }, redirect rules ${
    deployment.resourcesByKind["cloudflare-redirect-rule"] ?? 0
  }, DNS records ${deployment.resourcesByKind["cloudflare-dns-records"] ?? 0})`;
}

function formatInstanceDomainProviderRunDeleteResult(
  result: RunFormlessInstanceDomainProviderDeleteResult,
): string {
  return [
    "Instance domain Alchemy delete complete.",
    `Target: ${result.targetUrl}.`,
    `Job: ${result.delete.job.jobId}.`,
    `Job status: ${result.completion.job.status}.`,
    `Runner: ${result.runnerId}.`,
    `Resources: ${result.alchemy.resources.length}.`,
    `Evidence writes: ${result.evidenceCount}.`,
  ].join("\n");
}

function formatInstanceDomainRouteForgetResult(
  result: ForgetFormlessInstanceDomainRouteResult,
  cwd: string,
): string {
  return [
    "Instance domain route forgotten.",
    `Workspace: ${formatCliPath(cwd, result.workspaceRoot)}.`,
    `Target: ${formatSelectedTarget(result.selectedTarget)}.`,
    `Route: ${result.response.mapping.host} (${result.response.mapping.profile}).`,
    `Reason: ${result.response.desiredCleanupEvent.reason}.`,
    `Remaining desired routes: ${result.response.mappings.length}.`,
  ].join("\n");
}

function formatInstanceDomainRedirectForgetResult(
  result: ForgetFormlessInstanceDomainRedirectResult,
  cwd: string,
): string {
  return [
    "Instance domain redirect forgotten.",
    `Workspace: ${formatCliPath(cwd, result.workspaceRoot)}.`,
    `Target: ${formatSelectedTarget(result.selectedTarget)}.`,
    `Redirect: ${result.response.redirectIntent.fromHost}.`,
    `Reason: ${result.response.redirectIntentCleanupEvent.reason}.`,
    `Remaining desired redirects: ${result.response.redirectIntents.length}.`,
  ].join("\n");
}

function formatInstanceDomainProviderManualCleanupResult(
  result: MarkFormlessInstanceDomainProviderResourceManuallyRemovedResult,
  cwd: string,
): string {
  return [
    "Instance domain provider evidence marked manually removed.",
    `Workspace: ${formatCliPath(cwd, result.workspaceRoot)}.`,
    `Target: ${formatSelectedTarget(result.selectedTarget)}.`,
    `Resource: ${result.response.target.host} ${result.response.target.kind} ${result.response.target.logicalId}.`,
    `Action: ${result.response.action}.`,
  ].join("\n");
}

function formatSelectedTarget(target: FormlessInstanceWorkspaceTarget | undefined): string {
  return target ? `${target.alias} (${target.url})` : "<none>";
}

function formatDomainProviderResourceCounts(plan: InstanceDomainProviderPlanResponse): string {
  const customDomains = plan.plan.resources.filter(
    (resource) => resource.kind === "cloudflare-worker-custom-domain",
  ).length;
  const redirectRules = plan.plan.resources.filter(
    (resource) => resource.kind === "cloudflare-redirect-rule",
  ).length;
  const dnsRecords = plan.plan.resources.filter(
    (resource) => resource.kind === "cloudflare-dns-records",
  ).length;

  return `${plan.plan.resources.length} (custom domains ${customDomains}, redirect rules ${redirectRules}, DNS records ${dnsRecords})`;
}

function formatDomainProviderPlanBlockers(plan: InstanceDomainProviderPlanResponse): string {
  if (plan.plan.blockers.length === 0) {
    return "none";
  }

  return plan.plan.blockers
    .map((blocker) => (blocker.host ? `${blocker.host}:${blocker.code}` : blocker.code))
    .join(", ");
}

function formatDomainProviderResource(
  resource: InstanceDomainProviderPlanResponse["plan"]["resources"][number],
): string {
  switch (resource.kind) {
    case "cloudflare-worker-custom-domain":
      return [
        `${resource.host}: cloudflare-worker-custom-domain`,
        `profile ${formatDomainIntentTarget(resource)}`,
        `zone ${resource.zone.name} (${resource.zone.id})`,
        `alchemy ${resource.logicalId}`,
      ].join("; ");
    case "cloudflare-redirect-rule":
      return [
        `${resource.fromHost}: cloudflare-redirect-rule`,
        `target ${resource.targetUrl}`,
        `zone ${resource.zone.name} (${resource.zone.id})`,
        `alchemy ${resource.logicalId}`,
      ].join("; ");
    case "cloudflare-dns-records":
      return [
        `${resource.fromHost}: cloudflare-dns-records`,
        `records ${resource.props.records.length}`,
        `zone ${resource.zone.name} (${resource.zone.id})`,
        `alchemy ${resource.logicalId}`,
      ].join("; ");
  }
}

function formatRemoteInstalls(
  installs: readonly { installId: string; label: string; packageAppKey: string }[],
): string {
  if (installs.length === 0) {
    return "none";
  }

  return installs
    .map((install) => `${install.installId} (${install.packageAppKey}: ${install.label})`)
    .join(", ");
}

function formatDeployMetadataVersion(version: string | null): string {
  return version ?? "<missing>";
}

function formatList(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}

function formatDomainHostPlan(host: CloudflareDomainPreflightHostPlan): string {
  const issues = [...host.blockers, ...host.warnings];

  return [
    `${host.host}: ${host.status}`,
    `profile ${formatDomainIntentTarget(host)}`,
    `zone ${host.zone ? `${host.zone.name} (${host.zone.id})` : "missing"}`,
    `apex ${host.apex ? "yes" : "no"}`,
    `custom domains ${formatWorkerDomains(host.workerDomains)}`,
    `routes ${formatWorkerRoutes(host.workerRoutes)}`,
    `dns ${formatDnsRecords(host.dnsRecords)}`,
    `actions ${formatList(host.actions)}`,
    `issues ${formatDomainIssues(issues)}`,
  ].join("; ");
}

function formatDomainAppliedHost(host: CloudflareDomainApplyHostResult): string {
  return [
    `${host.host}: ${host.action}`,
    `profile ${formatDomainIntentTarget(host)}`,
    `custom domain ${host.domain.id}`,
    `worker ${host.domain.service}`,
    `zone ${host.domain.zoneName} (${host.domain.zoneId})`,
  ].join("; ");
}

function formatDomainDesiredDrift(
  drift: readonly PlanFormlessInstanceWorkspaceDomainsResult["desired"]["drift"][number][],
): string {
  if (drift.length === 0) {
    return "none";
  }

  return drift
    .map((entry) => {
      switch (entry.status) {
        case "local-only":
          return `${entry.host} local-only (${entry.local ? formatDomainIntentTarget(entry.local) : "missing"})`;
        case "live-only":
          return `${entry.host} live-only (${entry.live ? formatDomainIntentTarget(entry.live) : "missing"})`;
        case "mismatch":
          return `${entry.host} mismatch (workspace ${entry.local ? formatDomainIntentTarget(entry.local) : "missing"}, live ${entry.live ? formatDomainIntentTarget(entry.live) : "missing"})`;
      }
    })
    .join(", ");
}

function formatDomainIntentTarget(
  domain: Pick<CloudflareDomainIntent, "profile" | "targetInstallId"> & {
    enabled?: boolean;
  },
): string {
  const target =
    domain.targetInstallId === undefined
      ? domain.profile
      : `${domain.profile}:${domain.targetInstallId}`;

  return domain.enabled === false ? `${target}:disabled` : target;
}

function formatDomainIssues(issues: readonly CloudflareDomainPreflightIssue[]): string {
  if (issues.length === 0) {
    return "none";
  }

  return issues.map((issue) => issue.code).join(", ");
}

function formatWorkerDomains(domains: readonly CloudflareWorkerDomain[]): string {
  if (domains.length === 0) {
    return "none";
  }

  return domains.map((domain) => `${domain.hostname} -> ${domain.service}`).join(", ");
}

function formatWorkerRoutes(routes: readonly CloudflareWorkerRoute[]): string {
  if (routes.length === 0) {
    return "none";
  }

  return routes.map((route) => `${route.pattern} -> ${route.script ?? "<none>"}`).join(", ");
}

function formatDnsRecords(records: readonly CloudflareDnsRecord[]): string {
  if (records.length === 0) {
    return "none";
  }

  return records.map((record) => `${record.type} ${record.content}`).join(", ");
}

function formatOwnerSetup(status: {
  owner?: { email?: string; name: string };
  setupComplete: boolean;
}) {
  if (!status.setupComplete) {
    return "incomplete";
  }

  const owner = status.owner;

  if (!owner) {
    return "complete";
  }

  return owner.email ? `complete (${owner.name} <${owner.email}>)` : `complete (${owner.name})`;
}

function formatCliPath(cwd: string, filePath: string): string {
  const relativePath = path.relative(cwd, filePath);

  if (relativePath === "") {
    return ".";
  }

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return filePath;
  }

  return relativePath;
}

function openUrlWithSpawn(spawn: typeof nodeSpawn, url: string): Promise<void> {
  const command = browserOpenCommand(process.platform, url);

  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      stdio: "ignore",
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `${command.command} ${command.args.join(" ")} exited with signal ${signal}.`
            : `${command.command} ${command.args.join(" ")} exited with code ${code ?? "unknown"}.`,
        ),
      );
    });
  });
}

function browserOpenCommand(
  platform: NodeJS.Platform,
  url: string,
): { args: string[]; command: string } {
  if (platform === "darwin") {
    return { args: [url], command: "open" };
  }

  if (platform === "win32") {
    return { args: ["/c", "start", "", url], command: "cmd" };
  }

  return { args: [url], command: "xdg-open" };
}

function nodeFormlessCliDependencies(): FormlessCliDependencies {
  const spawn = nodeSpawn;

  return {
    accountDiscovery: alchemyFormlessInstanceAccountDiscoveryAdapter,
    cloudflareDomainClient: () => cloudflareDomainClientFromEnv({ env: process.env, fetch }),
    cwd: process.cwd(),
    deploymentAdapter: alchemyFormlessInstanceDeploymentAdapter,
    env: process.env,
    fetch,
    healthCheck: fetchFormlessInstanceDeploymentHealthCheckAdapter,
    localSecretEnv: {
      ensure: ensureFormlessInstanceLocalSecretEnv,
    },
    log: (message) => console.log(message),
    now: () => new Date().toISOString(),
    openBrowser: (url) => openUrlWithSpawn(spawn, url),
    packageRoot: resolvePackageRoot(path.dirname(fileURLToPath(import.meta.url))),
    randomToken: () => randomBytes(32).toString("base64url"),
    runCommand: (command, args, options) => runCommandWithSpawn(spawn, command, args, options),
    spawn,
    stateRoot: path.join(homedir(), FORMLESS_HOME_DIRECTORY),
    stateWriter: {
      write: writeFormlessInstanceState,
    },
    setupCapability: fetchFormlessInstanceOwnerSetupCapabilityAdapter,
  };
}

function resolvePackageRoot(startDirectory: string): string {
  let directory = path.resolve(startDirectory);

  while (true) {
    if (existsSync(path.join(directory, "package.json"))) {
      return directory;
    }

    const parent = path.dirname(directory);

    if (parent === directory) {
      throw new Error(`Could not resolve Formless package root from ${startDirectory}.`);
    }

    directory = parent;
  }
}

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
import {
  deploymentStatusDisplaySummary,
  type DeploymentStatus,
} from "../shared/deployment-runtime.ts";
import type { ForgetInstanceDomainMappingResponse } from "../shared/instance-domain-mappings.ts";
import {
  runFormlessInstanceDomainProviderApply as runFormlessInstanceDomainProviderApplyCommand,
  runFormlessInstanceDomainProviderDelete as runFormlessInstanceDomainProviderDeleteCommand,
  type RunFormlessInstanceDomainProviderApplyDependencies,
  type RunFormlessInstanceDomainProviderApplyResult,
  type RunFormlessInstanceDomainProviderDeleteInput,
  type RunFormlessInstanceDomainProviderDeleteResult,
} from "./domain-provider-runner.ts";
import {
  type FormlessInstanceWorkspaceApp,
  type FormlessInstanceWorkspaceManifest,
  type FormlessInstanceWorkspaceTarget,
} from "./instance-workspace-config.ts";
import {
  FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_PATH,
  readFormlessInstanceWorkspaceSecretState,
  resolveFormlessInstanceWorkspaceAdminToken,
} from "./instance-workspace-secrets.ts";
import {
  adoptFormlessInstanceWorkspaceAdminToken as adoptFormlessInstanceWorkspaceAdminTokenCommand,
  applyFormlessInstanceWorkspaceDomains as applyFormlessInstanceWorkspaceDomainsCommand,
  checkFormlessInstanceWorkspace as checkFormlessInstanceWorkspaceCommand,
  deployFormlessInstanceWorkspace as deployFormlessInstanceWorkspaceCommand,
  getFormlessInstanceWorkspaceStatus as getFormlessInstanceWorkspaceStatusCommand,
  initFormlessInstanceWorkspace as initFormlessInstanceWorkspaceCommand,
  planFormlessInstanceWorkspaceDomains as planFormlessInstanceWorkspaceDomainsCommand,
  resetFormlessInstanceWorkspaceLocalState as resetFormlessInstanceWorkspaceLocalStateCommand,
  runFormlessInstanceWorkspaceDev as runFormlessInstanceWorkspaceDevCommand,
  pullFormlessInstanceWorkspace as pullFormlessInstanceWorkspaceCommand,
  pushFormlessInstanceWorkspace as pushFormlessInstanceWorkspaceCommand,
  rotateFormlessInstanceWorkspaceAdminToken as rotateFormlessInstanceWorkspaceAdminTokenCommand,
  type AdoptFormlessInstanceWorkspaceAdminTokenResult,
  type ApplyFormlessInstanceWorkspaceDomainsInput,
  type ApplyFormlessInstanceWorkspaceDomainsResult,
  type CheckFormlessInstanceWorkspaceResult,
  type DeployFormlessInstanceWorkspaceInput,
  type DeployFormlessInstanceWorkspaceResult,
  type FormlessInstanceWorkspaceDevCommand,
  type FormlessInstanceWorkspaceStatusResult,
  type InitFormlessInstanceWorkspaceResult,
  type PlanFormlessInstanceWorkspaceDomainsInput,
  type PlanFormlessInstanceWorkspaceDomainsResult,
  type PullFormlessInstanceWorkspaceResult,
  type PushFormlessInstanceWorkspaceResult,
  type ResetFormlessInstanceWorkspaceLocalStateResult,
  type RotateFormlessInstanceWorkspaceAdminTokenResult,
} from "./instance-workspace.ts";
import {
  forgetFormlessInstanceDomainMapping,
  forgetFormlessInstanceDomainProviderRedirect,
  markFormlessInstanceDomainProviderResourceManuallyRemoved,
  readFormlessInstanceDomainProviderPlan,
} from "./instance-target-client.ts";
import { packageRunScriptCommand } from "./package-commands.ts";
import { SITE_PROJECT_RECORDS_FILE } from "./project-config.ts";
import { initSiteProjectSource, type InitSiteProjectSourceResult } from "./project-files.ts";
import { runSiteProjectDev } from "./project-dev.ts";
import {
  isSiteProjectPublishConfigured,
  publishSiteProject as publishSiteProjectCommand,
  setupSiteProjectDeploy as setupSiteProjectDeployCommand,
  startSiteProjectLocalPublishBroker as startSiteProjectLocalPublishBrokerCommand,
  type PublishSiteProjectResult,
  type SetupSiteProjectDeployResult,
} from "./project-publish.ts";
import {
  saveSiteProject as saveSiteProjectCommand,
  type SaveSiteProjectResult,
} from "./project-save.ts";
import { type SiteProjectLocalPublishBroker } from "./local-publish-broker.ts";
import { SITE_PROJECT_GITIGNORE_ENTRY } from "./project-state.ts";
import {
  alchemyFormlessInstanceAccountDiscoveryAdapter,
  alchemyFormlessInstanceDeploymentAdapter,
  fetchFormlessInstanceDeploymentHealthCheckAdapter,
  fetchFormlessInstanceOwnerSetupCapabilityAdapter,
  ensureFormlessInstanceLocalSecretEnv,
  FORMLESS_HOME_DIRECTORY,
  runFormlessInstanceOnboarding,
  writeFormlessInstanceState,
  type FormlessInstanceAccountDiscoveryAdapter,
  type FormlessInstanceDeploymentAdapter,
  type FormlessInstanceDeploymentHealthCheckAdapter,
  type FormlessInstanceLocalSecretEnvStore,
  type FormlessInstanceOwnerSetupCapabilityAdapter,
  type FormlessInstanceStateWriter,
  type RunFormlessInstanceOnboardingResult,
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
  formlessInstanceWorkspaceDevEnv,
  formlessInstanceWorkspaceLocalStateRoot,
  formlessInstanceWorkspaceWranglerPersistPath,
  type AdoptFormlessInstanceWorkspaceAdminTokenDependencies,
  type AdoptFormlessInstanceWorkspaceAdminTokenInput,
  type AdoptFormlessInstanceWorkspaceAdminTokenResult,
  type ApplyFormlessInstanceWorkspaceDomainsDependencies,
  type ApplyFormlessInstanceWorkspaceDomainsInput,
  type ApplyFormlessInstanceWorkspaceDomainsResult,
  type CheckFormlessInstanceWorkspaceDependencies,
  type CheckFormlessInstanceWorkspaceInput,
  type CheckFormlessInstanceWorkspaceResult,
  type DeployFormlessInstanceWorkspaceDependencies,
  type DeployFormlessInstanceWorkspaceInput,
  type DeployFormlessInstanceWorkspaceResult,
  type DevFormlessInstanceWorkspaceDependencies,
  type DevFormlessInstanceWorkspaceInput,
  type FormlessInstanceWorkspaceStatusDependencies,
  type FormlessInstanceWorkspaceStatusInput,
  type FormlessInstanceWorkspaceStatusResult,
  type FormlessInstanceWorkspaceDevCommand,
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
  readSiteProjectSource,
  resolveSiteProjectRoot,
  type SiteProjectSource,
} from "./project-files.ts";
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
  readSiteProjectDevStateSource,
  siteProjectDevEnv,
  siteProjectStorageId,
  siteProjectWranglerPersistPath,
} from "./project-dev.ts";
export { type SiteProjectLocalPublishBroker } from "./local-publish-broker.ts";
export {
  isSiteProjectPublishConfigured,
  type LocalAdminPublishResult,
  type PublishSiteProjectResult,
  type SetupSiteProjectDeployResult,
} from "./project-publish.ts";
export { type SaveSiteProjectResult } from "./project-save.ts";
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

const projectStateGitignoreEntry = SITE_PROJECT_GITIGNORE_ENTRY;

export type InitSiteProjectResult = InitSiteProjectSourceResult;

export type OnboardFormlessInstanceResult = RunFormlessInstanceOnboardingResult;

export async function runFormlessCli(
  args: string[],
  dependencies: FormlessCliDependencies = nodeFormlessCliDependencies(),
) {
  const command = parseFormlessCliArgs(args);

  switch (command.kind) {
    case "help":
      dependencies.log(formlessCliUsage());
      return;
    case "init": {
      const result = await initSiteProject(command, dependencies);
      dependencies.log(
        [
          `Created Formless Site project at ${result.projectRoot}.`,
          `Wrote ${path.basename(result.configPath)}, ${path.basename(result.recordsPath)}, and ${result.mediaCount} media files.`,
          "",
          "Next:",
          `  cd ${path.relative(dependencies.cwd, result.projectRoot) || "."}`,
          "  npx formless dev",
        ].join("\n"),
      );
      return;
    }
    case "onboard": {
      const result = await onboardFormlessInstance(command, dependencies);
      dependencies.log(
        [
          "Formless instance deployed.",
          `Instance: ${result.instanceName}.`,
          `Account: ${formatAccountLabel(result.account)}.`,
          `Credential profile: ${result.credentialProfile ?? "<default>"}.`,
          `URL: ${result.deployment.url}.`,
          `Worker: ${result.plan.resources.worker.name}.`,
          `Media bucket: ${result.plan.resources.mediaBucket.name}.`,
          `Authority storage: ${result.plan.resources.authority.namespaceName}.`,
          `Deploy metadata: version ${result.healthCheck.version} verified.`,
          `State: ${formatCliPath(dependencies.cwd, result.stateWrite.path)}.`,
          `Local secrets: ${formatCliPath(dependencies.cwd, result.localSecretEnv.path)}.`,
          `Browser opened: ${result.browserOpened ? "yes" : "no"}.`,
          result.browserOpened
            ? "Owner setup: opened in browser."
            : `Owner setup URL: ${result.ownerSetup.url}.`,
          "Complete owner setup to create the browser write session; automation remains protected by FORMLESS_ADMIN_TOKEN.",
        ].join("\n"),
      );
      return;
    }
    case "dev":
      await runSiteProjectDev(command, dependencies, {
        devCommand: packageRunScriptCommand("dev", dependencies.env),
        isPublishConfigured: (project) => isSiteProjectPublishConfigured(project, dependencies),
        startLocalPublishBroker: (input) => startSiteProjectLocalPublishBroker(input, dependencies),
      });
      return;
    case "deploySetup": {
      const result = await setupSiteProjectDeploy(command, dependencies);
      dependencies.log(
        [
          `Configured Site deploy for ${result.projectRoot}.`,
          `Wrote ${path.relative(result.projectRoot, result.configPath)} and ${path.relative(result.projectRoot, result.envPath)}.`,
          `Ensured ${path.relative(result.projectRoot, result.gitignorePath)} ignores ${projectStateGitignoreEntry}.`,
          result.bucketCreated ? "Verified or created the configured R2 bucket." : null,
          result.secretUploaded ? "Uploaded the admin token as a Worker secret." : null,
          "",
          "Next:",
          "  npx formless publish --yes",
        ]
          .filter((line): line is string => line !== null)
          .join("\n"),
      );
      return;
    }
    case "publish": {
      const result = await publishSiteProject(command, dependencies);
      dependencies.log(
        result.mode === "dry-run"
          ? `Site project publish dry run: ${result.sourceRecordCount} records for ${result.target}.`
          : `Site project published: ${result.sourceRecordCount} records to ${result.target}. Backup: ${result.backupPath}.`,
      );
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
      const result = await getFormlessInstanceWorkspaceStatus(
        { ...command, includeDeploymentStatus: true },
        dependencies,
      );
      dependencies.log(formatInstanceWorkspaceStatusResult(result, dependencies.cwd));
      return;
    }
    case "instancePull": {
      const result = await pullFormlessInstanceWorkspace(command, dependencies);
      dependencies.log(formatInstanceWorkspacePullResult(result, dependencies.cwd));
      return;
    }
    case "instanceCheck": {
      const result = await checkFormlessInstanceWorkspace(command, dependencies);
      dependencies.log(formatInstanceWorkspaceCheckResult(result, dependencies.cwd));
      return;
    }
    case "instancePush": {
      const result = await pushFormlessInstanceWorkspace(command, dependencies);
      dependencies.log(formatInstanceWorkspacePushResult(result, dependencies.cwd));
      return;
    }
    case "instanceDev":
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
      const result = await deployFormlessInstanceWorkspace(command, dependencies);
      dependencies.log(formatInstanceWorkspaceDeployResult(result, dependencies.cwd));
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
    case "save": {
      const result = await saveSiteProject(command, dependencies);
      dependencies.log(
        result.mode === "check"
          ? `Site project source is current: ${result.recordCount} records and ${result.mediaCount} media files from ${result.source}.`
          : `Wrote ${SITE_PROJECT_RECORDS_FILE}: ${result.recordCount} records and ${result.mediaCount} media files from ${result.source}.`,
      );
      return;
    }
  }
}

export async function initSiteProject(
  input: { targetDir: string },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "packageRoot"
  > = nodeFormlessCliDependencies(),
): Promise<InitSiteProjectResult> {
  const projectRoot = path.resolve(dependencies.cwd, input.targetDir);

  return initSiteProjectSource({ packageRoot: dependencies.packageRoot, projectRoot });
}

export async function onboardFormlessInstance(
  input: {
    credentialProfile?: string | null;
    instanceName?: string | null;
    open?: boolean;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    | "accountDiscovery"
    | "deploymentAdapter"
    | "healthCheck"
    | "localSecretEnv"
    | "cwd"
    | "openBrowser"
    | "packageRoot"
    | "randomToken"
    | "stateRoot"
    | "stateWriter"
    | "setupCapability"
  > = nodeFormlessCliDependencies(),
): Promise<OnboardFormlessInstanceResult> {
  return runFormlessInstanceOnboarding(input, {
    accountDiscovery: dependencies.accountDiscovery,
    deploymentAdapter: dependencies.deploymentAdapter,
    healthCheck: dependencies.healthCheck,
    localSecretEnv: dependencies.localSecretEnv,
    openBrowser: dependencies.openBrowser,
    packageRoot: dependencies.packageRoot,
    packageVersion: packageJson.version,
    randomToken: dependencies.randomToken,
    stateRoot: dependencies.stateRoot,
    stateWriter: dependencies.stateWriter,
    setupCapability: dependencies.setupCapability,
  });
}

export async function saveSiteProject(
  input: { check?: boolean; projectPath?: string; source?: string | null },
  dependencies: Pick<FormlessCliDependencies, "cwd" | "fetch"> = nodeFormlessCliDependencies(),
): Promise<SaveSiteProjectResult> {
  return saveSiteProjectCommand(input, dependencies);
}

export async function setupSiteProjectDeploy(
  input: {
    accountId?: string | null;
    adminToken?: string | null;
    createBucket?: boolean;
    mediaBucket: string;
    projectPath?: string;
    publishUrl: string;
    uploadSecret?: boolean;
    workerName: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "randomToken" | "runCommand" | "packageRoot"
  > = nodeFormlessCliDependencies(),
): Promise<SetupSiteProjectDeployResult> {
  return setupSiteProjectDeployCommand(input, dependencies);
}

export async function publishSiteProject(
  input: {
    code?: boolean | "if-stale";
    dryRun?: boolean;
    projectPath?: string;
    yes?: boolean;
  },
  dependencies: FormlessCliDependencies = nodeFormlessCliDependencies(),
): Promise<PublishSiteProjectResult> {
  return publishSiteProjectCommand(input, dependencies);
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
        ? {}
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
    "cwd" | "env" | "fetch" | "randomToken"
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
    },
  );
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

export async function startSiteProjectLocalPublishBroker(
  input: { projectPath: string; source: () => string | null },
  dependencies: FormlessCliDependencies = nodeFormlessCliDependencies(),
): Promise<SiteProjectLocalPublishBroker> {
  return startSiteProjectLocalPublishBrokerCommand(input, dependencies);
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

function formatAccountLabel(account: { id: string; name?: string }): string {
  return account.name ? `${account.name} (${account.id})` : account.id;
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

  if (!result.remote.ok) {
    return [
      `${label} ${status} failed.`,
      `Archive: ${formatCliPath(cwd, result.archivePath)}.`,
      ...(result.remote.errors ?? []).map((error) => `Error: ${error.message}`),
    ].join("\n");
  }

  return [
    `${label} ${status} ok.`,
    `Archive: ${formatCliPath(cwd, result.archivePath)}.`,
    summary ? `Apps: ${summary.appCount}.` : null,
    summary ? `Created installs: ${summary.createdInstalls.join(", ") || "none"}.` : null,
    summary ? `Replaced installs: ${summary.replacedInstalls.join(", ") || "none"}.` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function formatInstanceWorkspaceInitResult(
  result: InitFormlessInstanceWorkspaceResult,
  cwd: string,
): string {
  return [
    "Instance workspace initialized.",
    `Workspace: ${formatCliPath(cwd, result.workspaceRoot)}.`,
    `Manifest: ${formatCliPath(cwd, result.manifestPath)}.`,
    `Secret state: ${formatCliPath(cwd, path.join(result.workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_PATH))}.`,
    `Targets: ${formatWorkspaceTargets(result.manifest)}.`,
    `Default app policy: ${result.manifest.defaultAppPolicy}.`,
    `Local apps: ${formatWorkspaceApps(result.manifest.apps)}.`,
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
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function formatInstanceWorkspaceStatusResult(
  result: FormlessInstanceWorkspaceStatusResult,
  cwd: string,
): string {
  return [
    "Instance workspace status.",
    `Workspace: ${formatCliPath(cwd, result.workspaceRoot)}.`,
    `Manifest: ${formatCliPath(cwd, result.manifestPath)}.`,
    `Targets: ${formatWorkspaceTargets(result.manifest)}.`,
    `Default target: ${result.manifest.defaultTarget ?? "<none>"}.`,
    `Selected target: ${formatSelectedTarget(result.selectedTarget)}.`,
    `Automation token: ${formatSecretState(result.secretState)}.`,
    `Default app policy: ${result.manifest.defaultAppPolicy}.`,
    `Local apps: ${formatWorkspaceApps(result.manifest.apps)}.`,
    result.remoteStatus
      ? `Deploy metadata: ${formatDeployMetadataVersion(result.remoteStatus.deployMetadata.version)}.`
      : null,
    result.remoteStatus
      ? `Owner setup: ${formatOwnerSetup(result.remoteStatus.ownerSetup)}.`
      : null,
    result.remoteStatus
      ? `Remote apps: ${formatRemoteInstalls(result.remoteStatus.appRegistry.installs)}.`
      : null,
    result.remoteStatus?.deployment
      ? `Deployment: ${formatDeploymentStatus(result.remoteStatus.deployment.status)}.`
      : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function formatInstanceWorkspacePullResult(
  result: PullFormlessInstanceWorkspaceResult,
  cwd: string,
): string {
  return [
    "Instance workspace pulled.",
    `Workspace: ${formatCliPath(cwd, result.workspaceRoot)}.`,
    `Target: ${formatSelectedTarget(result.selectedTarget)}.`,
    `Instance archive: ${formatCliPath(cwd, result.instanceArchive.archivePath)}.`,
    `Apps: ${result.instanceArchive.appCount}.`,
    `Records: ${result.instanceArchive.recordCount}.`,
    `Media files: ${result.instanceArchive.mediaCount}.`,
    `App archives: ${formatPulledAppArchives(result.appArchives)}.`,
    `Domain mappings: ${formatWorkspaceDomainIntents(result.domains)}.`,
  ].join("\n");
}

function formatInstanceWorkspaceCheckResult(
  result: CheckFormlessInstanceWorkspaceResult,
  cwd: string,
): string {
  const drift = result.drift;

  return [
    "Instance workspace check.",
    `Workspace: ${formatCliPath(cwd, result.workspaceRoot)}.`,
    `Target: ${formatSelectedTarget(result.selectedTarget)}.`,
    `Drift: ${drift.status === "no-drift" ? "none" : "detected"}.`,
    `Local apps: ${drift.localAppCount}. Remote apps: ${drift.remoteAppCount}.`,
    `Local records: ${drift.localRecordCount}. Remote records: ${drift.remoteRecordCount}.`,
    `Local media files: ${drift.localMediaCount}. Remote media files: ${drift.remoteMediaCount}.`,
    `Local domains: ${drift.localDomainCount}. Remote domains: ${drift.remoteDomainCount}.`,
    `Missing remote installs: ${formatList(drift.missingInstalls)}.`,
    `Extra remote installs: ${formatList(drift.extraInstalls)}.`,
    `Package mismatches: ${formatPackageMismatches(drift.packageMismatches)}.`,
    `Changed records: ${formatList(drift.changedRecords)}.`,
    `Changed control-plane records: ${formatList(drift.changedControlPlaneRecords)}.`,
    `Changed media: ${formatList(drift.changedMedia)}.`,
    `Changed domain mappings: ${formatDomainDesiredDrift(drift.domainDesiredDrift)}.`,
    `Changed archive paths: ${formatList(drift.changedArchivePaths)}.`,
  ].join("\n");
}

function formatInstanceWorkspacePushResult(
  result: PushFormlessInstanceWorkspaceResult,
  cwd: string,
): string {
  const dryRunSummary = result.dryRun.remote.report?.summary ?? result.dryRun.remote.plan?.summary;
  const applySummary =
    result.applyResult?.remote.report?.summary ?? result.applyResult?.remote.plan?.summary;
  const dryRunErrors = result.dryRun.remote.errors ?? [];
  const applyErrors = result.applyResult?.remote.errors ?? [];

  return [
    `Instance workspace push ${result.mode === "apply" ? "applied" : "dry run"}.`,
    `Workspace: ${formatCliPath(cwd, result.workspaceRoot)}.`,
    `Target: ${formatSelectedTarget(result.selectedTarget)}.`,
    "Source: declared workspace app archives.",
    `Source apps: ${result.source.appCount}.`,
    `Source records: ${result.source.recordCount}.`,
    `Source media files: ${result.source.mediaCount}.`,
    `Replace existing installs: ${result.replace ? "yes" : "no"}.`,
    `Replace install set: ${result.replaceInstallSet ? "requested" : "no"}.`,
    result.backup ? `Backup: ${formatCliPath(cwd, result.backup.archivePath)}.` : "Backup: none.",
    `Drift: ${result.drift.status === "no-drift" ? "none" : "detected"}.`,
    `Missing remote installs: ${formatList(result.drift.missingInstalls)}.`,
    `Extra remote installs: ${formatList(result.drift.extraInstalls)}.`,
    `Changed records: ${formatList(result.drift.changedRecords)}.`,
    `Changed control-plane records: ${formatList(result.drift.changedControlPlaneRecords)}.`,
    `Changed media: ${formatList(result.drift.changedMedia)}.`,
    `Changed domain mappings: ${formatDomainDesiredDrift(result.drift.domainDesiredDrift)}.`,
    `Dry-run restore: ${result.dryRun.remote.ok ? "ok" : "failed"}.`,
    dryRunSummary
      ? `Dry-run created installs: ${formatList(dryRunSummary.createdInstalls)}.`
      : null,
    dryRunSummary
      ? `Dry-run replaced installs: ${formatList(dryRunSummary.replacedInstalls)}.`
      : null,
    ...dryRunErrors.map((error) => `Dry-run error: ${error.message}`),
    result.applyResult ? `Apply restore: ${result.applyResult.remote.ok ? "ok" : "failed"}.` : null,
    applySummary ? `Apply created installs: ${formatList(applySummary.createdInstalls)}.` : null,
    applySummary ? `Apply replaced installs: ${formatList(applySummary.replacedInstalls)}.` : null,
    ...applyErrors.map((error) => `Apply error: ${error.message}`),
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

function formatInstanceWorkspaceDeployResult(
  result: DeployFormlessInstanceWorkspaceResult,
  cwd: string,
): string {
  return [
    "Instance workspace deployed.",
    `Workspace: ${formatCliPath(cwd, result.workspaceRoot)}.`,
    `Target: ${formatSelectedTarget(result.selectedTarget)}.`,
    `Worker: ${result.plan.resources.worker.name}.`,
    `Media bucket: ${result.plan.resources.mediaBucket.name}.`,
    `Migration policy: ${result.migrationPolicy}.`,
    "Runtime profile: server instance, client instance.",
    `Deploy metadata: version ${result.healthCheck.version} verified.`,
    `Deployment state: ${formatCliPath(cwd, result.deploymentStateRoot)}.`,
    `Local deploy secrets: ${formatCliPath(cwd, result.localSecretEnv.path)}.`,
    `Automation secret state: ${formatCliPath(cwd, result.secretPath)}.`,
  ].join("\n");
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

function formatWorkspaceTargets(manifest: FormlessInstanceWorkspaceManifest): string {
  if (manifest.targets.length === 0) {
    return "none";
  }

  return manifest.targets.map((target) => `${target.alias}=${target.url}`).join(", ");
}

function formatSelectedTarget(target: FormlessInstanceWorkspaceTarget | undefined): string {
  return target ? `${target.alias} (${target.url})` : "<none>";
}

function formatWorkspaceApps(apps: readonly FormlessInstanceWorkspaceApp[]): string {
  if (apps.length === 0) {
    return "none";
  }

  return apps.map((app) => `${app.installId} (${app.packageAppKey})`).join(", ");
}

function formatPulledAppArchives(
  apps: readonly PullFormlessInstanceWorkspaceResult["appArchives"][number][],
): string {
  if (apps.length === 0) {
    return "none";
  }

  return apps
    .map((app) => `${app.installId} (${app.recordCount} records, ${app.mediaCount} media)`)
    .join(", ");
}

function formatWorkspaceDomainIntents(
  domains: readonly PullFormlessInstanceWorkspaceResult["domains"][number][],
): string {
  if (domains.length === 0) {
    return "none";
  }

  return domains
    .map((domain) => `${domain.host} -> ${formatDomainIntentTarget(domain)}`)
    .join(", ");
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

function formatPackageMismatches(
  mismatches: readonly {
    installId: string;
    localPackageAppKey: string;
    remotePackageAppKey: string;
  }[],
): string {
  if (mismatches.length === 0) {
    return "none";
  }

  return mismatches
    .map(
      (mismatch) =>
        `${mismatch.installId} (local ${mismatch.localPackageAppKey}, remote ${mismatch.remotePackageAppKey})`,
    )
    .join(", ");
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

function formatSecretState(state: FormlessInstanceWorkspaceStatusResult["secretState"]): string {
  switch (state) {
    case "env":
      return "env override";
    case "stored":
      return "stored";
    case "missing":
      return "missing";
  }
}

function formatDeploymentStatus(status: DeploymentStatus): string {
  const summary = deploymentStatusDisplaySummary(status);

  return `${summary.label}; ${summary.detail}`;
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

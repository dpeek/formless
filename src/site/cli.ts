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
import { formlessCliUsage, parseFormlessCliArgs, type FormlessCliCommand } from "./cli-command.ts";
import {
  FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE,
  type FormlessInstanceWorkspaceApp,
  type FormlessInstanceWorkspaceManifest,
  type FormlessInstanceWorkspaceTarget,
} from "./instance-workspace-config.ts";
import { FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_PATH } from "./instance-workspace-secrets.ts";
import {
  adoptFormlessInstanceWorkspaceAdminToken as adoptFormlessInstanceWorkspaceAdminTokenCommand,
  checkFormlessInstanceWorkspace as checkFormlessInstanceWorkspaceCommand,
  getFormlessInstanceWorkspaceStatus as getFormlessInstanceWorkspaceStatusCommand,
  initFormlessInstanceWorkspace as initFormlessInstanceWorkspaceCommand,
  pullFormlessInstanceWorkspace as pullFormlessInstanceWorkspaceCommand,
  pushFormlessInstanceWorkspace as pushFormlessInstanceWorkspaceCommand,
  rotateFormlessInstanceWorkspaceAdminToken as rotateFormlessInstanceWorkspaceAdminTokenCommand,
  type AdoptFormlessInstanceWorkspaceAdminTokenResult,
  type CheckFormlessInstanceWorkspaceResult,
  type FormlessInstanceWorkspaceStatusResult,
  type InitFormlessInstanceWorkspaceResult,
  type PullFormlessInstanceWorkspaceResult,
  type PushFormlessInstanceWorkspaceResult,
  type RotateFormlessInstanceWorkspaceAdminTokenResult,
} from "./instance-workspace.ts";
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
  type AdoptFormlessInstanceWorkspaceAdminTokenDependencies,
  type AdoptFormlessInstanceWorkspaceAdminTokenInput,
  type AdoptFormlessInstanceWorkspaceAdminTokenResult,
  type CheckFormlessInstanceWorkspaceDependencies,
  type CheckFormlessInstanceWorkspaceInput,
  type CheckFormlessInstanceWorkspaceResult,
  type FormlessInstanceWorkspaceStatusDependencies,
  type FormlessInstanceWorkspaceStatusInput,
  type FormlessInstanceWorkspaceStatusResult,
  type FormlessInstanceWorkspaceDriftSummary,
  type FormlessInstanceWorkspacePackageMismatch,
  type InitFormlessInstanceWorkspaceDependencies,
  type InitFormlessInstanceWorkspaceInput,
  type InitFormlessInstanceWorkspaceResult,
  type PullFormlessInstanceWorkspaceAppArchiveResult,
  type PullFormlessInstanceWorkspaceDependencies,
  type PullFormlessInstanceWorkspaceInput,
  type PullFormlessInstanceWorkspaceResult,
  type PushFormlessInstanceWorkspaceDependencies,
  type PushFormlessInstanceWorkspaceInput,
  type PushFormlessInstanceWorkspaceResult,
  type RotateFormlessInstanceWorkspaceAdminTokenDependencies,
  type RotateFormlessInstanceWorkspaceAdminTokenInput,
  type RotateFormlessInstanceWorkspaceAdminTokenResult,
} from "./instance-workspace.ts";
export {
  readFormlessInstanceAppRegistry,
  readFormlessInstanceDeployMetadata,
  readFormlessInstanceOwnerSetupStatus,
  readFormlessInstanceTargetStatus,
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
  type SiteProjectMediaHrefRewrite,
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
  cwd: string;
  deploymentAdapter: FormlessInstanceDeploymentAdapter;
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
          `Rewritten media hrefs: ${result.report.rewrittenMediaHrefs.length}.`,
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
      const result = await getFormlessInstanceWorkspaceStatus(command, dependencies);
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
    case "instanceDev":
    case "instanceResetLocal":
    case "instanceDeploy":
      dependencies.log(formatInstanceWorkspaceCommandSkeleton(command, dependencies.cwd));
      return;
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
    `Missing remote installs: ${formatList(drift.missingInstalls)}.`,
    `Extra remote installs: ${formatList(drift.extraInstalls)}.`,
    `Package mismatches: ${formatPackageMismatches(drift.packageMismatches)}.`,
    `Changed records: ${formatList(drift.changedRecords)}.`,
    `Changed media: ${formatList(drift.changedMedia)}.`,
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
    `Changed media: ${formatList(result.drift.changedMedia)}.`,
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

function formatInstanceWorkspaceCommandSkeleton(
  command: FormlessInstanceWorkspaceCliCommand,
  cwd: string,
): string {
  const workspaceRoot = path.resolve(cwd, command.workspacePath);
  const lines = [
    `Instance workspace command parsed: ${formatInstanceWorkspaceCommandName(command)}.`,
    `Workspace: ${formatCliPath(cwd, workspaceRoot)}.`,
    `Manifest: ${formatCliPath(cwd, path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE))}.`,
    `Secret state: ${formatCliPath(cwd, path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_PATH))}.`,
  ];

  if ("targetAlias" in command) {
    lines.push(`Target: ${command.targetAlias ?? "<manifest default>"}.`);
  }

  if (command.kind === "instanceInitWorkspace" && command.targetUrl) {
    lines.push(`Target URL: ${command.targetUrl}.`);
  }

  lines.push("No files changed: this command skeleton only validates arguments.");

  return lines.join("\n");
}

type FormlessInstanceWorkspaceCliCommand = Extract<
  FormlessCliCommand,
  {
    kind:
      | "instanceCheck"
      | "instanceDeploy"
      | "instanceDev"
      | "instanceInitWorkspace"
      | "instancePull"
      | "instancePush"
      | "instanceResetLocal"
      | "instanceStatus"
      | "instanceTokenAdopt"
      | "instanceTokenRotate";
  }
>;

function formatInstanceWorkspaceCommandName(command: FormlessInstanceWorkspaceCliCommand): string {
  switch (command.kind) {
    case "instanceInitWorkspace":
      return "init-workspace";
    case "instanceStatus":
      return "status";
    case "instancePull":
      return "pull";
    case "instanceCheck":
      return "check";
    case "instancePush":
      return "push";
    case "instanceDev":
      return "dev";
    case "instanceResetLocal":
      return "reset-local";
    case "instanceDeploy":
      return "deploy";
    case "instanceTokenAdopt":
      return "token adopt";
    case "instanceTokenRotate":
      return "token rotate";
  }
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

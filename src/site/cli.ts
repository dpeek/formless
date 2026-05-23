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
import { formlessCliUsage, parseFormlessCliArgs } from "./cli-command.ts";
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

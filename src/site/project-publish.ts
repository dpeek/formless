import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import packageJson from "../../package.json";
import {
  FORMLESS_DEPLOY_METADATA_PATH,
  type FormlessDeployMetadata,
} from "../shared/deploy-metadata.ts";
import type { StoredRecord } from "../shared/protocol.ts";
import { normalizeSourceUrl } from "./cli-command.ts";
import { formatDotEnv, parseDotEnv } from "./dotenv.ts";
import {
  formatSiteProjectConfig,
  SITE_PROJECT_CONFIG_FILE,
  type SiteProjectConfig,
} from "./project-config.ts";
import { packageSiteSourceSchema, siteProjectMediaAssetsFromRecords } from "./project-source.ts";
import {
  readSiteProjectSource,
  resolveSiteProjectRoot,
  type SiteProjectSource,
} from "./project-files.ts";
import {
  startSiteProjectLocalPublishBroker as startSiteProjectLocalPublishBrokerServer,
  type SiteProjectLocalPublishBroker,
} from "./local-publish-broker.ts";
import { packageExecCommand, packageRunScriptCommand } from "./package-commands.ts";
import {
  ensureSiteProjectStateIgnored,
  SITE_PROJECT_GITIGNORE_FILE,
  SITE_PROJECT_STATE_DIRECTORY,
} from "./project-state.ts";
import {
  runSitePublish,
  type SitePublishCommand,
  type SitePublishDependencies,
  type SitePublishResult,
} from "./publish.ts";
import { saveSiteProject, type SaveSiteProjectResult } from "./project-save.ts";

export type SiteProjectPublishRunCommandOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

export type SiteProjectPublishDependencies = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  log: (message: string) => void;
  now: () => string;
  packageRoot: string;
  randomToken: () => string;
  runCommand: (
    command: string,
    args: string[],
    options: SiteProjectPublishRunCommandOptions,
  ) => Promise<void>;
};

export type SetupSiteProjectDeployResult = {
  bucketCreated: boolean;
  configPath: string;
  envPath: string;
  gitignorePath: string;
  projectRoot: string;
  secretUploaded: boolean;
};

export type PublishSiteProjectResult = SitePublishResult & {
  projectRoot: string;
};

export type LocalAdminPublishResult = {
  publish: PublishSiteProjectResult;
  save: SaveSiteProjectResult;
};

type CompleteSiteProjectDeployConfig = {
  accountId?: string;
  mediaBucket: string;
  publishUrl: string;
  workerName: string;
};

const projectDeployEnvFile = `${SITE_PROJECT_STATE_DIRECTORY}/deploy.env`;
const projectPublishBackupDirectory = `${SITE_PROJECT_STATE_DIRECTORY}/backups`;
const adminTokenEnvName = "FORMLESS_ADMIN_TOKEN";
const deployVersionEnvName = "FORMLESS_DEPLOY_VERSION";
const formlessPackageVersion = packageJson.version;

type SiteProjectPublishCodeMode = boolean | "if-stale";

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
    SiteProjectPublishDependencies,
    "cwd" | "env" | "randomToken" | "runCommand" | "packageRoot"
  >,
): Promise<SetupSiteProjectDeployResult> {
  const project = await readSiteProjectSource(resolveSiteProjectRoot(dependencies.cwd, input));
  const deploy = {
    workerName: input.workerName,
    ...(input.accountId ? { accountId: input.accountId } : {}),
    publishUrl: normalizeSourceUrl(input.publishUrl),
    mediaBucket: input.mediaBucket,
  };
  const config = {
    ...project.config,
    deploy,
  };
  const configPath = path.join(project.projectRoot, SITE_PROJECT_CONFIG_FILE);
  const envPath = path.join(project.projectRoot, projectDeployEnvFile);
  const gitignorePath = path.join(project.projectRoot, SITE_PROJECT_GITIGNORE_FILE);
  const adminToken = input.adminToken ?? dependencies.randomToken();

  await writeFile(configPath, formatSiteProjectConfig(config));
  await writeProjectDeployEnv(envPath, { [adminTokenEnvName]: adminToken });
  await ensureSiteProjectStateIgnored(project.projectRoot);

  const commandEnv = cloudflareCommandEnv(dependencies.env, deploy.accountId);

  if (input.createBucket) {
    const createBucketCommand = packageExecCommand(
      "wrangler",
      ["r2", "bucket", "create", deploy.mediaBucket],
      dependencies.env,
    );

    await dependencies.runCommand(createBucketCommand.command, createBucketCommand.args, {
      cwd: dependencies.packageRoot,
      env: commandEnv,
    });
  }

  if (input.uploadSecret ?? true) {
    const uploadSecretCommand = packageExecCommand(
      "wrangler",
      ["secret", "bulk", envPath, "--name", deploy.workerName],
      dependencies.env,
    );

    await dependencies.runCommand(uploadSecretCommand.command, uploadSecretCommand.args, {
      cwd: dependencies.packageRoot,
      env: commandEnv,
    });
  }

  return {
    bucketCreated: Boolean(input.createBucket),
    configPath,
    envPath,
    gitignorePath,
    projectRoot: project.projectRoot,
    secretUploaded: input.uploadSecret ?? true,
  };
}

export async function publishSiteProject(
  input: {
    code?: SiteProjectPublishCodeMode;
    dryRun?: boolean;
    projectPath?: string;
    yes?: boolean;
  },
  dependencies: SiteProjectPublishDependencies,
): Promise<PublishSiteProjectResult> {
  const project = await readSiteProjectSource(resolveSiteProjectRoot(dependencies.cwd, input));
  const deploy = requiredSiteProjectDeployConfig(project.config.deploy);
  const adminToken =
    dependencies.env[adminTokenEnvName] ?? (await readProjectDeployAdminToken(project.projectRoot));

  if (!input.dryRun && !adminToken) {
    throw new Error(
      `Missing ${adminTokenEnvName}. Run "npx formless deploy setup" or set ${adminTokenEnvName}.`,
    );
  }

  const code = await shouldPublishSiteProjectCode(input, deploy, dependencies);

  const result = await runSitePublish({
    adminToken,
    codeDeployCommands: siteProjectCodeDeployCommands(deploy, dependencies),
    cwd: project.projectRoot,
    dependencies: sitePublishDependenciesFromProject(dependencies),
    missingSourceMediaMessage: (asset) =>
      `Missing Site project media file ${asset.sourcePath}. Run "npx formless save" or restore the file before publishing.`,
    options: {
      apply: !input.dryRun,
      backupDir: projectPublishBackupDirectory,
      code,
      data: true,
      skipCheck: true,
      target: deploy.publishUrl,
    },
    smokePaths: siteProjectPublishSmokePaths(project.records),
    sourceMediaAssets: siteProjectMediaAssetsFromRecords(project.records, {
      mediaRoot: project.config.mediaRoot,
    }),
    sourceSchema: packageSiteSourceSchema,
    sourceSeedRecords: project.records,
  });

  return {
    ...result,
    projectRoot: project.projectRoot,
  };
}

export async function startSiteProjectLocalPublishBroker(
  input: { projectPath: string; source: () => string | null },
  dependencies: SiteProjectPublishDependencies,
): Promise<SiteProjectLocalPublishBroker> {
  return startSiteProjectLocalPublishBrokerServer(input, {
    randomToken: dependencies.randomToken,
    runPublish: (publishInput) => runLocalAdminPublish(publishInput, dependencies),
  });
}

export async function isSiteProjectPublishConfigured(
  project: SiteProjectSource,
  dependencies: Pick<SiteProjectPublishDependencies, "env">,
): Promise<boolean> {
  try {
    requiredSiteProjectDeployConfig(project.config.deploy);
  } catch {
    return false;
  }

  return Boolean(
    dependencies.env[adminTokenEnvName] ?? (await readProjectDeployAdminToken(project.projectRoot)),
  );
}

async function runLocalAdminPublish(
  input: { projectPath: string; source: string },
  dependencies: SiteProjectPublishDependencies,
): Promise<LocalAdminPublishResult> {
  const save = await saveSiteProject(
    {
      projectPath: input.projectPath,
      source: input.source,
    },
    dependencies,
  );
  const publish = await publishSiteProject(
    {
      code: "if-stale",
      projectPath: input.projectPath,
      yes: true,
    },
    dependencies,
  );

  return {
    publish,
    save,
  };
}

function requiredSiteProjectDeployConfig(
  config: SiteProjectConfig["deploy"],
): CompleteSiteProjectDeployConfig {
  if (!config?.workerName) {
    throw new Error(
      `Missing deploy.workerName in ${SITE_PROJECT_CONFIG_FILE}. Run "npx formless deploy setup".`,
    );
  }

  if (!config.publishUrl) {
    throw new Error(
      `Missing deploy.publishUrl in ${SITE_PROJECT_CONFIG_FILE}. Run "npx formless deploy setup".`,
    );
  }

  if (!config.mediaBucket) {
    throw new Error(
      `Missing deploy.mediaBucket in ${SITE_PROJECT_CONFIG_FILE}. Run "npx formless deploy setup".`,
    );
  }

  return {
    ...(config.accountId ? { accountId: config.accountId } : {}),
    mediaBucket: config.mediaBucket,
    publishUrl: config.publishUrl,
    workerName: config.workerName,
  };
}

function sitePublishDependenciesFromProject(
  dependencies: SiteProjectPublishDependencies,
): SitePublishDependencies {
  return {
    fetch: (url, init) => dependencies.fetch(url, init),
    log: dependencies.log,
    mkdir: async (directoryPath, options) => {
      await mkdir(directoryPath, options);
    },
    now: dependencies.now,
    readFile,
    runCommand: dependencies.runCommand,
    writeFile,
  };
}

async function shouldPublishSiteProjectCode(
  input: { code?: SiteProjectPublishCodeMode; dryRun?: boolean },
  deploy: CompleteSiteProjectDeployConfig,
  dependencies: Pick<SiteProjectPublishDependencies, "fetch" | "log">,
): Promise<boolean> {
  const mode = input.code ?? true;

  if (mode === false) {
    return false;
  }

  if (mode === true || input.dryRun) {
    return true;
  }

  const targetVersion = await fetchTargetDeployVersion(deploy.publishUrl, dependencies.fetch);

  if (targetVersion === formlessPackageVersion) {
    dependencies.log(
      `Code/assets deploy skipped: target deploy version ${targetVersion} is current.`,
    );
    return false;
  }

  dependencies.log(
    targetVersion
      ? `Code/assets deploy required: target deploy version ${targetVersion} does not match local ${formlessPackageVersion}.`
      : "Code/assets deploy required: target deploy version is unavailable.",
  );
  return true;
}

async function fetchTargetDeployVersion(
  target: string,
  fetcher: typeof fetch,
): Promise<string | null> {
  try {
    const metadata = await fetchJson<FormlessDeployMetadata>(
      fetcher,
      new URL(FORMLESS_DEPLOY_METADATA_PATH, `${target}/`).toString(),
      {
        headers: { accept: "application/json" },
      },
    );

    return typeof metadata.version === "string" ? metadata.version : null;
  } catch {
    return null;
  }
}

function siteProjectCodeDeployCommands(
  deploy: CompleteSiteProjectDeployConfig,
  dependencies: Pick<SiteProjectPublishDependencies, "env" | "packageRoot">,
): SitePublishCommand[] {
  const env = publishedSiteDeployEnv(dependencies.env, deploy.accountId);
  const buildCommand = packageRunScriptCommand("build", dependencies.env);
  const deployCommand = packageExecCommand(
    "wrangler",
    [
      "deploy",
      "--name",
      deploy.workerName,
      "--var",
      "FORMLESS_RUNTIME_PROFILE:publishedSite",
      "--var",
      `${deployVersionEnvName}:${formlessPackageVersion}`,
    ],
    dependencies.env,
  );

  return [
    {
      args: buildCommand.args,
      command: buildCommand.command,
      cwd: dependencies.packageRoot,
      env,
      label: buildCommand.label,
    },
    {
      args: deployCommand.args,
      command: deployCommand.command,
      cwd: dependencies.packageRoot,
      env,
      label: deployCommand.label,
    },
  ];
}

function siteProjectPublishSmokePaths(records: StoredRecord[]): string[] {
  const nestedPagePath = records
    .map((record) => record.values.href)
    .find(
      (href): href is string =>
        typeof href === "string" &&
        href.startsWith("/") &&
        href !== "/" &&
        !href.startsWith("/api/"),
    );

  return nestedPagePath ? ["/", nestedPagePath] : ["/"];
}

async function writeProjectDeployEnv(envPath: string, values: Record<string, string>) {
  await mkdir(path.dirname(envPath), { recursive: true });
  await writeFile(envPath, formatDotEnv(values));
}

async function readProjectDeployAdminToken(projectRoot: string): Promise<string | undefined> {
  const contents = await readFileIfExists(path.join(projectRoot, projectDeployEnvFile), "utf8");

  if (!contents) {
    return undefined;
  }

  return parseDotEnv(contents)[adminTokenEnvName];
}

function cloudflareCommandEnv(
  env: NodeJS.ProcessEnv,
  accountId: string | undefined,
): NodeJS.ProcessEnv {
  return {
    ...env,
    ...(accountId ? { CLOUDFLARE_ACCOUNT_ID: accountId } : {}),
  };
}

function publishedSiteDeployEnv(
  env: NodeJS.ProcessEnv,
  accountId: string | undefined,
): NodeJS.ProcessEnv {
  return {
    ...cloudflareCommandEnv(env, accountId),
    [deployVersionEnvName]: formlessPackageVersion,
    FORMLESS_RUNTIME_PROFILE: "publishedSite",
    VITE_FORMLESS_RUNTIME_PROFILE: "publishedSite",
  };
}

async function fetchJson<T>(fetcher: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  const response = await fetcher(url, init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Failed ${init?.method ?? "GET"} ${url}: HTTP ${response.status} ${text}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Failed ${init?.method ?? "GET"} ${url}: response was not JSON.`);
  }
}

async function readFileIfExists(filePath: string): Promise<Buffer | null>;
async function readFileIfExists(filePath: string, encoding: BufferEncoding): Promise<string | null>;
async function readFileIfExists(
  filePath: string,
  encoding?: BufferEncoding,
): Promise<Buffer | string | null> {
  try {
    return encoding ? await readFile(filePath, encoding) : await readFile(filePath);
  } catch {
    return null;
  }
}

import { spawn as nodeSpawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import packageJson from "../../package.json";
import {
  FORMLESS_DEPLOY_METADATA_PATH,
  type FormlessDeployMetadata,
} from "../shared/deploy-metadata.ts";
import type { StoreSnapshot, StoredRecord } from "../shared/protocol.ts";
import { formlessCliUsage, normalizeSourceUrl, parseFormlessCliArgs } from "./cli-command.ts";
import {
  formatSiteProjectConfig,
  SITE_PROJECT_CONFIG_FILE,
  SITE_PROJECT_RECORDS_FILE,
  type SiteProjectConfig,
} from "./project-config.ts";
import {
  buildSiteProjectRecordsFromSnapshot,
  formatSiteProjectRecords,
  packageSiteSourceSchema,
  siteProjectMediaAssetsFromRecords,
} from "./project-source.ts";
import {
  fetchSiteProjectMediaFiles,
  initSiteProjectSource,
  readSiteProjectSource,
  resolveSiteProjectRoot,
  staleSiteProjectSourcePaths,
  writeSiteProjectSourceFiles,
  type SiteProjectSource,
} from "./project-files.ts";
import {
  readSiteProjectDevStateSource,
  runSiteProjectDev,
  SITE_PROJECT_DEFAULT_LOCAL_SOURCE,
} from "./project-dev.ts";
import {
  startSiteProjectLocalPublishBroker as startSiteProjectLocalPublishBrokerServer,
  type SiteProjectLocalPublishBroker,
} from "./local-publish-broker.ts";
import {
  ensureSiteProjectStateIgnored,
  SITE_PROJECT_GITIGNORE_ENTRY,
  SITE_PROJECT_GITIGNORE_FILE,
  SITE_PROJECT_STATE_DIRECTORY,
} from "./project-state.ts";
import {
  runSitePublish,
  type SitePublishCommand,
  type SitePublishDependencies,
  type SitePublishResult,
} from "./publish.ts";

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
  readSiteProjectDevStateSource,
  siteProjectDevEnv,
  siteProjectStorageId,
  siteProjectWranglerPersistPath,
} from "./project-dev.ts";
export { type SiteProjectLocalPublishBroker } from "./local-publish-broker.ts";

export type FormlessCliRunCommandOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

export type FormlessCliDependencies = {
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
    options: FormlessCliRunCommandOptions,
  ) => Promise<void>;
  spawn: typeof nodeSpawn;
};

export type InitSiteProjectResult = {
  configPath: string;
  mediaCount: number;
  projectRoot: string;
  recordCount: number;
  recordsPath: string;
};

export type SaveSiteProjectResult = {
  mediaCount: number;
  mode: "check" | "write";
  projectRoot: string;
  recordCount: number;
  source: string;
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

type PackageCommand = {
  args: string[];
  command: string;
  label: string;
};

type CompleteSiteProjectDeployConfig = {
  accountId?: string;
  mediaBucket: string;
  publishUrl: string;
  workerName: string;
};

const projectDeployEnvFile = `${SITE_PROJECT_STATE_DIRECTORY}/deploy.env`;
const projectPublishBackupDirectory = `${SITE_PROJECT_STATE_DIRECTORY}/backups`;
const projectGitignoreFile = SITE_PROJECT_GITIGNORE_FILE;
const projectStateGitignoreEntry = SITE_PROJECT_GITIGNORE_ENTRY;
const adminTokenEnvName = "FORMLESS_ADMIN_TOKEN";
const deployVersionEnvName = "FORMLESS_DEPLOY_VERSION";
const formlessPackageVersion = packageJson.version;

type SiteProjectPublishCodeMode = boolean | "if-stale";

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

export async function saveSiteProject(
  input: { check?: boolean; projectPath?: string; source?: string | null },
  dependencies: Pick<FormlessCliDependencies, "cwd" | "fetch"> = nodeFormlessCliDependencies(),
): Promise<SaveSiteProjectResult> {
  const project = await readSiteProjectSource(resolveSiteProjectRoot(dependencies.cwd, input));
  const source = normalizeSourceUrl(
    input.source ??
      (await readSiteProjectDevStateSource(project.projectRoot)) ??
      SITE_PROJECT_DEFAULT_LOCAL_SOURCE,
  );
  const snapshot = await fetchJson<StoreSnapshot>(dependencies.fetch, siteSnapshotUrl(source));
  const records = buildSiteProjectRecordsFromSnapshot(snapshot);
  const nextRecords = formatSiteProjectRecords(records);
  const mediaFiles = await fetchSiteProjectMediaFiles(
    source,
    records,
    project.config,
    dependencies.fetch,
  );

  if (input.check) {
    const stalePaths = await staleSiteProjectSourcePaths(project, nextRecords, mediaFiles);

    if (stalePaths.length > 0) {
      throw new Error(
        `Site project source is stale: ${stalePaths.join(", ")}. Run "npx formless save".`,
      );
    }

    return {
      mediaCount: mediaFiles.length,
      mode: "check",
      projectRoot: project.projectRoot,
      recordCount: records.length,
      source,
    };
  }

  await writeSiteProjectSourceFiles(project, nextRecords, mediaFiles);

  return {
    mediaCount: mediaFiles.length,
    mode: "write",
    projectRoot: project.projectRoot,
    recordCount: records.length,
    source,
  };
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
  const gitignorePath = path.join(project.projectRoot, projectGitignoreFile);
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
  dependencies: FormlessCliDependencies = nodeFormlessCliDependencies(),
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
    dependencies: sitePublishDependenciesFromCli(dependencies),
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
  dependencies: FormlessCliDependencies = nodeFormlessCliDependencies(),
): Promise<SiteProjectLocalPublishBroker> {
  return startSiteProjectLocalPublishBrokerServer(input, {
    randomToken: dependencies.randomToken,
    runPublish: (publishInput) => runLocalAdminPublish(publishInput, dependencies),
  });
}

async function runLocalAdminPublish(
  input: { projectPath: string; source: string },
  dependencies: FormlessCliDependencies,
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

async function isSiteProjectPublishConfigured(
  project: SiteProjectSource,
  dependencies: Pick<FormlessCliDependencies, "env">,
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

function sitePublishDependenciesFromCli(
  dependencies: FormlessCliDependencies,
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
  dependencies: Pick<FormlessCliDependencies, "fetch" | "log">,
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
  dependencies: Pick<FormlessCliDependencies, "env" | "packageRoot">,
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

function packageRunScriptCommand(scriptName: string, env: NodeJS.ProcessEnv): PackageCommand {
  if (packageCommandRunner(env) === "bun") {
    return {
      args: ["run", scriptName],
      command: "bun",
      label: `bun run ${scriptName}`,
    };
  }

  return {
    args: ["run", scriptName],
    command: "npm",
    label: `npm run ${scriptName}`,
  };
}

function packageExecCommand(
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): PackageCommand {
  if (packageCommandRunner(env) === "bun") {
    return {
      args: ["x", executable, ...args],
      command: "bun",
      label: `bun x ${[executable, ...args].join(" ")}`,
    };
  }

  return {
    args: ["exec", "--", executable, ...args],
    command: "npm",
    label: `npm exec -- ${[executable, ...args].join(" ")}`,
  };
}

function packageCommandRunner(env: NodeJS.ProcessEnv): "bun" | "npm" {
  const userAgent = env.npm_config_user_agent ?? "";
  const execPath = env.npm_execpath ?? "";

  return userAgent.startsWith("bun/") || path.basename(execPath).startsWith("bun") ? "bun" : "npm";
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
  await writeFile(
    envPath,
    Object.entries(values)
      .map(([key, value]) => `${key}=${formatDotEnvValue(value)}`)
      .join("\n")
      .concat("\n"),
  );
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

function formatDotEnvValue(value: string): string {
  return /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : JSON.stringify(value);
}

function parseDotEnv(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex);
    const value = trimmed.slice(equalsIndex + 1);

    values[key] = parseDotEnvValue(value);
  }

  return values;
}

function parseDotEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }

  return value;
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

function siteSnapshotUrl(source: string): string {
  return new URL("/api/site/snapshot", `${source}/`).toString();
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

function nodeFormlessCliDependencies(): FormlessCliDependencies {
  const spawn = nodeSpawn;

  return {
    cwd: process.cwd(),
    env: process.env,
    fetch,
    log: (message) => console.log(message),
    now: () => new Date().toISOString(),
    packageRoot: resolvePackageRoot(path.dirname(fileURLToPath(import.meta.url))),
    randomToken: () => randomBytes(32).toString("base64url"),
    runCommand: (command, args, options) => runCommandWithSpawn(spawn, command, args, options),
    spawn,
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

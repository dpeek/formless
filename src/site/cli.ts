import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
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
  buildSiteProjectSourceSnapshot,
  formatSiteProjectRecords,
  packageSiteSourceSchema,
  siteProjectMediaAssetsFromRecords,
} from "./project-source.ts";
import {
  fetchSiteProjectMediaFiles,
  initSiteProjectSource,
  readSiteProjectMediaFiles,
  readSiteProjectSource,
  resolveSiteProjectRoot,
  staleSiteProjectSourcePaths,
  writeSiteProjectSourceFiles,
  type SiteProjectSource,
} from "./project-files.ts";
import {
  runSitePublish,
  type SitePublishCommand,
  type SitePublishDependencies,
  type SitePublishResult,
} from "./publish.ts";
import { SITE_MEDIA_ROUTE_PREFIX } from "./source-media.ts";

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

export type SiteProjectLocalPublishBroker = {
  close: () => Promise<void>;
  endpoint: string;
  token: string;
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

type ProjectDevState = {
  adminUrl: string;
  projectId: string;
  publicUrl: string;
  sourceUrl: string;
  startedAt: string;
};

const defaultLocalSource = "http://localhost:5173";
const projectStateDirectory = ".formless";
const projectDevStateFile = `${projectStateDirectory}/dev.json`;
const projectDeployEnvFile = `${projectStateDirectory}/deploy.env`;
const projectPublishBackupDirectory = `${projectStateDirectory}/backups`;
const projectWranglerStateDirectory = `${projectStateDirectory}/wrangler`;
const projectGitignoreFile = ".gitignore";
const projectStateGitignoreEntry = ".formless/";
const adminTokenEnvName = "FORMLESS_ADMIN_TOKEN";
const deployVersionEnvName = "FORMLESS_DEPLOY_VERSION";
const wranglerPersistEnvName = "FORMLESS_WRANGLER_PERSIST";
const localPublishBrokerUrlEnvName = "VITE_FORMLESS_LOCAL_PUBLISH_BROKER_URL";
const localPublishBrokerTokenEnvName = "VITE_FORMLESS_LOCAL_PUBLISH_BROKER_TOKEN";
const formlessPackageVersion = packageJson.version;
const devServerReadyTimeoutMs = 30_000;
const devServerPollIntervalMs = 250;

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
      await runSiteProjectDev(command, dependencies);
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
    input.source ?? (await readProjectDevStateSource(project.projectRoot)) ?? defaultLocalSource,
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
  await ensureProjectStateIgnored(gitignorePath);

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
  const token = dependencies.randomToken();
  let isPublishing = false;
  const server = createServer((request, response) => {
    void handleLocalPublishBrokerRequest({
      dependencies,
      input,
      isPublishing: () => isPublishing,
      request,
      response,
      setPublishing: (nextPublishing) => {
        isPublishing = nextPublishing;
      },
      token,
    });
  });
  const endpoint = await listenLocalPublishBroker(server);

  return {
    close: () => closeLocalPublishBroker(server),
    endpoint,
    token,
  };
}

export function siteProjectStorageId(projectRoot: string): string {
  return createHash("sha256").update(path.resolve(projectRoot)).digest("hex").slice(0, 16);
}

export function siteProjectWranglerPersistPath(projectRoot: string): string {
  return path.resolve(projectRoot, projectWranglerStateDirectory);
}

async function runSiteProjectDev(
  input: { projectPath?: string },
  dependencies: FormlessCliDependencies,
) {
  const project = await readSiteProjectSource(resolveSiteProjectRoot(dependencies.cwd, input));
  const projectId = siteProjectStorageId(project.projectRoot);
  let localSource: string | null = null;
  await prepareProjectStateDirectory(project.projectRoot);
  const publishBroker = (await isSiteProjectPublishConfigured(project, dependencies))
    ? await startSiteProjectLocalPublishBroker(
        {
          projectPath: project.projectRoot,
          source: () => localSource,
        },
        dependencies,
      )
    : null;
  const devCommand = packageRunScriptCommand("dev", dependencies.env);
  const child = dependencies.spawn(devCommand.command, devCommand.args, {
    cwd: dependencies.packageRoot,
    env: siteProjectDevEnv(
      dependencies.env,
      project.projectRoot,
      projectId,
      publishBroker ?? undefined,
    ),
    stdio: "pipe",
  });
  const candidateOrigins = new Set(defaultDevSourceCandidates(dependencies.env));

  forwardDevOutput(child, dependencies.log, candidateOrigins);

  try {
    const source = await waitForDevServer(child, dependencies.fetch, candidateOrigins);
    await restoreSiteProjectToLocalAuthority(project, source, dependencies, projectId);
    localSource = source;
    dependencies.log(`Public preview: ${source}/`);
    dependencies.log(`Admin: ${source}/admin`);
    await waitForChildExit(child);
  } catch (error) {
    child.kill();
    throw error;
  } finally {
    await publishBroker?.close();
  }
}

async function restoreSiteProjectToLocalAuthority(
  project: SiteProjectSource,
  source: string,
  dependencies: Pick<FormlessCliDependencies, "fetch" | "now">,
  projectId: string,
) {
  const mediaFiles = await readSiteProjectMediaFiles(project);
  const snapshot = buildSiteProjectSourceSnapshot(project.records, {
    exportedAt: dependencies.now(),
  });

  for (const mediaFile of mediaFiles) {
    await fetchJson(
      dependencies.fetch,
      new URL(`${SITE_MEDIA_ROUTE_PREFIX}${mediaFile.key}`, `${source}/`).toString(),
      {
        body: mediaFile.bytes,
        headers: {
          accept: "application/json",
          "content-type": mediaFile.contentType,
        },
        method: "PUT",
      },
    );
  }

  await fetchJson(dependencies.fetch, siteSnapshotRestoreUrl(source), {
    body: JSON.stringify(snapshot),
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    method: "POST",
  });
  await writeProjectDevState(project.projectRoot, {
    adminUrl: `${source}/admin`,
    projectId,
    publicUrl: `${source}/`,
    sourceUrl: source,
    startedAt: dependencies.now(),
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

async function handleLocalPublishBrokerRequest({
  dependencies,
  input,
  isPublishing,
  request,
  response,
  setPublishing,
  token,
}: {
  dependencies: FormlessCliDependencies;
  input: { projectPath: string; source: () => string | null };
  isPublishing: () => boolean;
  request: IncomingMessage;
  response: ServerResponse;
  setPublishing: (isPublishing: boolean) => void;
  token: string;
}) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "authorization,content-type,accept");
  response.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  response.setHeader("Access-Control-Max-Age", "600");

  const pathname = localPublishBrokerPathname(request);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (pathname !== "/publish") {
    writeLocalPublishBrokerJson(response, 404, {
      error: "Local publish broker endpoint not found.",
      ok: false,
    });
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST,OPTIONS");
    writeLocalPublishBrokerJson(response, 405, {
      error: "Local publish broker only accepts POST.",
      ok: false,
    });
    return;
  }

  if (request.headers.authorization !== `Bearer ${token}`) {
    writeLocalPublishBrokerJson(response, 401, {
      error: "Local publish broker token is invalid.",
      ok: false,
    });
    return;
  }

  if (isPublishing()) {
    writeLocalPublishBrokerJson(response, 409, {
      error: "A Site publish is already running.",
      ok: false,
    });
    return;
  }

  const source = input.source();

  if (!source) {
    writeLocalPublishBrokerJson(response, 503, {
      error: "Site project dev server is not ready.",
      ok: false,
    });
    return;
  }

  setPublishing(true);

  try {
    const result = await runLocalAdminPublish(
      {
        projectPath: input.projectPath,
        source,
      },
      dependencies,
    );

    writeLocalPublishBrokerJson(response, 200, {
      ok: true,
      result: localAdminPublishResponse(result),
    });
  } catch (error) {
    writeLocalPublishBrokerJson(response, 500, {
      error: errorMessage(error),
      ok: false,
    });
  } finally {
    setPublishing(false);
  }
}

function localPublishBrokerPathname(request: IncomingMessage): string {
  try {
    const host = request.headers.host ?? "127.0.0.1";

    return new URL(request.url ?? "/", `http://${host}`).pathname;
  } catch {
    return "/";
  }
}

function localAdminPublishResponse(result: LocalAdminPublishResult) {
  return {
    publish: {
      backupPath: result.publish.backupPath,
      mode: result.publish.mode,
      sourceRecordCount: result.publish.sourceRecordCount,
      target: result.publish.target,
    },
    save: {
      mediaCount: result.save.mediaCount,
      recordCount: result.save.recordCount,
      source: result.save.source,
    },
  };
}

function writeLocalPublishBrokerJson(
  response: ServerResponse,
  status: number,
  body:
    | { error: string; ok: false }
    | { ok: true; result: ReturnType<typeof localAdminPublishResponse> },
) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(body)}\n`);
}

async function listenLocalPublishBroker(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    const rejectOnError = (error: Error) => {
      reject(error);
    };

    server.once("error", rejectOnError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectOnError);
      resolve();
    });
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Local publish broker did not bind to a TCP port.");
  }

  return `http://127.0.0.1:${address.port}/publish`;
}

async function closeLocalPublishBroker(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function ensureProjectStateIgnored(gitignorePath: string) {
  const current = (await readFileIfExists(gitignorePath, "utf8")) ?? "";
  const lines = current.split(/\r?\n/);

  if (lines.some((line) => isProjectStateIgnoreLine(line))) {
    return;
  }

  const prefix = current.length === 0 || current.endsWith("\n") ? current : `${current}\n`;

  await writeFile(gitignorePath, `${prefix}${projectStateGitignoreEntry}\n`);
}

function isProjectStateIgnoreLine(line: string): boolean {
  const value = line.trim();

  return value === projectStateDirectory || value === projectStateGitignoreEntry;
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

function defaultDevSourceCandidates(env: NodeJS.ProcessEnv): string[] {
  const port = env.PORT && /^\d+$/.test(env.PORT) ? env.PORT : "5173";

  return [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
}

export function siteProjectDevEnv(
  env: NodeJS.ProcessEnv,
  projectRoot: string,
  projectId: string,
  publishBroker?: Pick<SiteProjectLocalPublishBroker, "endpoint" | "token">,
): NodeJS.ProcessEnv {
  const nextEnv: NodeJS.ProcessEnv = {
    ...env,
    FORMLESS_RUNTIME_PROFILE: "siteAuthoring",
    FORMLESS_SITE_PROJECT_ROOT: projectRoot,
    FORMLESS_SITE_PROJECT_ID: projectId,
    [wranglerPersistEnvName]: siteProjectWranglerPersistPath(projectRoot),
    VITE_FORMLESS_RUNTIME_PROFILE: "siteAuthoring",
    VITE_FORMLESS_SITE_PROJECT_ID: projectId,
  };

  delete nextEnv.FORMLESS_ADMIN_TOKEN;
  delete nextEnv[localPublishBrokerUrlEnvName];
  delete nextEnv[localPublishBrokerTokenEnvName];

  if (publishBroker) {
    nextEnv[localPublishBrokerUrlEnvName] = publishBroker.endpoint;
    nextEnv[localPublishBrokerTokenEnvName] = publishBroker.token;
  }

  return nextEnv;
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

async function waitForDevServer(
  child: ChildProcessWithoutNullStreams,
  fetcher: typeof fetch,
  candidateOrigins: Set<string>,
): Promise<string> {
  const startedAt = Date.now();
  let spawnError: Error | null = null;

  child.once("error", (error) => {
    spawnError = error;
  });

  while (Date.now() - startedAt < devServerReadyTimeoutMs) {
    if (spawnError) {
      throw spawnError;
    }

    if (child.exitCode !== null) {
      throw new Error(`Site project dev server exited with code ${child.exitCode}.`);
    }

    for (const origin of candidateOrigins) {
      if (await isDevServerReady(fetcher, origin)) {
        return origin;
      }
    }

    await delay(devServerPollIntervalMs);
  }

  throw new Error("Timed out waiting for the Site project dev server.");
}

async function isDevServerReady(fetcher: typeof fetch, origin: string): Promise<boolean> {
  try {
    const response = await fetcher(siteBootstrapUrl(origin), {
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
            ? `Site project dev server exited with signal ${signal}.`
            : `Site project dev server exited with code ${code ?? "unknown"}.`,
        ),
      );
    });
  });
}

async function writeProjectDevState(projectRoot: string, state: ProjectDevState) {
  await mkdir(path.join(projectRoot, projectStateDirectory), { recursive: true });
  await writeFile(
    path.join(projectRoot, projectDevStateFile),
    `${JSON.stringify(state, null, 2)}\n`,
  );
}

async function prepareProjectStateDirectory(projectRoot: string) {
  await mkdir(path.join(projectRoot, projectStateDirectory), { recursive: true });
  await ensureProjectStateIgnored(path.join(projectRoot, projectGitignoreFile));
}

async function readProjectDevStateSource(projectRoot: string): Promise<string | null> {
  const contents = await readFileIfExists(path.join(projectRoot, projectDevStateFile), "utf8");

  if (!contents) {
    return null;
  }

  try {
    const value = JSON.parse(contents) as unknown;

    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof (value as { sourceUrl?: unknown }).sourceUrl === "string"
    ) {
      return (value as { sourceUrl: string }).sourceUrl;
    }
  } catch {
    return null;
  }

  return null;
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

function siteBootstrapUrl(source: string): string {
  return new URL("/api/site/bootstrap", `${source}/`).toString();
}

function siteSnapshotUrl(source: string): string {
  return new URL("/api/site/snapshot", `${source}/`).toString();
}

function siteSnapshotRestoreUrl(source: string): string {
  return new URL("/api/site/snapshot/restore", `${source}/`).toString();
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

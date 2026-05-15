import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import rawSiteSeedRecords from "../../schema/apps/site/seed-records.json";
import type { StoreSnapshot, StoredRecord } from "../shared/protocol.ts";
import {
  defaultSiteProjectConfig,
  formatSiteProjectConfig,
  parseSiteProjectConfigJson,
  SITE_PROJECT_CONFIG_FILE,
  SITE_PROJECT_MEDIA_ROOT,
  SITE_PROJECT_RECORDS_FILE,
  type SiteProjectConfig,
} from "./project-config.ts";
import {
  buildSiteProjectRecordsFromSnapshot,
  buildSiteProjectSourceSnapshot,
  formatSiteProjectRecords,
  packageSiteSourceSchema,
  parseSiteProjectRecords,
  parseSiteProjectRecordsJson,
  siteProjectMediaAssetsFromRecords,
  type SiteProjectMediaAsset,
} from "./project-source.ts";
import {
  runSitePublish,
  type SitePublishCommand,
  type SitePublishDependencies,
  type SitePublishResult,
} from "./publish.ts";
import { SITE_MEDIA_ROUTE_PREFIX, SITE_SOURCE_MEDIA_ROOT } from "./source-media.ts";

export type FormlessCliCommand =
  | {
      accountId: string | null;
      adminToken: string | null;
      createBucket: boolean;
      kind: "deploySetup";
      mediaBucket: string;
      projectPath: string;
      publishUrl: string;
      uploadSecret: boolean;
      workerName: string;
    }
  | { kind: "dev"; projectPath: string }
  | { kind: "help" }
  | { kind: "init"; targetDir: string }
  | { dryRun: boolean; kind: "publish"; projectPath: string; yes: boolean }
  | { check: boolean; kind: "save"; projectPath: string; source: string | null };

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

export type SiteProjectSource = {
  config: SiteProjectConfig;
  projectRoot: string;
  records: StoredRecord[];
};

type ProjectMediaFile = SiteProjectMediaAsset & {
  bytes: Uint8Array<ArrayBuffer>;
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
const projectGitignoreFile = ".gitignore";
const projectStateGitignoreEntry = ".formless/";
const adminTokenEnvName = "FORMLESS_ADMIN_TOKEN";
const localPublishBrokerUrlEnvName = "VITE_FORMLESS_LOCAL_PUBLISH_BROKER_URL";
const localPublishBrokerTokenEnvName = "VITE_FORMLESS_LOCAL_PUBLISH_BROKER_TOKEN";
const devServerReadyTimeoutMs = 30_000;
const devServerPollIntervalMs = 250;

export function parseFormlessCliArgs(args: string[]): FormlessCliCommand {
  const [command, ...rest] = args;

  if (!command || command === "-h" || command === "--help" || command === "help") {
    return { kind: "help" };
  }

  switch (command) {
    case "init":
      return parseInitArgs(rest);
    case "dev":
      return parseDevArgs(rest);
    case "save":
      return parseSaveArgs(rest);
    case "deploy":
      return parseDeployArgs(rest);
    case "publish":
      return parsePublishArgs(rest);
    default:
      throw new Error(`Unknown command: ${command}`);
  }
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

export function formlessCliUsage(): string {
  return [
    "Usage: formless <command>",
    "",
    "Commands:",
    "  init <dir>                         Create a Formless Site project",
    "  dev [--project <path>]             Run local public preview and /admin editor",
    "  save [--project <path>] [--check]   Save local Site edits back to project files",
    "       [--source <url>]",
    "  deploy setup [options]              Store deploy config and local admin token",
    "  publish [--project <path>]          Deploy code, media, and records",
    "       [--dry-run] [--yes]",
  ].join("\n");
}

export async function initSiteProject(
  input: { targetDir: string },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "packageRoot"
  > = nodeFormlessCliDependencies(),
): Promise<InitSiteProjectResult> {
  const projectRoot = path.resolve(dependencies.cwd, input.targetDir);
  await assertInitTarget(projectRoot);

  const config = defaultSiteProjectConfig();
  const records = parseSiteProjectRecords(rawSiteSeedRecords);
  const configPath = path.join(projectRoot, SITE_PROJECT_CONFIG_FILE);
  const recordsPath = path.join(projectRoot, SITE_PROJECT_RECORDS_FILE);
  const mediaAssets = siteProjectMediaAssetsFromRecords(records, { mediaRoot: config.mediaRoot });

  await mkdir(projectRoot, { recursive: true });
  await writeFile(configPath, formatSiteProjectConfig(config));
  await writeFile(recordsPath, formatSiteProjectRecords(records));
  await copyStarterMediaFiles(projectRoot, dependencies.packageRoot, mediaAssets);

  return {
    configPath,
    mediaCount: mediaAssets.length,
    projectRoot,
    recordCount: records.length,
    recordsPath,
  };
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
  const mediaFiles = await fetchProjectMediaFiles(source, records, project.config, dependencies);

  if (input.check) {
    const stalePaths = await staleProjectSourcePaths(project, nextRecords, mediaFiles);

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

  await writeFile(path.join(project.projectRoot, project.config.recordsPath), nextRecords);
  await writeProjectMediaFiles(project.projectRoot, mediaFiles);

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
    await dependencies.runCommand(
      "bun",
      ["x", "wrangler", "r2", "bucket", "create", deploy.mediaBucket],
      {
        cwd: dependencies.packageRoot,
        env: commandEnv,
      },
    );
  }

  if (input.uploadSecret ?? true) {
    await dependencies.runCommand(
      "bun",
      ["x", "wrangler", "secret", "bulk", envPath, "--name", deploy.workerName],
      {
        cwd: dependencies.packageRoot,
        env: commandEnv,
      },
    );
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
  input: { dryRun?: boolean; projectPath?: string; yes?: boolean },
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
      code: true,
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

export async function readSiteProjectSource(projectRoot: string): Promise<SiteProjectSource> {
  const configPath = path.join(projectRoot, SITE_PROJECT_CONFIG_FILE);
  const config = parseSiteProjectConfigJson(await readFile(configPath, "utf8"));
  const recordsPath = path.join(projectRoot, config.recordsPath);
  const records = parseSiteProjectRecordsJson(await readFile(recordsPath, "utf8"));

  return {
    config,
    projectRoot,
    records,
  };
}

export function resolveSiteProjectRoot(
  cwd: string,
  options: { projectPath?: string } = {},
): string {
  return path.resolve(cwd, options.projectPath ?? ".");
}

export function siteProjectStorageId(projectRoot: string): string {
  return createHash("sha256").update(path.resolve(projectRoot)).digest("hex").slice(0, 16);
}

export function normalizeSourceUrl(value: string): string {
  try {
    const url = new URL(value);

    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Source URL is invalid: ${value}`);
  }
}

async function runSiteProjectDev(
  input: { projectPath?: string },
  dependencies: FormlessCliDependencies,
) {
  const project = await readSiteProjectSource(resolveSiteProjectRoot(dependencies.cwd, input));
  const projectId = siteProjectStorageId(project.projectRoot);
  let localSource: string | null = null;
  const publishBroker = (await isSiteProjectPublishConfigured(project, dependencies))
    ? await startSiteProjectLocalPublishBroker(
        {
          projectPath: project.projectRoot,
          source: () => localSource,
        },
        dependencies,
      )
    : null;
  const child = dependencies.spawn("bun", ["run", "dev"], {
    cwd: dependencies.packageRoot,
    env: siteProjectDevEnv(dependencies.env, projectId, publishBroker ?? undefined),
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
  const mediaFiles = await readProjectMediaFiles(project);
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

function siteProjectCodeDeployCommands(
  deploy: CompleteSiteProjectDeployConfig,
  dependencies: Pick<FormlessCliDependencies, "env" | "packageRoot">,
): SitePublishCommand[] {
  const env = publishedSiteDeployEnv(dependencies.env, deploy.accountId);

  return [
    {
      args: ["run", "build"],
      command: "bun",
      cwd: dependencies.packageRoot,
      env,
      label: "bun run build",
    },
    {
      args: [
        "x",
        "wrangler",
        "deploy",
        "--name",
        deploy.workerName,
        "--var",
        "FORMLESS_RUNTIME_PROFILE:publishedSite",
      ],
      command: "bun",
      cwd: dependencies.packageRoot,
      env,
      label: `bun x wrangler deploy --name ${deploy.workerName}`,
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

  if (lines.some((line) => line.trim() === projectStateGitignoreEntry)) {
    return;
  }

  const prefix = current.length === 0 || current.endsWith("\n") ? current : `${current}\n`;

  await writeFile(gitignorePath, `${prefix}${projectStateGitignoreEntry}\n`);
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

function parseInitArgs(args: string[]): FormlessCliCommand {
  if (args.length !== 1 || args[0]?.startsWith("-")) {
    throw new Error("Usage: formless init <dir>");
  }

  return { kind: "init", targetDir: args[0] };
}

function parseDevArgs(args: string[]): FormlessCliCommand {
  const options = parseProjectOptions(args, "formless dev");

  if (options.rest.length > 0) {
    throw new Error(`Unknown option for formless dev: ${options.rest[0]}`);
  }

  return { kind: "dev", projectPath: options.projectPath };
}

function parseSaveArgs(args: string[]): FormlessCliCommand {
  const options = parseProjectOptions(args, "formless save");
  let check = false;
  let source: string | null = null;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--check") {
      check = true;
      continue;
    }

    if (arg === "--source") {
      source = normalizeSourceUrl(readOptionValue(options.rest, index, "--source"));
      index += 1;
      continue;
    }

    throw new Error(`Unknown option for formless save: ${arg}`);
  }

  return { check, kind: "save", projectPath: options.projectPath, source };
}

function parseDeployArgs(args: string[]): FormlessCliCommand {
  const [subcommand, ...rest] = args;

  if (subcommand !== "setup") {
    throw new Error(
      "Usage: formless deploy setup [--project <path>] --worker <name> --publish-url <url> --media-bucket <bucket>",
    );
  }

  return parseDeploySetupArgs(rest);
}

function parseDeploySetupArgs(args: string[]): FormlessCliCommand {
  const options = parseProjectOptions(args, "formless deploy setup");
  let accountId: string | null = null;
  let adminToken: string | null = null;
  let createBucket = false;
  let mediaBucket: string | null = null;
  let publishUrl: string | null = null;
  let uploadSecret = true;
  let workerName: string | null = null;

  for (let index = 0; index < options.rest.length; index += 1) {
    const arg = options.rest[index];

    if (arg === "--worker") {
      workerName = readOptionValue(options.rest, index, "--worker");
      index += 1;
      continue;
    }

    if (arg === "--publish-url") {
      publishUrl = normalizeSourceUrl(readOptionValue(options.rest, index, "--publish-url"));
      index += 1;
      continue;
    }

    if (arg === "--media-bucket") {
      mediaBucket = readOptionValue(options.rest, index, "--media-bucket");
      index += 1;
      continue;
    }

    if (arg === "--account-id") {
      accountId = readOptionValue(options.rest, index, "--account-id");
      index += 1;
      continue;
    }

    if (arg === "--admin-token") {
      adminToken = readOptionValue(options.rest, index, "--admin-token");
      index += 1;
      continue;
    }

    if (arg === "--generate-admin-token") {
      adminToken = null;
      continue;
    }

    if (arg === "--create-bucket") {
      createBucket = true;
      continue;
    }

    if (arg === "--skip-secret-upload") {
      uploadSecret = false;
      continue;
    }

    throw new Error(`Unknown option for formless deploy setup: ${arg}`);
  }

  if (!workerName) {
    throw new Error("Missing required option for formless deploy setup: --worker.");
  }

  if (!publishUrl) {
    throw new Error("Missing required option for formless deploy setup: --publish-url.");
  }

  if (!mediaBucket) {
    throw new Error("Missing required option for formless deploy setup: --media-bucket.");
  }

  return {
    accountId,
    adminToken,
    createBucket,
    kind: "deploySetup",
    mediaBucket,
    projectPath: options.projectPath,
    publishUrl,
    uploadSecret,
    workerName,
  };
}

function parsePublishArgs(args: string[]): FormlessCliCommand {
  const options = parseProjectOptions(args, "formless publish");
  let dryRun = false;
  let yes = false;

  for (const arg of options.rest) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--yes" || arg === "-y") {
      yes = true;
      continue;
    }

    throw new Error(`Unknown option for formless publish: ${arg}`);
  }

  return { dryRun, kind: "publish", projectPath: options.projectPath, yes };
}

function parseProjectOptions(
  args: string[],
  usage: string,
): { projectPath: string; rest: string[] } {
  let projectPath = ".";
  const rest: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--project") {
      projectPath = readOptionValue(args, index, "--project");
      index += 1;
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      throw new Error(`Usage: ${usage} [--project <path>]`);
    }

    rest.push(arg);
  }

  return { projectPath, rest };
}

function readOptionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];

  if (typeof value !== "string" || value.length === 0 || value.startsWith("-")) {
    throw new Error(`Missing value for ${option}.`);
  }

  return value;
}

async function assertInitTarget(projectRoot: string) {
  const targetStat = await statIfExists(projectRoot);

  if (targetStat && !targetStat.isDirectory()) {
    throw new Error(`Cannot initialize Site project because ${projectRoot} is not a directory.`);
  }

  const conflicts = (
    await Promise.all(
      [SITE_PROJECT_CONFIG_FILE, SITE_PROJECT_RECORDS_FILE, SITE_PROJECT_MEDIA_ROOT].map(
        async (relativePath) =>
          (await pathExists(path.join(projectRoot, relativePath))) ? relativePath : null,
      ),
    )
  ).filter((value): value is string => value !== null);

  if (conflicts.length > 0) {
    throw new Error(
      `Cannot initialize Site project because the target already contains ${conflicts.join(", ")}.`,
    );
  }
}

async function copyStarterMediaFiles(
  projectRoot: string,
  packageRoot: string,
  mediaAssets: SiteProjectMediaAsset[],
) {
  for (const asset of mediaAssets) {
    const sourcePath = path.join(packageRoot, SITE_SOURCE_MEDIA_ROOT, asset.key);
    const targetPath = path.join(projectRoot, asset.sourcePath);

    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  }
}

async function fetchProjectMediaFiles(
  source: string,
  records: StoredRecord[],
  config: SiteProjectConfig,
  dependencies: Pick<FormlessCliDependencies, "fetch">,
): Promise<ProjectMediaFile[]> {
  const mediaAssets = siteProjectMediaAssetsFromRecords(records, { mediaRoot: config.mediaRoot });

  return Promise.all(
    mediaAssets.map(async (asset) => {
      const response = await dependencies.fetch(new URL(asset.href, `${source}/`).toString(), {
        headers: {
          accept: asset.contentType,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch ${asset.href}: HTTP ${response.status} ${await response.text()}`,
        );
      }

      const contentType = normalizeContentType(response.headers.get("Content-Type"));

      if (contentType && contentType !== asset.contentType) {
        throw new Error(
          `Failed to fetch ${asset.href}: expected ${asset.contentType}, received ${contentType}.`,
        );
      }

      return {
        ...asset,
        bytes: copyBytes(new Uint8Array(await response.arrayBuffer())),
      };
    }),
  );
}

async function readProjectMediaFiles(project: SiteProjectSource): Promise<ProjectMediaFile[]> {
  const mediaAssets = siteProjectMediaAssetsFromRecords(project.records, {
    mediaRoot: project.config.mediaRoot,
  });
  const files: ProjectMediaFile[] = [];

  for (const asset of mediaAssets) {
    const mediaPath = path.join(project.projectRoot, asset.sourcePath);

    files.push({
      ...asset,
      bytes: copyBytes(await readFile(mediaPath)),
    });
  }

  return files;
}

async function writeProjectMediaFiles(projectRoot: string, mediaFiles: ProjectMediaFile[]) {
  for (const mediaFile of mediaFiles) {
    const targetPath = path.join(projectRoot, mediaFile.sourcePath);

    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, mediaFile.bytes);
  }
}

async function staleProjectSourcePaths(
  project: SiteProjectSource,
  nextRecords: string,
  mediaFiles: ProjectMediaFile[],
): Promise<string[]> {
  const stalePaths: string[] = [];
  const recordsPath = path.join(project.projectRoot, project.config.recordsPath);

  if ((await readFileIfExists(recordsPath, "utf8")) !== nextRecords) {
    stalePaths.push(project.config.recordsPath);
  }

  for (const mediaFile of mediaFiles) {
    const current = await readFileIfExists(path.join(project.projectRoot, mediaFile.sourcePath));

    if (!current || !bytesEqual(current, mediaFile.bytes)) {
      stalePaths.push(mediaFile.sourcePath);
    }
  }

  return stalePaths;
}

function defaultDevSourceCandidates(env: NodeJS.ProcessEnv): string[] {
  const port = env.PORT && /^\d+$/.test(env.PORT) ? env.PORT : "5173";

  return [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
}

function siteProjectDevEnv(
  env: NodeJS.ProcessEnv,
  projectId: string,
  publishBroker?: Pick<SiteProjectLocalPublishBroker, "endpoint" | "token">,
): NodeJS.ProcessEnv {
  const nextEnv: NodeJS.ProcessEnv = {
    ...env,
    FORMLESS_RUNTIME_PROFILE: "siteAuthoring",
    FORMLESS_SITE_PROJECT_ID: projectId,
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

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);

  copy.set(bytes);
  return copy;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function normalizeContentType(value: string | null): string {
  return value?.split(";")[0]?.trim().toLowerCase() ?? "";
}

async function statIfExists(filePath: string) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
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
    packageRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
    randomToken: () => randomBytes(32).toString("base64url"),
    runCommand: (command, args, options) => runCommandWithSpawn(spawn, command, args, options),
    spawn,
  };
}

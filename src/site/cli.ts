import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
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
  parseSiteProjectRecords,
  parseSiteProjectRecordsJson,
  siteProjectMediaAssetsFromRecords,
  type SiteProjectMediaAsset,
} from "./project-source.ts";
import { SITE_MEDIA_ROUTE_PREFIX, SITE_SOURCE_MEDIA_ROOT } from "./source-media.ts";

export type FormlessCliCommand =
  | { kind: "dev"; projectPath: string }
  | { kind: "help" }
  | { kind: "init"; targetDir: string }
  | { check: boolean; kind: "save"; projectPath: string; source: string | null };

export type FormlessCliDependencies = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  log: (message: string) => void;
  now: () => string;
  packageRoot: string;
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

export type SiteProjectSource = {
  config: SiteProjectConfig;
  projectRoot: string;
  records: StoredRecord[];
};

type ProjectMediaFile = SiteProjectMediaAsset & {
  bytes: Uint8Array<ArrayBuffer>;
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
  const child = dependencies.spawn("bun", ["run", "dev"], {
    cwd: dependencies.packageRoot,
    env: siteProjectDevEnv(dependencies.env, projectId),
    stdio: "pipe",
  });
  const candidateOrigins = new Set(defaultDevSourceCandidates(dependencies.env));

  forwardDevOutput(child, dependencies.log, candidateOrigins);

  try {
    const source = await waitForDevServer(child, dependencies.fetch, candidateOrigins);
    await restoreSiteProjectToLocalAuthority(project, source, dependencies, projectId);
    dependencies.log(`Public preview: ${source}/`);
    dependencies.log(`Admin: ${source}/admin`);
    await waitForChildExit(child);
  } catch (error) {
    child.kill();
    throw error;
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

function siteProjectDevEnv(env: NodeJS.ProcessEnv, projectId: string): NodeJS.ProcessEnv {
  const nextEnv: NodeJS.ProcessEnv = {
    ...env,
    FORMLESS_RUNTIME_PROFILE: "siteAuthoring",
    FORMLESS_SITE_PROJECT_ID: projectId,
    VITE_FORMLESS_RUNTIME_PROFILE: "siteAuthoring",
    VITE_FORMLESS_SITE_PROJECT_ID: projectId,
  };

  delete nextEnv.FORMLESS_ADMIN_TOKEN;
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

function nodeFormlessCliDependencies(): FormlessCliDependencies {
  return {
    cwd: process.cwd(),
    env: process.env,
    fetch,
    log: (message) => console.log(message),
    now: () => new Date().toISOString(),
    packageRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
    spawn: nodeSpawn,
  };
}

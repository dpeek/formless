import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildSiteProjectSourceSnapshot } from "./project-source.ts";
import {
  readSiteProjectMediaFiles,
  readSiteProjectSource,
  resolveSiteProjectRoot,
  type SiteProjectSource,
} from "./project-files.ts";
import type { SiteProjectLocalPublishBroker } from "./local-publish-broker.ts";
import {
  prepareSiteProjectStateDirectory,
  siteProjectStatePath,
  SITE_PROJECT_STATE_DIRECTORY,
} from "./project-state.ts";

export type SiteProjectDevCommand = {
  args: string[];
  command: string;
  label: string;
};

export type { SiteProjectLocalPublishBroker } from "./local-publish-broker.ts";

export type SiteProjectDevDependencies = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  log: (message: string) => void;
  now: () => string;
  packageRoot: string;
  spawn: typeof nodeSpawn;
};

export type SiteProjectDevOptions = {
  devCommand: SiteProjectDevCommand;
  isPublishConfigured: (project: SiteProjectSource) => Promise<boolean>;
  startLocalPublishBroker: (input: {
    projectPath: string;
    source: () => string | null;
  }) => Promise<SiteProjectLocalPublishBroker>;
};

type ProjectDevState = {
  adminUrl: string;
  projectId: string;
  publicUrl: string;
  sourceUrl: string;
  startedAt: string;
};

export const SITE_PROJECT_DEFAULT_LOCAL_SOURCE = "http://localhost:5173";

const projectDevStateFile = `${SITE_PROJECT_STATE_DIRECTORY}/dev.json`;
const projectWranglerStateDirectory = `${SITE_PROJECT_STATE_DIRECTORY}/wrangler`;
const wranglerPersistEnvName = "FORMLESS_WRANGLER_PERSIST";
const localPublishBrokerUrlEnvName = "VITE_FORMLESS_LOCAL_PUBLISH_BROKER_URL";
const localPublishBrokerTokenEnvName = "VITE_FORMLESS_LOCAL_PUBLISH_BROKER_TOKEN";
const devServerReadyTimeoutMs = 30_000;
const devServerPollIntervalMs = 250;

export async function runSiteProjectDev(
  input: { projectPath?: string },
  dependencies: SiteProjectDevDependencies,
  options: SiteProjectDevOptions,
) {
  const project = await readSiteProjectSource(resolveSiteProjectRoot(dependencies.cwd, input));
  const projectId = siteProjectStorageId(project.projectRoot);
  let localSource: string | null = null;
  await prepareSiteProjectStateDirectory(project.projectRoot);
  const publishBroker = (await options.isPublishConfigured(project))
    ? await options.startLocalPublishBroker({
        projectPath: project.projectRoot,
        source: () => localSource,
      })
    : null;
  const child = dependencies.spawn(options.devCommand.command, options.devCommand.args, {
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

export function siteProjectStorageId(projectRoot: string): string {
  return createHash("sha256").update(path.resolve(projectRoot)).digest("hex").slice(0, 16);
}

export function siteProjectWranglerPersistPath(projectRoot: string): string {
  return path.resolve(projectRoot, projectWranglerStateDirectory);
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

export async function readSiteProjectDevStateSource(projectRoot: string): Promise<string | null> {
  const contents = await readTextFileIfExists(path.join(projectRoot, projectDevStateFile));

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

async function restoreSiteProjectToLocalAuthority(
  project: SiteProjectSource,
  source: string,
  dependencies: Pick<SiteProjectDevDependencies, "fetch" | "now">,
  projectId: string,
) {
  const mediaFiles = await readSiteProjectMediaFiles(project);
  const snapshot = buildSiteProjectSourceSnapshot(project.records, {
    exportedAt: dependencies.now(),
  });

  for (const mediaFile of mediaFiles) {
    await fetchJson(dependencies.fetch, new URL(mediaFile.href, `${source}/`).toString(), {
      body: mediaFile.bytes,
      headers: {
        accept: "application/json",
        "content-type": mediaFile.contentType,
      },
      method: "PUT",
    });
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

function defaultDevSourceCandidates(env: NodeJS.ProcessEnv): string[] {
  const port = env.PORT && /^\d+$/.test(env.PORT) ? env.PORT : "5173";

  return [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
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
  await writeFile(
    siteProjectStatePath(projectRoot, "dev.json"),
    `${JSON.stringify(state, null, 2)}\n`,
  );
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

function siteSnapshotRestoreUrl(source: string): string {
  return new URL("/api/site/snapshot/restore", `${source}/`).toString();
}

async function readTextFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

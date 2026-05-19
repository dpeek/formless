import type { StoreSnapshot } from "../shared/protocol.ts";
import { normalizeSourceUrl } from "./cli-command.ts";
import { buildSiteProjectRecordsFromSnapshot, formatSiteProjectRecords } from "./project-source.ts";
import {
  fetchSiteProjectMediaFiles,
  readSiteProjectSource,
  resolveSiteProjectRoot,
  staleSiteProjectSourcePaths,
  writeSiteProjectSourceFiles,
} from "./project-files.ts";
import { readSiteProjectDevStateSource, SITE_PROJECT_DEFAULT_LOCAL_SOURCE } from "./project-dev.ts";

export type SiteProjectSaveDependencies = {
  cwd: string;
  fetch: typeof fetch;
};

export type SaveSiteProjectResult = {
  mediaCount: number;
  mode: "check" | "write";
  projectRoot: string;
  recordCount: number;
  source: string;
};

export async function saveSiteProject(
  input: { check?: boolean; projectPath?: string; source?: string | null },
  dependencies: SiteProjectSaveDependencies,
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

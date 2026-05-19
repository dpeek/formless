import { constants as fsConstants } from "node:fs";
import { access, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import rawSiteSeedRecords from "../../schema/apps/site/seed-records.json";
import type { StoredRecord } from "../shared/protocol.ts";
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
  formatSiteProjectRecords,
  parseSiteProjectRecords,
  parseSiteProjectRecordsJson,
  siteProjectMediaAssetsFromRecords,
  type SiteProjectMediaAsset,
} from "./project-source.ts";
import { SITE_SOURCE_MEDIA_ROOT } from "./source-media.ts";

export type SiteProjectSource = {
  config: SiteProjectConfig;
  projectRoot: string;
  records: StoredRecord[];
};

export type SiteProjectMediaFile = SiteProjectMediaAsset & {
  bytes: Uint8Array<ArrayBuffer>;
};

export type InitSiteProjectSourceResult = {
  configPath: string;
  mediaCount: number;
  projectRoot: string;
  recordCount: number;
  recordsPath: string;
};

export function resolveSiteProjectRoot(
  cwd: string,
  options: { projectPath?: string } = {},
): string {
  return path.resolve(cwd, options.projectPath ?? ".");
}

export async function initSiteProjectSource(input: {
  packageRoot: string;
  projectRoot: string;
}): Promise<InitSiteProjectSourceResult> {
  await assertInitTarget(input.projectRoot);

  const config = defaultSiteProjectConfig();
  const records = parseSiteProjectRecords(rawSiteSeedRecords);
  const configPath = path.join(input.projectRoot, SITE_PROJECT_CONFIG_FILE);
  const recordsPath = path.join(input.projectRoot, SITE_PROJECT_RECORDS_FILE);
  const mediaAssets = siteProjectMediaAssetsFromRecords(records, { mediaRoot: config.mediaRoot });

  await mkdir(input.projectRoot, { recursive: true });
  await writeFile(configPath, formatSiteProjectConfig(config));
  await writeFile(recordsPath, formatSiteProjectRecords(records));
  await copyStarterMediaFiles(input.projectRoot, input.packageRoot, mediaAssets);

  return {
    configPath,
    mediaCount: mediaAssets.length,
    projectRoot: input.projectRoot,
    recordCount: records.length,
    recordsPath,
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

export async function fetchSiteProjectMediaFiles(
  source: string,
  records: StoredRecord[],
  config: SiteProjectConfig,
  fetcher: typeof fetch,
): Promise<SiteProjectMediaFile[]> {
  const mediaAssets = siteProjectMediaAssetsFromRecords(records, { mediaRoot: config.mediaRoot });

  return Promise.all(
    mediaAssets.map(async (asset) => {
      const response = await fetcher(new URL(asset.href, `${source}/`).toString(), {
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

export async function readSiteProjectMediaFiles(
  project: SiteProjectSource,
): Promise<SiteProjectMediaFile[]> {
  const mediaAssets = siteProjectMediaAssetsFromRecords(project.records, {
    mediaRoot: project.config.mediaRoot,
  });
  const files: SiteProjectMediaFile[] = [];

  for (const asset of mediaAssets) {
    const mediaPath = path.join(project.projectRoot, asset.sourcePath);

    files.push({
      ...asset,
      bytes: copyBytes(await readFile(mediaPath)),
    });
  }

  return files;
}

export async function writeSiteProjectSourceFiles(
  project: SiteProjectSource,
  recordsContents: string,
  mediaFiles: SiteProjectMediaFile[],
) {
  await writeFile(path.join(project.projectRoot, project.config.recordsPath), recordsContents);
  await writeProjectMediaFiles(project.projectRoot, mediaFiles);
}

export async function staleSiteProjectSourcePaths(
  project: SiteProjectSource,
  nextRecords: string,
  mediaFiles: SiteProjectMediaFile[],
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

async function writeProjectMediaFiles(projectRoot: string, mediaFiles: SiteProjectMediaFile[]) {
  for (const mediaFile of mediaFiles) {
    const targetPath = path.join(projectRoot, mediaFile.sourcePath);

    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, mediaFile.bytes);
  }
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

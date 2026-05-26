import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import type { StoredRecord } from "../shared/protocol.ts";
import {
  defaultSiteProjectConfig,
  formatSiteProjectConfig,
  SITE_PROJECT_CONFIG_FILE,
  SITE_PROJECT_RECORDS_FILE,
} from "./project-config.ts";
import { formatSiteProjectRecords } from "./project-source.ts";
import {
  initSiteProjectSource,
  readSiteProjectSource,
  resolveSiteProjectRoot,
  staleSiteProjectSourcePaths,
  writeSiteProjectSourceFiles,
  type SiteProjectMediaFile,
} from "./project-files.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("Site project files", () => {
  it("initializes and reads Site project source files", async () => {
    const tempDir = await makeTempDir();
    const projectRoot = path.join(tempDir, "site");
    const result = await initSiteProjectSource({ packageRoot: process.cwd(), projectRoot });
    const project = await readSiteProjectSource(projectRoot);

    expect(resolveSiteProjectRoot(tempDir, { projectPath: "site" })).toBe(projectRoot);
    expect(project.config).toEqual(defaultSiteProjectConfig());
    expect(project.records.length).toBeGreaterThan(0);
    expect(result).toMatchObject({
      mediaCount: 0,
      projectRoot,
      recordCount: project.records.length,
      recordsPath: path.join(projectRoot, SITE_PROJECT_RECORDS_FILE),
    });
    await expect(stat(path.join(projectRoot, project.config.mediaRoot))).rejects.toMatchObject({
      code: "ENOENT",
    });

    await expect(
      initSiteProjectSource({ packageRoot: process.cwd(), projectRoot }),
    ).rejects.toThrow("target already contains");
  });

  it("writes project record and media files through one source file seam", async () => {
    const tempDir = await makeTempDir();
    const projectRoot = path.join(tempDir, "site");
    const records = mediaRecords();
    const project = {
      config: defaultSiteProjectConfig(),
      projectRoot,
      records,
    };
    const mediaFile: SiteProjectMediaFile = {
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
      href: "/api/formless/media/media/images/cover.png",
      key: "media/images/cover.png",
      sourcePath: "media/media/images/cover.png",
    };
    const nextRecords = formatSiteProjectRecords(records);

    await mkdir(projectRoot, { recursive: true });
    await writeFile(
      path.join(projectRoot, SITE_PROJECT_CONFIG_FILE),
      formatSiteProjectConfig(project.config),
    );
    await writeFile(path.join(projectRoot, SITE_PROJECT_RECORDS_FILE), "[]\n");

    await writeSiteProjectSourceFiles(project, nextRecords, [mediaFile]);

    await expect(readFile(path.join(projectRoot, SITE_PROJECT_RECORDS_FILE), "utf8")).resolves.toBe(
      nextRecords,
    );
    await expect(readFile(path.join(projectRoot, mediaFile.sourcePath))).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    );
    await expect(staleSiteProjectSourcePaths(project, nextRecords, [mediaFile])).resolves.toEqual(
      [],
    );

    await writeFile(path.join(projectRoot, mediaFile.sourcePath), Buffer.from([9]));

    await expect(staleSiteProjectSourcePaths(project, nextRecords, [mediaFile])).resolves.toEqual([
      "media/media/images/cover.png",
    ]);
  });
});

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.resolve(".site-project-files-test-"));

  tempDirs.push(tempDir);
  return tempDir;
}

function mediaRecords(): StoredRecord[] {
  return [
    block("block-home", "2026-05-05T00:00:01.000Z", {
      type: "page",
      label: "Home",
      href: "/",
    }),
    block("block-cover", "2026-05-05T00:00:02.000Z", {
      type: "image",
      label: "Cover",
      mediaAssetId: "cover.png",
    }),
  ];
}

function block(id: string, createdAt: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    createdAt,
    entity: "block",
    values,
  };
}

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  STORE_SNAPSHOT_KIND,
  STORE_SNAPSHOT_VERSION,
  type StoreSnapshot,
  type StoredRecord,
} from "../shared/protocol.ts";
import { siteSourceSchema } from "../test/schema-apps.ts";
import {
  defaultSiteProjectConfig,
  formatSiteProjectConfig,
  parseSiteProjectConfigJson,
} from "./project-config.ts";
import {
  formatSiteProjectRecords,
  parseSiteProjectRecordsJson,
  siteProjectMediaAssetsFromRecords,
} from "./project-source.ts";
import {
  initSiteProject,
  normalizeSourceUrl,
  parseFormlessCliArgs,
  saveSiteProject,
} from "./cli.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("Formless Site CLI", () => {
  it("parses init, dev, and save commands", () => {
    expect(parseFormlessCliArgs(["init", "my-site"])).toEqual({
      kind: "init",
      targetDir: "my-site",
    });
    expect(parseFormlessCliArgs(["dev", "--project", "../site"])).toEqual({
      kind: "dev",
      projectPath: "../site",
    });
    expect(
      parseFormlessCliArgs([
        "save",
        "--project",
        "../site",
        "--check",
        "--source",
        "https://example.com/?draft=1#top",
      ]),
    ).toEqual({
      check: true,
      kind: "save",
      projectPath: "../site",
      source: "https://example.com",
    });
    expect(parseFormlessCliArgs([])).toEqual({ kind: "help" });
    expect(() => parseFormlessCliArgs(["save", "--source"])).toThrow("Missing value for --source.");
  });

  it("initializes a Site project with config, deterministic records, and starter media", async () => {
    const tempDir = await makeTempDir();
    const result = await initSiteProject(
      { targetDir: "my-site" },
      { cwd: tempDir, packageRoot: process.cwd() },
    );
    const config = parseSiteProjectConfigJson(await readFile(result.configPath, "utf8"));
    const records = parseSiteProjectRecordsJson(await readFile(result.recordsPath, "utf8"));
    const mediaAssets = siteProjectMediaAssetsFromRecords(records, { mediaRoot: config.mediaRoot });

    expect(config).toEqual(defaultSiteProjectConfig());
    expect(records.length).toBeGreaterThan(0);
    expect(result.recordCount).toBe(records.length);
    expect(result.mediaCount).toBe(mediaAssets.length);

    for (const asset of mediaAssets) {
      await expect(
        readFile(path.join(result.projectRoot, asset.sourcePath)),
      ).resolves.toBeInstanceOf(Buffer);
    }

    await expect(
      initSiteProject({ targetDir: "my-site" }, { cwd: tempDir, packageRoot: process.cwd() }),
    ).rejects.toThrow("target already contains");
  });

  it("saves local authority snapshots into project records and media", async () => {
    const tempDir = await makeTempDir();
    const projectRoot = path.join(tempDir, "site");
    const sourceRecords = mediaRecords();
    const nextSnapshot = snapshot(sourceRecords);
    const fetcher = fakeSaveFetch(nextSnapshot, new Uint8Array([1, 2, 3]));

    await writeFileTree(projectRoot, sourceRecords.slice(0, 1));

    const result = await saveSiteProject(
      { projectPath: projectRoot, source: "https://local.test" },
      { cwd: tempDir, fetch: fetcher },
    );

    expect(result).toMatchObject({
      mediaCount: 1,
      mode: "write",
      recordCount: sourceRecords.length,
      source: "https://local.test",
    });
    await expect(readFile(path.join(projectRoot, "site.records.json"), "utf8")).resolves.toBe(
      formatSiteProjectRecords(sourceRecords),
    );
    await expect(readFile(path.join(projectRoot, "media/site/images/cover.png"))).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    );

    await expect(
      saveSiteProject(
        { check: true, projectPath: projectRoot, source: "https://local.test" },
        { cwd: tempDir, fetch: fetcher },
      ),
    ).resolves.toMatchObject({ mode: "check" });

    await writeFile(path.join(projectRoot, "media/site/images/cover.png"), Buffer.from([9]));
    await expect(
      saveSiteProject(
        { check: true, projectPath: projectRoot, source: "https://local.test" },
        { cwd: tempDir, fetch: fetcher },
      ),
    ).rejects.toThrow("Site project source is stale: media/site/images/cover.png.");
  });

  it("normalizes local source URLs", () => {
    expect(normalizeSourceUrl("http://localhost:5173/pages/home?x=1#top")).toBe(
      "http://localhost:5173/pages/home",
    );
    expect(() => normalizeSourceUrl("not a url")).toThrow("Source URL is invalid: not a url");
  });
});

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.resolve(".site-cli-test-"));

  tempDirs.push(tempDir);
  return tempDir;
}

async function writeFileTree(projectRoot: string, records: StoredRecord[]) {
  await mkdir(projectRoot, { recursive: true });
  await writeFile(
    path.join(projectRoot, "formless.config.json"),
    formatSiteProjectConfig(defaultSiteProjectConfig()),
  );
  await writeFile(path.join(projectRoot, "site.records.json"), formatSiteProjectRecords(records));
}

function fakeSaveFetch(snapshotValue: StoreSnapshot, mediaBytes: Uint8Array): typeof fetch {
  return async (url) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

    if (requestUrl === "https://local.test/api/site/snapshot") {
      return Response.json(snapshotValue);
    }

    if (requestUrl === "https://local.test/api/site/media/site/images/cover.png") {
      return new Response(Buffer.from(mediaBytes), {
        headers: {
          "content-type": "image/png",
        },
      });
    }

    return Response.json({ error: "not found" }, { status: 404 });
  };
}

function snapshot(records: StoredRecord[]): StoreSnapshot {
  return {
    kind: STORE_SNAPSHOT_KIND,
    version: STORE_SNAPSHOT_VERSION,
    schemaKey: "site",
    exportedAt: "2026-05-12T00:00:00.000Z",
    schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
    sourceCursor: 1,
    schema: siteSourceSchema,
    records,
  };
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
      href: "/api/site/media/site/images/cover.png",
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

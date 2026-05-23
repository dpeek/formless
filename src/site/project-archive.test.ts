import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { formatAppArchive, parseAppArchive } from "../shared/archive.ts";
import { planAppArchiveRestore } from "../shared/archive-restore-plan.ts";
import type { StoredRecord } from "../shared/protocol.ts";
import { siteSourceSchema } from "../test/schema-apps.ts";
import { defaultSiteProjectConfig, formatSiteProjectConfig } from "./project-config.ts";
import { formatSiteProjectRecords } from "./project-source.ts";
import {
  buildSiteProjectAppArchiveEntry,
  readSiteProjectAppArchiveEntry,
} from "./project-archive.ts";
import type { SiteProjectMediaFile } from "./project-files.ts";

const tempDirs: string[] = [];
const now = "2026-05-23T00:00:00.000Z";

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("Site project app archive import", () => {
  it("builds an installed Site app archive from source records and media files", () => {
    const coverBytes = new Uint8Array([1, 2, 3]);
    const avatarBytes = new Uint8Array([4, 5]);
    const entry = buildSiteProjectAppArchiveEntry({
      exportedAt: now,
      installId: "personal",
      mediaFiles: [
        mediaFile("site/images/cover.png", coverBytes),
        mediaFile("site/images/avatar.webp", avatarBytes),
      ],
      records: [
        siteRecord("Personal Site"),
        imageRecord("image-cover", {
          href: "/api/site/media/site/images/cover.png",
          mediaAssetId: "cover.png",
        }),
        imageRecord("image-avatar", {
          mediaAssetId: "avatar.webp",
        }),
        imageRecord("image-remote", {
          href: "https://example.com/remote.png",
        }),
      ],
    });
    const reparsed = parseAppArchive(JSON.parse(formatAppArchive(entry.archive)));

    expect(reparsed.app).toMatchObject({
      installId: "personal",
      label: "Personal Site",
      packageAppKey: "site",
      sourceSchemaKey: "site",
    });
    expect(reparsed.data.kind).toBe("sourceRecords");

    if (reparsed.data.kind !== "sourceRecords") {
      throw new Error("Expected source-record app archive.");
    }

    expect(reparsed.data.records.find((record) => record.id === "image-cover")?.values.href).toBe(
      "/api/app-installs/site/personal/media/app-installs/personal/site/images/cover.png",
    );
    expect(reparsed.data.records.find((record) => record.id === "image-remote")?.values.href).toBe(
      "https://example.com/remote.png",
    );
    expect(reparsed.media.objects).toEqual([
      {
        archivePath: "media/personal/site/images/avatar.webp",
        byteSize: avatarBytes.byteLength,
        contentType: "image/webp",
        deliveryHref:
          "/api/app-installs/site/personal/media/app-installs/personal/site/images/avatar.webp",
        storageKey: "app-installs/personal/site/images/avatar.webp",
      },
      {
        archivePath: "media/personal/site/images/cover.png",
        byteSize: coverBytes.byteLength,
        contentType: "image/png",
        deliveryHref:
          "/api/app-installs/site/personal/media/app-installs/personal/site/images/cover.png",
        storageKey: "app-installs/personal/site/images/cover.png",
      },
    ]);
    expect(entry.mediaFiles.map((file) => file.archivePath)).toEqual([
      "media/personal/site/images/avatar.webp",
      "media/personal/site/images/cover.png",
    ]);
    expect(entry.report).toMatchObject({
      installId: "personal",
      label: "Personal Site",
      mediaCount: 2,
      recordCount: 4,
      recordCountsByEntity: {
        block: 3,
        site: 1,
      },
    });
    expect(entry.report.rewrittenMediaHrefs).toEqual([
      {
        nextHref:
          "/api/app-installs/site/personal/media/app-installs/personal/site/images/cover.png",
        previousHref: "/api/site/media/site/images/cover.png",
        recordId: "image-cover",
        storageKey: "app-installs/personal/site/images/cover.png",
      },
    ]);
    expect(
      planAppArchiveRestore(reparsed, {
        mediaFiles: entry.mediaFiles,
        sourceSchemas: { site: siteSourceSchema },
      }),
    ).toMatchObject({
      ok: true,
      plan: {
        summary: {
          createdInstalls: ["personal"],
          mediaCountsByApp: {
            personal: 2,
          },
        },
      },
    });
  });

  it("reads a standalone Site project from disk into an app archive entry", async () => {
    const tempDir = await makeTempDir();
    const projectRoot = path.join(tempDir, "project");
    const records = [
      siteRecord("Project Site"),
      imageRecord("image-cover", {
        href: "/api/site/media/site/images/cover.png",
        mediaAssetId: "cover.png",
      }),
    ];

    await mkdir(path.join(projectRoot, "media/site/images"), { recursive: true });
    await writeFile(
      path.join(projectRoot, "formless.config.json"),
      formatSiteProjectConfig(defaultSiteProjectConfig()),
    );
    await writeFile(path.join(projectRoot, "site.records.json"), formatSiteProjectRecords(records));
    await writeFile(
      path.join(projectRoot, "media/site/images/cover.png"),
      new Uint8Array([1, 2, 3]),
    );

    const entry = await readSiteProjectAppArchiveEntry({
      exportedAt: now,
      installId: "docs",
      projectRoot,
    });

    expect(entry.archive.app).toMatchObject({
      installId: "docs",
      label: "Project Site",
    });
    expect(entry.mediaFiles).toHaveLength(1);
    expect(await readFile(path.join(projectRoot, "media/site/images/cover.png"))).toEqual(
      Buffer.from([1, 2, 3]),
    );
  });

  it("fails when a referenced project media file is not supplied", () => {
    expect(() =>
      buildSiteProjectAppArchiveEntry({
        exportedAt: now,
        installId: "personal",
        mediaFiles: [],
        records: [
          siteRecord("Personal Site"),
          imageRecord("image-cover", {
            href: "/api/site/media/site/images/cover.png",
            mediaAssetId: "cover.png",
          }),
        ],
      }),
    ).toThrow(
      'Site project import is missing media file "media/site/images/cover.png" for "/api/site/media/site/images/cover.png".',
    );
  });
});

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(process.cwd(), ".tmp-site-archive-"));

  tempDirs.push(tempDir);
  return tempDir;
}

function siteRecord(label: string): StoredRecord {
  return {
    id: "site-primary",
    entity: "site",
    values: {
      key: "primary",
      label,
    },
    createdAt: "2026-05-22T00:00:00.000Z",
  };
}

function imageRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity: "block",
    values: {
      label: id,
      type: "image",
      ...values,
    },
    createdAt: `2026-05-22T00:00:0${id.endsWith("cover") ? "1" : "2"}.000Z`,
  };
}

function mediaFile(key: string, bytes: Uint8Array<ArrayBuffer>): SiteProjectMediaFile {
  const contentType = key.endsWith(".webp") ? "image/webp" : "image/png";

  return {
    bytes,
    contentType,
    href: `/api/site/media/${key}`,
    key,
    sourcePath: `media/${key}`,
  };
}

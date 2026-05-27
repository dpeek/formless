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
        mediaFile("media/images/cover.png", coverBytes),
        mediaFile("media/images/avatar.webp", avatarBytes),
      ],
      records: [
        siteRecord("Personal Site"),
        imageRecord("image-cover", {
          href: "/api/formless/media/media/images/cover.png",
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
      "/api/formless/media/media/images/cover.png",
    );
    expect(reparsed.data.records.find((record) => record.id === "image-remote")?.values.href).toBe(
      "https://example.com/remote.png",
    );
    expect(reparsed.media.objects).toEqual([
      {
        archivePath: "media/personal/media/images/avatar.webp",
        asset: {
          byteSize: avatarBytes.byteLength,
          contentType: "image/webp",
          deliveryHref: "/api/formless/media/media/images/avatar.webp",
          id: "avatar.webp",
          kind: "image",
          label: "avatar.webp",
          provider: "r2",
          status: "ready",
          storageKey: "media/images/avatar.webp",
        },
        byteSize: avatarBytes.byteLength,
        contentType: "image/webp",
        deliveryHref: "/api/formless/media/media/images/avatar.webp",
        storageKey: "media/images/avatar.webp",
      },
      {
        archivePath: "media/personal/media/images/cover.png",
        asset: {
          byteSize: coverBytes.byteLength,
          contentType: "image/png",
          deliveryHref: "/api/formless/media/media/images/cover.png",
          id: "cover.png",
          kind: "image",
          label: "cover.png",
          provider: "r2",
          status: "ready",
          storageKey: "media/images/cover.png",
        },
        byteSize: coverBytes.byteLength,
        contentType: "image/png",
        deliveryHref: "/api/formless/media/media/images/cover.png",
        storageKey: "media/images/cover.png",
      },
    ]);
    expect(entry.mediaFiles.map((file) => file.archivePath)).toEqual([
      "media/personal/media/images/avatar.webp",
      "media/personal/media/images/cover.png",
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
        mediaAssetId: "cover.png",
      }),
    ];

    await mkdir(path.join(projectRoot, "media/media/images"), { recursive: true });
    await writeFile(
      path.join(projectRoot, "formless.config.json"),
      formatSiteProjectConfig(defaultSiteProjectConfig()),
    );
    await writeFile(path.join(projectRoot, "site.records.json"), formatSiteProjectRecords(records));
    await writeFile(
      path.join(projectRoot, "media/media/images/cover.png"),
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
    expect(await readFile(path.join(projectRoot, "media/media/images/cover.png"))).toEqual(
      Buffer.from([1, 2, 3]),
    );
  });

  it("fails when a referenced core project media file is not supplied", () => {
    expect(() =>
      buildSiteProjectAppArchiveEntry({
        exportedAt: now,
        installId: "personal",
        mediaFiles: [],
        records: [
          siteRecord("Personal Site"),
          imageRecord("image-cover", {
            mediaAssetId: "cover.png",
          }),
        ],
      }),
    ).toThrow(
      'Site project import is missing media file "media/media/images/cover.png" for "/api/formless/media/media/images/cover.png".',
    );
  });

  it("rejects unsupported legacy Site media hrefs", () => {
    expect(() =>
      buildSiteProjectAppArchiveEntry({
        exportedAt: now,
        installId: "personal",
        mediaFiles: [],
        records: [
          siteRecord("Personal Site"),
          imageRecord("image-cover", {
            href: "/api/site/media/site/images/cover.png",
          }),
        ],
      }),
    ).toThrow(
      'Unsupported legacy Site media href "/api/site/media/site/images/cover.png". Use core media before Site project media collection.',
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
    href: `/api/formless/media/${key}`,
    key,
    sourcePath: `media/${key}`,
  };
}

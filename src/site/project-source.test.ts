import { describe, expect, it } from "vite-plus/test";

import {
  STORE_SNAPSHOT_KIND,
  STORE_SNAPSHOT_VERSION,
  type StoreSnapshot,
  type StoredRecord,
} from "../shared/protocol.ts";
import { siteSeedRecords, siteSourceSchema } from "../test/schema-apps.ts";
import {
  buildSiteProjectRecordsFromSnapshot,
  buildSiteProjectSourceSnapshot,
  formatSiteProjectRecords,
  packageSiteSourceSchema,
  parseSiteProjectRecords,
  parseSiteProjectRecordsJson,
  siteProjectMediaAssetsFromRecords,
  siteProjectMediaPathForKey,
} from "./project-source.ts";

describe("Site project source", () => {
  it("parses and formats deterministic Site project records", () => {
    const records = parseSiteProjectRecords([
      placementRecord("placement-home", "2026-05-05T00:00:00.500Z", {
        label: "Home slot",
        order: 10,
        block: "block-home",
        parent: "block-header",
      }),
      blockRecord("block-home", "2026-05-05T00:00:02.000Z", {
        href: "/",
        label: "Home",
        type: "page",
      }),
      blockRecord("block-header", "2026-05-05T00:00:01.000Z", {
        label: "Header",
        type: "header",
      }),
    ]);

    expect(records.map((record) => record.id)).toEqual([
      "block-header",
      "block-home",
      "placement-home",
    ]);
    expect(Object.keys(records[1]?.values ?? {})).toEqual(["type", "label", "href"]);
    expect(Object.keys(records[2]?.values ?? {})).toEqual(["parent", "block", "order", "label"]);
    expect(formatSiteProjectRecords(records)).toBe(`${JSON.stringify(records, null, 2)}\n`);
    expect(parseSiteProjectRecordsJson(formatSiteProjectRecords(records))).toEqual(records);
  });

  it("validates records against the package-owned Site schema by default", () => {
    expect(packageSiteSourceSchema).toEqual(siteSourceSchema);

    expect(() =>
      parseSiteProjectRecords([
        blockRecord("block-home", "2026-05-05T00:00:01.000Z", {
          label: "Home",
          type: "not-a-site-type",
        }),
      ]),
    ).toThrow('Site seed record "block-home" has invalid field "block.type".');
  });

  it("rejects tombstones, unknown fields, and broken references", () => {
    expect(() =>
      parseSiteProjectRecords([
        {
          ...blockRecord("block-old", "2026-05-05T00:00:01.000Z"),
          deletedAt: "2026-05-05T00:00:02.000Z",
        },
      ]),
    ).toThrow("Site project record 0 must not include deletedAt.");

    expect(() =>
      parseSiteProjectRecords([
        blockRecord("block-home", "2026-05-05T00:00:01.000Z", {
          label: "Home",
          type: "page",
          readModelOutput: "not-source",
        }),
      ]),
    ).toThrow('Site seed record "block-home" includes unknown field "block.readModelOutput".');

    expect(() =>
      parseSiteProjectRecords([
        blockRecord("block-home", "2026-05-05T00:00:01.000Z"),
        placementRecord("placement-home", "2026-05-05T00:00:02.000Z", {
          parent: "block-home",
          block: "block-missing",
          order: 1,
        }),
      ]),
    ).toThrow(
      'Site seed record "placement-home" field "blockPlacement.block" references missing block record "block-missing".',
    );
  });

  it("builds project records and source snapshots for restore", () => {
    const records = [
      blockRecord("block-home", "2026-05-05T00:00:01.000Z"),
      {
        ...blockRecord("block-deleted", "2026-05-05T00:00:02.000Z"),
        deletedAt: "2026-05-05T00:00:03.000Z",
      },
    ];

    expect(buildSiteProjectRecordsFromSnapshot(snapshot(records))).toEqual([
      blockRecord("block-home", "2026-05-05T00:00:01.000Z"),
    ]);
    expect(
      buildSiteProjectSourceSnapshot([blockRecord("block-home", "2026-05-05T00:00:01.000Z")], {
        exportedAt: "2026-05-12T01:00:00.000Z",
      }),
    ).toMatchObject({
      kind: STORE_SNAPSHOT_KIND,
      version: STORE_SNAPSHOT_VERSION,
      schemaKey: "site",
      exportedAt: "2026-05-12T01:00:00.000Z",
      sourceCursor: 0,
      records: [blockRecord("block-home", "2026-05-05T00:00:01.000Z")],
    });
  });

  it("maps project media from same-origin Site hrefs and media asset ids", () => {
    const records: StoredRecord[] = [
      blockRecord("image-a", "2026-05-05T00:00:01.000Z", {
        href: "/api/site/media/site/images/cover.png",
        label: "Cover",
        type: "image",
      }),
      blockRecord("image-b", "2026-05-05T00:00:02.000Z", {
        href: "https://example.com/remote.png",
        label: "Remote",
        type: "image",
      }),
      blockRecord("image-c", "2026-05-05T00:00:03.000Z", {
        href: "data:image/png;base64,abc",
        label: "Data URL",
        type: "image",
      }),
      blockRecord("image-d", "2026-05-05T00:00:04.000Z", {
        href: "/api/site/media/site/images/cover.png",
        label: "Duplicate",
        type: "image",
      }),
      blockRecord("image-e", "2026-05-05T00:00:05.000Z", {
        label: "Asset only",
        mediaAssetId: "asset-only.webp",
        type: "image",
      }),
      blockRecord("image-f", "2026-05-05T00:00:06.000Z", {
        label: "Invalid asset",
        mediaAssetId: "../bad.webp",
        type: "image",
      }),
    ];

    expect(siteProjectMediaAssetsFromRecords(records)).toEqual([
      {
        contentType: "image/webp",
        href: "/api/formless/media/media/images/asset-only.webp",
        key: "media/images/asset-only.webp",
        sourcePath: "media/media/images/asset-only.webp",
      },
      {
        contentType: "image/png",
        href: "/api/site/media/site/images/cover.png",
        key: "site/images/cover.png",
        sourcePath: "media/site/images/cover.png",
      },
    ]);
    expect(
      siteProjectMediaPathForKey("site/images/photo.webp", { mediaRoot: "source-media" }),
    ).toBe("source-media/site/images/photo.webp");
    expect(
      siteProjectMediaPathForKey("media/images/photo.webp", { mediaRoot: "source-media" }),
    ).toBe("source-media/media/images/photo.webp");
  });

  it("finds no project media assets in the package starter records", () => {
    expect(siteProjectMediaAssetsFromRecords(siteSeedRecords)).toEqual([]);
  });

  it("rejects unsupported project media paths", () => {
    expect(() =>
      siteProjectMediaAssetsFromRecords([
        blockRecord("video", "2026-05-05T00:00:01.000Z", {
          href: "/api/site/media/site/videos/clip.mp4",
          label: "Video",
          type: "image",
        }),
      ]),
    ).toThrow(
      'Site project media href "/api/site/media/site/videos/clip.mp4" uses unsupported media key "site/videos/clip.mp4".',
    );

    expect(() =>
      siteProjectMediaPathForKey("site/images/cover.png", { mediaRoot: "../media" }),
    ).toThrow("Site project media root must be a safe project-relative path.");
  });
});

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

function blockRecord(
  id: string,
  createdAt: string,
  values: StoredRecord["values"] = { type: "page", label: "Page" },
): StoredRecord {
  return {
    id,
    entity: "block",
    values,
    createdAt,
  };
}

function placementRecord(
  id: string,
  createdAt: string,
  values: StoredRecord["values"],
): StoredRecord {
  return {
    id,
    entity: "blockPlacement",
    values,
    createdAt,
  };
}

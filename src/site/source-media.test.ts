import { describe, expect, it } from "vite-plus/test";

import type { StoredRecord } from "../shared/protocol.ts";
import {
  siteImageExtensionForContentType,
  siteMediaContentTypeForKey,
  siteSourceMediaAssetsFromRecords,
  siteSourceMediaPathForKey,
} from "./source-media.ts";

describe("Site source media", () => {
  it("maps core media hrefs and asset ids to deterministic source asset paths", () => {
    const records: StoredRecord[] = [
      blockRecord("image-a", "/api/formless/media/media/images/cover.png"),
      blockRecord("image-b", "data:image/svg+xml,%3Csvg%20/%3E"),
      blockRecord("image-c", "https://example.com/image.png"),
      blockRecord("image-d", "/api/formless/media/media/images/cover.png"),
      {
        ...blockRecord("image-e", "/api/formless/media/media/images/deleted.webp"),
        deletedAt: "2026-05-14T00:00:00.000Z",
      },
      blockRecord("image-f", undefined, {
        mediaAssetId: "asset-only.webp",
      }),
      blockRecord("image-g", undefined, {
        mediaAssetId: "../bad.webp",
      }),
    ];

    expect(siteSourceMediaAssetsFromRecords(records)).toEqual([
      {
        contentType: "image/webp",
        href: "/api/formless/media/media/images/asset-only.webp",
        key: "media/images/asset-only.webp",
        sourcePath: "schema/apps/site/media/media/images/asset-only.webp",
      },
      {
        contentType: "image/png",
        href: "/api/formless/media/media/images/cover.png",
        key: "media/images/cover.png",
        sourcePath: "schema/apps/site/media/media/images/cover.png",
      },
    ]);
  });

  it("rejects legacy Site media hrefs with a migration error", () => {
    expect(() =>
      siteSourceMediaAssetsFromRecords([
        blockRecord("legacy", "/api/site/media/site/images/cover.png"),
      ]),
    ).toThrow(
      'Legacy Site media href "/api/site/media/site/images/cover.png" must be migrated to core media before source Site media collection.',
    );

    expect(() =>
      siteSourceMediaAssetsFromRecords([
        blockRecord(
          "installed-legacy",
          "/api/app-installs/site/personal/media/app-installs/personal/site/images/cover.png",
        ),
      ]),
    ).toThrow(
      'Legacy Site media href "/api/app-installs/site/personal/media/app-installs/personal/site/images/cover.png" must be migrated to core media before source Site media collection.',
    );
  });

  it("rejects unsupported or unsafe core source media keys", () => {
    expect(() =>
      siteSourceMediaAssetsFromRecords([
        blockRecord("video", "/api/formless/media/media/videos/clip.mp4"),
      ]),
    ).toThrow(
      'Core media href "/api/formless/media/media/videos/clip.mp4" uses unsupported source media key "media/videos/clip.mp4".',
    );

    expect(() => siteSourceMediaPathForKey("site/images/cover.png")).toThrow(
      "Site source media key is not core image media: site/images/cover.png",
    );
  });

  it("shares image content-type and href conventions", () => {
    expect(siteImageExtensionForContentType("image/jpeg; charset=binary")).toBe("jpg");
    expect(siteMediaContentTypeForKey("media/images/photo.jpeg")).toBe("image/jpeg");
    expect(siteSourceMediaPathForKey("media/images/photo.webp")).toBe(
      "schema/apps/site/media/media/images/photo.webp",
    );
  });
});

function blockRecord(
  id: string,
  href: string | undefined,
  extraValues: StoredRecord["values"] = {},
): StoredRecord {
  return {
    id,
    entity: "block",
    values: {
      label: "Image",
      type: "image",
      ...(href === undefined ? {} : { href }),
      ...extraValues,
    },
    createdAt: "2026-05-14T00:00:00.000Z",
  };
}

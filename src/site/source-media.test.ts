import { describe, expect, it } from "vite-plus/test";

import type { StoredRecord } from "../shared/protocol.ts";
import {
  siteImageExtensionForContentType,
  siteMediaContentTypeForKey,
  siteMediaDeliveryFactsForAssetId,
  siteMediaHrefForKey,
  siteSourceMediaAssetsFromRecords,
  siteSourceMediaPathForKey,
} from "./source-media.ts";

describe("Site source media", () => {
  it("maps internal media hrefs and asset ids to deterministic source asset paths", () => {
    const records: StoredRecord[] = [
      blockRecord("image-a", "/api/site/media/site/images/cover.png"),
      blockRecord("image-b", "data:image/svg+xml,%3Csvg%20/%3E"),
      blockRecord("image-c", "https://example.com/image.png"),
      blockRecord("image-d", "/api/site/media/site/images/cover.png"),
      {
        ...blockRecord("image-e", "/api/site/media/site/images/deleted.webp"),
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
        href: "/api/site/media/site/images/asset-only.webp",
        key: "site/images/asset-only.webp",
        sourcePath: "schema/apps/site/media/site/images/asset-only.webp",
      },
      {
        contentType: "image/png",
        href: "/api/site/media/site/images/cover.png",
        key: "site/images/cover.png",
        sourcePath: "schema/apps/site/media/site/images/cover.png",
      },
    ]);
  });

  it("rejects unsupported or unsafe source media keys", () => {
    expect(() =>
      siteSourceMediaAssetsFromRecords([
        blockRecord("video", "/api/site/media/site/videos/clip.mp4"),
      ]),
    ).toThrow(
      'Site media href "/api/site/media/site/videos/clip.mp4" uses unsupported source media key "site/videos/clip.mp4".',
    );

    expect(() => siteSourceMediaPathForKey("site/images/../cover.png")).toThrow(
      "Site source media key is not restorable: site/images/../cover.png",
    );
  });

  it("shares image content-type and href conventions", () => {
    expect(siteImageExtensionForContentType("image/jpeg; charset=binary")).toBe("jpg");
    expect(siteMediaContentTypeForKey("site/images/photo.jpeg")).toBe("image/jpeg");
    expect(siteMediaHrefForKey("site/images/photo.webp")).toBe(
      "/api/site/media/site/images/photo.webp",
    );
    expect(siteMediaDeliveryFactsForAssetId("photo.webp")).toEqual({
      assetId: "photo.webp",
      href: "/api/site/media/site/images/photo.webp",
      kind: "image",
    });
    expect(siteMediaDeliveryFactsForAssetId("site/images/photo.webp")).toBeUndefined();
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

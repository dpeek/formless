import { describe, expect, it } from "vite-plus/test";
import {
  CORE_IMAGE_KEY_PREFIX,
  CORE_MEDIA_ROUTE_PREFIX,
  coreImageMediaDeliveryFactsForAssetId,
  coreMediaHrefForKey,
  coreMediaKeyFromAssetId,
  coreMediaKeyFromHref,
  imageMediaContentTypeForKey,
  imageMediaDeliveryFactsForAssetId,
  imageMediaExtensionForContentType,
  isRestorableImageMediaKey,
  isValidImageMediaAssetId,
  isValidMediaStorageKey,
  mediaAssetFromObjectMetadata,
  mediaObjectMetadataForAsset,
  normalizeMediaContentType,
} from "./index.ts";
import type { MediaAsset } from "./types.ts";

describe("Media runtime-neutral contract helpers", () => {
  it("normalizes image content types and file extensions", () => {
    expect(normalizeMediaContentType(" IMAGE/PNG ; charset=binary ")).toBe("image/png");
    expect(imageMediaExtensionForContentType("image/jpeg; charset=binary")).toBe("jpg");
    expect(imageMediaExtensionForContentType("image/svg+xml")).toBeUndefined();
    expect(imageMediaContentTypeForKey("media/images/photo.JPEG")).toBe("image/jpeg");
    expect(imageMediaContentTypeForKey("media/images/photo.svg")).toBeUndefined();
  });

  it("validates media storage keys and image asset ids", () => {
    expect(isValidMediaStorageKey("media/images/hero_1-2.webp")).toBe(true);
    expect(isValidMediaStorageKey("")).toBe(false);
    expect(isValidMediaStorageKey("/media/images/hero.webp")).toBe(false);
    expect(isValidMediaStorageKey("media//hero.webp")).toBe(false);
    expect(isValidMediaStorageKey("media/../hero.webp")).toBe(false);
    expect(isValidMediaStorageKey("media/images/%2e%2e.webp")).toBe(false);
    expect(isValidMediaStorageKey("media\\images\\hero.webp")).toBe(false);

    expect(isValidImageMediaAssetId("hero.webp")).toBe(true);
    expect(isValidImageMediaAssetId("media/images/hero.webp")).toBe(false);
    expect(isValidImageMediaAssetId("../hero.webp")).toBe(false);
  });

  it("validates restorable image keys inside the configured prefix", () => {
    expect(
      isRestorableImageMediaKey("media/images/hero.webp", {
        keyPrefix: `${CORE_IMAGE_KEY_PREFIX}/`,
      }),
    ).toBe(true);
    expect(
      isRestorableImageMediaKey("media/videos/hero.webp", {
        keyPrefix: `${CORE_IMAGE_KEY_PREFIX}/`,
      }),
    ).toBe(false);
    expect(
      isRestorableImageMediaKey("media/images/hero.svg", {
        keyPrefix: `${CORE_IMAGE_KEY_PREFIX}/`,
      }),
    ).toBe(false);
    expect(
      isRestorableImageMediaKey("media/images/../hero.webp", {
        keyPrefix: `${CORE_IMAGE_KEY_PREFIX}/`,
      }),
    ).toBe(false);
  });

  it("round-trips media asset metadata and rejects incomplete metadata", () => {
    const asset = mediaAsset();
    const metadata = mediaObjectMetadataForAsset(asset);

    expect(metadata).toEqual({
      "formless-media-asset-id": "hero.webp",
      "formless-media-byte-size": "123",
      "formless-media-content-type": "image/webp",
      "formless-media-delivery-href": "/api/formless/media/media/images/hero.webp",
      "formless-media-filename": "hero.webp",
      "formless-media-height": "630",
      "formless-media-kind": "image",
      "formless-media-label": "Hero",
      "formless-media-provider": "r2",
      "formless-media-status": "ready",
      "formless-media-storage-key": "media/images/hero.webp",
      "formless-media-width": "1200",
    });
    expect(mediaAssetFromObjectMetadata(metadata)).toEqual(asset);
    expect(
      mediaAssetFromObjectMetadata({
        ...metadata,
        "formless-media-byte-size": "-1",
      }),
    ).toBeUndefined();
    expect(
      mediaAssetFromObjectMetadata({
        ...metadata,
        "formless-media-kind": "video",
      }),
    ).toBeUndefined();
    expect(mediaAssetFromObjectMetadata(undefined)).toBeUndefined();
  });

  it("derives core media delivery hrefs and storage keys from asset ids", () => {
    expect(coreMediaHrefForKey("media/images/hero.webp")).toBe(
      `${CORE_MEDIA_ROUTE_PREFIX}media/images/hero.webp`,
    );
    expect(coreMediaKeyFromHref("/api/formless/media/media/images/hero.webp?cache=1")).toBe(
      "media/images/hero.webp",
    );
    expect(coreMediaKeyFromHref("/api/site/media/media/images/hero.webp")).toBeUndefined();
    expect(coreMediaKeyFromHref("/api/formless/media/media/images/%25bad.webp")).toBeUndefined();
    expect(coreMediaKeyFromAssetId("hero.webp")).toBe("media/images/hero.webp");
    expect(coreMediaKeyFromAssetId("../hero.webp")).toBeUndefined();
    expect(coreImageMediaDeliveryFactsForAssetId("hero.webp")).toEqual({
      assetId: "hero.webp",
      href: "/api/formless/media/media/images/hero.webp",
      kind: "image",
      storageKey: "media/images/hero.webp",
    });
    expect(
      imageMediaDeliveryFactsForAssetId("hero.png", {
        hrefForKey: (key) => `/assets/${key}`,
        keyPrefix: "media/images/",
      }),
    ).toEqual({
      assetId: "hero.png",
      href: "/assets/media/images/hero.png",
      kind: "image",
      storageKey: "media/images/hero.png",
    });
  });
});

function mediaAsset(): MediaAsset {
  return {
    byteSize: 123,
    contentType: "image/webp",
    deliveryHref: "/api/formless/media/media/images/hero.webp",
    filename: "hero.webp",
    height: 630,
    id: "hero.webp",
    kind: "image",
    label: "Hero",
    provider: "r2",
    status: "ready",
    storageKey: "media/images/hero.webp",
    width: 1200,
  };
}

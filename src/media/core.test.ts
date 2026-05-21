import { describe, expect, it } from "vite-plus/test";

import {
  MEDIA_OBJECT_CACHE_CONTROL,
  deliveryFactsForMediaObject,
  imageMediaContentTypeForKey,
  imageMediaDeliveryFactsForAssetId,
  imageMediaExtensionForContentType,
  isRestorableImageMediaKey,
  mediaAssetFromObjectMetadata,
  type MediaObjectStore,
  restoreImageMedia,
  uploadImageMedia,
} from "./core.ts";

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe("core media", () => {
  it("uploads images through a provider store and returns stable delivery facts", async () => {
    const store = memoryMediaObjectStore();
    const result = await uploadImageMedia({
      file: {
        bytes: pngBytes,
        contentType: "image/png; charset=binary",
        filename: "hero.png",
        size: pngBytes.byteLength,
      },
      hrefForKey: (key) => `/api/site/media/${key}`,
      keyPrefix: "site/images/",
      provider: "r2",
      randomId: () => "asset-1",
      store,
    });

    expect(result).toEqual({
      ok: true,
      upload: {
        asset: {
          byteSize: pngBytes.byteLength,
          contentType: "image/png",
          deliveryHref: "/api/site/media/site/images/asset-1.png",
          filename: "hero.png",
          id: "asset-1.png",
          kind: "image",
          label: "hero.png",
          provider: "r2",
          status: "ready",
          storageKey: "site/images/asset-1.png",
        },
        assetId: "asset-1.png",
        contentType: "image/png",
        href: "/api/site/media/site/images/asset-1.png",
        key: "site/images/asset-1.png",
        size: pngBytes.byteLength,
      },
    });
    expect(store.writes).toEqual([
      {
        bytes: pngBytes,
        cacheControl: MEDIA_OBJECT_CACHE_CONTROL,
        contentType: "image/png",
        customMetadata: {
          "formless-media-asset-id": "asset-1.png",
          "formless-media-byte-size": String(pngBytes.byteLength),
          "formless-media-content-type": "image/png",
          "formless-media-delivery-href": "/api/site/media/site/images/asset-1.png",
          "formless-media-filename": "hero.png",
          "formless-media-kind": "image",
          "formless-media-label": "hero.png",
          "formless-media-provider": "r2",
          "formless-media-status": "ready",
          "formless-media-storage-key": "site/images/asset-1.png",
        },
        key: "site/images/asset-1.png",
      },
    ]);
    expect(mediaAssetFromObjectMetadata(store.writes[0]?.customMetadata)).toEqual(
      result.ok ? result.upload.asset : undefined,
    );

    const delivery = await deliveryFactsForMediaObject({
      includeBody: false,
      key: "site/images/asset-1.png",
      store,
    });

    expect(delivery?.body).toBeNull();
    expect(delivery?.headers.get("Content-Type")).toBe("image/png");
    expect(delivery?.headers.get("Cache-Control")).toBe(MEDIA_OBJECT_CACHE_CONTROL);
    expect(delivery?.headers.get("ETag")).toBe('"site/images/asset-1.png"');
  });

  it("restores images to exact keys and rejects unsupported restore inputs", async () => {
    const store = memoryMediaObjectStore();
    const restored = await restoreImageMedia({
      bytes: pngBytes,
      contentType: "image/png",
      hrefForKey: (key) => `/api/site/media/${key}`,
      key: "site/images/restored.png",
      keyPrefix: "site/images/",
      store,
    });
    const mismatched = await restoreImageMedia({
      bytes: pngBytes,
      contentType: "image/jpeg",
      hrefForKey: (key) => `/api/site/media/${key}`,
      key: "site/images/restored.png",
      keyPrefix: "site/images/",
      store,
    });
    const unsupported = await restoreImageMedia({
      bytes: pngBytes,
      contentType: "image/png",
      hrefForKey: (key) => `/api/site/media/${key}`,
      key: "site/videos/clip.png",
      keyPrefix: "site/images/",
      store,
    });

    expect(restored).toEqual({
      ok: true,
      upload: {
        contentType: "image/png",
        href: "/api/site/media/site/images/restored.png",
        key: "site/images/restored.png",
        size: pngBytes.byteLength,
      },
    });
    expect(mismatched).toEqual({
      error: "Media restore content type must match the media key.",
      ok: false,
      status: 415,
    });
    expect(unsupported).toEqual({
      error: "Unsupported media restore key.",
      ok: false,
      status: 400,
    });
  });

  it("owns image content type and restorable storage key conventions", () => {
    expect(imageMediaExtensionForContentType("image/jpeg; charset=binary")).toBe("jpg");
    expect(imageMediaContentTypeForKey("site/images/photo.jpeg")).toBe("image/jpeg");
    expect(isRestorableImageMediaKey("site/images/photo.webp", { keyPrefix: "site/images/" })).toBe(
      true,
    );
    expect(
      isRestorableImageMediaKey("site/images/../photo.webp", { keyPrefix: "site/images/" }),
    ).toBe(false);
  });

  it("resolves render-ready delivery facts from image media asset ids", () => {
    const hrefForKey = (key: string) => `/api/site/media/${key}`;

    expect(
      imageMediaDeliveryFactsForAssetId("asset-1.webp", {
        hrefForKey,
        keyPrefix: "site/images/",
      }),
    ).toEqual({
      assetId: "asset-1.webp",
      href: "/api/site/media/site/images/asset-1.webp",
      kind: "image",
      storageKey: "site/images/asset-1.webp",
    });
    expect(
      imageMediaDeliveryFactsForAssetId("site/images/asset-1.webp", {
        hrefForKey,
        keyPrefix: "site/images/",
      }),
    ).toBeUndefined();
    expect(
      imageMediaDeliveryFactsForAssetId("../asset-1.webp", {
        hrefForKey,
        keyPrefix: "site/images/",
      }),
    ).toBeUndefined();
    expect(
      imageMediaDeliveryFactsForAssetId("asset-1.txt", {
        hrefForKey,
        keyPrefix: "site/images/",
      }),
    ).toBeUndefined();
  });

  it("normalizes uploaded filenames into media asset labels", async () => {
    const result = await uploadImageMedia({
      file: {
        bytes: pngBytes,
        contentType: "image/png",
        filename: "../nested/\u0000",
        size: pngBytes.byteLength,
      },
      hrefForKey: (key) => `/api/site/media/${key}`,
      keyPrefix: "site/images/",
      provider: "r2",
      randomId: () => "asset-2",
      store: memoryMediaObjectStore(),
    });

    expect(result).toMatchObject({
      ok: true,
      upload: {
        asset: {
          id: "asset-2.png",
          label: "Uploaded image",
        },
      },
    });
  });
});

function memoryMediaObjectStore(): MediaObjectStore & {
  writes: Parameters<MediaObjectStore["putObject"]>[0][];
} {
  const objects = new Map<string, Parameters<MediaObjectStore["putObject"]>[0]>();
  const writes: Parameters<MediaObjectStore["putObject"]>[0][] = [];

  return {
    async getObject(key) {
      const object = objects.get(key);

      if (!object) {
        return undefined;
      }

      return {
        body: null,
        customMetadata: object.customMetadata,
        httpEtag: `"${key}"`,
        writeHttpMetadata(headers) {
          headers.set("Content-Type", object.contentType);
          headers.set("Cache-Control", object.cacheControl);
        },
      };
    },
    async putObject(write) {
      writes.push(write);
      objects.set(write.key, write);
    },
    writes,
  };
}

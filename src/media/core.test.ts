import { describe, expect, it } from "vite-plus/test";

import {
  MEDIA_OBJECT_CACHE_CONTROL,
  coreImageMediaDeliveryFactsForAssetId,
  deliveryFactsForMediaObject,
  imageMediaContentTypeForKey,
  imageMediaDeliveryFactsForAssetId,
  imageMediaExtensionForContentType,
  isRestorableImageMediaKey,
  listImageMediaAssets,
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
      hrefForKey: (key) => `/api/formless/media/${key}`,
      keyPrefix: "media/images/",
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
          deliveryHref: "/api/formless/media/media/images/asset-1.png",
          filename: "hero.png",
          id: "asset-1.png",
          kind: "image",
          label: "hero.png",
          provider: "r2",
          status: "ready",
          storageKey: "media/images/asset-1.png",
        },
        assetId: "asset-1.png",
        contentType: "image/png",
        href: "/api/formless/media/media/images/asset-1.png",
        key: "media/images/asset-1.png",
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
          "formless-media-delivery-href": "/api/formless/media/media/images/asset-1.png",
          "formless-media-filename": "hero.png",
          "formless-media-kind": "image",
          "formless-media-label": "hero.png",
          "formless-media-provider": "r2",
          "formless-media-status": "ready",
          "formless-media-storage-key": "media/images/asset-1.png",
        },
        key: "media/images/asset-1.png",
      },
    ]);
    expect(mediaAssetFromObjectMetadata(store.writes[0]?.customMetadata)).toEqual(
      result.ok ? result.upload.asset : undefined,
    );

    const delivery = await deliveryFactsForMediaObject({
      includeBody: false,
      key: "media/images/asset-1.png",
      store,
    });

    expect(delivery?.body).toBeNull();
    expect(delivery?.headers.get("Content-Type")).toBe("image/png");
    expect(delivery?.headers.get("Cache-Control")).toBe(MEDIA_OBJECT_CACHE_CONTROL);
    expect(delivery?.headers.get("ETag")).toBe('"media/images/asset-1.png"');
  });

  it("restores images to exact keys and rejects unsupported restore inputs", async () => {
    const store = memoryMediaObjectStore();
    const restored = await restoreImageMedia({
      bytes: pngBytes,
      contentType: "image/png",
      hrefForKey: (key) => `/api/formless/media/${key}`,
      key: "media/images/restored.png",
      keyPrefix: "media/images/",
      store,
    });
    const mismatched = await restoreImageMedia({
      bytes: pngBytes,
      contentType: "image/jpeg",
      hrefForKey: (key) => `/api/formless/media/${key}`,
      key: "media/images/restored.png",
      keyPrefix: "media/images/",
      store,
    });
    const unsupported = await restoreImageMedia({
      bytes: pngBytes,
      contentType: "image/png",
      hrefForKey: (key) => `/api/formless/media/${key}`,
      key: "media/videos/clip.png",
      keyPrefix: "media/images/",
      store,
    });

    expect(restored).toEqual({
      ok: true,
      upload: {
        contentType: "image/png",
        href: "/api/formless/media/media/images/restored.png",
        key: "media/images/restored.png",
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
    expect(imageMediaContentTypeForKey("media/images/photo.jpeg")).toBe("image/jpeg");
    expect(
      isRestorableImageMediaKey("media/images/photo.webp", { keyPrefix: "media/images/" }),
    ).toBe(true);
    expect(
      isRestorableImageMediaKey("media/images/../photo.webp", { keyPrefix: "media/images/" }),
    ).toBe(false);
  });

  it("resolves render-ready delivery facts from image media asset ids", () => {
    const hrefForKey = (key: string) => `/api/formless/media/${key}`;

    expect(
      imageMediaDeliveryFactsForAssetId("asset-1.webp", {
        hrefForKey,
        keyPrefix: "media/images/",
      }),
    ).toEqual({
      assetId: "asset-1.webp",
      href: "/api/formless/media/media/images/asset-1.webp",
      kind: "image",
      storageKey: "media/images/asset-1.webp",
    });
    expect(
      imageMediaDeliveryFactsForAssetId("media/images/asset-1.webp", {
        hrefForKey,
        keyPrefix: "media/images/",
      }),
    ).toBeUndefined();
    expect(
      imageMediaDeliveryFactsForAssetId("../asset-1.webp", {
        hrefForKey,
        keyPrefix: "media/images/",
      }),
    ).toBeUndefined();
    expect(
      imageMediaDeliveryFactsForAssetId("asset-1.txt", {
        hrefForKey,
        keyPrefix: "media/images/",
      }),
    ).toBeUndefined();
    expect(coreImageMediaDeliveryFactsForAssetId("asset-1.webp")).toEqual({
      assetId: "asset-1.webp",
      href: "/api/formless/media/media/images/asset-1.webp",
      kind: "image",
      storageKey: "media/images/asset-1.webp",
    });
  });

  it("lists image media assets from object metadata", async () => {
    const store = memoryMediaObjectStore();

    await uploadImageMedia({
      file: {
        bytes: pngBytes,
        contentType: "image/png",
        filename: "z-cover.png",
        size: pngBytes.byteLength,
      },
      hrefForKey: (key) => `/api/formless/media/${key}`,
      keyPrefix: "media/images/",
      provider: "r2",
      randomId: () => "z-cover",
      store,
    });
    await uploadImageMedia({
      file: {
        bytes: pngBytes,
        contentType: "image/webp",
        filename: "a-hero.webp",
        size: pngBytes.byteLength,
      },
      hrefForKey: (key) => `/api/formless/media/${key}`,
      keyPrefix: "media/images/",
      provider: "r2",
      randomId: () => "a-hero",
      store,
    });
    await restoreImageMedia({
      bytes: pngBytes,
      contentType: "image/png",
      hrefForKey: (key) => `/api/formless/media/${key}`,
      key: "media/images/restored.png",
      keyPrefix: "media/images/",
      store,
    });

    expect(await listImageMediaAssets({ keyPrefix: "media/images/", store })).toMatchObject([
      { id: "a-hero.webp", label: "a-hero.webp" },
      { id: "z-cover.png", label: "z-cover.png" },
    ]);
  });

  it("lists image media assets from image object facts when metadata is unavailable", async () => {
    const store = memoryMediaObjectStore();

    await store.putObject({
      bytes: pngBytes,
      cacheControl: MEDIA_OBJECT_CACHE_CONTROL,
      contentType: "image/png",
      key: "media/images/fallback.png",
    });

    expect(
      await listImageMediaAssets({
        hrefForKey: (key) => `/api/formless/media/${key}`,
        keyPrefix: "media/images/",
        provider: "r2",
        store,
      }),
    ).toEqual([
      {
        byteSize: pngBytes.byteLength,
        contentType: "image/png",
        deliveryHref: "/api/formless/media/media/images/fallback.png",
        id: "fallback.png",
        kind: "image",
        label: "fallback.png",
        provider: "r2",
        status: "ready",
        storageKey: "media/images/fallback.png",
      },
    ]);
  });

  it("normalizes uploaded filenames into media asset labels", async () => {
    const result = await uploadImageMedia({
      file: {
        bytes: pngBytes,
        contentType: "image/png",
        filename: "../nested/\u0000",
        size: pngBytes.byteLength,
      },
      hrefForKey: (key) => `/api/formless/media/${key}`,
      keyPrefix: "media/images/",
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
    async listObjects(options) {
      return {
        objects: [...objects.values()]
          .filter((object) => object.key.startsWith(options.prefix))
          .slice(0, options.limit)
          .map((object) => ({
            customMetadata: object.customMetadata,
            key: object.key,
            contentType: object.contentType,
            size: object.bytes.byteLength,
          })),
      };
    },
    async putObject(write) {
      writes.push(write);
      objects.set(write.key, write);
    },
    writes,
  };
}

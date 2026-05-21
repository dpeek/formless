import { describe, expect, it } from "vite-plus/test";

import {
  MEDIA_OBJECT_CACHE_CONTROL,
  deliveryFactsForMediaObject,
  imageMediaContentTypeForKey,
  imageMediaExtensionForContentType,
  isRestorableImageMediaKey,
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
        size: pngBytes.byteLength,
      },
      hrefForKey: (key) => `/api/site/media/${key}`,
      keyPrefix: "site/images/",
      randomId: () => "asset-1",
      store,
    });

    expect(result).toEqual({
      ok: true,
      upload: {
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
        key: "site/images/asset-1.png",
      },
    ]);

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

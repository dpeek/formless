import { describe, expect, it } from "vite-plus/test";
import {
  CORE_MEDIA_ROUTE_PREFIX,
  MEDIA_OBJECT_CACHE_CONTROL,
  deliveryFactsForMediaObject,
  handleMediaRequest,
  imageMediaRouteFromPathname,
  listImageMediaAssets,
  restoreImageMedia,
  uploadImageMedia,
} from "./worker.ts";
import type { MediaAsset, MediaObjectMetadata, MediaObjectStore } from "./types.ts";

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe("Media Worker adapter", () => {
  it("exposes Worker adapter route behavior through the public package subpath", async () => {
    const mediaWorker = await import("@dpeek/formless-media/worker");

    expect(mediaWorker.CORE_MEDIA_ROUTE_PREFIX).toBe(CORE_MEDIA_ROUTE_PREFIX);
    expect(mediaWorker.imageMediaRouteFromPathname("/api/formless/media/images")).toEqual({
      media: {
        imageKeyPrefix: "media/images",
        imageUploadPath: "/api/formless/media/images",
        routePrefix: "/api/formless/media",
      },
      path: "/media/images",
    });
  });

  it("preserves core media route matching and rejects legacy media routes", () => {
    expect(imageMediaRouteFromPathname("/api/formless/media/images")).toEqual({
      media: {
        imageKeyPrefix: "media/images",
        imageUploadPath: "/api/formless/media/images",
        routePrefix: "/api/formless/media",
      },
      path: "/media/images",
    });
    expect(imageMediaRouteFromPathname(`${CORE_MEDIA_ROUTE_PREFIX}media/images/hero.png`)).toEqual({
      media: {
        imageKeyPrefix: "media/images",
        imageUploadPath: "/api/formless/media/images",
        routePrefix: "/api/formless/media",
      },
      path: "/media/media/images/hero.png",
    });
    expect(imageMediaRouteFromPathname("/api/site/media/images")).toBeUndefined();
    expect(
      imageMediaRouteFromPathname("/api/app-installs/site/personal/media/images"),
    ).toBeUndefined();
  });

  it("preserves list, read, and HEAD behavior for /api/formless/media", async () => {
    const harness = createMediaRequestHarness();
    const key = "media/images/hero.png";

    harness.putObject(key, pngBytes, "image/png");

    const list = await harness.dispatch("/api/formless/media/images");
    const getResponse = await harness.dispatch(`${CORE_MEDIA_ROUTE_PREFIX}${key}`);
    const headResponse = await harness.dispatch(`${CORE_MEDIA_ROUTE_PREFIX}${key}`, {
      method: "HEAD",
    });

    expect(list.status).toBe(200);
    expect(list.headers.get("Cache-Control")).toBe("no-store");
    expect((await list.json()) as unknown).toEqual({
      assets: [
        {
          byteSize: pngBytes.byteLength,
          contentType: "image/png",
          deliveryHref: `${CORE_MEDIA_ROUTE_PREFIX}${key}`,
          id: "hero.png",
          kind: "image",
          label: "hero.png",
          provider: "r2",
          status: "ready",
          storageKey: key,
        },
      ],
    });

    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get("Content-Type")).toBe("image/png");
    expect(getResponse.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(new Uint8Array(await getResponse.arrayBuffer())).toEqual(pngBytes);

    expect(headResponse.status).toBe(200);
    expect(headResponse.headers.get("Content-Type")).toBe("image/png");
    expect(headResponse.headers.get("Cache-Control")).toBe(
      getResponse.headers.get("Cache-Control"),
    );
    expect((await headResponse.arrayBuffer()).byteLength).toBe(0);
  });

  it("preserves upload and restore behavior for /api/formless/media", async () => {
    const harness = createMediaRequestHarness();

    const upload = await harness.dispatch("/api/formless/media/images", {
      body: multipartFormData([{ body: pngBytes, contentType: "image/png", filename: "hero.png" }]),
      headers: { "Content-Type": "multipart/form-data; boundary=formless-media-test" },
      method: "POST",
    });
    const uploaded = (await upload.json()) as {
      asset: { filename?: string; label: string; storageKey: string };
      assetId: string;
      contentType: string;
      href: string;
      key: string;
      size: number;
    };

    expect(upload.status).toBe(200);
    expect(uploaded).toEqual({
      asset: {
        byteSize: pngBytes.byteLength,
        contentType: "image/png",
        deliveryHref: uploaded.href,
        filename: "hero.png",
        id: uploaded.assetId,
        kind: "image",
        label: "hero.png",
        provider: "r2",
        status: "ready",
        storageKey: uploaded.key,
      },
      assetId: "asset-fixed.png",
      contentType: "image/png",
      href: `${CORE_MEDIA_ROUTE_PREFIX}media/images/asset-fixed.png`,
      key: "media/images/asset-fixed.png",
      size: pngBytes.byteLength,
    });
    expect(harness.objects.get(uploaded.key)?.customMetadata).toMatchObject({
      "formless-media-asset-id": uploaded.assetId,
      "formless-media-storage-key": uploaded.key,
    });

    const restoreKey = "media/images/restored.png";
    const restore = await harness.dispatch(`${CORE_MEDIA_ROUTE_PREFIX}${restoreKey}`, {
      body: pngBytes,
      headers: { "Content-Type": "image/png" },
      method: "PUT",
    });

    expect(restore.status).toBe(200);
    expect((await restore.json()) as unknown).toEqual({
      contentType: "image/png",
      href: `${CORE_MEDIA_ROUTE_PREFIX}${restoreKey}`,
      key: restoreKey,
      size: pngBytes.byteLength,
    });
    expect(harness.objects.has(restoreKey)).toBe(true);
  });

  it("uses fake stores and fixed ids for upload, list, restore, and delivery contracts", async () => {
    const memory = createMemoryStore();
    const upload = await uploadImageMedia({
      file: {
        bytes: pngBytes,
        contentType: "image/png; charset=binary",
        filename: "hero.png",
        size: pngBytes.byteLength,
      },
      hrefForKey: (key) => `${CORE_MEDIA_ROUTE_PREFIX}${key}`,
      keyPrefix: "media/images/",
      provider: "fake-r2",
      randomId: () => "asset-fixed",
      store: memory.store,
    });

    expect(upload).toEqual({
      ok: true,
      upload: {
        asset: {
          byteSize: pngBytes.byteLength,
          contentType: "image/png",
          deliveryHref: `${CORE_MEDIA_ROUTE_PREFIX}media/images/asset-fixed.png`,
          filename: "hero.png",
          id: "asset-fixed.png",
          kind: "image",
          label: "hero.png",
          provider: "fake-r2",
          status: "ready",
          storageKey: "media/images/asset-fixed.png",
        },
        assetId: "asset-fixed.png",
        contentType: "image/png",
        href: `${CORE_MEDIA_ROUTE_PREFIX}media/images/asset-fixed.png`,
        key: "media/images/asset-fixed.png",
        size: pngBytes.byteLength,
      },
    });
    expect(memory.objects.get("media/images/asset-fixed.png")?.customMetadata).toEqual({
      "formless-media-asset-id": "asset-fixed.png",
      "formless-media-byte-size": String(pngBytes.byteLength),
      "formless-media-content-type": "image/png",
      "formless-media-delivery-href": `${CORE_MEDIA_ROUTE_PREFIX}media/images/asset-fixed.png`,
      "formless-media-filename": "hero.png",
      "formless-media-kind": "image",
      "formless-media-label": "hero.png",
      "formless-media-provider": "fake-r2",
      "formless-media-status": "ready",
      "formless-media-storage-key": "media/images/asset-fixed.png",
    });

    await memory.store.putObject({
      bytes: pngBytes,
      cacheControl: MEDIA_OBJECT_CACHE_CONTROL,
      contentType: "image/webp",
      key: "media/images/fallback.webp",
    });

    await expect(
      listImageMediaAssets({
        hrefForKey: (key) => `${CORE_MEDIA_ROUTE_PREFIX}${key}`,
        keyPrefix: "media/images/",
        provider: "fake-r2",
        store: memory.store,
      }),
    ).resolves.toEqual([
      {
        byteSize: pngBytes.byteLength,
        contentType: "image/webp",
        deliveryHref: `${CORE_MEDIA_ROUTE_PREFIX}media/images/fallback.webp`,
        id: "fallback.webp",
        kind: "image",
        label: "fallback.webp",
        provider: "fake-r2",
        status: "ready",
        storageKey: "media/images/fallback.webp",
      },
      upload.ok ? upload.upload.asset : undefined,
    ]);

    const restoreAsset: MediaAsset = {
      byteSize: pngBytes.byteLength,
      contentType: "image/webp",
      deliveryHref: `${CORE_MEDIA_ROUTE_PREFIX}media/images/restored.webp`,
      id: "restored.webp",
      kind: "image",
      label: "Restored",
      provider: "fake-r2",
      status: "ready",
      storageKey: "media/images/restored.webp",
    };
    const restore = await restoreImageMedia({
      asset: restoreAsset,
      bytes: pngBytes,
      contentType: "image/webp",
      hrefForKey: (key) => `${CORE_MEDIA_ROUTE_PREFIX}${key}`,
      key: "media/images/restored.webp",
      keyPrefix: "media/images/",
      store: memory.store,
    });

    expect(restore).toEqual({
      ok: true,
      upload: {
        contentType: "image/webp",
        href: `${CORE_MEDIA_ROUTE_PREFIX}media/images/restored.webp`,
        key: "media/images/restored.webp",
        size: pngBytes.byteLength,
      },
    });
    expect(memory.objects.get("media/images/restored.webp")?.customMetadata).toMatchObject({
      "formless-media-asset-id": "restored.webp",
      "formless-media-label": "Restored",
      "formless-media-storage-key": "media/images/restored.webp",
    });

    const delivery = await deliveryFactsForMediaObject({
      includeBody: false,
      key: "media/images/restored.webp",
      store: memory.store,
    });

    expect(delivery?.body).toBeNull();
    expect(delivery?.headers.get("Content-Type")).toBe("image/webp");
    expect(delivery?.headers.get("Cache-Control")).toBe(MEDIA_OBJECT_CACHE_CONTROL);
    expect(delivery?.headers.get("ETag")).toBe('"media/images/restored.webp"');
  });

  it("returns deterministic write errors without provider writes", async () => {
    const memory = createMemoryStore();

    await expect(
      uploadImageMedia({
        file: {
          bytes: pngBytes,
          contentType: "image/svg+xml",
          filename: "hero.svg",
          size: pngBytes.byteLength,
        },
        hrefForKey: (key) => `${CORE_MEDIA_ROUTE_PREFIX}${key}`,
        keyPrefix: "media/images/",
        provider: "fake-r2",
        randomId: () => "asset-fixed",
        store: memory.store,
      }),
    ).resolves.toEqual({ error: "Unsupported image type.", ok: false, status: 415 });
    await expect(
      restoreImageMedia({
        bytes: new Uint8Array(),
        contentType: "image/png",
        hrefForKey: (key) => `${CORE_MEDIA_ROUTE_PREFIX}${key}`,
        key: "media/images/empty.png",
        keyPrefix: "media/images/",
        store: memory.store,
      }),
    ).resolves.toEqual({ error: "Media restore body must not be empty.", ok: false, status: 400 });
    expect(memory.objects.size).toBe(0);
  });

  it("preserves media miss and authorization response behavior", async () => {
    const harness = createMediaRequestHarness({
      authorizeWrite: () => ({
        authorized: false,
        error: "Write denied.",
        headers: { "WWW-Authenticate": "Bearer" },
        status: 401,
      }),
    });

    const ignored = await handleMediaRequest(
      new Request("https://example.test/api/site/media/images"),
      {
        authorizeWrite: () => ({ authorized: true }),
        store: createMemoryStore().store,
      },
    );
    const rejected = await harness.dispatch("/api/formless/media/images", {
      body: multipartFormData([{ body: pngBytes, contentType: "image/png", filename: "hero.png" }]),
      headers: { "Content-Type": "multipart/form-data; boundary=formless-media-test" },
      method: "POST",
    });

    expect(ignored).toBeUndefined();
    expect(rejected.status).toBe(401);
    expect(rejected.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect((await rejected.json()) as unknown).toEqual({ error: "Write denied." });
  });
});

type StoredMediaObject = {
  cacheControl: string;
  contentType: string;
  customMetadata?: MediaObjectMetadata;
  bytes: Uint8Array;
};

type MediaRequestHarnessOptions = {
  authorizeWrite?: Parameters<typeof handleMediaRequest>[1]["authorizeWrite"];
};

function createMediaRequestHarness(options: MediaRequestHarnessOptions = {}) {
  const memory = createMemoryStore();

  return {
    ...memory,
    async dispatch(path: string, init: RequestInit = {}) {
      const response = await handleMediaRequest(new Request(`https://example.test${path}`, init), {
        authorizeWrite: options.authorizeWrite ?? (() => ({ authorized: true })),
        provider: "r2",
        randomId: () => "asset-fixed",
        store: memory.store,
      });

      if (!response) {
        throw new Error(`Expected media response for ${path}.`);
      }

      return response;
    },
  };
}

function createMemoryStore() {
  const objects = new Map<string, StoredMediaObject>();
  const store: MediaObjectStore = {
    async getObject(key) {
      const object = objects.get(key);

      if (!object) {
        return undefined;
      }

      return {
        body: bodyInitFromBytes(object.bytes),
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
        objects: [...objects.entries()]
          .filter(([key]) => key.startsWith(options.prefix))
          .slice(0, options.limit)
          .map(([key, object]) => ({
            contentType: object.contentType,
            customMetadata: object.customMetadata,
            key,
            size: object.bytes.byteLength,
          })),
      };
    },
    async putObject(write) {
      objects.set(write.key, {
        bytes: copyBytes(write.bytes),
        cacheControl: write.cacheControl,
        contentType: write.contentType,
        customMetadata: write.customMetadata,
      });
    },
  };

  return {
    objects,
    putObject(key: string, body: Uint8Array, contentType: string) {
      objects.set(key, {
        bytes: copyBytes(body),
        cacheControl: "public, max-age=31536000, immutable",
        contentType,
      });
    },
    store,
  };
}

function multipartFormData(
  files: Array<{ body: Uint8Array; contentType: string; filename: string }>,
) {
  const chunks: Uint8Array[] = [];

  for (const file of files) {
    chunks.push(
      textBytes(
        `--formless-media-test\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      ),
      file.body,
      textBytes("\r\n"),
    );
  }

  chunks.push(textBytes("--formless-media-test--\r\n"));

  return concatBytes(chunks);
}

function textBytes(value: string) {
  return new TextEncoder().encode(value);
}

function bodyInitFromBytes(bytes: Uint8Array): BodyInit {
  return copyBytes(bytes).buffer as ArrayBuffer;
}

function copyBytes(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);

  copy.set(bytes);

  return copy;
}

function concatBytes(chunks: Uint8Array[]) {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

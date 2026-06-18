import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import type { OwnerIdentity } from "../shared/protocol.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import {
  CORE_IMAGE_KEY_PREFIX,
  CORE_MEDIA_ROUTE_PREFIX,
  MEDIA_IMAGE_UPLOAD_MAX_BYTES,
  MEDIA_OBJECT_CACHE_CONTROL,
} from "@dpeek/formless-media/worker";
import { createOwnerSessionCookie } from "./owner-session.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;
type HarnessResponse = Awaited<ReturnType<Harness["fetch"]>>;

const adminToken = "test-admin-token";
const sessionSecret = "test-session-secret";
const mediaBinding = "FORMLESS_MEDIA";
const mediaBuckets = [mediaBinding];
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const owner: OwnerIdentity = {
  id: "owner-1",
  name: "Ada Owner",
  email: "ada@example.com",
  createdAt: "2026-05-21T00:00:00.000Z",
};

type TestFile = {
  content: Uint8Array;
  name: string;
  type: string;
};

let harness: Harness;
let guardedHarness: Harness;

beforeAll(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      r2Buckets: mediaBuckets,
    },
  );
  guardedHarness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_OWNER_SESSION_SECRET: sessionSecret,
      },
      r2Buckets: mediaBuckets,
    },
  );
});

beforeEach(async () => {
  await clearMediaBucket(harness);
  await clearMediaBucket(guardedHarness);
});

afterAll(async () => {
  await harness.dispose();
  await guardedHarness.dispose();
});

describe("media worker routes", () => {
  it("uploads a core image media asset and serves it from the instance media route", async () => {
    const upload = await uploadCoreImage(harness, imageFile("hero.png", "image/png", pngBytes));

    await expectResponseStatus(upload, 200);

    const body = (await upload.json()) as {
      asset: {
        byteSize: number;
        contentType: string;
        deliveryHref: string;
        filename?: string;
        id: string;
        kind: string;
        label: string;
        provider: string;
        status: string;
        storageKey: string;
      };
      assetId: string;
      contentType: string;
      href: string;
      key: string;
      size: number;
    };

    expect(body).toEqual({
      asset: {
        byteSize: pngBytes.byteLength,
        contentType: "image/png",
        deliveryHref: body.href,
        filename: "hero.png",
        id: body.assetId,
        kind: "image",
        label: "hero.png",
        provider: "r2",
        status: "ready",
        storageKey: body.key,
      },
      assetId: expect.stringMatching(/^[0-9a-f-]+\.png$/),
      contentType: "image/png",
      href: expect.stringMatching(/^\/api\/formless\/media\/media\/images\/.+\.png$/),
      key: expect.stringMatching(/^media\/images\/.+\.png$/),
      size: pngBytes.byteLength,
    });
    expect(body.href).toBe(`${CORE_MEDIA_ROUTE_PREFIX}${body.key}`);
    expect(body.key).toBe(`${CORE_IMAGE_KEY_PREFIX}/${body.assetId}`);
    await expectMediaObjectCustomMetadata(harness, body.key, {
      "formless-media-asset-id": body.assetId,
      "formless-media-byte-size": String(pngBytes.byteLength),
      "formless-media-content-type": "image/png",
      "formless-media-delivery-href": body.href,
      "formless-media-filename": "hero.png",
      "formless-media-kind": "image",
      "formless-media-label": "hero.png",
      "formless-media-provider": "r2",
      "formless-media-status": "ready",
      "formless-media-storage-key": body.key,
    });

    const served = await harness.fetch(body.href);

    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("image/png");
    expect(served.headers.get("Cache-Control")).toBe(MEDIA_OBJECT_CACHE_CONTROL);
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(pngBytes);
  });

  it("lists core image media assets for generated media selectors", async () => {
    const upload = await uploadCoreImage(harness, imageFile("hero.png", "image/png", pngBytes));
    const uploaded = (await upload.json()) as {
      assetId: string;
      href: string;
      key: string;
    };
    const list = await harness.fetch("/api/formless/media/images");

    expect(list.status).toBe(200);
    expect(list.headers.get("Cache-Control")).toBe("no-store");
    expect((await list.json()) as unknown).toEqual({
      assets: [
        expect.objectContaining({
          deliveryHref: uploaded.href,
          id: uploaded.assetId,
          kind: "image",
          label: "hero.png",
          storageKey: uploaded.key,
        }),
      ],
    });
  });

  it("uses the same write authorization boundaries for core media assets", async () => {
    const rejected = await uploadCoreImage(
      guardedHarness,
      imageFile("rejected.png", "image/png", pngBytes),
    );
    const adminAccepted = await uploadCoreImage(
      guardedHarness,
      imageFile("admin.png", "image/png", pngBytes),
      {
        Authorization: `Bearer ${adminToken}`,
      },
    );

    expect(adminAccepted.status).toBe(200);
    const body = (await adminAccepted.json()) as { href: string; key: string };

    const ownerAccepted = await uploadCoreImage(
      guardedHarness,
      imageFile("owner.png", "image/png", pngBytes),
      await ownerSessionHeaders(),
    );

    expect(rejected.status).toBe(401);
    expect(ownerAccepted.status).toBe(200);

    const served = await guardedHarness.fetch(body.href);

    expect(body.key).toMatch(/^media\/images\/.+\.png$/);
    expect(served.status).toBe(200);
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(pngBytes);
    await expectMediaBucketKeysUnordered(guardedHarness, [
      expect.stringMatching(/^media\/images\/.+\.png$/),
      expect.stringMatching(/^media\/images\/.+\.png$/),
    ]);
  });

  it("rejects missing, repeated, unsupported, and oversized core image uploads before R2 writes", async () => {
    const cases = [
      await uploadForm(harness, multipartFormData([])),
      await uploadForm(
        harness,
        multipartFormData([
          imageFile("first.png", "image/png", pngBytes),
          imageFile("second.png", "image/png", pngBytes),
        ]),
      ),
      await uploadCoreImage(harness, imageFile("icon.svg", "image/svg+xml", textBytes("<svg />"))),
      await uploadCoreImage(
        harness,
        imageFile("huge.jpg", "image/jpeg", new Uint8Array(MEDIA_IMAGE_UPLOAD_MAX_BYTES + 1)),
      ),
    ];

    expect(cases.map((response) => response.status)).toEqual([400, 400, 415, 413]);
    await expectMediaBucketKeys(harness, []);
  });

  it("restores core media to an exact guarded R2 key", async () => {
    const key = "media/images/restored.png";
    const rejected = await restoreCoreMedia(guardedHarness, key, "image/png", pngBytes);
    const accepted = await restoreCoreMedia(guardedHarness, key, "image/png", pngBytes, {
      Authorization: `Bearer ${adminToken}`,
    });

    expect(rejected.status).toBe(401);
    expect(accepted.status).toBe(200);
    expect((await accepted.json()) as unknown).toEqual({
      contentType: "image/png",
      href: `${CORE_MEDIA_ROUTE_PREFIX}${key}`,
      key,
      size: pngBytes.byteLength,
    });
    await expectMediaBucketKeys(guardedHarness, [key]);

    const served = await guardedHarness.fetch(`${CORE_MEDIA_ROUTE_PREFIX}${key}`);

    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(pngBytes);
  });

  it("accepts owner session cookies for core media writes when configured", async () => {
    const headers = await ownerSessionHeaders();
    const upload = await uploadCoreImage(
      guardedHarness,
      imageFile("hero.png", "image/png", pngBytes),
      headers,
    );
    const restore = await restoreCoreMedia(
      guardedHarness,
      "media/images/restored-by-owner.png",
      "image/png",
      pngBytes,
      headers,
    );

    expect(upload.status).toBe(200);
    expect(restore.status).toBe(200);
    await expectMediaBucketKeysUnordered(guardedHarness, [
      expect.stringMatching(/^media\/images\/.+\.png$/),
      "media/images/restored-by-owner.png",
    ]);
  });

  it("rejects invalid core media restore keys and mismatched content types", async () => {
    const invalidKey = await restoreCoreMedia(
      harness,
      "media/videos/clip.mp4",
      "video/mp4",
      pngBytes,
    );
    const mismatchedContentType = await restoreCoreMedia(
      harness,
      "media/images/restored.png",
      "image/jpeg",
      pngBytes,
    );

    expect(invalidKey.status).toBe(400);
    expect((await invalidKey.json()) as { error: string }).toEqual({
      error: "Unsupported media restore key.",
    });
    expect(mismatchedContentType.status).toBe(415);
    expect((await mismatchedContentType.json()) as { error: string }).toEqual({
      error: "Media restore content type must match the media key.",
    });
    await expectMediaBucketKeys(harness, []);
  });

  it("keeps core media reads open when the admin token is configured", async () => {
    const bucket = await guardedHarness.mf.getR2Bucket(mediaBinding);
    const key = "media/images/public.png";

    await bucket.put(key, pngBytes, {
      httpMetadata: {
        cacheControl: MEDIA_OBJECT_CACHE_CONTROL,
        contentType: "image/png",
      },
    });

    const response = await guardedHarness.fetch(`${CORE_MEDIA_ROUTE_PREFIX}${key}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pngBytes);
  });

  it("returns core media HEAD headers without a response body", async () => {
    const bucket = await harness.mf.getR2Bucket(mediaBinding);
    const key = "media/images/head.png";

    await bucket.put(key, pngBytes, {
      httpMetadata: {
        cacheControl: MEDIA_OBJECT_CACHE_CONTROL,
        contentType: "image/png",
      },
    });

    const getResponse = await harness.fetch(`${CORE_MEDIA_ROUTE_PREFIX}${key}`);
    const headResponse = await harness.fetch(`${CORE_MEDIA_ROUTE_PREFIX}${key}`, {
      method: "HEAD",
    });

    expect(headResponse.status).toBe(getResponse.status);
    expect(headResponse.headers.get("Content-Type")).toBe(getResponse.headers.get("Content-Type"));
    expect(headResponse.headers.get("Cache-Control")).toBe(
      getResponse.headers.get("Cache-Control"),
    );
    expect(headResponse.headers.get("ETag")).toBe(getResponse.headers.get("ETag"));
    expect((await headResponse.arrayBuffer()).byteLength).toBe(0);
  });

  it("keeps legacy app-scoped media routes inactive", async () => {
    const bucket = await harness.mf.getR2Bucket(mediaBinding);

    await bucket.put("site/images/public.png", pngBytes, {
      httpMetadata: {
        cacheControl: MEDIA_OBJECT_CACHE_CONTROL,
        contentType: "image/png",
      },
    });

    const schemaUpload = await uploadForm(
      harness,
      multipartFormData([imageFile("hero.png", "image/png", pngBytes)]),
      {},
      "/api/site/media/images",
    );
    const installedUpload = await uploadForm(
      harness,
      multipartFormData([imageFile("hero.png", "image/png", pngBytes)]),
      {},
      "/api/app-installs/site/personal/media/images",
    );
    const schemaList = await harness.fetch("/api/site/media/images");
    const installedList = await harness.fetch("/api/app-installs/site/personal/media/images");
    const schemaRead = await harness.fetch("/api/site/media/site/images/public.png");
    const installedRead = await harness.fetch(
      "/api/app-installs/site/personal/media/app-installs/personal/site/images/public.png",
    );
    const schemaRestore = await harness.fetch("/api/site/media/site/images/restored.png", {
      body: pngBytes,
      headers: { "Content-Type": "image/png" },
      method: "PUT",
    });
    const installedRestore = await harness.fetch(
      "/api/app-installs/site/personal/media/app-installs/personal/site/images/restored.png",
      {
        body: pngBytes,
        headers: { "Content-Type": "image/png" },
        method: "PUT",
      },
    );
    const schemaHead = await harness.fetch("/api/site/media/site/images/public.png", {
      method: "HEAD",
    });

    expect(
      [
        schemaUpload,
        installedUpload,
        schemaList,
        installedList,
        schemaRead,
        installedRead,
        schemaRestore,
        installedRestore,
        schemaHead,
      ].map((response) => response.status),
    ).toEqual([404, 404, 404, 404, 404, 404, 404, 404, 404]);
    expect(await schemaHead.text()).toBe("");
  });
});

async function uploadCoreImage(
  harness: Harness,
  file: TestFile,
  headers: Record<string, string> = {},
) {
  return uploadForm(harness, multipartFormData([file]), headers, "/api/formless/media/images");
}

async function uploadForm(
  harness: Harness,
  formData: ReturnType<typeof multipartFormData>,
  headers: Record<string, string> = {},
  path = "/api/formless/media/images",
) {
  return harness.fetch(path, {
    body: formData.body.buffer,
    headers: {
      ...headers,
      "Content-Type": `multipart/form-data; boundary=${formData.boundary}`,
    },
    method: "POST",
  });
}

async function restoreCoreMedia(
  harness: Harness,
  key: string,
  contentType: string,
  body: Uint8Array,
  headers: Record<string, string> = {},
) {
  return harness.fetch(`${CORE_MEDIA_ROUTE_PREFIX}${key}`, {
    body,
    headers: {
      ...headers,
      "Content-Type": contentType,
    },
    method: "PUT",
  });
}

function multipartFormData(files: TestFile[]) {
  const boundary = `formless-test-${crypto.randomUUID()}`;
  const chunks: Uint8Array[] = [];

  for (const file of files) {
    chunks.push(
      textBytes(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`,
      ),
      file.content,
      textBytes("\r\n"),
    );
  }

  chunks.push(textBytes(`--${boundary}--\r\n`));

  return {
    body: concatBytes(chunks),
    boundary,
  };
}

function imageFile(name: string, type: string, content: Uint8Array): TestFile {
  return { content, name, type };
}

function textBytes(value: string) {
  return new TextEncoder().encode(value);
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

async function clearMediaBucket(harness: Harness) {
  const bucket = await harness.mf.getR2Bucket(mediaBinding);
  const objects = await bucket.list();

  if (objects.objects.length > 0) {
    await bucket.delete(objects.objects.map((object) => object.key));
  }
}

async function expectMediaBucketKeys(harness: Harness, expected: unknown[]) {
  const bucket = await harness.mf.getR2Bucket(mediaBinding);
  const objects = await bucket.list();

  expect(objects.objects.map((object) => object.key)).toEqual(expected);
}

async function expectMediaBucketKeysUnordered(harness: Harness, expected: unknown[]) {
  const bucket = await harness.mf.getR2Bucket(mediaBinding);
  const objects = await bucket.list();
  const keys = objects.objects.map((object) => object.key);

  expect(keys).toHaveLength(expected.length);
  expect(keys).toEqual(expect.arrayContaining(expected));
}

async function expectMediaObjectCustomMetadata(
  harness: Harness,
  key: string,
  expected: Record<string, string>,
) {
  const bucket = await harness.mf.getR2Bucket(mediaBinding);
  const object = await bucket.get(key);

  expect(object?.customMetadata).toEqual(expected);
}

async function expectResponseStatus(response: HarnessResponse, status: number) {
  expect({
    body: await response.clone().text(),
    status: response.status,
  }).toEqual({
    body: expect.any(String),
    status,
  });
}

async function ownerSessionHeaders() {
  const created = await createOwnerSessionCookie({
    env: { FORMLESS_OWNER_SESSION_SECRET: sessionSecret },
    maxAgeSeconds: 60,
    now: "2999-01-01T00:00:00.000Z",
    owner,
    request: new Request("http://example.com/admin"),
  });

  return {
    Cookie: cookiePair(created.cookie),
  };
}

function cookiePair(cookie: string) {
  return cookie.split(";")[0] ?? cookie;
}

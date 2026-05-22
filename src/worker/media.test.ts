import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import type { OwnerIdentity } from "../shared/protocol.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { SITE_IMAGE_UPLOAD_MAX_BYTES, SITE_MEDIA_CACHE_CONTROL } from "./media.ts";
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

describe("site media worker routes", () => {
  it("uploads a raster image to R2 and serves it from the returned same-origin href", async () => {
    const upload = await uploadImage(harness, imageFile("hero.png", "image/png", pngBytes));

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
      href: expect.stringMatching(/^\/api\/site\/media\/site\/images\/.+\.png$/),
      key: expect.stringMatching(/^site\/images\/.+\.png$/),
      size: pngBytes.byteLength,
    });
    expect(body.key).toBe(`site/images/${body.assetId}`);
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
    expect(served.headers.get("Cache-Control")).toBe(SITE_MEDIA_CACHE_CONTROL);
    expect(served.headers.get("ETag")).toEqual(expect.stringContaining('"'));
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(pngBytes);
  });

  it("uploads installed Site images under the install media namespace", async () => {
    const upload = await uploadInstalledImage(
      harness,
      "personal",
      imageFile("hero.png", "image/png", pngBytes),
    );

    await expectResponseStatus(upload, 200);

    const body = (await upload.json()) as {
      assetId: string;
      href: string;
      key: string;
    };

    expect(body).toMatchObject({
      assetId: expect.stringMatching(/^[0-9a-f-]+\.png$/),
      href: expect.stringMatching(
        /^\/api\/app-installs\/site\/personal\/media\/app-installs\/personal\/site\/images\/.+\.png$/,
      ),
      key: expect.stringMatching(/^app-installs\/personal\/site\/images\/.+\.png$/),
    });
    expect(body.key).toBe(`app-installs/personal/site/images/${body.assetId}`);
    await expectMediaBucketKeys(harness, [body.key]);

    const served = await harness.fetch(body.href);
    const crossInstall = await harness.fetch(
      body.href.replace("/site/personal/media/", "/site/docs/media/"),
    );
    const legacy = await harness.fetch(`/api/site/media/${body.key}`);

    expect(served.status).toBe(200);
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(pngBytes);
    expect(crossInstall.status).toBe(404);
    expect(legacy.status).toBe(404);
  });

  it("rejects missing, repeated, unsupported, and oversized files before R2 writes", async () => {
    const cases = [
      await uploadForm(harness, multipartFormData([])),
      await uploadForm(
        harness,
        multipartFormData([
          imageFile("first.png", "image/png", pngBytes),
          imageFile("second.png", "image/png", pngBytes),
        ]),
      ),
      await uploadImage(harness, imageFile("icon.svg", "image/svg+xml", textBytes("<svg />"))),
      await uploadImage(
        harness,
        imageFile("huge.jpg", "image/jpeg", new Uint8Array(SITE_IMAGE_UPLOAD_MAX_BYTES + 1)),
      ),
    ];

    expect(cases.map((response) => response.status)).toEqual([400, 400, 415, 413]);
    await expectMediaBucketKeys(harness, []);
  });

  it("guards uploads with the admin bearer token when configured", async () => {
    const rejected = await uploadImage(
      guardedHarness,
      imageFile("hero.png", "image/png", pngBytes),
    );
    const accepted = await uploadImage(
      guardedHarness,
      imageFile("hero.png", "image/png", pngBytes),
      {
        Authorization: `Bearer ${adminToken}`,
      },
    );

    expect(rejected.status).toBe(401);
    expect(rejected.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
    expect((await rejected.json()) as { error: string }).toEqual({
      error: "Owner session or admin authorization is required for this write endpoint.",
    });
    expect(accepted.status).toBe(200);
    await expectMediaBucketKeys(guardedHarness, [expect.stringMatching(/^site\/images\/.+\.png$/)]);
  });

  it("accepts owner session cookies for media writes when configured", async () => {
    const headers = await ownerSessionHeaders();
    const upload = await uploadImage(
      guardedHarness,
      imageFile("hero.png", "image/png", pngBytes),
      headers,
    );
    const restore = await restoreMedia(
      guardedHarness,
      "site/images/restored-by-owner.png",
      "image/png",
      pngBytes,
      headers,
    );

    expect(upload.status).toBe(200);
    expect(restore.status).toBe(200);
    await expectMediaBucketKeysUnordered(guardedHarness, [
      expect.stringMatching(/^site\/images\/.+\.png$/),
      "site/images/restored-by-owner.png",
    ]);
  });

  it("restores source media to an exact guarded R2 key", async () => {
    const key = "site/images/restored.png";
    const rejected = await restoreMedia(guardedHarness, key, "image/png", pngBytes);
    const accepted = await restoreMedia(guardedHarness, key, "image/png", pngBytes, {
      Authorization: `Bearer ${adminToken}`,
    });

    expect(rejected.status).toBe(401);
    expect(accepted.status).toBe(200);
    expect((await accepted.json()) as unknown).toEqual({
      contentType: "image/png",
      href: `/api/site/media/${key}`,
      key,
      size: pngBytes.byteLength,
    });
    await expectMediaBucketKeys(guardedHarness, [key]);

    const served = await guardedHarness.fetch(`/api/site/media/${key}`);

    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(pngBytes);
  });

  it("rejects invalid source media restore keys and mismatched content types", async () => {
    const invalidKey = await restoreMedia(harness, "site/videos/clip.mp4", "video/mp4", pngBytes);
    const mismatchedContentType = await restoreMedia(
      harness,
      "site/images/restored.png",
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

  it("keeps public media reads open when the admin token is configured", async () => {
    const bucket = await guardedHarness.mf.getR2Bucket(mediaBinding);
    const key = "site/images/public.png";

    await bucket.put(key, pngBytes, {
      httpMetadata: {
        cacheControl: SITE_MEDIA_CACHE_CONTROL,
        contentType: "image/png",
      },
    });

    const response = await guardedHarness.fetch(`/api/site/media/${key}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pngBytes);
  });

  it("returns HEAD headers for public media without a response body", async () => {
    const bucket = await harness.mf.getR2Bucket(mediaBinding);
    const key = "site/images/head.png";

    await bucket.put(key, pngBytes, {
      httpMetadata: {
        cacheControl: SITE_MEDIA_CACHE_CONTROL,
        contentType: "image/png",
      },
    });

    const getResponse = await harness.fetch(`/api/site/media/${key}`);
    const headResponse = await harness.fetch(`/api/site/media/${key}`, { method: "HEAD" });

    expect(headResponse.status).toBe(getResponse.status);
    expect(headResponse.headers.get("Content-Type")).toBe(getResponse.headers.get("Content-Type"));
    expect(headResponse.headers.get("Cache-Control")).toBe(
      getResponse.headers.get("Cache-Control"),
    );
    expect(headResponse.headers.get("ETag")).toBe(getResponse.headers.get("ETag"));
    expect((await headResponse.arrayBuffer()).byteLength).toBe(0);
  });

  it("returns 404 for missing public media objects", async () => {
    const response = await harness.fetch("/api/site/media/site/images/missing.png");

    expect(response.status).toBe(404);
    expect((await response.json()) as { error: string }).toEqual({
      error: "Media object not found.",
    });
  });

  it("returns HEAD missing-media headers without a response body", async () => {
    const getResponse = await harness.fetch("/api/site/media/site/images/missing.png");
    const headResponse = await harness.fetch("/api/site/media/site/images/missing.png", {
      method: "HEAD",
    });

    expect(headResponse.status).toBe(getResponse.status);
    expect(headResponse.headers.get("Content-Type")).toBe(getResponse.headers.get("Content-Type"));
    expect(await headResponse.text()).toBe("");
  });
});

async function uploadImage(harness: Harness, file: TestFile, headers: Record<string, string> = {}) {
  return uploadForm(harness, multipartFormData([file]), headers);
}

async function uploadInstalledImage(
  harness: Harness,
  installId: string,
  file: TestFile,
  headers: Record<string, string> = {},
) {
  return uploadForm(
    harness,
    multipartFormData([file]),
    headers,
    `/api/app-installs/site/${installId}/media/images`,
  );
}

async function uploadForm(
  harness: Harness,
  formData: ReturnType<typeof multipartFormData>,
  headers: Record<string, string> = {},
  path = "/api/site/media/images",
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

async function restoreMedia(
  harness: Harness,
  key: string,
  contentType: string,
  body: Uint8Array,
  headers: Record<string, string> = {},
) {
  return harness.fetch(`/api/site/media/${key}`, {
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

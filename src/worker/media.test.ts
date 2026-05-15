import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { createWorkerHarness } from "./miniflare-test.ts";
import { SITE_IMAGE_UPLOAD_MAX_BYTES, SITE_MEDIA_CACHE_CONTROL } from "./media.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;
type HarnessResponse = Awaited<ReturnType<Harness["fetch"]>>;

const adminToken = "test-admin-token";
const mediaBinding = "FORMLESS_MEDIA";
const mediaBuckets = [mediaBinding];
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

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
      bindings: { FORMLESS_ADMIN_TOKEN: adminToken },
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
      contentType: string;
      href: string;
      key: string;
      size: number;
    };

    expect(body).toEqual({
      contentType: "image/png",
      href: expect.stringMatching(/^\/api\/site\/media\/site\/images\/.+\.png$/),
      key: expect.stringMatching(/^site\/images\/.+\.png$/),
      size: pngBytes.byteLength,
    });

    const served = await harness.fetch(body.href);

    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("image/png");
    expect(served.headers.get("Cache-Control")).toBe(SITE_MEDIA_CACHE_CONTROL);
    expect(served.headers.get("ETag")).toEqual(expect.stringContaining('"'));
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(pngBytes);
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
      error: "Admin authorization is required for this write endpoint.",
    });
    expect(accepted.status).toBe(200);
    await expectMediaBucketKeys(guardedHarness, [expect.stringMatching(/^site\/images\/.+\.png$/)]);
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

  it("returns 404 for missing public media objects", async () => {
    const response = await harness.fetch("/api/site/media/site/images/missing.png");

    expect(response.status).toBe(404);
    expect((await response.json()) as { error: string }).toEqual({
      error: "Media object not found.",
    });
  });
});

async function uploadImage(harness: Harness, file: TestFile, headers: Record<string, string> = {}) {
  return uploadForm(harness, multipartFormData([file]), headers);
}

async function uploadForm(
  harness: Harness,
  formData: ReturnType<typeof multipartFormData>,
  headers: Record<string, string> = {},
) {
  return harness.fetch("/api/site/media/images", {
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

async function expectResponseStatus(response: HarnessResponse, status: number) {
  expect({
    body: await response.clone().text(),
    status: response.status,
  }).toEqual({
    body: expect.any(String),
    status,
  });
}

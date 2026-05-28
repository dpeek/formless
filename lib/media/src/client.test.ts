import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";
import {
  coreImageMediaAssetOptionForId,
  listCoreImageMediaAssets,
  parseImageMediaListResponse,
  parseImageMediaUploadResponse,
  uploadCoreImageMediaFile,
} from "./client.ts";

describe("Media client adapter", () => {
  it("stays free of React and generated UI imports", async () => {
    const source = await readFile(fileURLToPath(new URL("./client.ts", import.meta.url)), "utf8");

    expect(source).not.toMatch(
      /\bfrom\s+["'][^"']*(?:react|generated|record-field|\.tsx)[^"']*["']/i,
    );
    expect(source).not.toMatch(
      /\bimport\s+["'][^"']*(?:react|generated|record-field|\.tsx)[^"']*["']/i,
    );
  });

  it("preserves core image upload request and response behavior", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "hero.png", { type: "image/png" });
    const upload = {
      asset: {
        byteSize: 3,
        contentType: "image/png",
        deliveryHref: "/api/formless/media/media/images/uploaded.png",
        filename: "hero.png",
        id: "uploaded.png",
        kind: "image" as const,
        label: "hero.png",
        provider: "r2",
        status: "ready" as const,
        storageKey: "media/images/uploaded.png",
      },
      assetId: "uploaded.png",
      contentType: "image/png",
      href: "/api/formless/media/media/images/uploaded.png",
      key: "media/images/uploaded.png",
      size: 3,
    };

    await expect(
      uploadCoreImageMediaFile(file, {
        fetcher: async (input, init) => {
          expect(input).toBe("/api/formless/media/images");
          expect(init?.method).toBe("POST");
          expect(init?.headers).toEqual({ Accept: "application/json" });
          expect(init?.body).toBeInstanceOf(FormData);

          if (!(init?.body instanceof FormData)) {
            throw new Error("Expected multipart form data.");
          }

          expect(init.body.get("file")).toBe(file);

          return Response.json(upload);
        },
        readDimensions: async (uploadedFile) => {
          expect(uploadedFile).toBe(file);

          return { height: 630, width: 1200 };
        },
      }),
    ).resolves.toEqual({
      ...upload,
      dimensions: { height: 630, width: 1200 },
    });
  });

  it("preserves upload parser errors", async () => {
    await expect(
      parseImageMediaUploadResponse(
        Response.json({ error: "Unsupported image type." }, { status: 415 }),
      ),
    ).rejects.toThrow("Unsupported image type.");
    await expect(parseImageMediaUploadResponse(Response.json({}, { status: 500 }))).rejects.toThrow(
      "Image upload failed with status 500.",
    );
    await expect(
      parseImageMediaUploadResponse(Response.json({ href: "/missing" })),
    ).rejects.toThrow("Image upload returned an invalid response.");
  });

  it("preserves core image list request, response, and option mapping behavior", async () => {
    await expect(
      listCoreImageMediaAssets({
        fetcher: async (input, init) => {
          expect(input).toBe("/api/formless/media/images");
          expect(init?.headers).toEqual({ Accept: "application/json" });

          return Response.json({
            assets: [
              {
                byteSize: 4,
                contentType: "image/webp",
                deliveryHref: "/api/formless/media/media/images/cover.webp",
                filename: "cover.webp",
                height: 640,
                id: "cover.webp",
                kind: "image",
                label: "Cover",
                provider: "r2",
                status: "ready",
                storageKey: "media/images/cover.webp",
                width: 960,
              },
            ],
          });
        },
      }),
    ).resolves.toEqual([
      {
        height: 640,
        href: "/api/formless/media/media/images/cover.webp",
        id: "cover.webp",
        label: "Cover",
        width: 960,
      },
    ]);
    expect(coreImageMediaAssetOptionForId("cover.webp")).toEqual({
      href: "/api/formless/media/media/images/cover.webp",
      id: "cover.webp",
      label: "cover.webp",
    });
    expect(coreImageMediaAssetOptionForId("../cover.webp")).toBeUndefined();
  });

  it("preserves list parser errors", async () => {
    await expect(
      parseImageMediaListResponse(Response.json({ error: "List failed." }, { status: 500 })),
    ).rejects.toThrow("List failed.");
    await expect(parseImageMediaListResponse(Response.json({}, { status: 503 }))).rejects.toThrow(
      "Media asset list failed with status 503.",
    );
    await expect(parseImageMediaListResponse(Response.json({ assets: [{}] }))).rejects.toThrow(
      "Media asset list returned an invalid response.",
    );
  });
});

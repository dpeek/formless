import { describe, expect, it } from "vite-plus/test";
import {
  coreImageMediaAssetOptionForId,
  listCoreImageMediaAssets,
  siteImageUploadPatchValues,
  uploadCoreImageMediaFile,
  uploadSiteImageFile,
  type ImageDimensions,
} from "./media.ts";

describe("media client helpers", () => {
  it("uploads core image media assets to the instance media route", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "hero.png", { type: "image/png" });

    const result = await uploadCoreImageMediaFile(file, {
      fetcher: async (input, init) => {
        expect(input).toBe("/api/formless/media/images");
        expect(init?.method).toBe("POST");
        expect(init?.headers).toEqual({ Accept: "application/json" });

        return Response.json({
          asset: {
            byteSize: 3,
            contentType: "image/png",
            deliveryHref: "/api/formless/media/media/images/uploaded.png",
            filename: "hero.png",
            id: "uploaded.png",
            kind: "image",
            label: "hero.png",
            provider: "r2",
            status: "ready",
            storageKey: "media/images/uploaded.png",
          },
          assetId: "uploaded.png",
          contentType: "image/png",
          href: "/api/formless/media/media/images/uploaded.png",
          key: "media/images/uploaded.png",
          size: 3,
        });
      },
      readDimensions: async () => undefined,
    });

    expect(result.assetId).toBe("uploaded.png");
    expect(result.href).toBe("/api/formless/media/media/images/uploaded.png");
  });

  it("lists and resolves core image media assets", async () => {
    await expect(
      listCoreImageMediaAssets({
        fetcher: async (input, init) => {
          expect(input).toBe("/api/formless/media/images");
          expect(init?.headers).toEqual({ Accept: "application/json" });

          return Response.json({
            assets: [
              {
                byteSize: 3,
                contentType: "image/webp",
                deliveryHref: "/api/formless/media/media/images/cover.webp",
                filename: "cover.webp",
                id: "cover.webp",
                kind: "image",
                label: "cover.webp",
                provider: "r2",
                status: "ready",
                storageKey: "media/images/cover.webp",
              },
            ],
          });
        },
      }),
    ).resolves.toEqual([
      {
        href: "/api/formless/media/media/images/cover.webp",
        id: "cover.webp",
        label: "cover.webp",
      },
    ]);
    expect(coreImageMediaAssetOptionForId("cover.webp")).toEqual({
      href: "/api/formless/media/media/images/cover.webp",
      id: "cover.webp",
      label: "cover.webp",
    });
    expect(coreImageMediaAssetOptionForId("../cover.webp")).toBeUndefined();
  });

  it("keeps the Site upload helper on the core image media route", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "hero.png", { type: "image/png" });
    const dimensions = { height: 630, width: 1200 } satisfies ImageDimensions;
    const result = await uploadSiteImageFile(file, {
      fetcher: async (input, init) => {
        expect(input).toBe("/api/formless/media/images");
        expect(init?.method).toBe("POST");
        expect(init?.headers).toEqual({ Accept: "application/json" });
        const body = init?.body;

        expect(body).toBeInstanceOf(FormData);

        if (!(body instanceof FormData)) {
          throw new Error("Expected multipart form data.");
        }

        expect(body.get("file")).toBe(file);

        return Response.json({
          asset: {
            byteSize: 3,
            contentType: "image/png",
            deliveryHref: "/api/formless/media/media/images/uploaded.png",
            filename: "hero.png",
            id: "uploaded.png",
            kind: "image",
            label: "hero.png",
            provider: "r2",
            status: "ready",
            storageKey: "media/images/uploaded.png",
          },
          assetId: "uploaded.png",
          contentType: "image/png",
          href: "/api/formless/media/media/images/uploaded.png",
          key: "media/images/uploaded.png",
          size: 3,
        });
      },
      readDimensions: async (uploadedFile) => {
        expect(uploadedFile).toBe(file);

        return dimensions;
      },
    });

    expect(result).toEqual({
      asset: {
        byteSize: 3,
        contentType: "image/png",
        deliveryHref: "/api/formless/media/media/images/uploaded.png",
        filename: "hero.png",
        id: "uploaded.png",
        kind: "image",
        label: "hero.png",
        provider: "r2",
        status: "ready",
        storageKey: "media/images/uploaded.png",
      },
      assetId: "uploaded.png",
      contentType: "image/png",
      dimensions,
      href: "/api/formless/media/media/images/uploaded.png",
      key: "media/images/uploaded.png",
      size: 3,
    });
  });

  it("keeps upload errors before generated editors patch records", async () => {
    const file = new File([new Uint8Array([1])], "hero.txt", { type: "text/plain" });

    await expect(
      uploadSiteImageFile(file, {
        fetcher: async () => Response.json({ error: "Unsupported image type." }, { status: 415 }),
        readDimensions: async () => {
          throw new Error("dimension reader should not matter");
        },
      }),
    ).rejects.toThrow("Unsupported image type.");
  });

  it("builds flat patch values for media assets and optional dimensions", () => {
    expect(
      siteImageUploadPatchValues({
        heightFieldName: "height",
        hrefFieldName: "href",
        mediaAssetFieldName: "mediaAsset",
        upload: {
          asset: {
            byteSize: 10,
            contentType: "image/webp",
            deliveryHref: "/api/formless/media/media/images/uploaded.webp",
            id: "uploaded.webp",
            kind: "image",
            label: "uploaded.webp",
            provider: "r2",
            status: "ready",
            storageKey: "media/images/uploaded.webp",
          },
          assetId: "uploaded.webp",
          contentType: "image/webp",
          dimensions: { height: 300, width: 400 },
          href: "/api/formless/media/media/images/uploaded.webp",
          key: "media/images/uploaded.webp",
          size: 10,
        },
        widthFieldName: "width",
      }),
    ).toEqual({
      mediaAsset: "uploaded.webp",
      width: 400,
      height: 300,
    });
    expect(
      siteImageUploadPatchValues({
        mediaAssetFieldName: "mediaAssetId",
        upload: {
          assetId: "asset-only.webp",
          contentType: "image/webp",
          href: "/api/formless/media/media/images/asset-only.webp",
          key: "media/images/asset-only.webp",
          size: 10,
        },
      }),
    ).toEqual({
      mediaAssetId: "asset-only.webp",
    });
    expect(
      siteImageUploadPatchValues({
        hrefFieldName: "href",
        upload: {
          contentType: "image/webp",
          href: "/manual/uploaded.webp",
          key: "media/images/uploaded.webp",
          size: 10,
        },
      }),
    ).toEqual({
      href: "/manual/uploaded.webp",
    });
  });
});

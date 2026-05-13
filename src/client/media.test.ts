import { describe, expect, it } from "vite-plus/test";
import { siteImageUploadPatchValues, uploadSiteImageFile, type ImageDimensions } from "./media.ts";

describe("Site media client helper", () => {
  it("uploads one file as multipart form data and returns dimensions when available", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "hero.png", { type: "image/png" });
    const dimensions = { height: 630, width: 1200 } satisfies ImageDimensions;
    const result = await uploadSiteImageFile(file, {
      fetcher: async (input, init) => {
        expect(input).toBe("/api/site/media/images");
        expect(init?.method).toBe("POST");
        expect(init?.headers).toEqual({ Accept: "application/json" });
        const body = init?.body;

        expect(body).toBeInstanceOf(FormData);

        if (!(body instanceof FormData)) {
          throw new Error("Expected multipart form data.");
        }

        expect(body.get("file")).toBe(file);

        return Response.json({
          contentType: "image/png",
          href: "/api/site/media/site/images/uploaded.png",
          key: "site/images/uploaded.png",
          size: 3,
        });
      },
      readDimensions: async (uploadedFile) => {
        expect(uploadedFile).toBe(file);

        return dimensions;
      },
    });

    expect(result).toEqual({
      contentType: "image/png",
      dimensions,
      href: "/api/site/media/site/images/uploaded.png",
      key: "site/images/uploaded.png",
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

  it("builds flat patch values for href and optional dimensions", () => {
    expect(
      siteImageUploadPatchValues({
        heightFieldName: "height",
        hrefFieldName: "href",
        upload: {
          contentType: "image/webp",
          dimensions: { height: 300, width: 400 },
          href: "/api/site/media/site/images/uploaded.webp",
          key: "site/images/uploaded.webp",
          size: 10,
        },
        widthFieldName: "width",
      }),
    ).toEqual({
      href: "/api/site/media/site/images/uploaded.webp",
      width: 400,
      height: 300,
    });
    expect(
      siteImageUploadPatchValues({
        hrefFieldName: "href",
        upload: {
          contentType: "image/webp",
          href: "/api/site/media/site/images/uploaded.webp",
          key: "site/images/uploaded.webp",
          size: 10,
        },
      }),
    ).toEqual({
      href: "/api/site/media/site/images/uploaded.webp",
    });
  });
});

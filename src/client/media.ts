import type { RecordValues } from "../shared/protocol.ts";

export const SITE_IMAGE_UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export type SiteImageUploadResponse = {
  contentType: string;
  href: string;
  key: string;
  size: number;
};

export type ImageDimensions = {
  height: number;
  width: number;
};

export type UploadedSiteImage = SiteImageUploadResponse & {
  dimensions?: ImageDimensions;
};

type UploadSiteImageFileOptions = {
  fetcher?: typeof fetch;
  readDimensions?: (file: File) => Promise<ImageDimensions | undefined>;
};

export async function uploadSiteImageFile(
  file: File,
  options: UploadSiteImageFileOptions = {},
): Promise<UploadedSiteImage> {
  const fetcher = options.fetcher ?? fetch;
  const formData = new FormData();

  formData.set("file", file);

  const response = await fetcher("/api/site/media/images", {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    body: formData,
  });
  const upload = await parseSiteImageUploadResponse(response);
  const readDimensions = options.readDimensions ?? readImageDimensions;
  let dimensions: ImageDimensions | undefined;

  try {
    dimensions = await readDimensions(file);
  } catch {
    dimensions = undefined;
  }

  return dimensions === undefined ? upload : { ...upload, dimensions };
}

export function siteImageUploadPatchValues({
  heightFieldName,
  hrefFieldName,
  upload,
  widthFieldName,
}: {
  heightFieldName?: string;
  hrefFieldName: string;
  upload: UploadedSiteImage;
  widthFieldName?: string;
}): Partial<RecordValues> {
  const values: Partial<RecordValues> = {
    [hrefFieldName]: upload.href,
  };

  if (upload.dimensions && widthFieldName && heightFieldName) {
    values[widthFieldName] = upload.dimensions.width;
    values[heightFieldName] = upload.dimensions.height;
  }

  return values;
}

export async function readImageDimensions(file: File): Promise<ImageDimensions | undefined> {
  if (
    typeof Image === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof URL.revokeObjectURL !== "function"
  ) {
    return undefined;
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise<ImageDimensions | undefined>((resolve) => {
      const image = new Image();

      image.onload = () => {
        const width = image.naturalWidth;
        const height = image.naturalHeight;

        resolve(
          Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
            ? { height, width }
            : undefined,
        );
      };
      image.onerror = () => resolve(undefined);
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function parseSiteImageUploadResponse(response: Response): Promise<SiteImageUploadResponse> {
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const message = isErrorResponse(body)
      ? body.error
      : `Image upload failed with status ${response.status}.`;

    throw new Error(message);
  }

  if (!isSiteImageUploadResponse(body)) {
    throw new Error("Image upload returned an invalid response.");
  }

  return body;
}

function isSiteImageUploadResponse(value: unknown): value is SiteImageUploadResponse {
  return (
    isRecord(value) &&
    typeof value.contentType === "string" &&
    typeof value.href === "string" &&
    typeof value.key === "string" &&
    typeof value.size === "number"
  );
}

function isErrorResponse(value: unknown): value is { error: string } {
  return isRecord(value) && typeof value.error === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

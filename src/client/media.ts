import type { RecordValues } from "../shared/protocol.ts";
import {
  CORE_IMAGE_UPLOAD_PATH,
  coreImageMediaDeliveryFactsForAssetId,
  type MediaAsset,
} from "../media/core.ts";
import { appStorageIdentityForClientTarget, type ClientAppTarget } from "./app-target.ts";

export const IMAGE_UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
export const SITE_IMAGE_UPLOAD_ACCEPT = IMAGE_UPLOAD_ACCEPT;

export type ImageMediaUploadResponse = {
  asset?: MediaAsset;
  assetId?: string;
  contentType: string;
  href: string;
  key: string;
  size: number;
};

export type SiteImageUploadResponse = ImageMediaUploadResponse;

export type ImageDimensions = {
  height: number;
  width: number;
};

export type UploadedImageMedia = ImageMediaUploadResponse & {
  dimensions?: ImageDimensions;
};

export type UploadedSiteImage = UploadedImageMedia;

export type ImageMediaAssetOption = {
  height?: number;
  href: string;
  id: string;
  label: string;
  width?: number;
};

type UploadImageMediaFileOptions = {
  fetcher?: typeof fetch;
  readDimensions?: (file: File) => Promise<ImageDimensions | undefined>;
};

type UploadSiteImageFileOptions = UploadImageMediaFileOptions & {
  target?: ClientAppTarget;
};

export async function uploadCoreImageMediaFile(
  file: File,
  options: UploadImageMediaFileOptions = {},
): Promise<UploadedImageMedia> {
  return uploadImageMediaFile(file, CORE_IMAGE_UPLOAD_PATH, options);
}

export async function uploadSiteImageFile(
  file: File,
  options: UploadSiteImageFileOptions = {},
): Promise<UploadedSiteImage> {
  return uploadImageMediaFile(
    file,
    siteImageUploadPathForTarget(options.target ?? "site"),
    options,
  );
}

async function uploadImageMediaFile(
  file: File,
  uploadPath: string,
  options: UploadImageMediaFileOptions,
): Promise<UploadedImageMedia> {
  const fetcher = options.fetcher ?? fetch;
  const formData = new FormData();

  formData.set("file", file);

  const response = await fetcher(uploadPath, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    body: formData,
  });
  const upload = await parseImageMediaUploadResponse(response);
  const readDimensions = options.readDimensions ?? readImageDimensions;
  let dimensions: ImageDimensions | undefined;

  try {
    dimensions = await readDimensions(file);
  } catch {
    dimensions = undefined;
  }

  return dimensions === undefined ? upload : { ...upload, dimensions };
}

function siteImageUploadPathForTarget(target: ClientAppTarget): string {
  const media = appStorageIdentityForClientTarget(target).siteMedia;

  if (!media) {
    throw new Error("Image upload is only available for Site records.");
  }

  return media.imageUploadPath;
}

export function siteImageUploadPatchValues({
  heightFieldName,
  hrefFieldName,
  mediaAssetFieldName,
  upload,
  widthFieldName,
}: {
  heightFieldName?: string;
  hrefFieldName?: string;
  mediaAssetFieldName?: string;
  upload: UploadedSiteImage;
  widthFieldName?: string;
}): Partial<RecordValues> {
  const values: Partial<RecordValues> = {};

  if (hrefFieldName) {
    values[hrefFieldName] = upload.href;
  }

  if (upload.dimensions && widthFieldName && heightFieldName) {
    values[widthFieldName] = upload.dimensions.width;
    values[heightFieldName] = upload.dimensions.height;
  }

  const mediaAssetId = upload.assetId ?? upload.asset?.id;

  if (mediaAssetFieldName && mediaAssetId) {
    values[mediaAssetFieldName] = mediaAssetId;
  }

  return values;
}

export function coreImageMediaAssetOptionForId(assetId: string): ImageMediaAssetOption | undefined {
  const delivery = coreImageMediaDeliveryFactsForAssetId(assetId);

  if (!delivery) {
    return undefined;
  }

  return {
    href: delivery.href,
    id: delivery.assetId,
    label: delivery.assetId,
  };
}

export async function listCoreImageMediaAssets(
  options: { fetcher?: typeof fetch } = {},
): Promise<ImageMediaAssetOption[]> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(CORE_IMAGE_UPLOAD_PATH, {
    headers: {
      Accept: "application/json",
    },
  });
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const message = isErrorResponse(body)
      ? body.error
      : `Media asset list failed with status ${response.status}.`;

    throw new Error(message);
  }

  if (!isImageMediaAssetListResponse(body)) {
    throw new Error("Media asset list returned an invalid response.");
  }

  return body.assets.map(mediaAssetOptionFromAsset);
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

async function parseImageMediaUploadResponse(
  response: Response,
): Promise<ImageMediaUploadResponse> {
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const message = isErrorResponse(body)
      ? body.error
      : `Image upload failed with status ${response.status}.`;

    throw new Error(message);
  }

  if (!isImageMediaUploadResponse(body)) {
    throw new Error("Image upload returned an invalid response.");
  }

  return body;
}

function isImageMediaUploadResponse(value: unknown): value is ImageMediaUploadResponse {
  return (
    isRecord(value) &&
    typeof value.contentType === "string" &&
    typeof value.href === "string" &&
    typeof value.key === "string" &&
    typeof value.size === "number" &&
    (!("assetId" in value) || typeof value.assetId === "string") &&
    (!("asset" in value) || isMediaAsset(value.asset))
  );
}

function isImageMediaAssetListResponse(value: unknown): value is { assets: MediaAsset[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.assets) &&
    value.assets.every((asset) => isMediaAsset(asset))
  );
}

function mediaAssetOptionFromAsset(asset: MediaAsset): ImageMediaAssetOption {
  return {
    ...(asset.height === undefined ? {} : { height: asset.height }),
    href: asset.deliveryHref,
    id: asset.id,
    label: asset.label,
    ...(asset.width === undefined ? {} : { width: asset.width }),
  };
}

function isMediaAsset(value: unknown): value is MediaAsset {
  return (
    isRecord(value) &&
    typeof value.byteSize === "number" &&
    typeof value.contentType === "string" &&
    typeof value.deliveryHref === "string" &&
    (!("filename" in value) || typeof value.filename === "string") &&
    (!("height" in value) || typeof value.height === "number") &&
    typeof value.id === "string" &&
    value.kind === "image" &&
    typeof value.label === "string" &&
    typeof value.provider === "string" &&
    value.status === "ready" &&
    typeof value.storageKey === "string" &&
    (!("width" in value) || typeof value.width === "number")
  );
}

function isErrorResponse(value: unknown): value is { error: string } {
  return isRecord(value) && typeof value.error === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

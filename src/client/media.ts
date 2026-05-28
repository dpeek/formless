// Compatibility shim for pre-extraction client Media imports.
// New code imports the Media client package subpath directly.
import {
  IMAGE_UPLOAD_ACCEPT,
  uploadCoreImageMediaFile,
  type ImageMediaUploadResponse,
  type UploadImageMediaFileOptions,
  type UploadedImageMedia,
} from "@dpeek/formless-media/client";
import type { RecordValues } from "../shared/protocol.ts";
import type { ClientAppTarget } from "./app-target.ts";

export {
  IMAGE_UPLOAD_ACCEPT,
  coreImageMediaAssetOptionForId,
  listCoreImageMediaAssets,
  mediaAssetOptionFromAsset,
  parseImageMediaListResponse,
  parseImageMediaUploadResponse,
  readImageDimensions,
  uploadCoreImageMediaFile,
} from "@dpeek/formless-media/client";
export type {
  ImageDimensions,
  ImageMediaAssetOption,
  ImageMediaListResponse,
  ImageMediaUploadResponse,
  ListCoreImageMediaAssetsOptions,
  MediaAsset,
  UploadImageMediaFileOptions,
  UploadedImageMedia,
} from "@dpeek/formless-media/client";

export const SITE_IMAGE_UPLOAD_ACCEPT = IMAGE_UPLOAD_ACCEPT;

export type SiteImageUploadResponse = ImageMediaUploadResponse;
export type UploadedSiteImage = UploadedImageMedia;

type UploadSiteImageFileOptions = UploadImageMediaFileOptions & {
  target?: ClientAppTarget;
};

export async function uploadSiteImageFile(
  file: File,
  options: UploadSiteImageFileOptions = {},
): Promise<UploadedSiteImage> {
  return uploadCoreImageMediaFile(file, options);
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

  if (upload.dimensions && widthFieldName && heightFieldName) {
    values[widthFieldName] = upload.dimensions.width;
    values[heightFieldName] = upload.dimensions.height;
  }

  const mediaAssetId = upload.assetId ?? upload.asset?.id;

  if (mediaAssetFieldName && mediaAssetId) {
    values[mediaAssetFieldName] = mediaAssetId;
  } else if (hrefFieldName) {
    values[hrefFieldName] = upload.href;
  }

  return values;
}

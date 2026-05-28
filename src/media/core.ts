// Compatibility shim for pre-extraction Media core imports.
// New code imports public Media package subpaths directly.
export {
  CORE_IMAGE_KEY_PREFIX,
  CORE_IMAGE_UPLOAD_PATH,
  CORE_MEDIA_ROUTE_PREFIX,
  MEDIA_ASSET_METADATA_KEYS,
  MEDIA_IMAGE_UPLOAD_MAX_BYTES,
  MEDIA_OBJECT_CACHE_CONTROL,
} from "@dpeek/formless-media";
export type {
  ImageMediaListResponse,
  ImageMediaRestoreResponse,
  ImageMediaUploadResponse,
  MediaAsset,
  MediaAssetDeliveryFacts,
  MediaAssetMetadata,
  MediaDeliveryFacts,
  MediaImageFile,
  MediaObjectList,
  MediaObjectMetadata,
  MediaObjectStore,
  MediaObjectWrite,
  MediaStorageKey,
  MediaStoredObject,
  MediaStoredObjectListing,
  MediaWriteResponse,
  MediaWriteResult,
} from "@dpeek/formless-media";
export {
  coreImageMediaDeliveryFactsForAssetId,
  coreMediaHrefForKey,
  coreMediaKeyFromAssetId,
  coreMediaKeyFromHref,
  imageMediaContentTypeForKey,
  imageMediaDeliveryFactsForAssetId,
  imageMediaExtensionForContentType,
  isRestorableImageMediaKey,
  isValidMediaStorageKey,
  mediaAssetFromObjectMetadata,
} from "@dpeek/formless-media";
export {
  deliveryFactsForMediaObject,
  listImageMediaAssets,
  restoreImageMedia,
  uploadImageMedia,
} from "@dpeek/formless-media/worker";

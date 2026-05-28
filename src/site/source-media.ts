import type { StoredRecord } from "../shared/protocol.ts";
import {
  CORE_IMAGE_KEY_PREFIX,
  coreMediaHrefForKey,
  coreMediaKeyFromAssetId,
  coreMediaKeyFromHref,
  imageMediaContentTypeForKey,
  imageMediaExtensionForContentType,
  isRestorableImageMediaKey,
} from "@dpeek/formless-media";

const SITE_MEDIA_ROUTE_PREFIX = "/api/site/media/";
const INSTALLED_SITE_MEDIA_ROUTE_PREFIX = "/api/app-installs/site/";
export const SITE_SOURCE_MEDIA_ROOT = "schema/apps/site/media";

export type SiteSourceMediaAsset = {
  contentType: string;
  href: string;
  key: string;
  sourcePath: string;
};

export function siteImageExtensionForContentType(contentType: string): string | undefined {
  return imageMediaExtensionForContentType(contentType);
}

export function siteMediaContentTypeForKey(key: string): string | undefined {
  return imageMediaContentTypeForKey(key);
}

export function isLegacySiteMediaHref(href: string): boolean {
  return (
    href.startsWith(SITE_MEDIA_ROUTE_PREFIX) ||
    (href.startsWith(INSTALLED_SITE_MEDIA_ROUTE_PREFIX) &&
      /^\/api\/app-installs\/site\/[^/]+\/media\//.test(href))
  );
}

export function unsupportedLegacySiteMediaMessage(href: string, workflow: string): string {
  return `Unsupported legacy Site media href "${href}". Use core media before ${workflow}.`;
}

export function siteSourceMediaAssetsFromRecords(records: StoredRecord[]): SiteSourceMediaAsset[] {
  const assetsByKey = new Map<string, SiteSourceMediaAsset>();

  for (const record of records) {
    if (record.deletedAt !== undefined) {
      continue;
    }

    const href = record.values.href;

    if (typeof href === "string") {
      if (isLegacySiteMediaHref(href)) {
        throw new Error(unsupportedLegacySiteMediaMessage(href, "source Site media collection"));
      }

      const key = coreMediaKeyFromHref(href);

      if (key) {
        if (!isRestorableCoreMediaKey(key)) {
          throw new Error(`Core media href "${href}" uses unsupported source media key "${key}".`);
        }

        setSiteSourceMediaAsset(assetsByKey, key);
      }
    }

    const mediaAssetId = record.values.mediaAssetId;
    const mediaAssetKey =
      typeof mediaAssetId === "string" ? coreMediaKeyFromAssetId(mediaAssetId) : undefined;

    if (mediaAssetKey) {
      setSiteSourceMediaAsset(assetsByKey, mediaAssetKey);
    }
  }

  return [...assetsByKey.values()].sort((left, right) => left.key.localeCompare(right.key));
}

export function siteSourceMediaPathForKey(key: string): string {
  if (!isRestorableCoreMediaKey(key)) {
    throw new Error(`Site source media key is not core image media: ${key}`);
  }

  return `${SITE_SOURCE_MEDIA_ROOT}/${key}`;
}

function isRestorableCoreMediaKey(key: string): boolean {
  return isRestorableImageMediaKey(key, { keyPrefix: `${CORE_IMAGE_KEY_PREFIX}/` });
}

function setSiteSourceMediaAsset(assetsByKey: Map<string, SiteSourceMediaAsset>, key: string) {
  if (assetsByKey.has(key)) {
    return;
  }

  assetsByKey.set(key, {
    contentType: siteMediaContentTypeForKey(key) ?? "application/octet-stream",
    href: coreMediaHrefForKey(key),
    key,
    sourcePath: siteSourceMediaPathForKey(key),
  });
}

import type { StoredRecord } from "../shared/protocol.ts";
import {
  imageMediaDeliveryFactsForAssetId,
  imageMediaContentTypeForKey,
  imageMediaExtensionForContentType,
  isRestorableImageMediaKey,
  isValidMediaStorageKey,
} from "../media/core.ts";

export const SITE_MEDIA_ROUTE_PREFIX = "/api/site/media/";
export const SITE_IMAGE_KEY_PREFIX = "site/images/";
export const SITE_SOURCE_MEDIA_ROOT = "schema/apps/site/media";

export type SiteSourceMediaAsset = {
  contentType: string;
  href: string;
  key: string;
  sourcePath: string;
};

export type SiteMediaDeliveryFacts = {
  assetId: string;
  href: string;
  kind: "image";
};

export function siteImageExtensionForContentType(contentType: string): string | undefined {
  return imageMediaExtensionForContentType(contentType);
}

export function siteMediaContentTypeForKey(key: string): string | undefined {
  return imageMediaContentTypeForKey(key);
}

export function siteMediaHrefForKey(key: string): string {
  return `${SITE_MEDIA_ROUTE_PREFIX}${key}`;
}

export function siteMediaDeliveryFactsForAssetId(
  assetId: string,
): SiteMediaDeliveryFacts | undefined {
  const facts = imageMediaDeliveryFactsForAssetId(assetId, {
    hrefForKey: siteMediaHrefForKey,
    keyPrefix: SITE_IMAGE_KEY_PREFIX,
  });

  return facts
    ? {
        assetId: facts.assetId,
        href: facts.href,
        kind: facts.kind,
      }
    : undefined;
}

export function siteMediaKeyFromHref(href: string): string | undefined {
  if (!href.startsWith(SITE_MEDIA_ROUTE_PREFIX)) {
    return undefined;
  }

  const url = new URL(href, "https://formless.local");
  const key = siteMediaKeyFromPathname(url.pathname);

  return key && isValidMediaStorageKey(key) ? key : undefined;
}

export function siteMediaKeyFromPathname(pathname: string): string | undefined {
  const key = pathname.startsWith(SITE_MEDIA_ROUTE_PREFIX)
    ? pathname.slice(SITE_MEDIA_ROUTE_PREFIX.length)
    : "";

  return isValidMediaStorageKey(key) ? key : undefined;
}

export function isRestorableSiteMediaKey(key: string): boolean {
  return isRestorableImageMediaKey(key, { keyPrefix: SITE_IMAGE_KEY_PREFIX });
}

export function siteSourceMediaAssetsFromRecords(records: StoredRecord[]): SiteSourceMediaAsset[] {
  const assetsByKey = new Map<string, SiteSourceMediaAsset>();

  for (const record of records) {
    if (record.deletedAt !== undefined) {
      continue;
    }

    const href = record.values.href;

    if (typeof href !== "string") {
      continue;
    }

    const key = siteMediaKeyFromHref(href);

    if (!key) {
      continue;
    }

    if (!isRestorableSiteMediaKey(key)) {
      throw new Error(`Site media href "${href}" uses unsupported source media key "${key}".`);
    }

    if (!assetsByKey.has(key)) {
      assetsByKey.set(key, {
        contentType: siteMediaContentTypeForKey(key) ?? "application/octet-stream",
        href: siteMediaHrefForKey(key),
        key,
        sourcePath: siteSourceMediaPathForKey(key),
      });
    }
  }

  return [...assetsByKey.values()].sort((left, right) => left.key.localeCompare(right.key));
}

export function siteSourceMediaPathForKey(key: string): string {
  if (!isRestorableSiteMediaKey(key)) {
    throw new Error(`Site source media key is not restorable: ${key}`);
  }

  return `${SITE_SOURCE_MEDIA_ROOT}/${key}`;
}

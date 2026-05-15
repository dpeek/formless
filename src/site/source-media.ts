import type { StoredRecord } from "../shared/protocol.ts";

export const SITE_MEDIA_ROUTE_PREFIX = "/api/site/media/";
export const SITE_IMAGE_KEY_PREFIX = "site/images/";
export const SITE_SOURCE_MEDIA_ROOT = "schema/apps/site/media";

export type SiteSourceMediaAsset = {
  contentType: string;
  href: string;
  key: string;
  sourcePath: string;
};

const siteImageExtensionsByContentType = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

const siteImageContentTypesByExtension = new Map([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["gif", "image/gif"],
]);

export function siteImageExtensionForContentType(contentType: string): string | undefined {
  return siteImageExtensionsByContentType.get(normalizeContentType(contentType));
}

export function siteMediaContentTypeForKey(key: string): string | undefined {
  const extension = key.split(".").pop()?.toLowerCase();

  return extension ? siteImageContentTypesByExtension.get(extension) : undefined;
}

export function siteMediaHrefForKey(key: string): string {
  return `${SITE_MEDIA_ROUTE_PREFIX}${key}`;
}

export function siteMediaKeyFromHref(href: string): string | undefined {
  if (!href.startsWith(SITE_MEDIA_ROUTE_PREFIX)) {
    return undefined;
  }

  const url = new URL(href, "https://formless.local");
  const key = siteMediaKeyFromPathname(url.pathname);

  return key && isValidSiteMediaKey(key) ? key : undefined;
}

export function siteMediaKeyFromPathname(pathname: string): string | undefined {
  const key = pathname.startsWith(SITE_MEDIA_ROUTE_PREFIX)
    ? pathname.slice(SITE_MEDIA_ROUTE_PREFIX.length)
    : "";

  return isValidSiteMediaKey(key) ? key : undefined;
}

export function isRestorableSiteMediaKey(key: string): boolean {
  return (
    isValidSiteMediaKey(key) &&
    key.startsWith(SITE_IMAGE_KEY_PREFIX) &&
    siteMediaContentTypeForKey(key) !== undefined
  );
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

function isValidSiteMediaKey(key: string): boolean {
  if (key === "" || key.startsWith("/") || key.includes("\\") || key.includes("%")) {
    return false;
  }

  const segments = key.split("/");

  return segments.every(
    (segment) =>
      segment !== "" &&
      segment !== "." &&
      segment !== ".." &&
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment),
  );
}

function normalizeContentType(value: string): string {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

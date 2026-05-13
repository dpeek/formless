export const PUBLISHED_SITE_HTML_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";
export const PUBLISHED_SITE_NOT_FOUND_CACHE_CONTROL =
  "public, max-age=30, stale-while-revalidate=60";
export const PUBLISHED_SITE_ERROR_CACHE_CONTROL = "no-store";
export const PUBLIC_SITE_TREE_CACHE_CONTROL = "no-store";

export type PublishedSiteDocumentCacheKind = "success" | "not-found" | "error";

export function publishedSiteDocumentCacheControl(kind: PublishedSiteDocumentCacheKind): string {
  switch (kind) {
    case "success":
      return PUBLISHED_SITE_HTML_CACHE_CONTROL;
    case "not-found":
      return PUBLISHED_SITE_NOT_FOUND_CACHE_CONTROL;
    case "error":
      return PUBLISHED_SITE_ERROR_CACHE_CONTROL;
  }
}

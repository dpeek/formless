import type {
  FieldValue,
  SiteTreeRoute,
  SiteTreeWarning,
  StoredRecord,
} from "../shared/protocol.ts";

export type SiteRouteResolution =
  | {
      kind: "page";
      slug: string;
      page: StoredRecord;
    }
  | {
      kind: "post-index";
      slug: string;
      page?: StoredRecord;
      posts: StoredRecord[];
    }
  | {
      kind: "post";
      slug: string;
      post: StoredRecord;
    };

const BLOG_ROUTE = "blog";

export function resolveSiteRoute(
  blocks: Iterable<StoredRecord>,
  slug: string,
  warnings: SiteTreeWarning[],
): SiteRouteResolution | undefined {
  const liveBlocks = [...blocks].filter(isLiveBlock);
  const routePath = normalizeSiteRoutePath(slug);

  if (routePath === BLOG_ROUTE) {
    return {
      kind: "post-index",
      slug: routePath,
      page: resolveRootPage(liveBlocks, routePath, warnings),
      posts: resolvePostIndex(liveBlocks),
    };
  }

  if (routePath.startsWith(`${BLOG_ROUTE}/`)) {
    const post = resolveRootPost(liveBlocks, routePath, warnings);

    if (post) {
      return {
        kind: "post",
        slug: routePath,
        post,
      };
    }
  }

  const page = resolveRootPage(liveBlocks, routePath, warnings);

  if (!page) {
    return undefined;
  }

  return {
    kind: "page",
    slug: routePath,
    page,
  };
}

export function routeInfoForResolution(resolution: SiteRouteResolution): SiteTreeRoute {
  switch (resolution.kind) {
    case "post-index":
      return {
        kind: resolution.kind,
        slug: resolution.slug,
        postCount: resolution.posts.length,
      };
    case "page":
    case "post":
      return {
        kind: resolution.kind,
        slug: resolution.slug,
      };
  }
}

export function normalizeSiteRoutePath(slug: string): string {
  const trimmed = slug.trim().replace(/^\/+/, "").replace(/\/+$/, "");

  return trimmed === "" ? "home" : trimmed;
}

function resolveRootPage(
  blocks: StoredRecord[],
  slug: string,
  warnings: SiteTreeWarning[],
): StoredRecord | undefined {
  const candidates = blocks
    .filter(
      (record) =>
        record.entity === "block" &&
        stringValue(record.values.type) === "page" &&
        hrefMatchesRoute(stringValue(record.values.href), slug),
    )
    .sort(compareRecords);

  const root = candidates[0];

  for (const duplicate of candidates.slice(1)) {
    warnings.push({
      code: "skipped-root",
      recordId: duplicate.id,
      message: `Skipped duplicate page block "${duplicate.id}" for route "${slug}".`,
    });
  }

  return root;
}

function resolveRootPost(
  blocks: StoredRecord[],
  slug: string,
  warnings: SiteTreeWarning[],
): StoredRecord | undefined {
  const candidates = blocks
    .filter(
      (record) =>
        record.entity === "block" &&
        stringValue(record.values.type) === "post" &&
        hrefMatchesRoute(stringValue(record.values.href), slug),
    )
    .sort(compareRecords);

  const root = candidates[0];

  for (const duplicate of candidates.slice(1)) {
    warnings.push({
      code: "skipped-post-route",
      recordId: duplicate.id,
      message: `Skipped duplicate post block "${duplicate.id}" for route "${slug}".`,
    });
  }

  return root;
}

function resolvePostIndex(blocks: StoredRecord[]): StoredRecord[] {
  return blocks
    .filter(
      (record) =>
        record.entity === "block" &&
        stringValue(record.values.type) === "post" &&
        postRoutePath(record)?.startsWith(`${BLOG_ROUTE}/`),
    )
    .sort(comparePostsForIndex);
}

function postRoutePath(record: StoredRecord): string | undefined {
  const href = stringValue(record.values.href);

  if (!href) {
    return undefined;
  }

  const path = normalizeHrefPath(href);

  if (path === "/pages" || path === "/pages/") {
    return "home";
  }

  if (path.startsWith("/pages/")) {
    return normalizeSiteRoutePath(path.slice("/pages/".length));
  }

  return normalizeSiteRoutePath(path);
}

function hrefMatchesRoute(href: string | undefined, slug: string): boolean {
  if (!href) {
    return false;
  }

  const hrefPath = normalizeHrefPath(href);
  const routePath = normalizeSiteRoutePath(slug);
  const previewPath = `/pages/${routePath}`;
  const publishedPath = routePath === "home" ? "/" : `/${routePath}`;

  return hrefPath === previewPath || hrefPath === publishedPath;
}

function normalizeHrefPath(href: string): string {
  const path = href.split(/[?#]/, 1)[0] ?? "";
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;

  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, "") : withLeadingSlash;
}

function isLiveBlock(record: StoredRecord): boolean {
  return record.entity === "block" && !record.deletedAt;
}

function comparePostsForIndex(a: StoredRecord, b: StoredRecord): number {
  return compareStrings(b.createdAt, a.createdAt) || compareStrings(a.id, b.id);
}

function compareRecords(a: StoredRecord, b: StoredRecord): number {
  return compareStrings(a.createdAt, b.createdAt) || compareStrings(a.id, b.id);
}

function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1;
  }

  if (a > b) {
    return 1;
  }

  return 0;
}

function stringValue(value: FieldValue | undefined): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}
